import { LLMTaskType, LLMProviderType, RoutingRequest } from '@uaip/types';
import type { ResolvedLLMPreference } from '@uaip/types';

// System defaults for different task types - Updated to use available models
const SYSTEM_DEFAULTS: Record<LLMTaskType, ResolvedLLMPreference> = {
  [LLMTaskType.SUMMARIZATION]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.3, maxTokens: 1000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.8,
  },
  [LLMTaskType.VISION]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.2, maxTokens: 2000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.9,
  },
  [LLMTaskType.TOOL_CALLING]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.1, maxTokens: 4000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.9,
  },
  [LLMTaskType.SPEECH_TO_TEXT]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 1.0,
  },
  [LLMTaskType.TEXT_TO_SPEECH]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: {},
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.9,
  },
  [LLMTaskType.CODE_GENERATION]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.2, maxTokens: 8000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.85,
  },
  [LLMTaskType.REASONING]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.3, maxTokens: 4000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.95,
  },
  [LLMTaskType.CREATIVE_WRITING]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.7, maxTokens: 4000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.8,
  },
  [LLMTaskType.TRANSLATION]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.2, maxTokens: 2000 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.8,
  },
  [LLMTaskType.EMBEDDINGS]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: {},
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.9,
  },
  [LLMTaskType.CLASSIFICATION]: {
    provider: LLMProviderType.LLMSTUDIO,
    model: 'arch-agent-7b-i1',
    settings: { temperature: 0.1, maxTokens: 500 },
    source: 'system',
    reasoning: 'LM Studio local model - system default',
    confidence: 0.85,
  },
};

export class LLMPreferenceResolutionService {
  constructor(
    private userLLMPreferenceRepository: unknown,
    private agentLLMPreferenceRepository: unknown,
    private agentRepository: unknown
  ) {}

  /**
   * Resolve LLM preference for a specific agent and task type
   * Follows hierarchy: Agent -> User -> System defaults
   */
  async resolveLLMPreference(
    agentId: string,
    taskType: LLMTaskType,
    context?: RoutingRequest
  ): Promise<ResolvedLLMPreference> {
    // Step 1: Check for agent-specific preference
    const agentPreference = await this.getAgentPreference(agentId, taskType);
    if (agentPreference && (agentPreference as { isActive: boolean }).isActive) {
      const pref = agentPreference as { preferredProvider: LLMProviderType; preferredModel: string; fallbackModel?: string; getEffectiveSettings: Function; reasoning?: string; getPerformanceScore: Function };
      return {
        provider: pref.preferredProvider,
        model: pref.preferredModel,
        fallbackModel: pref.fallbackModel,
        settings: pref.getEffectiveSettings(),
        source: 'agent',
        reasoning: `Agent-specific preference: ${pref.reasoning || 'Optimized for agent role'}`,
        confidence: this.calculateConfidence(pref.getPerformanceScore(), 'agent'),
      };
    }

    // Step 2: Check for user-specific preference
    const agent = await (this.agentRepository as { findOne: Function }).findOne({
      where: { id: agentId },
      select: ['createdBy'],
    });

    if ((agent as { createdBy?: string })?.createdBy) {
      const userPreference = await this.getUserPreference((agent as { createdBy: string }).createdBy, taskType);
      if (userPreference && (userPreference as { isActive: boolean }).isActive) {
        return {
          provider: (userPreference as { preferredProvider: LLMProviderType }).preferredProvider,
          model: (userPreference as { preferredModel: string }).preferredModel,
          fallbackModel: (userPreference as { fallbackModel?: string }).fallbackModel,
          settings: (userPreference as { getEffectiveSettings: Function }).getEffectiveSettings(),
          source: 'user',
          reasoning: `User preference: ${(userPreference as { description?: string }).description || 'User-defined default'}`,
          confidence: this.calculateConfidence((userPreference as { getPerformanceScore: Function }).getPerformanceScore(), 'user'),
        };
      }
    }

    // Step 3: Fall back to system defaults
    const systemDefault = SYSTEM_DEFAULTS[taskType];

    // Apply context-based adjustments if provided
    if (context) {
      return this.adjustPreferenceForContext(systemDefault, context);
    }

    return systemDefault;
  }

  /**
   * Resolve LLM preference for a user (without agent context)
   */
  async resolveUserLLMPreference(
    userId: string,
    taskType: LLMTaskType,
    context?: RoutingRequest
  ): Promise<ResolvedLLMPreference> {
    // Check for user-specific preference
    const userPreference = await this.getUserPreference(userId, taskType);
    if (userPreference && (userPreference as { isActive: boolean }).isActive) {
      const pref = userPreference as { preferredProvider: LLMProviderType; preferredModel: string; fallbackModel?: string; getEffectiveSettings: Function; description?: string; getPerformanceScore: Function };
      return {
        provider: pref.preferredProvider,
        model: pref.preferredModel,
        fallbackModel: pref.fallbackModel,
        settings: pref.getEffectiveSettings(),
        source: 'user',
        reasoning: `User preference: ${pref.description || 'User-defined default'}`,
        confidence: this.calculateConfidence(pref.getPerformanceScore(), 'user'),
      };
    }

    // Fall back to system defaults
    const systemDefault = SYSTEM_DEFAULTS[taskType];

    if (context) {
      return this.adjustPreferenceForContext(systemDefault, context);
    }

    return systemDefault;
  }

