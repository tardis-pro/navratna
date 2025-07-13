import { Repository } from 'typeorm';
import { UserLLMPreference } from '../entities/userLLMPreference.entity.js';
import { AgentLLMPreference } from '../entities/agentLLMPreference.entity.js';
import { Agent } from '../entities/agent.entity.js';
import { LLMProvider } from '../entities/llmProvider.entity.js';
import { 
  LLMTaskType, 
  LLMProviderType, 
  RoutingRequest,
  UserLLMPreference as UserLLMPreferenceType 
} from '@uaip/types';
import { logger } from '@uaip/utils';

// =============================================================================
// UNIFIED MODEL SELECTION INTERFACES
// =============================================================================

export interface ModelSelectionRequest {
  agentId?: string;
  userId?: string;
  taskType: LLMTaskType;
  requestedModel?: string;
  requestedProvider?: string;
  context?: RoutingRequest;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  complexity?: 'low' | 'medium' | 'high';
}

export interface ModelSelectionResult {
  provider: LLMProviderType;
  model: string;
  fallbackModel?: string;
  settings: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    systemPrompt?: string;
    customSettings?: Record<string, any>;
  };
  source: 'agent' | 'user' | 'system';
  reasoning: string;
  confidence: number; // 0-1 confidence score
  warnings?: string[];
  selectionStrategy: string;
}

export interface FallbackChain {
  primary: ModelSelectionResult;
  fallbacks: ModelSelectionResult[];
}

// =============================================================================
// SELECTION STRATEGIES
// =============================================================================

export interface ModelSelectionStrategy {
  name: string;
  select(request: ModelSelectionRequest, context: ModelSelectionContext): Promise<ModelSelectionResult>;
  canHandle(request: ModelSelectionRequest): boolean;
  priority: number; // Higher = tried first
}

export interface ModelSelectionContext {
  agentRepository: Repository<Agent>;
  userLLMPreferenceRepository: Repository<UserLLMPreference>;
  agentLLMPreferenceRepository: Repository<AgentLLMPreference>;
  llmProviderRepository: Repository<LLMProvider>;
  systemDefaults: Record<LLMTaskType, ModelSelectionResult>;
}

// =============================================================================
// SYSTEM DEFAULTS CONFIGURATION
// =============================================================================

export const UNIFIED_SYSTEM_DEFAULTS: Record<LLMTaskType, ModelSelectionResult> = {
  [LLMTaskType.SUMMARIZATION]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.3, maxTokens: 1000 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet optimized for concise, accurate summarization',
    confidence: 0.8,
    selectionStrategy: 'SystemDefaultStrategy'
  },
  [LLMTaskType.VISION]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.2, maxTokens: 2000 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet excellent for vision analysis',
    confidence: 0.9,
    selectionStrategy: 'SystemDefaultStrategy'
  },
  [LLMTaskType.TOOL_CALLING]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.1, maxTokens: 4000 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet reliable for structured tool calling',
    confidence: 0.9,
    selectionStrategy: 'SystemDefaultStrategy'
  },
  [LLMTaskType.SPEECH_TO_TEXT]: {
    provider: LLMProviderType.OPENAI,
    model: 'whisper-1',
    settings: { temperature: 0 },
    source: 'system',
    reasoning: 'OpenAI Whisper specialized for speech transcription',
    confidence: 1.0,
    selectionStrategy: 'SystemDefaultStrategy'
  },
  [LLMTaskType.TEXT_TO_SPEECH]: {
    provider: LLMProviderType.OPENAI,
    model: 'tts-1',
    settings: {},
    source: 'system',
    reasoning: 'OpenAI TTS for text-to-speech generation',
    confidence: 0.9,
    selectionStrategy: 'SystemDefaultStrategy'
  },
  [LLMTaskType.CODE_GENERATION]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.2, maxTokens: 8000 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet strong for code generation',
    confidence: 0.85,
    selectionStrategy: 'SystemDefaultStrategy'
  },
  [LLMTaskType.REASONING]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.3, maxTokens: 4000 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet best for complex reasoning',
    confidence: 0.95,
    selectionStrategy: 'SystemDefaultStrategy'
  },
  [LLMTaskType.CREATIVE_WRITING]: {
    provider: LLMProviderType.OPENAI,
    model: 'gpt-4o-mini',
    settings: { temperature: 0.7, maxTokens: 4000 },
    source: 'system',
    reasoning: 'GPT-4o Mini excellent for creative writing',
    confidence: 0.8,
    selectionStrategy: 'SystemDefaultStrategy'
  },
  [LLMTaskType.TRANSLATION]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.2, maxTokens: 2000 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet reliable for translation',
    confidence: 0.8,
    selectionStrategy: 'SystemDefaultStrategy'
  },
  [LLMTaskType.EMBEDDINGS]: {
    provider: LLMProviderType.OPENAI,
    model: 'text-embedding-3-large',
    settings: {},
    source: 'system',
    reasoning: 'OpenAI embeddings for vector similarity',
    confidence: 0.9,
    selectionStrategy: 'SystemDefaultStrategy'
  },
  [LLMTaskType.CLASSIFICATION]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.1, maxTokens: 500 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet fast and accurate for classification',
    confidence: 0.85,
    selectionStrategy: 'SystemDefaultStrategy'
  }
};

