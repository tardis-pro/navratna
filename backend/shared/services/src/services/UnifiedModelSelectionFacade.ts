import { Repository } from 'typeorm';
import { UserLLMPreference } from '../entities/userLLMPreference.entity.js';
import { AgentLLMPreference } from '../entities/agentLLMPreference.entity.js';
import { Agent } from '../entities/agent.entity.js';
import { LLMProvider } from '../entities/llmProvider.entity.js';
import { 
  ModelSelectionOrchestrator,
  ModelSelectionRequest,
  ModelSelectionResult,
  FallbackChain
} from './ModelSelectionOrchestrator.js';
import { 
  ProviderFallbackService,
  ProviderResolution,
  ProviderCapabilities,
  FallbackConfig
} from './ProviderFallbackService.js';
import { LLMTaskType, LLMProviderType, RoutingRequest } from '@uaip/types';
import { logger } from '@uaip/utils';

// =============================================================================
// UNIFIED FACADE INTERFACES
// =============================================================================

export interface UnifiedModelSelection {
  // Model selection result
  model: ModelSelectionResult;
  
  // Provider resolution details
  provider: ProviderResolution;
  
  // Provider capabilities
  capabilities: ProviderCapabilities | null;
  
  // Complete fallback chain
  fallbackChain: FallbackChain;
  
  // Selection metadata
  metadata: {
    selectionTimeMs: number;
    strategiesAttempted: string[];
    fallbacksAvailable: number;
    healthChecksPerformed: number;
  };
}

export interface UnifiedSelectionRequest {
  // Agent context
  agentId?: string;
  agentProviderId?: string;
  
  // User context  
  userId?: string;
  userProviders?: any[];
  
  // Task details
  taskType: LLMTaskType;
  requestedModel?: string;
  requestedProvider?: string;
  
  // Context and constraints
  context?: RoutingRequest;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  complexity?: 'low' | 'medium' | 'high';
  
  // Fallback preferences
  allowFallbacks?: boolean;
  maxFallbacks?: number;
  requireHealthyProvider?: boolean;
}

export interface SelectionMetrics {
  totalSelections: number;
  successfulSelections: number;
  averageSelectionTimeMs: number;
  strategyUsageCount: Record<string, number>;
  providerUsageCount: Record<string, number>;
  fallbackUsageCount: number;
  healthCheckFailures: number;
}

// =============================================================================
// UNIFIED MODEL SELECTION FACADE
// =============================================================================

export class UnifiedModelSelectionFacade {
  private orchestrator: ModelSelectionOrchestrator;
  private fallbackService: ProviderFallbackService;
  private metrics: SelectionMetrics;

  constructor(
    agentRepository: Repository<Agent>,
    userLLMPreferenceRepository: Repository<UserLLMPreference>,
    agentLLMPreferenceRepository: Repository<AgentLLMPreference>,
    llmProviderRepository: Repository<LLMProvider>,
    fallbackConfig?: Partial<FallbackConfig>
  ) {
    this.orchestrator = new ModelSelectionOrchestrator(
      agentRepository,
      userLLMPreferenceRepository,
      agentLLMPreferenceRepository,
      llmProviderRepository
    );

    this.fallbackService = new ProviderFallbackService(
      llmProviderRepository,
      fallbackConfig
    );

    this.metrics = {
      totalSelections: 0,
      successfulSelections: 0,
      averageSelectionTimeMs: 0,
      strategyUsageCount: {},
      providerUsageCount: {},
      fallbackUsageCount: 0,
      healthCheckFailures: 0
    };
  }