  /**
   * Get the best model for agent routing decisions
   */
  async getRoutingModel(agentId: string, domain?: string): Promise<ResolvedLLMPreference> {
    // For routing decisions, prioritize reasoning capability
    let taskType = LLMTaskType.REASONING;

    // Adjust based on domain if provided
    if (domain) {
      switch (domain.toLowerCase()) {
        case 'code_review':
        case 'technical_architecture':
          taskType = LLMTaskType.CODE_GENERATION;
          break;
        case 'creative_brainstorming':
          taskType = LLMTaskType.CREATIVE_WRITING;
          break;
        case 'compliance_audit':
        case 'security_analysis':
          taskType = LLMTaskType.CLASSIFICATION;
          break;
        default:
          taskType = LLMTaskType.REASONING;
      }
    }

    return this.resolveLLMPreference(agentId, taskType);
  }

  /**
   * Update usage statistics for learning and optimization
   */
  async updateUsageStats(
    agentId: string,
    taskType: LLMTaskType,
    responseTime: number,
    success: boolean,
    quality?: number
  ): Promise<void> {
    const agentPrefRepo = this.agentLLMPreferenceRepository as { findOne: Function; save: Function };
    const userPrefRepo = this.userLLMPreferenceRepository as { findOne: Function; save: Function };
    const agentRepo = this.agentRepository as { findOne: Function };

    // Update agent-specific stats if preference exists
    const agentPreference = await this.getAgentPreference(agentId, taskType);
    if (agentPreference) {
      (agentPreference as { updateUsageStats: Function }).updateUsageStats(responseTime, success, quality);
      await agentPrefRepo.save(agentPreference);
    }

    // Update user-specific stats
    const agent = await agentRepo.findOne({
      where: { id: agentId },
      select: ['createdBy'],
    });

    if ((agent as { createdBy?: string })?.createdBy) {
      const userPreference = await this.getUserPreference((agent as { createdBy: string }).createdBy, taskType);
      if (userPreference) {
        (userPreference as { updateUsageStats: Function }).updateUsageStats(responseTime, success);
        await userPrefRepo.save(userPreference);
      }
    }
  }

  private async getAgentPreference(
    agentId: string,
    taskType: LLMTaskType
  ): Promise<unknown | null> {
    const repo = this.agentLLMPreferenceRepository as { findOne: Function };
    return repo.findOne({
      where: { agentId, taskType, isActive: true },
    });
  }

  private async getUserPreference(
    userId: string,
    taskType: LLMTaskType
  ): Promise<unknown | null> {
    const repo = this.userLLMPreferenceRepository as { findOne: Function };
    return repo.findOne({
      where: { userId, taskType, isActive: true },
    });
  }

  private calculateConfidence(performanceScore: number, source: 'agent' | 'user'): number {
    // Agent preferences get higher confidence if they have good performance
    // User preferences get moderate confidence
    // System defaults get baseline confidence

    if (source === 'agent') {
      return Math.min(0.95, 0.6 + performanceScore * 0.35);
    } else if (source === 'user') {
      return Math.min(0.85, 0.5 + performanceScore * 0.35);
    }

    return 0.7; // System default confidence
  }

  private adjustPreferenceForContext(
    preference: ResolvedLLMPreference,
    context: RoutingRequest
  ): ResolvedLLMPreference {
    const adjusted = { ...preference };

    // Adjust based on urgency
    if (context.context?.urgency === 'critical') {
      // For critical tasks, prefer faster models
      if (preference.model.includes('opus')) {
        adjusted.model = adjusted.model.replace('opus', 'sonnet');
        adjusted.reasoning += ' (Switched to faster model for critical urgency)';
      }

      // Reduce temperature for more deterministic results
      if (adjusted.settings?.temperature && adjusted.settings.temperature > 0.2) {
        adjusted.settings = { ...adjusted.settings, temperature: 0.2 };
      }
    }

    // Adjust based on complexity
    if (context.context?.complexity === 'high') {
      // For complex tasks, prefer more capable models
      if (preference.model.includes('haiku')) {
        adjusted.model = adjusted.model.replace('haiku', 'sonnet');
        adjusted.reasoning += ' (Upgraded to more capable model for high complexity)';
      }
    }

    return adjusted;
  }
}
