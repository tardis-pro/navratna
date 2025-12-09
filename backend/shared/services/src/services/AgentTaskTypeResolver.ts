import { Agent, AgentLLMPreference } from '../entities/index.js';
import { AgentRole, LLMTaskType, DiscussionDomain } from '@uaip/types';
import { DatabaseService } from '../databaseService.js';
import { logger } from '@uaip/utils';

export interface TaskTypeContext {
  userIntent?: string;
  conversationHistory?: any[];
  requiredCapabilities?: string[];
  domain?: DiscussionDomain;
  action?: string;
}

export class AgentTaskTypeResolver {
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

  async determineTaskType(agent: Agent, context?: TaskTypeContext): Promise<LLMTaskType> {
    logger.info('Determining task type for agent', {
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role,
      context: context ? Object.keys(context) : 'none',
    });

    try {
      // 1. Check agent-specific LLM preferences first
      const agentPreferences = await this.getAgentLLMPreferences(agent.id);
      if (agentPreferences.length > 0) {
        const taskType = this.selectBestTaskTypeFromPreferences(agentPreferences, context);
        logger.info('Task type determined from agent preferences', {
          agentId: agent.id,
          taskType,
          preferencesCount: agentPreferences.length,
        });
        return taskType;
      }

      // 2. Use agent role to task type mapping
      const roleBasedTaskType = this.mapRoleToTaskType(agent.role);
      if (roleBasedTaskType) {
        logger.info('Task type determined from agent role', {
          agentId: agent.id,
          role: agent.role,
          taskType: roleBasedTaskType,
        });
        return roleBasedTaskType;
      }

      // 3. Analyze agent capabilities and configuration
      const capabilityBasedTaskType = this.mapCapabilitiesToTaskType(agent.capabilities);
      if (capabilityBasedTaskType) {
        logger.info('Task type determined from agent capabilities', {
          agentId: agent.id,
          capabilities: agent.capabilities,
          taskType: capabilityBasedTaskType,
        });
        return capabilityBasedTaskType;
      }

      // 4. Use agent name/description patterns (existing logic)
      const nameBasedTaskType = this.mapNameToTaskType(agent.name, agent.description);
      if (nameBasedTaskType) {
        logger.info('Task type determined from agent name/description', {
          agentId: agent.id,
          name: agent.name,
          taskType: nameBasedTaskType,
        });
        return nameBasedTaskType;
      }

      // 5. Context-based determination
      if (context) {
        const contextTaskType = this.mapContextToTaskType(context);
        if (contextTaskType) {
          logger.info('Task type determined from context', {
            agentId: agent.id,
            taskType: contextTaskType,
          });
          return contextTaskType;
        }
      }

      // 6. Default fallback
      logger.info('Task type using default fallback', {
        agentId: agent.id,
        taskType: LLMTaskType.REASONING,
      });
      return LLMTaskType.REASONING;
    } catch (error) {
      logger.error('Error determining task type, using default', {
        agentId: agent.id,
        error: error.message,
        taskType: LLMTaskType.REASONING,
      });
      return LLMTaskType.REASONING;
    }
  }

  private async getAgentLLMPreferences(agentId: string): Promise<AgentLLMPreference[]> {
    try {
      const repository = await this.databaseService.getRepository(AgentLLMPreference);
      const preferences = await repository.find({
        where: { agentId },
        order: { priority: 'DESC' },
      });
      return preferences;
    } catch (error) {
      logger.error('Error fetching agent LLM preferences', {
        agentId,
        error: error.message,
      });
      return [];
    }
  }

  private selectBestTaskTypeFromPreferences(
    preferences: AgentLLMPreference[],
    context?: TaskTypeContext
  ): LLMTaskType {
    // Sort by priority (highest first) and return the task type of the best preference
    const sortedPreferences = preferences.sort((a, b) => b.priority - a.priority);

    // TODO: In the future, we could add context-aware selection logic here
    // For now, just return the highest priority task type
    return sortedPreferences[0].taskType;
  }

