import { Repository } from 'typeorm';
import { LLMProvider } from '../entities/llmProvider.entity.js';
import { LLMProviderType } from '@uaip/types';
import { logger } from '@uaip/utils';

// =============================================================================
// PROVIDER FALLBACK INTERFACES
// =============================================================================

export interface ProviderResolution {
  effectiveProvider: LLMProviderType;
  effectiveModel: string;
  providerId?: string;
  resolutionPath: 'explicit' | 'agent-specific' | 'user-provider' | 'model-mapping' | 'global-fallback';
  confidence: number;
  warnings?: string[];
  fallbackChain?: string[];
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  maxTokens: number;
  supportedModalities: string[];
  healthStatus: 'healthy' | 'degraded' | 'unavailable';
  lastHealthCheck?: Date;
  averageResponseTime?: number;
}

export interface FallbackConfig {
  // Global provider fallback order
  globalFallbackOrder: LLMProviderType[];
  
  // Task-specific provider preferences
  taskProviderPreferences: Partial<Record<string, LLMProviderType[]>>;
  
  // Model-to-provider mappings
  modelToProviderMapping: Record<string, LLMProviderType>;
  
  // Provider health check intervals
  healthCheckIntervalMs: number;
  
  // Confidence thresholds
  confidenceThresholds: {
    high: number;
    medium: number;
    low: number;
  };
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  globalFallbackOrder: [
    LLMProviderType.ANTHROPIC,
    LLMProviderType.OPENAI,
    LLMProviderType.LLMSTUDIO,
    LLMProviderType.OLLAMA
  ],
  taskProviderPreferences: {
    'reasoning': [LLMProviderType.ANTHROPIC, LLMProviderType.OPENAI],
    'code_generation': [LLMProviderType.ANTHROPIC, LLMProviderType.OPENAI],
    'vision': [LLMProviderType.ANTHROPIC, LLMProviderType.OPENAI],
    'embeddings': [LLMProviderType.OPENAI, LLMProviderType.ANTHROPIC],
    'speech_to_text': [LLMProviderType.OPENAI],
    'text_to_speech': [LLMProviderType.OPENAI],
    'creative_writing': [LLMProviderType.OPENAI, LLMProviderType.ANTHROPIC],
    'translation': [LLMProviderType.ANTHROPIC, LLMProviderType.OPENAI],
    'summarization': [LLMProviderType.ANTHROPIC, LLMProviderType.OPENAI],
    'classification': [LLMProviderType.ANTHROPIC, LLMProviderType.OPENAI],
    'tool_calling': [LLMProviderType.ANTHROPIC, LLMProviderType.OPENAI]
  },
  modelToProviderMapping: {
    // Claude models
    'claude-3-5-sonnet-20241022': LLMProviderType.ANTHROPIC,
    'claude-3-5-haiku-20241022': LLMProviderType.ANTHROPIC,
    'claude-3-opus-20240229': LLMProviderType.ANTHROPIC,
    'claude-3-sonnet-20240229': LLMProviderType.ANTHROPIC,
    'claude-3-haiku-20240307': LLMProviderType.ANTHROPIC,
    
    // OpenAI models
    'gpt-4o': LLMProviderType.OPENAI,
    'gpt-4o-mini': LLMProviderType.OPENAI,
    'gpt-4-turbo': LLMProviderType.OPENAI,
    'gpt-4': LLMProviderType.OPENAI,
    'gpt-3.5-turbo': LLMProviderType.OPENAI,
    'whisper-1': LLMProviderType.OPENAI,
    'tts-1': LLMProviderType.OPENAI,
    'tts-1-hd': LLMProviderType.OPENAI,
    'text-embedding-3-large': LLMProviderType.OPENAI,
    'text-embedding-3-small': LLMProviderType.OPENAI,
    'text-embedding-ada-002': LLMProviderType.OPENAI,
    
    // Common Ollama models
    'llama2': LLMProviderType.OLLAMA,
    'llama2:13b': LLMProviderType.OLLAMA,
    'llama2:70b': LLMProviderType.OLLAMA,
    'codellama': LLMProviderType.OLLAMA,
    'codellama:13b': LLMProviderType.OLLAMA,
    'mistral': LLMProviderType.OLLAMA,
    'mistral:7b': LLMProviderType.OLLAMA,
    'mixtral': LLMProviderType.OLLAMA,
    'mixtral:8x7b': LLMProviderType.OLLAMA,
    'phi': LLMProviderType.OLLAMA,
    'neural-chat': LLMProviderType.OLLAMA,
    'starling-lm': LLMProviderType.OLLAMA,
    'orca-mini': LLMProviderType.OLLAMA,
    'vicuna': LLMProviderType.OLLAMA,
    'nous-hermes': LLMProviderType.OLLAMA,
    'deepseek-coder': LLMProviderType.OLLAMA
  },
  healthCheckIntervalMs: 60000, // 1 minute
  confidenceThresholds: {
    high: 0.9,
    medium: 0.7,
    low: 0.5
  }
};