// =============================================================================
// SELECTION STRATEGIES IMPLEMENTATION
// =============================================================================

/**
 * Agent-specific model selection strategy
 * Highest priority - uses agent's specific LLM preferences
 */
export class AgentSpecificStrategy implements ModelSelectionStrategy {
  name = 'AgentSpecificStrategy';
  priority = 1000;

  canHandle(request: ModelSelectionRequest): boolean {
    return !!request.agentId;
  }

  async select(request: ModelSelectionRequest, context: ModelSelectionContext): Promise<ModelSelectionResult> {
    if (!request.agentId) {
      throw new Error('Agent ID required for AgentSpecificStrategy');
    }

    const agentPreference = await context.agentLLMPreferenceRepository.findOne({
      where: { agentId: request.agentId, taskType: request.taskType, isActive: true }
    });

    if (!agentPreference || !agentPreference.isActive) {
      throw new Error('No active agent preference found');
    }

    const confidence = this.calculateConfidence(agentPreference.getPerformanceScore(), 'agent');

    return {
      provider: agentPreference.preferredProvider,
      model: agentPreference.preferredModel,
      fallbackModel: agentPreference.fallbackModel,
      settings: agentPreference.getEffectiveSettings(),
      source: 'agent',
      reasoning: `Agent-specific preference: ${agentPreference.reasoning || 'Optimized for agent role'}`,
      confidence,
      selectionStrategy: this.name
    };
  }

  private calculateConfidence(performanceScore: number, source: 'agent'): number {
    return Math.min(0.95, 0.6 + (performanceScore * 0.35));
  }
}

/**
 * User-specific model selection strategy
 * Medium priority - uses user's LLM preferences
 */
export class UserSpecificStrategy implements ModelSelectionStrategy {
  name = 'UserSpecificStrategy';
  priority = 800;

  canHandle(request: ModelSelectionRequest): boolean {
    return !!(request.userId || request.agentId);
  }

  async select(request: ModelSelectionRequest, context: ModelSelectionContext): Promise<ModelSelectionResult> {
    let userId = request.userId;

    // If agentId provided, get user from agent
    if (!userId && request.agentId) {
      const agent = await context.agentRepository.findOne({
        where: { id: request.agentId },
        select: ['createdBy']
      });
      userId = agent?.createdBy;
    }

    if (!userId) {
      throw new Error('User ID required for UserSpecificStrategy');
    }

    const userPreference = await context.userLLMPreferenceRepository.findOne({
      where: { userId, taskType: request.taskType, isActive: true }
    });

    if (!userPreference || !userPreference.isActive) {
      throw new Error('No active user preference found');
    }

    const confidence = this.calculateConfidence(userPreference.getPerformanceScore(), 'user');

    return {
      provider: userPreference.preferredProvider,
      model: userPreference.preferredModel,
      fallbackModel: userPreference.fallbackModel,
      settings: userPreference.getEffectiveSettings(),
      source: 'user',
      reasoning: `User preference: ${userPreference.description || 'User-defined default'}`,
      confidence,
      selectionStrategy: this.name
    };
  }

  private calculateConfidence(performanceScore: number, source: 'user'): number {
    return Math.min(0.85, 0.5 + (performanceScore * 0.35));
  }
}

/**
 * Performance-optimized strategy
 * Adjusts models based on historical performance data
 */
export class PerformanceOptimizedStrategy implements ModelSelectionStrategy {
  name = 'PerformanceOptimizedStrategy';
  priority = 600;

  canHandle(request: ModelSelectionRequest): boolean {
    return true; // Can always provide a performance-optimized selection
  }

