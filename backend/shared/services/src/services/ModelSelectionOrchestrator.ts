import { LLMTaskType, LLMProviderType, RoutingRequest } from '@uaip/types';
import type {
  ModelSelectionRequest,
  ModelSelectionResult,
  FallbackChain,
  ModelSelectionStrategy,
  ModelSelectionContext,
} from '@uaip/types';
import { logger } from '@uaip/utils';

// =============================================================================
// SYSTEM DEFAULTS CONFIGURATION
// =============================================================================

export const UNIFIED_SYSTEM_DEFAULTS: Record<LLMTaskType, ModelSelectionResult> = {
  [LLMTaskType.SUMMARIZATION]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.3, maxTokens: 1000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.8,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.VISION]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.2, maxTokens: 2000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.9,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.TOOL_CALLING]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.1, maxTokens: 4000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.9,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.SPEECH_TO_TEXT]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 1.0,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.TEXT_TO_SPEECH]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: {},
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.9,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.CODE_GENERATION]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.2, maxTokens: 8000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.85,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.REASONING]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.3, maxTokens: 4000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.95,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.CREATIVE_WRITING]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.7, maxTokens: 4000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.8,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.TRANSLATION]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.2, maxTokens: 2000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.8,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.EMBEDDINGS]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: {},
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.9,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.CLASSIFICATION]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.1, maxTokens: 500 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.85,
    selectionStrategy: 'SystemDefaultStrategy',
  },
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

  async select(
    request: ModelSelectionRequest,
    context: ModelSelectionContext
  ): Promise<ModelSelectionResult> {
    if (!request.agentId) {
      throw new Error('Agent ID required for AgentSpecificStrategy');
    }

    const agentPreference = await (context.agentLLMPreferenceRepository as { findOne: Function }).findOne({
      where: { agentId: request.agentId, taskType: request.taskType, isActive: true },
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
      selectionStrategy: this.name,
    };
  }

  private calculateConfidence(performanceScore: number, _source: 'agent'): number {
    return Math.min(0.95, 0.6 + performanceScore * 0.35);
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

  async select(
    request: ModelSelectionRequest,
    context: ModelSelectionContext
  ): Promise<ModelSelectionResult> {
    let userId = request.userId;

    // If agentId provided, get user from agent
    if (!userId && request.agentId) {
      const agent = await (context.agentRepository as { findOne: Function }).findOne({
        where: { id: request.agentId },
        select: ['createdBy'],
      });
      userId = (agent as { createdBy?: string })?.createdBy;
    }

    if (!userId) {
      throw new Error('User ID required for UserSpecificStrategy');
    }

    const userPreference = await (context.userLLMPreferenceRepository as { findOne: Function }).findOne({
      where: { userId, taskType: request.taskType, isActive: true },
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
      selectionStrategy: this.name,
    };
  }

  private calculateConfidence(performanceScore: number, _source: 'user'): number {
    return Math.min(0.85, 0.5 + performanceScore * 0.35);
  }
}

/**
 * Performance-optimized strategy
 * Adjusts models based on historical performance data
 */
export class PerformanceOptimizedStrategy implements ModelSelectionStrategy {
  name = 'PerformanceOptimizedStrategy';
  priority = 600;

  canHandle(_request: ModelSelectionRequest): boolean {
    return true; // Can always provide a performance-optimized selection
  }

  async select(
    request: ModelSelectionRequest,
    context: ModelSelectionContext
  ): Promise<ModelSelectionResult> {
    // Start with system defaults
    const systemDefault = context.systemDefaults[request.taskType];

    // Try to find better performing alternatives based on user/agent history
    let bestResult = { ...systemDefault };

    if (request.agentId) {
      const agentPerformance = await this.getAgentPerformanceData(
        request.agentId,
        request.taskType,
        context
      );
      if (agentPerformance && agentPerformance.score > 0.7) {
        bestResult = this.optimizeForPerformance(bestResult, agentPerformance);
      }
    }

    bestResult.selectionStrategy = this.name;
    bestResult.reasoning += ' (Performance-optimized based on historical data)';
    return bestResult;
  }

  private async getAgentPerformanceData(
    agentId: string,
    taskType: LLMTaskType,
    context: ModelSelectionContext
  ) {
    const repo = context.agentLLMPreferenceRepository as { find: Function };
    const preferences = await repo.find({
      where: { agentId, taskType },
    }) as Array<{ getPerformanceScore: Function; preferredProvider: LLMProviderType; preferredModel: string }>;

    if (preferences.length === 0) return null;

    const bestPreference = preferences.reduce((best, current) =>
      current.getPerformanceScore() > best.getPerformanceScore() ? current : best
    ) as typeof preferences[0];

    return {
      provider: bestPreference.preferredProvider,
      model: bestPreference.preferredModel,
      score: bestPreference.getPerformanceScore(),
    };
  }

  private optimizeForPerformance(
    baseResult: ModelSelectionResult,
    performanceData: { provider: LLMProviderType; model: string; score: number }
  ): ModelSelectionResult {
    return {
      ...baseResult,
      provider: performanceData.provider,
      model: performanceData.model,
      confidence: Math.min(0.9, baseResult.confidence + 0.1),
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

  async select(
    request: ModelSelectionRequest,
    context: ModelSelectionContext
  ): Promise<ModelSelectionResult> {
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

  private applyContextAdjustments(
    result: ModelSelectionResult,
    context: RoutingRequest,
    taskType: LLMTaskType
  ): ModelSelectionResult {
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

  canHandle(_request: ModelSelectionRequest): boolean {
    return true; // Always can provide defaults
  }

  async select(
    request: ModelSelectionRequest,
    context: ModelSelectionContext
  ): Promise<ModelSelectionResult> {
    const systemDefault = context.systemDefaults[request.taskType];
    return {
      ...systemDefault,
      selectionStrategy: this.name,
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
    agentRepository: unknown,
    userLLMPreferenceRepository: unknown,
    agentLLMPreferenceRepository: unknown,
    llmProviderRepository: unknown
  ) {
    this.context = {
      agentRepository,
      userLLMPreferenceRepository,
      agentLLMPreferenceRepository,
      llmProviderRepository,
      systemDefaults: UNIFIED_SYSTEM_DEFAULTS,
    };

    // Initialize strategies in priority order
    this.strategies = [
      new AgentSpecificStrategy(),
      new UserSpecificStrategy(),
      new ContextAwareStrategy(),
      new PerformanceOptimizedStrategy(),
      new SystemDefaultStrategy(),
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
        // eslint-disable-next-line no-await-in-loop
        const result = await strategy.select(request, this.context);

        logger.info('Model selected successfully', {
          strategy: strategy.name,
          model: result.model,
          provider: result.provider,
          confidence: result.confidence,
          taskType: request.taskType,
        });

        return result;
      } catch (error) {
        logger.warn(`Strategy ${strategy.name} failed`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          taskType: request.taskType,
        });
        errors.push(error instanceof Error ? error : new Error('Unknown error'));
        continue;
      }
    }

    // If all strategies failed, this shouldn't happen as SystemDefaultStrategy should always work
    throw new Error(
      `All model selection strategies failed: ${errors.map((e) => e.message).join(', ')}`
    );
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
        // eslint-disable-next-line no-await-in-loop
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
      urgency: 'medium', // Default urgency for system tasks
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
      const agentPrefRepo = this.context.agentLLMPreferenceRepository as { findOne: Function; save: Function };
      const userPrefRepo = this.context.userLLMPreferenceRepository as { findOne: Function; save: Function };

      // Update agent-specific stats if applicable
      if (request.agentId && result.source === 'agent') {
        const agentPreference = await agentPrefRepo.findOne({
          where: { agentId: request.agentId, taskType: request.taskType, isActive: true },
        });

        if (agentPreference) {
          (agentPreference as { updateUsageStats: Function }).updateUsageStats(responseTime, success, quality);
          await agentPrefRepo.save(agentPreference);
        }
      }

      // Update user-specific stats if applicable
      if (request.userId && result.source === 'user') {
        const userPreference = await userPrefRepo.findOne({
          where: { userId: request.userId, taskType: request.taskType, isActive: true },
        });

        if (userPreference) {
          (userPreference as { updateUsageStats: Function }).updateUsageStats(responseTime, success);
          await userPrefRepo.save(userPreference);
        }
      }

      logger.info('Usage stats updated', {
        strategy: result.selectionStrategy,
        success,
        responseTime,
        quality,
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