// UUID extraction regex
const UUID_REGEX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

// =============================================================================
// PROVIDER FALLBACK SERVICE
// =============================================================================

export class ProviderFallbackService {
  private config: FallbackConfig;
  private providerCapabilities: Map<string, ProviderCapabilities> = new Map();
  private healthCheckTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private llmProviderRepository: Repository<LLMProvider>,
    config?: Partial<FallbackConfig>
  ) {
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };
  }

  /**
   * Main provider resolution method
   * Handles all fallback scenarios in a unified way
   */
  async resolveProvider(
    requestedModel?: string,
    requestedProvider?: string,
    agentProviderId?: string,
    userProviders?: any[],
    taskType?: string
  ): Promise<ProviderResolution> {
    const fallbackChain: string[] = [];

    try {
      // Step 1: Try explicit provider if requested
      if (requestedProvider) {
        const explicitResult = await this.tryExplicitProvider(requestedProvider, requestedModel);
        if (explicitResult) {
          return {
            effectiveProvider: explicitResult.effectiveProvider!,
            effectiveModel: explicitResult.effectiveModel!,
            providerId: explicitResult.providerId,
            resolutionPath: 'explicit',
            confidence: explicitResult.confidence!,
            warnings: explicitResult.warnings,
            fallbackChain: [requestedProvider]
          };
        }
        fallbackChain.push(`explicit:${requestedProvider}:failed`);
      }

      // Step 2: Try agent-specific provider
      if (agentProviderId) {
        const agentResult = await this.tryAgentProvider(agentProviderId, requestedModel);
        if (agentResult) {
          return {
            effectiveProvider: agentResult.effectiveProvider!,
            effectiveModel: agentResult.effectiveModel!,
            providerId: agentResult.providerId,
            resolutionPath: 'agent-specific',
            confidence: agentResult.confidence!,
            warnings: agentResult.warnings,
            fallbackChain: [...fallbackChain, `agent:${agentProviderId}`]
          };
        }
        fallbackChain.push(`agent:${agentProviderId}:failed`);
      }

      // Step 3: Try user providers
      if (userProviders && userProviders.length > 0) {
        const userResult = await this.tryUserProviders(userProviders, requestedModel);
        if (userResult) {
          return {
            effectiveProvider: userResult.effectiveProvider!,
            effectiveModel: userResult.effectiveModel!,
            providerId: userResult.providerId,
            resolutionPath: 'user-provider',
            confidence: userResult.confidence!,
            warnings: userResult.warnings,
            fallbackChain: [...fallbackChain, `user:${userResult.effectiveProvider}`]
          };
        }
        fallbackChain.push('user:all:failed');
      }

      // Step 4: Try model-to-provider mapping
      if (requestedModel) {
        const mappingResult = await this.tryModelMapping(requestedModel);
        if (mappingResult) {
          return {
            effectiveProvider: mappingResult.effectiveProvider!,
            effectiveModel: mappingResult.effectiveModel!,
            providerId: mappingResult.providerId,
            resolutionPath: 'model-mapping',
            confidence: mappingResult.confidence!,
            warnings: mappingResult.warnings,
            fallbackChain: [...fallbackChain, `mapping:${mappingResult.effectiveProvider}`]
          };
        }
        fallbackChain.push(`mapping:${requestedModel}:failed`);
      }

      // Step 5: Try task-specific providers
      if (taskType) {
        const taskResult = await this.tryTaskSpecificProviders(taskType, requestedModel);
        if (taskResult) {
          return {
            effectiveProvider: taskResult.effectiveProvider!,
            effectiveModel: taskResult.effectiveModel!,
            providerId: taskResult.providerId,
            resolutionPath: 'global-fallback',
            confidence: taskResult.confidence!,
            warnings: taskResult.warnings,
            fallbackChain: [...fallbackChain, `task:${taskResult.effectiveProvider}`]
          };
        }
        fallbackChain.push(`task:${taskType}:failed`);
      }

      // Step 6: Global fallback chain
      const globalResult = await this.tryGlobalFallback(requestedModel);
      if (globalResult) {
        return {
          effectiveProvider: globalResult.effectiveProvider!,
          effectiveModel: globalResult.effectiveModel!,
          providerId: globalResult.providerId,
          resolutionPath: 'global-fallback',
          confidence: globalResult.confidence!,
          warnings: globalResult.warnings,
          fallbackChain: [...fallbackChain, `global:${globalResult.effectiveProvider}`]
        };
      }

      // If everything fails, return the first available provider as last resort
      const lastResort = await this.getLastResortProvider(requestedModel);
      return {
        effectiveProvider: lastResort.effectiveProvider!,
        effectiveModel: lastResort.effectiveModel!,
        providerId: lastResort.providerId,
        resolutionPath: 'global-fallback',
        confidence: lastResort.confidence!,
        warnings: ['All preferred providers failed, using last resort'],
        fallbackChain: [...fallbackChain, 'last-resort']
      };

    } catch (error) {
      logger.error('Provider resolution failed completely', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        fallbackChain 
      });
      
      // Return absolute fallback
      return this.getAbsoluteFallback(requestedModel, fallbackChain);
    }
  }

  /**
   * Get provider capabilities with health checking
   */
  async getProviderCapabilities(providerId: string): Promise<ProviderCapabilities | null> {
    // Check cache first
    const cached = this.providerCapabilities.get(providerId);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Fetch fresh capabilities
    try {
      const provider = await this.llmProviderRepository.findOne({
        where: { id: providerId, isActive: true }
      });

      if (!provider) {
        return null;
      }

      const capabilities = this.determineCapabilities(provider);
      
      // Cache the result
      this.providerCapabilities.set(providerId, capabilities);
      
      // Schedule health check if not already scheduled
      if (!this.healthCheckTimers.has(providerId)) {
        this.scheduleHealthCheck(providerId);
      }

      return capabilities;
    } catch (error) {
      logger.error(`Failed to get capabilities for provider ${providerId}`, { error });
      return null;
    }
  }

  /**
   * Validate if a provider supports a specific model
   */
  async validateProviderModel(providerId: string, model: string): Promise<boolean> {
    const capabilities = await this.getProviderCapabilities(providerId);
    if (!capabilities || capabilities.healthStatus === 'unavailable') {
      return false;
    }

    // Check if the provider type matches the model
    const provider = await this.llmProviderRepository.findOne({
      where: { id: providerId }
    });

    if (!provider) {
      return false;
    }

    // Validate API key is not a placeholder
    const apiKey = provider.getApiKey();
    if (!apiKey || 
        apiKey.includes('placeholder') || 
        apiKey.includes('demo-') ||
        apiKey.includes('AIza-placeholder') ||
        apiKey.includes('replace-in-settings')) {
      logger.debug('Provider has placeholder API key, skipping', { 
        providerId, 
        providerName: provider.name,
        hasApiKey: !!apiKey,
        isPlaceholder: !!(apiKey && (apiKey.includes('placeholder') || apiKey.includes('demo-')))
      });
      return false;
    }

    const expectedProvider = this.getProviderTypeFromModel(model);
    return provider.type === expectedProvider;
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private async tryExplicitProvider(provider: string, model?: string): Promise<Partial<ProviderResolution> | null> {
    try {
      const dbProvider = await this.llmProviderRepository.findOne({
        where: { type: provider as LLMProviderType, isActive: true }
      });

      if (!dbProvider) {
        return null;
      }

      const capabilities = await this.getProviderCapabilities(dbProvider.id);
      if (!capabilities || capabilities.healthStatus === 'unavailable') {
        return null;
      }

      return {
        effectiveProvider: provider as LLMProviderType,
        effectiveModel: model || this.getDefaultModelForProvider(provider),
        providerId: dbProvider.id,
        confidence: this.config.confidenceThresholds.high
      };
    } catch (error) {
      logger.debug(`Explicit provider ${provider} failed`, { error });
      return null;
    }
  }

  private async tryAgentProvider(agentProviderId: string, model?: string): Promise<Partial<ProviderResolution> | null> {
    try {
      const provider = await this.llmProviderRepository.findOne({
        where: { id: agentProviderId, isActive: true }
      });

      if (!provider) {
        return null;
      }

      const capabilities = await this.getProviderCapabilities(provider.id);
      if (!capabilities || capabilities.healthStatus === 'unavailable') {
        return null;
      }

      return {
        effectiveProvider: provider.type,
        effectiveModel: model || provider.defaultModel || this.getDefaultModelForProvider(provider.type),
        providerId: provider.id,
        confidence: this.config.confidenceThresholds.high
      };
    } catch (error) {
      logger.debug(`Agent provider ${agentProviderId} failed`, { error });
      return null;
    }
  }

  private async tryUserProviders(userProviders: any[], model?: string): Promise<Partial<ProviderResolution> | null> {
    // First try UUID extraction from model name
    if (model) {
      const match = model.match(UUID_REGEX);
      if (match) {
        const provider = userProviders.find(p => p.id === match[1] && p.isActive);
        if (provider) {
          const capabilities = await this.getProviderCapabilities(provider.id);
          if (capabilities && capabilities.healthStatus !== 'unavailable') {
            return {
              effectiveProvider: provider.type,
              effectiveModel: model,
              providerId: provider.id,
              confidence: this.config.confidenceThresholds.medium + 0.1
            };
          }
        }
      }
    }

    // Try model-to-provider mapping
    if (model) {
      const providerType = this.getProviderTypeFromModel(model);
      const provider = userProviders.find(p => p.type === providerType && p.isActive);
      if (provider) {
        const capabilities = await this.getProviderCapabilities(provider.id);
        if (capabilities && capabilities.healthStatus !== 'unavailable') {
          return {
            effectiveProvider: provider.type,
            effectiveModel: model,
            providerId: provider.id,
            confidence: this.config.confidenceThresholds.medium
          };
        }
      }
    }

    // Try any healthy user provider
    for (const provider of userProviders.filter(p => p.isActive)) {
      const capabilities = await this.getProviderCapabilities(provider.id);
      if (capabilities && capabilities.healthStatus === 'healthy') {
        return {
          effectiveProvider: provider.type,
          effectiveModel: model || provider.defaultModel || this.getDefaultModelForProvider(provider.type),
          providerId: provider.id,
          confidence: this.config.confidenceThresholds.low
        };
      }
    }

    return null;
  }

  private async tryModelMapping(model: string): Promise<Partial<ProviderResolution> | null> {
    const providerType = this.config.modelToProviderMapping[model] || this.getProviderTypeFromModel(model);
    
    const provider = await this.llmProviderRepository.findOne({
      where: { type: providerType, isActive: true }
    });

    if (!provider) {
      return null;
    }

    const capabilities = await this.getProviderCapabilities(provider.id);
    if (!capabilities || capabilities.healthStatus === 'unavailable') {
      return null;
    }

    return {
      effectiveProvider: providerType,
      effectiveModel: model,
      providerId: provider.id,
      confidence: this.config.confidenceThresholds.medium
    };
  }

  private async tryTaskSpecificProviders(taskType: string, model?: string): Promise<Partial<ProviderResolution> | null> {
    const preferredProviders = this.config.taskProviderPreferences[taskType] || this.config.globalFallbackOrder;
    
    for (const providerType of preferredProviders) {
      const provider = await this.llmProviderRepository.findOne({
        where: { type: providerType, isActive: true }
      });

      if (!provider) continue;

      const capabilities = await this.getProviderCapabilities(provider.id);
      if (capabilities && capabilities.healthStatus !== 'unavailable') {
        return {
          effectiveProvider: providerType,
          effectiveModel: model || provider.defaultModel || this.getDefaultModelForProvider(providerType),
          providerId: provider.id,
          confidence: this.config.confidenceThresholds.medium
        };
      }
    }

    return null;
  }

  private async tryGlobalFallback(model?: string): Promise<Partial<ProviderResolution> | null> {
    for (const providerType of this.config.globalFallbackOrder) {
      const provider = await this.llmProviderRepository.findOne({
        where: { type: providerType, isActive: true }
      });

      if (!provider) continue;

      const capabilities = await this.getProviderCapabilities(provider.id);
      if (capabilities && capabilities.healthStatus !== 'unavailable') {
        return {
          effectiveProvider: providerType,
          effectiveModel: model || provider.defaultModel || this.getDefaultModelForProvider(providerType),
          providerId: provider.id,
          confidence: this.config.confidenceThresholds.low
        };
      }
    }

    return null;
  }

  private async getLastResortProvider(model?: string): Promise<Partial<ProviderResolution>> {
    // Get any active provider as absolute last resort
    const provider = await this.llmProviderRepository.findOne({
      where: { isActive: true }
    });

    if (!provider) {
      throw new Error('No active providers available');
    }

    return {
      effectiveProvider: provider.type,
      effectiveModel: model || provider.defaultModel || this.getDefaultModelForProvider(provider.type),
      providerId: provider.id,
      confidence: 0.1 // Very low confidence
    };
  }

  private getAbsoluteFallback(model?: string, fallbackChain: string[] = []): ProviderResolution {
    // Absolute fallback when everything fails
    return {
      effectiveProvider: LLMProviderType.OLLAMA, // Most likely to be available locally
      effectiveModel: model || 'llama2',
      resolutionPath: 'global-fallback',
      confidence: 0.05,
      warnings: ['All providers failed, using absolute fallback'],
      fallbackChain: [...fallbackChain, 'absolute-fallback']
    };
  }

  private getProviderTypeFromModel(model: string): LLMProviderType {
    const modelLower = model.toLowerCase();
    
    if (modelLower.includes('claude') || modelLower.includes('anthropic')) {
      return LLMProviderType.ANTHROPIC;
    }
    if (modelLower.includes('gpt') || modelLower.includes('openai') || modelLower.includes('whisper') || modelLower.includes('tts') || modelLower.includes('embedding')) {
      return LLMProviderType.OPENAI;
    }
    if (modelLower.includes('llama') || modelLower.includes('mistral') || modelLower.includes('ollama')) {
      return LLMProviderType.OLLAMA;
    }
    
    // Default fallback
    return LLMProviderType.OLLAMA;
  }

  private getDefaultModelForProvider(providerType: string): string {
    switch (providerType) {
      case LLMProviderType.ANTHROPIC:
        return 'claude-3-5-sonnet-20241022';
      case LLMProviderType.OPENAI:
        return 'gpt-4o-mini';
      case LLMProviderType.OLLAMA:
        return 'llama2';
      case LLMProviderType.LLMSTUDIO:
        return 'llama2';
      default:
        return 'llama2';
    }
  }

  private determineCapabilities(provider: LLMProvider): ProviderCapabilities {
    const baseCapabilities: ProviderCapabilities = {
      supportsStreaming: true,
      maxTokens: 4096,
      supportedModalities: ['text'],
      healthStatus: 'healthy', // Assume healthy until proven otherwise
      lastHealthCheck: new Date()
    };

    switch (provider.type) {
      case LLMProviderType.OPENAI:
        return {
          ...baseCapabilities,
          maxTokens: 128000,
          supportedModalities: ['text', 'image', 'audio']
        };
      case LLMProviderType.ANTHROPIC:
        return {
          ...baseCapabilities,
          maxTokens: 200000,
          supportedModalities: ['text', 'image']
        };
      case LLMProviderType.OLLAMA:
        return {
          ...baseCapabilities,
          maxTokens: 32768,
          supportedModalities: ['text']
        };
      case LLMProviderType.LLMSTUDIO:
        return {
          ...baseCapabilities,
          maxTokens: 32768,
          supportedModalities: ['text']
        };
      default:
        return baseCapabilities;
    }
  }

  private isCacheValid(capabilities: ProviderCapabilities): boolean {
    if (!capabilities.lastHealthCheck) return false;
    
    const now = new Date();
    const timeDiff = now.getTime() - capabilities.lastHealthCheck.getTime();
    return timeDiff < this.config.healthCheckIntervalMs;
  }

  private scheduleHealthCheck(providerId: string): void {
    const timer = setInterval(async () => {
      try {
        // Refresh capabilities which includes health check
        await this.getProviderCapabilities(providerId);
      } catch (error) {
        logger.error(`Health check failed for provider ${providerId}`, { error });
      }
    }, this.config.healthCheckIntervalMs);

    this.healthCheckTimers.set(providerId, timer);
  }

  /**
   * Cleanup method to clear timers when service is destroyed
   */
  destroy(): void {
    for (const timer of this.healthCheckTimers.values()) {
      clearInterval(timer);
    }
    this.healthCheckTimers.clear();
    this.providerCapabilities.clear();
  }
}