  private mapRoleToTaskType(role: AgentRole): LLMTaskType | null {
    const roleTaskMap: Record<AgentRole, LLMTaskType> = {
      [AgentRole.ARCHITECT]: LLMTaskType.REASONING,
      [AgentRole.DESIGNER]: LLMTaskType.CREATIVE_WRITING,
      [AgentRole.EXECUTOR]: LLMTaskType.TOOL_CALLING,
      [AgentRole.ANALYZER]: LLMTaskType.CLASSIFICATION,
      [AgentRole.SPECIALIST]: LLMTaskType.REASONING,
      [AgentRole.ADVISOR]: LLMTaskType.REASONING,
      [AgentRole.STRATEGIST]: LLMTaskType.REASONING,
      [AgentRole.COMMUNICATOR]: LLMTaskType.CREATIVE_WRITING,
      [AgentRole.VALIDATOR]: LLMTaskType.CLASSIFICATION,
      [AgentRole.REVIEWER]: LLMTaskType.SUMMARIZATION,
      [AgentRole.ORCHESTRATOR]: LLMTaskType.REASONING,
      [AgentRole.ASSISTANT]: LLMTaskType.REASONING,
    };
    return roleTaskMap[role] || null;
  }

  private mapCapabilitiesToTaskType(capabilities: string[]): LLMTaskType | null {
    const capabilityTaskMap: Record<string, LLMTaskType> = {
      'code-generation': LLMTaskType.CODE_GENERATION,
      'creative-writing': LLMTaskType.CREATIVE_WRITING,
      translation: LLMTaskType.TRANSLATION,
      summarization: LLMTaskType.SUMMARIZATION,
      classification: LLMTaskType.CLASSIFICATION,
      'tool-execution': LLMTaskType.TOOL_CALLING,
      'speech-recognition': LLMTaskType.SPEECH_TO_TEXT,
      'text-to-speech': LLMTaskType.TEXT_TO_SPEECH,
      'vision-analysis': LLMTaskType.VISION,
      'embedding-generation': LLMTaskType.EMBEDDINGS,
    };

    // Find the first matching capability
    for (const capability of capabilities) {
      if (capabilityTaskMap[capability]) {
        return capabilityTaskMap[capability];
      }
    }
    return null;
  }

  private mapNameToTaskType(name: string, description: string = ''): LLMTaskType | null {
    const nameDesc = `${name} ${description}`.toLowerCase();

    // Code-focused agents
    if (
      nameDesc.includes('engineer') ||
      nameDesc.includes('developer') ||
      nameDesc.includes('code')
    ) {
      return LLMTaskType.CODE_GENERATION;
    }

    // Creative agents
    if (
      nameDesc.includes('creative') ||
      nameDesc.includes('writer') ||
      nameDesc.includes('content')
    ) {
      return LLMTaskType.CREATIVE_WRITING;
    }

    // Research and analysis agents
    if (
      nameDesc.includes('research') ||
      nameDesc.includes('analyst') ||
      nameDesc.includes('analysis')
    ) {
      return LLMTaskType.REASONING;
    }

    // Support agents
    if (nameDesc.includes('support') || nameDesc.includes('service') || nameDesc.includes('help')) {
      return LLMTaskType.CLASSIFICATION;
    }

    // Translation agents
    if (nameDesc.includes('translat') || nameDesc.includes('language')) {
      return LLMTaskType.TRANSLATION;
    }

    // Summarization agents
    if (nameDesc.includes('summar') || nameDesc.includes('brief')) {
      return LLMTaskType.SUMMARIZATION;
    }

    return null;
  }

  private mapContextToTaskType(context: TaskTypeContext): LLMTaskType | null {
    // Map discussion domains to task types
    if (context.domain) {
      const domainTaskMap: Record<string, LLMTaskType> = {
        code_review: LLMTaskType.CODE_GENERATION,
        creative_brainstorming: LLMTaskType.CREATIVE_WRITING,
        technical_support: LLMTaskType.CLASSIFICATION,
        content_creation: LLMTaskType.CREATIVE_WRITING,
        data_analysis: LLMTaskType.REASONING,
        project_planning: LLMTaskType.REASONING,
      };

      const domainStr = context.domain.toString().toLowerCase();
      if (domainTaskMap[domainStr]) {
        return domainTaskMap[domainStr];
      }
    }

    // Analyze user intent for task type hints
    if (context.userIntent) {
      const intent = context.userIntent.toLowerCase();
      if (intent.includes('code') || intent.includes('program') || intent.includes('implement')) {
        return LLMTaskType.CODE_GENERATION;
      }
      if (intent.includes('write') || intent.includes('create') || intent.includes('compose')) {
        return LLMTaskType.CREATIVE_WRITING;
      }
      if (intent.includes('summarize') || intent.includes('summary')) {
        return LLMTaskType.SUMMARIZATION;
      }
      if (intent.includes('translate')) {
        return LLMTaskType.TRANSLATION;
      }
      if (intent.includes('classify') || intent.includes('categorize')) {
        return LLMTaskType.CLASSIFICATION;
      }
    }

    return null;
  }
}