  async select(request: ModelSelectionRequest, context: ModelSelectionContext): Promise<ModelSelectionResult> {
    // Start with system defaults
    const systemDefault = context.systemDefaults[request.taskType];
    
    // Try to find better performing alternatives based on user/agent history
    let bestResult = { ...systemDefault };

    if (request.agentId) {
      const agentPerformance = await this.getAgentPerformanceData(request.agentId, request.taskType, context);
      if (agentPerformance && agentPerformance.score > 0.7) {
        bestResult = this.optimizeForPerformance(bestResult, agentPerformance);
      }
    }

    bestResult.selectionStrategy = this.name;
    bestResult.reasoning += ' (Performance-optimized based on historical data)';
    return bestResult;
  }

  private async getAgentPerformanceData(agentId: string, taskType: LLMTaskType, context: ModelSelectionContext) {
    const preferences = await context.agentLLMPreferenceRepository.find({
      where: { agentId, taskType }
    });

    if (preferences.length === 0) return null;

    // Find the best performing preference
    const bestPreference = preferences.reduce((best, current) => 
      current.getPerformanceScore() > best.getPerformanceScore() ? current : best
    );

    return {
      provider: bestPreference.preferredProvider,
      model: bestPreference.preferredModel,
      score: bestPreference.getPerformanceScore()
    };
  }

  private optimizeForPerformance(baseResult: ModelSelectionResult, performanceData: any): ModelSelectionResult {
    return {
      ...baseResult,
      provider: performanceData.provider,
      model: performanceData.model,
      confidence: Math.min(0.9, baseResult.confidence + 0.1)
    };
  }
}

/**
 * Context-aware strategy
 * Adjusts model selection based on urgency and complexity
 */
export class ContextAwareStrategy implements ModelSelectionStrategy {
  name = 'ContextAwareStrategy';
  priority = 700;

  canHandle(request: ModelSelectionRequest): boolean {
    return !!(request.urgency || request.complexity || request.context);
  }

  async select(request: ModelSelectionRequest, context: ModelSelectionContext): Promise<ModelSelectionResult> {
    const systemDefault = context.systemDefaults[request.taskType];
    let adjusted = { ...systemDefault };

    // Adjust based on urgency
    if (request.urgency === 'critical') {
      adjusted = this.optimizeForSpeed(adjusted);
      adjusted.reasoning += ' (Optimized for critical urgency)';
    }

    // Adjust based on complexity
    if (request.complexity === 'high') {
      adjusted = this.optimizeForCapability(adjusted);
      adjusted.reasoning += ' (Upgraded for high complexity)';
    }

    // Apply context-specific adjustments
    if (request.context) {
      adjusted = this.applyContextAdjustments(adjusted, request.context, request.taskType);
    }

    adjusted.selectionStrategy = this.name;
    return adjusted;
  }

  private optimizeForSpeed(result: ModelSelectionResult): ModelSelectionResult {
    // Switch to faster models for critical tasks
    if (result.model.includes('opus')) {
      result.model = result.model.replace('opus', 'sonnet');
    }
    
    // Reduce temperature for more deterministic results
    if (result.settings.temperature && result.settings.temperature > 0.2) {
      result.settings = { ...result.settings, temperature: 0.2 };
    }

    return result;
  }

  private optimizeForCapability(result: ModelSelectionResult): ModelSelectionResult {
    // Upgrade to more capable models for complex tasks
    if (result.model.includes('haiku')) {
      result.model = result.model.replace('haiku', 'sonnet');
    }
    
    return result;
  }

  private applyContextAdjustments(result: ModelSelectionResult, context: RoutingRequest, taskType: LLMTaskType): ModelSelectionResult {
    // Apply domain-specific optimizations
    if (context.domain === 'code_review' && taskType !== LLMTaskType.CODE_GENERATION) {
      result.settings = { ...result.settings, temperature: 0.1 };
    }

    return result;
  }
}

/**
 * System default strategy
 * Fallback to system defaults - always available
 */
export class SystemDefaultStrategy implements ModelSelectionStrategy {
  name = 'SystemDefaultStrategy';
  priority = 100; // Lowest priority - fallback only

  canHandle(request: ModelSelectionRequest): boolean {
    return true; // Always can provide defaults
  }

  async select(request: ModelSelectionRequest, context: ModelSelectionContext): Promise<ModelSelectionResult> {
    const systemDefault = context.systemDefaults[request.taskType];
    return {
      ...systemDefault,
      selectionStrategy: this.name
    };
  }
}

// =============================================================================
// MAIN ORCHESTRATOR SERVICE
// =============================================================================

export class ModelSelectionOrchestrator {
  private strategies: ModelSelectionStrategy[];
  private context: ModelSelectionContext;

