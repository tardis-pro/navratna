import { getControlDb } from '../drizzle/clients/index';
import { getIntelligenceDb } from '../drizzle/clients/index';
import {
  userLLMPreferences,
  type UserLLMPreference,
} from '../../database/drizzle/schemas/control_schema';
import { agentLLMPreferences } from '../../database/drizzle/schemas/intelligence_schema';
import { BaseSeed } from './base_seed';
import { LLMTaskType } from '@uaip/types';
import type { InferInsertModel } from 'drizzle-orm';

type UserLLMPreferenceInsert = InferInsertModel<typeof userLLMPreferences>;
type AgentLLMPreferenceInsert = InferInsertModel<typeof agentLLMPreferences>;

type TaskConfig = {
  settings: {
    temperature: number;
    maxTokens: number;
    topP: number;
    systemPrompt: string;
  };
};

export class LLMPreferencesSeed extends BaseSeed {
  private controlDb = getControlDb();
  private intelligenceDb = getIntelligenceDb();
  private userIds: string[] = [];
  private agentIds: string[] = [];

  constructor(userIds: string[], agentIds: string[]) {
    super('LLM Preferences');
    this.userIds = userIds;
    this.agentIds = agentIds;
  }

  async seed(): Promise<UserLLMPreference[]> {
    await this.seedUserPreferences();
    await this.seedAgentPreferences();
    return await this.controlDb.select().from(userLLMPreferences);
  }

  private async seedUserPreferences(): Promise<void> {
    for (const userId of this.userIds) {
      const prefs = this.createUserTaskPreferences(userId);
      for (const pref of prefs) {
        await this.controlDb
          .insert(userLLMPreferences)
          .values(pref)
          .onConflictDoNothing();
      }
    }
  }

  private async seedAgentPreferences(): Promise<void> {
    for (const agentId of this.agentIds) {
      const prefs = this.createAgentTaskPreferences(agentId);
      for (const pref of prefs) {
        await this.intelligenceDb
          .insert(agentLLMPreferences)
          .values(pref)
          .onConflictDoNothing();
      }
    }
  }

  private createUserTaskPreferences(userId: string): UserLLMPreferenceInsert[] {
    const configs = this.getTaskConfigurations();
    return Object.keys(configs).map((taskType) => {
      const config = configs[taskType]!;
      return {
        userId,
        temperature: config.settings.temperature.toString(),
        maxTokens: config.settings.maxTokens,
        systemPrompt: config.settings.systemPrompt,
        preferences: {},
      };
    });
  }

  private createAgentTaskPreferences(agentId: string): AgentLLMPreferenceInsert[] {
    const configs = this.getTaskConfigurations();
    return Object.keys(configs).map((taskType) => {
      const config = configs[taskType]!;
      return {
        agentId,
        temperature: config.settings.temperature,
        maxTokens: config.settings.maxTokens,
        systemPrompt: config.settings.systemPrompt,
        preferences: {},
      };
    });
  }

  private getTaskConfigurations(): Record<string, TaskConfig> {
    return {
      [LLMTaskType.CODE_GENERATION]: {
        settings: {
          temperature: 0.1,
          maxTokens: 4000,
          topP: 0.9,
          systemPrompt: 'You are an expert software engineer.',
        },
      },
      [LLMTaskType.REASONING]: {
        settings: {
          temperature: 0.2,
          maxTokens: 3000,
          topP: 0.9,
          systemPrompt: 'Think step by step.',
        },
      },
      [LLMTaskType.TOOL_CALLING]: {
        settings: {
          temperature: 0.1,
          maxTokens: 2000,
          topP: 0.9,
          systemPrompt: 'Execute tool calls accurately.',
        },
      },
      [LLMTaskType.SUMMARIZATION]: {
        settings: {
          temperature: 0.3,
          maxTokens: 1000,
          topP: 0.9,
          systemPrompt: 'Provide concise summaries.',
        },
      },
      [LLMTaskType.CREATIVE_WRITING]: {
        settings: { temperature: 0.8, maxTokens: 2000, topP: 0.95, systemPrompt: 'Be creative.' },
      },
    };
  }
}
