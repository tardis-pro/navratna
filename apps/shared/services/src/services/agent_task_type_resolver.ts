import { AgentRole, LLMTaskType, DiscussionDomain } from '@uaip/types';
import { DatabaseService } from '../database_service';
import { logger } from '@uaip/utils';
import type { Agent } from '../database/drizzle/schemas/intelligence_schema';

export interface TaskTypeContext {
  userIntent?: string;
  conversationHistory?: unknown[];
  requiredCapabilities?: string[];
  domain?: DiscussionDomain;
  action?: string;
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];
type AgentPreferenceWithTaskType = { [key: string]: JsonValue };

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

      const roleBasedTaskType = this.mapRoleToTaskType(agent.role);
      if (roleBasedTaskType) {
        logger.info('Task type determined from agent role', {
          agentId: agent.id,
          role: agent.role,
          taskType: roleBasedTaskType,
        });
        return roleBasedTaskType;
      }

      const capabilityBasedTaskType = this.mapCapabilitiesToTaskType(
        agent.capabilities || []
      );
      if (capabilityBasedTaskType) {
        logger.info('Task type determined from agent capabilities', {
          agentId: agent.id,
          capabilities: agent.capabilities,
          taskType: capabilityBasedTaskType,
        });
        return capabilityBasedTaskType;
      }

      const nameBasedTaskType = this.mapNameToTaskType(agent.name, agent.description || '');
      if (nameBasedTaskType) {
        logger.info('Task type determined from agent name/description', {
          agentId: agent.id,
          name: agent.name,
          taskType: nameBasedTaskType,
        });
        return nameBasedTaskType;
      }

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

      logger.info('Task type using default fallback', {
        agentId: agent.id,
        taskType: LLMTaskType.REASONING,
      });
      return LLMTaskType.REASONING;
    } catch (error) {
      logger.error('Error determining task type, using default', {
        agentId: agent.id,
        error: error instanceof Error ? error.message : String(error),
        taskType: LLMTaskType.REASONING,
      });
      return LLMTaskType.REASONING;
    }
  }

  private async getAgentLLMPreferences(agentId: string): Promise<AgentPreferenceWithTaskType[]> {
    try {
      const tableName = 'agent_llm_preferences';
      const preferences = await this.databaseService.findMany<AgentPreferenceWithTaskType>(
        tableName,
        { agent_id: agentId }
      );
      return preferences;
    } catch (error) {
      logger.error('Error fetching agent LLM preferences', {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private selectBestTaskTypeFromPreferences(
    preferences: AgentPreferenceWithTaskType[],
    _context?: TaskTypeContext
  ): LLMTaskType {
    const pref = preferences[0];
    if (pref?.taskType && typeof pref.taskType === 'string') {
      const matched = Object.values(LLMTaskType).find((t) => t === pref.taskType);
      if (matched !== undefined) {
        return matched;
      }
    }
    return LLMTaskType.REASONING;
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

    for (const capability of capabilities) {
      if (capabilityTaskMap[capability]) {
        return capabilityTaskMap[capability];
      }
    }
    return null;
  }

  private mapNameToTaskType(name: string, description: string = ''): LLMTaskType | null {
    const nameDesc = `${name} ${description}`.toLowerCase();

    if (
      nameDesc.includes('engineer') ||
      nameDesc.includes('developer') ||
      nameDesc.includes('code')
    ) {
      return LLMTaskType.CODE_GENERATION;
    }

    if (
      nameDesc.includes('creative') ||
      nameDesc.includes('writer') ||
      nameDesc.includes('content')
    ) {
      return LLMTaskType.CREATIVE_WRITING;
    }

    if (
      nameDesc.includes('research') ||
      nameDesc.includes('analyst') ||
      nameDesc.includes('analysis')
    ) {
      return LLMTaskType.REASONING;
    }

    if (nameDesc.includes('support') || nameDesc.includes('service') || nameDesc.includes('help')) {
      return LLMTaskType.CLASSIFICATION;
    }

    if (nameDesc.includes('translat') || nameDesc.includes('language')) {
      return LLMTaskType.TRANSLATION;
    }

    if (nameDesc.includes('summar') || nameDesc.includes('brief')) {
      return LLMTaskType.SUMMARIZATION;
    }

    return null;
  }

  private mapContextToTaskType(context: TaskTypeContext): LLMTaskType | null {
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
