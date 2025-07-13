import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserLLMPreference } from '../entities/userLLMPreference.entity.js';
import { AgentLLMPreference } from '../entities/agentLLMPreference.entity.js';
import { Agent } from '../entities/agent.entity.js';
import { LLMTaskType, LLMProviderType, UserLLMPreference as UserLLMPreferenceType, RoutingRequest } from '@uaip/types';

export interface ResolvedLLMPreference {
  provider: LLMProviderType;
  model: string;
  fallbackModel?: string;
  settings?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    systemPrompt?: string;
    customSettings?: Record<string, any>;
  };
  source: 'agent' | 'user' | 'system';
  reasoning: string;
  confidence: number; // 0-1 confidence in this preference
}

// System defaults for different task types - Updated to use available models
const SYSTEM_DEFAULTS: Record<LLMTaskType, ResolvedLLMPreference> = {
  [LLMTaskType.SUMMARIZATION]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.3, maxTokens: 1000 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet optimized for concise, accurate summarization',
    confidence: 0.8
  },
  [LLMTaskType.VISION]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.2, maxTokens: 2000 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet excellent for vision analysis and description',
    confidence: 0.9
  },
  [LLMTaskType.TOOL_CALLING]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.1, maxTokens: 4000 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet reliable for structured tool calling and function execution',
    confidence: 0.9
  },
  [LLMTaskType.SPEECH_TO_TEXT]: {
    provider: LLMProviderType.OPENAI,
    model: 'whisper-1',
    settings: { temperature: 0 },
    source: 'system',
    reasoning: 'OpenAI Whisper specialized for speech transcription',
    confidence: 1.0
  },
  [LLMTaskType.TEXT_TO_SPEECH]: {
    provider: LLMProviderType.OPENAI,
    model: 'tts-1',
    settings: {},
    source: 'system',
    reasoning: 'OpenAI TTS for text-to-speech generation',
    confidence: 0.9
  },
  [LLMTaskType.CODE_GENERATION]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.2, maxTokens: 8000 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet strong for code generation and analysis',
    confidence: 0.85
  },
  [LLMTaskType.REASONING]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.3, maxTokens: 4000 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet best available for complex reasoning tasks',
    confidence: 0.95
  },
  [LLMTaskType.CREATIVE_WRITING]: {
    provider: LLMProviderType.OPENAI,
    model: 'gpt-4o-mini',
    settings: { temperature: 0.7, maxTokens: 4000 },
    source: 'system',
    reasoning: 'GPT-4o Mini excellent for creative and varied writing styles',
    confidence: 0.8
  },
  [LLMTaskType.TRANSLATION]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.2, maxTokens: 2000 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet reliable for accurate translation',
    confidence: 0.8
  },
  [LLMTaskType.EMBEDDINGS]: {
    provider: LLMProviderType.OPENAI,
    model: 'text-embedding-3-large',
    settings: {},
    source: 'system',
    reasoning: 'OpenAI embeddings for vector similarity',
    confidence: 0.9
  },
  [LLMTaskType.CLASSIFICATION]: {
    provider: LLMProviderType.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.1, maxTokens: 500 },
    source: 'system',
    reasoning: 'Claude 3.5 Sonnet fast and accurate for classification tasks',
    confidence: 0.85
  }
};

@Injectable()
export class LLMPreferenceResolutionService {
  constructor(
    @InjectRepository(UserLLMPreference)
    private userLLMPreferenceRepository: Repository<UserLLMPreference>,
    @InjectRepository(AgentLLMPreference)
    private agentLLMPreferenceRepository: Repository<AgentLLMPreference>,
    @InjectRepository(Agent)
    private agentRepository: Repository<Agent>
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
    if (agentPreference && agentPreference.isActive) {
      return {
        provider: agentPreference.preferredProvider,
        model: agentPreference.preferredModel,
        fallbackModel: agentPreference.fallbackModel,
        settings: agentPreference.getEffectiveSettings(),
        source: 'agent',
        reasoning: `Agent-specific preference: ${agentPreference.reasoning || 'Optimized for agent role'}`,
        confidence: this.calculateConfidence(agentPreference.getPerformanceScore(), 'agent')
      };
    }

    // Step 2: Check for user-specific preference
    const agent = await this.agentRepository.findOne({
      where: { id: agentId },
      select: ['createdBy']
    });

    if (agent?.createdBy) {
      const userPreference = await this.getUserPreference(agent.createdBy, taskType);
      if (userPreference && userPreference.isActive) {
        return {
          provider: userPreference.preferredProvider,
          model: userPreference.preferredModel,
          fallbackModel: userPreference.fallbackModel,
          settings: userPreference.getEffectiveSettings(),
          source: 'user',
          reasoning: `User preference: ${userPreference.description || 'User-defined default'}`,
          confidence: this.calculateConfidence(userPreference.getPerformanceScore(), 'user')
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
        confidence: this.calculateConfidence(userPreference.getPerformanceScore(), 'user')
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
    // Update agent-specific stats if preference exists
    const agentPreference = await this.getAgentPreference(agentId, taskType);
    if (agentPreference) {
      agentPreference.updateUsageStats(responseTime, success, quality);
      await this.agentLLMPreferenceRepository.save(agentPreference);
    }

    // Update user-specific stats
    const agent = await this.agentRepository.findOne({
      where: { id: agentId },
      select: ['createdBy']
    });

    if (agent?.createdBy) {
      const userPreference = await this.getUserPreference(agent.createdBy, taskType);
      if (userPreference) {
        userPreference.updateUsageStats(responseTime, success);
        await this.userLLMPreferenceRepository.save(userPreference);
      }
    }
  }

  // Private helper methods
  private async getAgentPreference(agentId: string, taskType: LLMTaskType): Promise<AgentLLMPreference | null> {
    return this.agentLLMPreferenceRepository.findOne({
      where: { agentId, taskType, isActive: true }
    });
  }

  private async getUserPreference(userId: string, taskType: LLMTaskType): Promise<UserLLMPreference | null> {
    return this.userLLMPreferenceRepository.findOne({
      where: { userId, taskType, isActive: true }
    });
  }

  private calculateConfidence(performanceScore: number, source: 'agent' | 'user'): number {
    // Agent preferences get higher confidence if they have good performance
    // User preferences get moderate confidence
    // System defaults get baseline confidence
    
    if (source === 'agent') {
      return Math.min(0.95, 0.6 + (performanceScore * 0.35));
    } else if (source === 'user') {
      return Math.min(0.85, 0.5 + (performanceScore * 0.35));
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