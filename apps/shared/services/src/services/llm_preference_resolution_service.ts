import { LLMTaskType, LLMProviderType, RoutingRequest } from '@uaip/types';
import type { LLMSettings, ResolvedLLMPreference } from '@uaip/types';
import { UserLLMPreferenceRepository } from '../database/repositories/user_l_l_m_preference_repository';
import { AgentLLMPreferenceRepository } from '../database/repositories/agent_l_l_m_preference_repository';
import { AgentRepository } from '../database/repositories/agent_repository';

type LLMPreferenceRecord = {
  id?: string;
  isActive: boolean;
  preferredProvider: LLMProviderType;
  preferredModel: string;
  fallbackModel?: string;
  description?: string;
  reasoning?: string;
  getEffectiveSettings: () => LLMSettings;
  getPerformanceScore: () => number;
  updateUsageStats: (responseTime: number, success: boolean, quality?: number) => void;
};

type PreferenceQuery = {
  where: {
    userId?: string;
    agentId?: string;
    taskType: LLMTaskType;
    isActive: boolean;
  };
};

type AgentOwnerRepository = AgentRepository & {
  findOne: (query: { where: { id: string }; select?: string[] }) => Promise<{ createdBy?: string } | null>;
};

type UserPreferenceRepository = UserLLMPreferenceRepository & {
  findOne: (query: PreferenceQuery) => Promise<LLMPreferenceRecord | null>;
  update: (
    id: string,
    data: Record<string, string | number | boolean | null>
  ) => Promise<Record<string, string | number | boolean | null> | null>;
};

type AgentPreferenceRepository = AgentLLMPreferenceRepository & {
  findOne: (query: PreferenceQuery) => Promise<LLMPreferenceRecord | null>;
  update: (
    id: string,
    data: Record<string, string | number | boolean | null>
  ) => Promise<Record<string, string | number | boolean | null> | null>;
};

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
    private userLLMPreferenceRepository: UserPreferenceRepository,
    private agentLLMPreferenceRepository: AgentPreferenceRepository,
    private agentRepository: AgentOwnerRepository
  ) {}

  private async getAgentOwner(
    repo: AgentOwnerRepository,
    agentId: string
  ): Promise<string | undefined> {
    const agent = await repo.findOne({ where: { id: agentId }, select: ['createdBy'] });
    return agent?.createdBy;
  }
  async resolveLLMPreference(
    agentId: string,
    taskType: LLMTaskType,
    context?: RoutingRequest
  ): Promise<ResolvedLLMPreference> {
    // Step 1: Check for agent-specific preference
    const agentPreference = await this.getAgentPreference(agentId, taskType);
    if (agentPreference && agentPreference.isActive) {
      return {
        provider: agentPreference.preferredProvider,
        model: agentPreference.preferredModel,
        fallbackModel: agentPreference.fallbackModel,
        settings: agentPreference.getEffectiveSettings(),
        source: 'agent',
        reasoning: `Agent-specific preference: ${agentPreference.reasoning || 'Optimized for agent role'}`,
        confidence: this.calculateConfidence(agentPreference.getPerformanceScore(), 'agent'),
      };
    }

    const createdBy = await this.getAgentOwner(this.agentRepository, agentId);
    if (createdBy) {
      const userPreference = await this.getUserPreference(createdBy, taskType);
      if (userPreference && userPreference.isActive) {
        return {
          provider: userPreference.preferredProvider,
          model: userPreference.preferredModel,
          fallbackModel: userPreference.fallbackModel,
          settings: userPreference.getEffectiveSettings(),
          source: 'user',
          reasoning: `User preference: ${userPreference.description || 'User-defined default'}`,
          confidence: this.calculateConfidence(userPreference.getPerformanceScore(), 'user'),
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
    if (userPreference && userPreference.isActive) {
      return {
        provider: userPreference.preferredProvider,
        model: userPreference.preferredModel,
        fallbackModel: userPreference.fallbackModel,
        settings: userPreference.getEffectiveSettings(),
        source: 'user',
        reasoning: `User preference: ${userPreference.description || 'User-defined default'}`,
        confidence: this.calculateConfidence(userPreference.getPerformanceScore(), 'user'),
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
    const agentPrefRepo = this.agentLLMPreferenceRepository;
    const userPrefRepo = this.userLLMPreferenceRepository;
    const agentRepo = this.agentRepository;

    // Update agent-specific stats if preference exists
    const agentPreference = await this.getAgentPreference(agentId, taskType);
    if (agentPreference) {
      agentPreference.updateUsageStats(responseTime, success, quality);
      if (agentPreference.id) {
        await agentPrefRepo.update(agentPreference.id, {});
      }
    }

    const createdBy = await this.getAgentOwner(agentRepo, agentId);
    if (createdBy) {
      const userPreference = await this.getUserPreference(createdBy, taskType);
      if (userPreference) {
        userPreference.updateUsageStats(responseTime, success);
        if (userPreference.id) {
          await userPrefRepo.update(userPreference.id, {});
        }
      }
    }
  }

  private async getAgentPreference(
    agentId: string,
    taskType: LLMTaskType
  ): Promise<LLMPreferenceRecord | null> {
    return this.agentLLMPreferenceRepository.findOne({
      where: { agentId, taskType, isActive: true },
    });
  }

  private async getUserPreference(
    userId: string,
    taskType: LLMTaskType
  ): Promise<LLMPreferenceRecord | null> {
    return this.userLLMPreferenceRepository.findOne({
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