  constructor(
    agentRepository: Repository<Agent>,
    userLLMPreferenceRepository: Repository<UserLLMPreference>,
    agentLLMPreferenceRepository: Repository<AgentLLMPreference>,
    llmProviderRepository: Repository<LLMProvider>
  ) {
    this.context = {
      agentRepository,
      userLLMPreferenceRepository,
      agentLLMPreferenceRepository,
      llmProviderRepository,
      systemDefaults: UNIFIED_SYSTEM_DEFAULTS
    };

    // Initialize strategies in priority order
    this.strategies = [
      new AgentSpecificStrategy(),
      new UserSpecificStrategy(),
      new ContextAwareStrategy(),
      new PerformanceOptimizedStrategy(),
      new SystemDefaultStrategy()
    ].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Main model selection method - tries strategies in priority order
   */
  async selectModel(request: ModelSelectionRequest): Promise<ModelSelectionResult> {
    const errors: Error[] = [];

    for (const strategy of this.strategies) {
      if (!strategy.canHandle(request)) {
        continue;
      }

      try {
        const result = await strategy.select(request, this.context);
        
        logger.info('Model selected successfully', {
          strategy: strategy.name,
          model: result.model,
          provider: result.provider,
          confidence: result.confidence,
          taskType: request.taskType
        });

        return result;
      } catch (error) {
        logger.warn(`Strategy ${strategy.name} failed`, { 
          error: error instanceof Error ? error.message : 'Unknown error',
          taskType: request.taskType
        });
        errors.push(error instanceof Error ? error : new Error('Unknown error'));
        continue;
      }
    }

    // If all strategies failed, this shouldn't happen as SystemDefaultStrategy should always work
    throw new Error(`All model selection strategies failed: ${errors.map(e => e.message).join(', ')}`);
  }

  /**
   * Get complete fallback chain with primary + fallback options
   */
  async selectWithFallbacks(request: ModelSelectionRequest): Promise<FallbackChain> {
    const primary = await this.selectModel(request);
    const fallbacks: ModelSelectionResult[] = [];

    // Generate fallback options by trying different strategies
    const fallbackRequests = this.generateFallbackRequests(request);
    
    for (const fallbackRequest of fallbackRequests) {
      try {
        const fallback = await this.selectModel(fallbackRequest);
        // Don't include if it's the same as primary
        if (fallback.model !== primary.model || fallback.provider !== primary.provider) {
          fallbacks.push(fallback);
        }
      } catch (error) {
        logger.debug('Fallback generation failed', { error });
      }
    }

    return { primary, fallbacks };
  }

  /**
   * System-level selection for internal tasks (convenience method)
   */
  async selectForSystem(taskType: LLMTaskType): Promise<ModelSelectionResult> {
    return this.selectModel({
      taskType,
      urgency: 'medium' // Default urgency for system tasks
    });
  }

  /**
   * Update usage statistics for learning and optimization
   */
  async updateUsageStats(
    request: ModelSelectionRequest,
    result: ModelSelectionResult,
    responseTime: number,
    success: boolean,
    quality?: number
  ): Promise<void> {
    try {
      // Update agent-specific stats if applicable
      if (request.agentId && result.source === 'agent') {
        const agentPreference = await this.context.agentLLMPreferenceRepository.findOne({
          where: { agentId: request.agentId, taskType: request.taskType, isActive: true }
        });
        
        if (agentPreference) {
          agentPreference.updateUsageStats(responseTime, success, quality);
          await this.context.agentLLMPreferenceRepository.save(agentPreference);
        }
      }

      // Update user-specific stats if applicable
      if (request.userId && result.source === 'user') {
        const userPreference = await this.context.userLLMPreferenceRepository.findOne({
          where: { userId: request.userId, taskType: request.taskType, isActive: true }
        });
        
        if (userPreference) {
          userPreference.updateUsageStats(responseTime, success);
          await this.context.userLLMPreferenceRepository.save(userPreference);
        }
      }

      logger.info('Usage stats updated', {
        strategy: result.selectionStrategy,
        success,
        responseTime,
        quality
      });
    } catch (error) {
      logger.error('Failed to update usage stats', { error });
    }
  }

  private generateFallbackRequests(original: ModelSelectionRequest): ModelSelectionRequest[] {
    const fallbacks: ModelSelectionRequest[] = [];

    // Try without agent specificity
    if (original.agentId) {
      fallbacks.push({ ...original, agentId: undefined });
    }

    // Try without user specificity
    if (original.userId) {
      fallbacks.push({ ...original, userId: undefined, agentId: undefined });
    }

    // Try different urgency levels
    if (original.urgency !== 'medium') {
      fallbacks.push({ ...original, urgency: 'medium' });
    }

    return fallbacks;
  }
}