  /**
   * Main unified model selection method
   * Combines orchestrator model selection with provider fallback resolution
   */
  async selectModel(request: UnifiedSelectionRequest): Promise<UnifiedModelSelection> {
    const startTime = Date.now();
    const strategiesAttempted: string[] = [];
    let healthChecksPerformed = 0;

    try {
      this.metrics.totalSelections++;

      // Step 1: Use orchestrator to select the best model
      const modelRequest: ModelSelectionRequest = {
        agentId: request.agentId,
        userId: request.userId,
        taskType: request.taskType,
        requestedModel: request.requestedModel,
        requestedProvider: request.requestedProvider,
        context: request.context,
        urgency: request.urgency,
        complexity: request.complexity
      };

      const modelSelection = await this.orchestrator.selectModel(modelRequest);
      strategiesAttempted.push(modelSelection.selectionStrategy);

      // Step 2: Resolve provider for the selected model
      const providerResolution = await this.fallbackService.resolveProvider(
        modelSelection.model,
        modelSelection.provider,
        request.agentProviderId,
        request.userProviders,
        request.taskType
      );

      // Step 3: Get provider capabilities
      let capabilities: ProviderCapabilities | null = null;
      if (providerResolution.providerId) {
        capabilities = await this.fallbackService.getProviderCapabilities(providerResolution.providerId);
        healthChecksPerformed++;
        
        // If provider is unhealthy and fallbacks are allowed, try fallback
        if (request.requireHealthyProvider && capabilities?.healthStatus === 'unavailable') {
          if (request.allowFallbacks !== false) {
            logger.info('Primary provider unhealthy, attempting fallback', {
              provider: providerResolution.effectiveProvider,
              model: modelSelection.model
            });
            
            return await this.handleUnhealthyProvider(request, modelSelection, startTime, strategiesAttempted, healthChecksPerformed);
          } else {
            throw new Error(`Provider ${providerResolution.effectiveProvider} is unavailable and fallbacks are disabled`);
          }
        }
      }

      // Step 4: Generate fallback chain
      const fallbackChain = request.allowFallbacks !== false 
        ? await this.orchestrator.selectWithFallbacks(modelRequest)
        : { primary: modelSelection, fallbacks: [] };

      // Step 5: Build unified result
      const selectionTime = Date.now() - startTime;
      const result: UnifiedModelSelection = {
        model: modelSelection,
        provider: providerResolution,
        capabilities,
        fallbackChain,
        metadata: {
          selectionTimeMs: selectionTime,
          strategiesAttempted,
          fallbacksAvailable: fallbackChain.fallbacks.length,
          healthChecksPerformed
        }
      };

      // Update metrics
      this.updateMetrics(result, true);

      logger.info('Unified model selection completed', {
        model: modelSelection.model,
        provider: providerResolution.effectiveProvider,
        strategy: modelSelection.selectionStrategy,
        confidence: modelSelection.confidence,
        selectionTimeMs: selectionTime
      });

      return result;

    } catch (error) {
      const selectionTime = Date.now() - startTime;
      
      logger.error('Unified model selection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        taskType: request.taskType,
        selectionTimeMs: selectionTime,
        strategiesAttempted
      });

      // Update metrics for failure
      this.updateMetrics(null, false);

      // If fallbacks are allowed, try emergency fallback
      if (request.allowFallbacks !== false) {
        return await this.handleEmergencyFallback(request, startTime, strategiesAttempted, healthChecksPerformed);
      }

      throw error;
    }
  }

  /**
   * Simplified selection method for common use cases
   */
  async selectForAgent(
    agentId: string, 
    taskType: LLMTaskType, 
    options?: {
      model?: string;
      provider?: string;
      urgency?: 'low' | 'medium' | 'high' | 'critical';
      context?: RoutingRequest;
    }
  ): Promise<UnifiedModelSelection> {
    return this.selectModel({
      agentId,
      taskType,
      requestedModel: options?.model,
      requestedProvider: options?.provider,
      urgency: options?.urgency,
      context: options?.context,
      allowFallbacks: true,
      requireHealthyProvider: true
    });
  }

  /**
   * Simplified selection method for user tasks
   */
  async selectForUser(
    userId: string,
    taskType: LLMTaskType,
    options?: {
      model?: string;
      provider?: string;
      userProviders?: any[];
      urgency?: 'low' | 'medium' | 'high' | 'critical';
    }
  ): Promise<UnifiedModelSelection> {
    return this.selectModel({
      userId,
      taskType,
      requestedModel: options?.model,
      requestedProvider: options?.provider,
      userProviders: options?.userProviders,
      urgency: options?.urgency,
      allowFallbacks: true,
      requireHealthyProvider: true
    });
  }

  /**
   * System-level selection for internal tasks
   */
  async selectForSystem(
    taskType: LLMTaskType,
    options?: {
      model?: string;
      provider?: string;
      urgency?: 'low' | 'medium' | 'high' | 'critical';
    }
  ): Promise<UnifiedModelSelection> {
    return this.selectModel({
      taskType,
      requestedModel: options?.model,
      requestedProvider: options?.provider,
      urgency: options?.urgency,
      allowFallbacks: true,
      requireHealthyProvider: false // System tasks are more tolerant
    });
  }

  /**
   * Update usage statistics after model execution
   */
  async updateUsageStats(
    selection: UnifiedModelSelection,
    request: UnifiedSelectionRequest,
    responseTime: number,
    success: boolean,
    quality?: number
  ): Promise<void> {
    try {
      // Update orchestrator stats
      await this.orchestrator.updateUsageStats(
        {
          agentId: request.agentId,
          userId: request.userId,
          taskType: request.taskType,
          context: request.context
        },
        selection.model,
        responseTime,
        success,
        quality
      );

      // Update internal metrics
      if (success) {
        this.metrics.successfulSelections++;
      }

      logger.debug('Usage stats updated', {
        strategy: selection.model.selectionStrategy,
        provider: selection.provider.effectiveProvider,
        success,
        responseTime,
        quality
      });

    } catch (error) {
      logger.error('Failed to update usage stats', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Get selection metrics for monitoring
   */
  getMetrics(): SelectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (useful for testing or periodic resets)
   */
  resetMetrics(): void {
    this.metrics = {
      totalSelections: 0,
      successfulSelections: 0,
      averageSelectionTimeMs: 0,
      strategyUsageCount: {},
      providerUsageCount: {},
      fallbackUsageCount: 0,
      healthCheckFailures: 0
    };
  }

  /**
   * Validate provider and model combination
   */
  async validateSelection(
    provider: LLMProviderType,
    model: string,
    providerId?: string
  ): Promise<boolean> {
    if (!providerId) {
      // Try to find provider by type
      const resolution = await this.fallbackService.resolveProvider(model, provider);
      providerId = resolution.providerId;
    }

    if (!providerId) {
      return false;
    }

    return this.fallbackService.validateProviderModel(providerId, model);
  }

  /**
   * Get all available models for a specific provider type
   */
  async getAvailableModels(providerType: LLMProviderType): Promise<string[]> {
    // This would typically query the provider to get available models
    // For now, return common models based on provider type
    const commonModels: Record<LLMProviderType, string[]> = {
      [LLMProviderType.ANTHROPIC]: [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307'
      ],
      [LLMProviderType.OPENAI]: [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
        'text-embedding-3-large',
        'text-embedding-3-small',
        'whisper-1',
        'tts-1'
      ],
      [LLMProviderType.OLLAMA]: [
        'llama2',
        'llama2:13b',
        'llama2:70b',
        'codellama',
        'mistral',
        'mixtral',
        'phi'
      ],
      [LLMProviderType.LLMSTUDIO]: [
        'llama2',
        'mistral',
        'codellama'
      ],
      [LLMProviderType.CUSTOM]: []
    };

    return commonModels[providerType] || [];
  }

  /**
   * Cleanup method
   */
  destroy(): void {
    this.fallbackService.destroy();
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private async handleUnhealthyProvider(
    request: UnifiedSelectionRequest,
    originalSelection: ModelSelectionResult,
    startTime: number,
    strategiesAttempted: string[],
    healthChecksPerformed: number
  ): Promise<UnifiedModelSelection> {
    this.metrics.fallbackUsageCount++;
    
    // Try to get fallback chain and use first healthy option
    const fallbackChain = await this.orchestrator.selectWithFallbacks({
      agentId: request.agentId,
      userId: request.userId,
      taskType: request.taskType,
      context: request.context,
      urgency: request.urgency,
      complexity: request.complexity
    });

    for (const fallback of fallbackChain.fallbacks) {
      const fallbackResolution = await this.fallbackService.resolveProvider(
        fallback.model,
        fallback.provider
      );

      if (fallbackResolution.providerId) {
        const capabilities = await this.fallbackService.getProviderCapabilities(fallbackResolution.providerId);
        healthChecksPerformed++;

        if (capabilities?.healthStatus === 'healthy') {
          const selectionTime = Date.now() - startTime;
          strategiesAttempted.push(`fallback:${fallback.selectionStrategy}`);

          return {
            model: fallback,
            provider: fallbackResolution,
            capabilities,
            fallbackChain,
            metadata: {
              selectionTimeMs: selectionTime,
              strategiesAttempted,
              fallbacksAvailable: fallbackChain.fallbacks.length - 1,
              healthChecksPerformed
            }
          };
        }
      }
    }

    throw new Error('No healthy providers available in fallback chain');
  }

  private async handleEmergencyFallback(
    request: UnifiedSelectionRequest,
    startTime: number,
    strategiesAttempted: string[],
    healthChecksPerformed: number
  ): Promise<UnifiedModelSelection> {
    logger.warn('Attempting emergency fallback selection', { taskType: request.taskType });
    
    this.metrics.fallbackUsageCount++;
    strategiesAttempted.push('emergency-fallback');

    // Use system defaults as absolute fallback
    const emergencySelection = await this.orchestrator.selectForSystem(request.taskType);
    const emergencyResolution = await this.fallbackService.resolveProvider(
      emergencySelection.model,
      emergencySelection.provider
    );

    const selectionTime = Date.now() - startTime;

    return {
      model: emergencySelection,
      provider: emergencyResolution,
      capabilities: null,
      fallbackChain: { primary: emergencySelection, fallbacks: [] },
      metadata: {
        selectionTimeMs: selectionTime,
        strategiesAttempted,
        fallbacksAvailable: 0,
        healthChecksPerformed
      }
    };
  }

  private updateMetrics(result: UnifiedModelSelection | null, success: boolean): void {
    if (result) {
      // Update strategy usage
      const strategy = result.model.selectionStrategy;
      this.metrics.strategyUsageCount[strategy] = (this.metrics.strategyUsageCount[strategy] || 0) + 1;

      // Update provider usage
      const provider = result.provider.effectiveProvider;
      this.metrics.providerUsageCount[provider] = (this.metrics.providerUsageCount[provider] || 0) + 1;

      // Update average selection time
      const currentAvg = this.metrics.averageSelectionTimeMs;
      const newTime = result.metadata.selectionTimeMs;
      this.metrics.averageSelectionTimeMs = (currentAvg * (this.metrics.totalSelections - 1) + newTime) / this.metrics.totalSelections;
    }

    if (success) {
      this.metrics.successfulSelections++;
    }
  }
}