import { LLMTaskType, LLMProviderType, RoutingRequest } from '@uaip/types';
import type {
  ModelSelectionRequest,
  ModelSelectionResult,
  FallbackChain,
  ModelSelectionStrategy,
  LLMSettings,
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { AgentRepository } from '../database/repositories/agent_repository';
import { UserLLMPreferenceRepository } from '../database/repositories/user_l_l_m_preference_repository';
import { AgentLLMPreferenceRepository } from '../database/repositories/agent_l_l_m_preference_repository';
import { LLMProviderRepository } from '../database/repositories/l_l_m_provider_repository';

type AgentOwnerRecord = { createdBy?: string };
type PreferenceQuery = {
  where: { agentId?: string; userId?: string; taskType: LLMTaskType; isActive: boolean };
};

type LLMPreferenceRecord = {
  id?: string;
  isActive: boolean;
  preferredProvider: LLMProviderType;
  preferredModel: string;
  fallbackModel?: string;
  reasoning?: string;
  description?: string;
  getEffectiveSettings: () => LLMSettings;
  getPerformanceScore: () => number;
  updateUsageStats: (responseTime: number, success: boolean, quality?: number) => void;
};

type ModelSelectionContext = {
  agentRepository: AgentRepository & {
    findOne: (query: { where: { id: string }; select?: string[] }) => Promise<AgentOwnerRecord | null>;
  };
  userLLMPreferenceRepository: UserLLMPreferenceRepository & {
    findOne: (query: PreferenceQuery) => Promise<LLMPreferenceRecord | null>;
  };
  agentLLMPreferenceRepository: AgentLLMPreferenceRepository & {
    findOne: (query: PreferenceQuery) => Promise<LLMPreferenceRecord | null>;
    find: (query: { where: { agentId: string; taskType: LLMTaskType } }) => Promise<LLMPreferenceRecord[]>;
  };
  llmProviderRepository: LLMProviderRepository;
  systemDefaults: Record<LLMTaskType, ModelSelectionResult>;
};

// =============================================================================
// SYSTEM DEFAULTS CONFIGURATION
// =============================================================================

export const UNIFIED_SYSTEM_DEFAULTS: Record<LLMTaskType, ModelSelectionResult> = {
  [LLMTaskType.SUMMARIZATION]: {
    provider: LLMProviderType.OPENAI,
    model: 'gpt-4o-mini',
    settings: { temperature: 0.3, maxTokens: 1000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.8,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.VISION]: {
    provider: LLMProviderType.OPENAI,
    model: 'gpt-4o-mini',
    settings: { temperature: 0.2, maxTokens: 2000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.9,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.TOOL_CALLING]: {
    provider: LLMProviderType.OPENAI,
    model: 'gpt-4o-mini',
    settings: { temperature: 0.1, maxTokens: 4000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.9,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.SPEECH_TO_TEXT]: {
    provider: LLMProviderType.OPENAI,
    model: 'gpt-4o-mini',
    settings: { temperature: 0 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 1.0,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.TEXT_TO_SPEECH]: {
    provider: LLMProviderType.OPENAI,
    model: 'gpt-4o-mini',
    settings: {},
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.9,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.CODE_GENERATION]: {
    provider: LLMProviderType.OPENAI,
    model: 'gpt-4o-mini',
    settings: { temperature: 0.2, maxTokens: 8000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.85,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.REASONING]: {
    provider: LLMProviderType.OPENAI,
    model: 'gpt-4o-mini',
    settings: { temperature: 0.3, maxTokens: 4000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.95,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.CREATIVE_WRITING]: {
    provider: LLMProviderType.OPENAI,
    model: 'gpt-4o-mini',
    settings: { temperature: 0.7, maxTokens: 4000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.8,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.TRANSLATION]: {
    provider: LLMProviderType.OPENAI,
    model: 'gpt-4o-mini',
    settings: { temperature: 0.2, maxTokens: 2000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.8,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.EMBEDDINGS]: {
    provider: LLMProviderType.OPENAI,
    model: 'gpt-4o-mini',
    settings: {},
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.9,
    selectionStrategy: 'SystemDefaultStrategy',
  },
  [LLMTaskType.CLASSIFICATION]: {
    provider: LLMProviderType.OPENAI,
    model: 'gpt-4o-mini',
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

    const agentPreference = await context.agentLLMPreferenceRepository.findOne({
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
      const agent = await context.agentRepository.findOne({
        where: { id: request.agentId },
        select: ['createdBy'],
      });
      userId = agent?.createdBy;
    }

    if (!userId) {
      throw new Error('User ID required for UserSpecificStrategy');
    }

    const userPreference = await context.userLLMPreferenceRepository.findOne({
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
    const preferences = await context.agentLLMPreferenceRepository.find({
      where: { agentId, taskType },
    });

    if (preferences.length === 0) return null;

    const bestPreference = preferences.reduce((best, current) =>
      current.getPerformanceScore() > best.getPerformanceScore() ? current : best
    );

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
    agentRepository: ModelSelectionContext['agentRepository'],
    userLLMPreferenceRepository: ModelSelectionContext['userLLMPreferenceRepository'],
    agentLLMPreferenceRepository: ModelSelectionContext['agentLLMPreferenceRepository'],
    llmProviderRepository: ModelSelectionContext['llmProviderRepository']
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
      const agentPrefRepo = this.context.agentLLMPreferenceRepository;
      const userPrefRepo = this.context.userLLMPreferenceRepository;

      // Update agent-specific stats if applicable
      if (request.agentId && result.source === 'agent') {
        const agentPreference = await agentPrefRepo.findOne({
          where: { agentId: request.agentId, taskType: request.taskType, isActive: true },
        });

        if (agentPreference) {
          agentPreference.updateUsageStats(responseTime, success, quality);
        }
      }

      // Update user-specific stats if applicable
      if (request.userId && result.source === 'user') {
        const userPreference = await userPrefRepo.findOne({
          where: { userId: request.userId, taskType: request.taskType, isActive: true },
        });

        if (userPreference) {
          userPreference.updateUsageStats(responseTime, success);
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
