import { DataSource, DeepPartial } from 'typeorm';
import { BaseSeed } from './BaseSeed.js';
import { UserLLMPreference } from '../../entities/userLLMPreference.entity.js';
import { AgentLLMPreference } from '../../entities/agentLLMPreference.entity.js';
import { UserEntity } from '../../entities/user.entity.js';
import { Agent } from '../../entities/agent.entity.js';
import { LLMProviderType, LLMTaskType } from '@uaip/types';

interface TaskConfiguration {
  primaryProvider: LLMProviderType;
  primaryModel: string;
  fallbackModel: string;
  priority: number;
  description: string;
  settings: {
    temperature: number;
    maxTokens: number;
    topP: number;
    systemPrompt?: string;
    customSettings?: Record<string, any>;
  };
  reasoning?: string;
}

/**
 * LLM Preferences Seed
 * 
 * Creates intelligent default LLM preferences for users and agents based on:
 * - Task type optimization (different models excel at different tasks)
 * - Provider availability and reliability
 * - Performance characteristics (speed vs quality trade-offs)
 * - Cost considerations (using smaller models for simpler tasks)
 */
export class LLMPreferencesSeed extends BaseSeed<UserLLMPreference> {
  private users: UserEntity[];
  private agents: Agent[];

  constructor(dataSource: DataSource, users: UserEntity[], agents: Agent[]) {
    super(dataSource, dataSource.getRepository(UserLLMPreference), 'LLM Preferences');
    this.users = users;
    this.agents = agents;
  }

  getUniqueField(): keyof UserLLMPreference {
    // Use a composite unique constraint simulation (userId + taskType)
    return 'userId' as keyof UserLLMPreference;
  }

  async getSeedData(): Promise<DeepPartial<UserLLMPreference>[]> {
    const userPreferences = this.generateUserPreferences();
    const agentPreferences = this.generateAgentPreferences();
    
    // Seed both user and agent preferences
    await this.seedAgentPreferences(agentPreferences);
    
    return userPreferences;
  }

  private generateUserPreferences(): DeepPartial<UserLLMPreference>[] {
    const preferences: DeepPartial<UserLLMPreference>[] = [];
    
    for (const user of this.users) {
      preferences.push(...this.createUserTaskPreferences(user.id));
    }
    
    return preferences;
  }

  private generateAgentPreferences(): DeepPartial<AgentLLMPreference>[] {
    const preferences: DeepPartial<AgentLLMPreference>[] = [];
    
    for (const agent of this.agents) {
      preferences.push(...this.createAgentTaskPreferences(agent.id, agent.name, agent.description));
    }
    
    return preferences;
  }

  private createUserTaskPreferences(userId: string): DeepPartial<UserLLMPreference>[] {
    const taskConfigurations = this.getTaskConfigurations();
    
    return Object.entries(taskConfigurations).map(([taskType, config]) => ({
      userId,
      taskType: taskType as LLMTaskType,
      preferredProvider: config.primaryProvider,
      preferredModel: config.primaryModel,
      fallbackModel: config.fallbackModel,
      settings: config.settings,
      isActive: true,
      priority: config.priority,
      description: config.description,
      usageCount: '0',
    }));
  }

  private createAgentTaskPreferences(agentId: string, agentName: string, agentDescription: string): DeepPartial<AgentLLMPreference>[] {
    const taskConfigurations = this.getAgentOptimizedTaskConfigurations(agentName, agentDescription);
    
    return Object.entries(taskConfigurations).map(([taskType, config]) => ({
      agentId,
      taskType: taskType as LLMTaskType,
      preferredProvider: config.primaryProvider,
      preferredModel: config.primaryModel,
      fallbackModel: config.fallbackModel,
      settings: config.settings,
      isActive: true,
      priority: config.priority,
      description: config.description,
      reasoning: config.reasoning,
      usageCount: '0',
    }));
  }

  private getTaskConfigurations(): Record<LLMTaskType, TaskConfiguration> {
    return {
      [LLMTaskType.CODE_GENERATION]: {
        primaryProvider: LLMProviderType.ANTHROPIC,
        primaryModel: 'claude-3-5-sonnet-20241022',
        fallbackModel: 'gpt-4o',
        priority: 90,
        description: 'High-quality code generation with Claude Sonnet',
        settings: {
          temperature: 0.1,
          maxTokens: 4000,
          topP: 0.9,
          systemPrompt: 'You are an expert software engineer. Write clean, efficient, and well-documented code.'
        }
      },
      [LLMTaskType.REASONING]: {
        primaryProvider: LLMProviderType.ANTHROPIC,
        primaryModel: 'claude-3-5-sonnet-20241022',
        fallbackModel: 'gpt-4o',
        priority: 95,
        description: 'Complex reasoning and analysis with Claude Sonnet',
        settings: {
          temperature: 0.2,
          maxTokens: 3000,
          topP: 0.9,
          systemPrompt: 'Think step by step and provide detailed reasoning for your conclusions.'
        }
      },
      [LLMTaskType.TOOL_CALLING]: {
        primaryProvider: LLMProviderType.OPENAI,
        primaryModel: 'gpt-4o-mini',
        fallbackModel: 'gpt-4o',
        priority: 85,
        description: 'Fast and reliable tool execution with GPT-4o-mini',
        settings: {
          temperature: 0.1,
          maxTokens: 2000,
          topP: 0.9,
          systemPrompt: 'Execute tool calls accurately and efficiently.'
        }
      },
      [LLMTaskType.SUMMARIZATION]: {
        primaryProvider: LLMProviderType.ANTHROPIC,
        primaryModel: 'claude-3-5-haiku-20241022',
        fallbackModel: 'gpt-4o-mini',
        priority: 80,
        description: 'Efficient summarization with Claude Haiku',
        settings: {
          temperature: 0.3,
          maxTokens: 1000,
          topP: 0.9,
          systemPrompt: 'Provide concise and accurate summaries capturing key information.'
        }
      },
      [LLMTaskType.CREATIVE_WRITING]: {
        primaryProvider: LLMProviderType.ANTHROPIC,
        primaryModel: 'claude-3-5-sonnet-20241022',
        fallbackModel: 'gpt-4o',
        priority: 75,
        description: 'Creative content generation with high temperature',
        settings: {
          temperature: 0.8,
          maxTokens: 2000,
          topP: 0.95,
          systemPrompt: 'Be creative and engaging while maintaining quality and coherence.'
        }
      },
      [LLMTaskType.TRANSLATION]: {
        primaryProvider: LLMProviderType.OPENAI,
        primaryModel: 'gpt-4o',
        fallbackModel: 'gpt-4o-mini',
        priority: 70,
        description: 'Accurate translation with GPT-4o',
        settings: {
          temperature: 0.2,
          maxTokens: 2000,
          topP: 0.9,
          systemPrompt: 'Provide accurate translations while preserving meaning and context.'
        }
      },
      [LLMTaskType.CLASSIFICATION]: {
        primaryProvider: LLMProviderType.OPENAI,
        primaryModel: 'gpt-4o-mini',
        fallbackModel: 'gpt-3.5-turbo',
        priority: 65,
        description: 'Fast classification with GPT-4o-mini',
        settings: {
          temperature: 0.1,
          maxTokens: 500,
          topP: 0.9,
          systemPrompt: 'Classify content accurately based on the given criteria.'
        }
      },
      [LLMTaskType.VISION]: {
        primaryProvider: LLMProviderType.OPENAI,
        primaryModel: 'gpt-4o',
        fallbackModel: 'gpt-4o-mini',
        priority: 85,
        description: 'Image analysis and vision tasks with GPT-4o',
        settings: {
          temperature: 0.3,
          maxTokens: 1500,
          topP: 0.9,
          systemPrompt: 'Analyze images carefully and provide detailed, accurate descriptions.'
        }
      },
      [LLMTaskType.EMBEDDINGS]: {
        primaryProvider: LLMProviderType.OPENAI,
        primaryModel: 'text-embedding-3-large',
        fallbackModel: 'text-embedding-3-small',
        priority: 90,
        description: 'High-quality embeddings with OpenAI',
        settings: {
          temperature: 0.0,
          maxTokens: 8191,
          topP: 1.0,
        }
      },
      [LLMTaskType.SPEECH_TO_TEXT]: {
        primaryProvider: LLMProviderType.OPENAI,
        primaryModel: 'whisper-1',
        fallbackModel: 'whisper-1',
        priority: 80,
        description: 'Speech transcription with Whisper',
        settings: {
          temperature: 0.0,
          maxTokens: 1000,
          topP: 1.0,
        }
      },
      [LLMTaskType.TEXT_TO_SPEECH]: {
        primaryProvider: LLMProviderType.OPENAI,
        primaryModel: 'tts-1',
        fallbackModel: 'tts-1-hd',
        priority: 80,
        description: 'Text to speech conversion',
        settings: {
          temperature: 0.0,
          maxTokens: 4096,
          topP: 1.0,
          customSettings: {
            voice: 'alloy',
            speed: 1.0
          }
        }
      }
    };
  }

  private getAgentOptimizedTaskConfigurations(agentName: string, agentDescription: string): Record<LLMTaskType, TaskConfiguration> {
    const baseConfigs = this.getTaskConfigurations();
    
    // Agent-specific optimizations based on their role
    const agentOptimizations = this.getAgentSpecificOptimizations(agentName, agentDescription);
    
    // Apply agent-specific modifications
    Object.entries(agentOptimizations).forEach(([taskType, optimization]) => {
      if (baseConfigs[taskType as LLMTaskType]) {
        baseConfigs[taskType as LLMTaskType] = {
          ...baseConfigs[taskType as LLMTaskType],
          ...optimization,
          reasoning: optimization.reasoning || `Optimized for ${agentName} agent role`,
        };
      }
    });
    
    return baseConfigs;
  }

  private getAgentSpecificOptimizations(agentName: string, agentDescription: string): Partial<Record<LLMTaskType, Partial<TaskConfiguration>>> {
    const name = agentName.toLowerCase();
    const description = agentDescription.toLowerCase();
    
    // Code-focused agents
    if (name.includes('engineer') || name.includes('developer') || description.includes('code')) {
      return {
        [LLMTaskType.CODE_GENERATION]: {
          priority: 100,
          reasoning: 'Engineering agent optimized for code generation',
          settings: {
            temperature: 0.05, // Even lower for more deterministic code
            maxTokens: 6000,   // More tokens for complex code
            topP: 0.9,
          }
        },
        [LLMTaskType.REASONING]: {
          priority: 95,
          reasoning: 'Engineers need strong reasoning for system design',
        }
      };
    }
    
    // Research and analysis agents
    if (name.includes('research') || name.includes('analyst') || description.includes('analysis')) {
      return {
        [LLMTaskType.REASONING]: {
          priority: 100,
          reasoning: 'Research agent requires advanced reasoning capabilities',
          settings: {
            temperature: 0.15,
            maxTokens: 4000,
            topP: 0.9,
          }
        },
        [LLMTaskType.SUMMARIZATION]: {
          priority: 95,
          reasoning: 'Research agents frequently summarize findings',
        }
      };
    }
    
    // Creative agents
    if (name.includes('creative') || name.includes('writer') || description.includes('creative')) {
      return {
        [LLMTaskType.CREATIVE_WRITING]: {
          priority: 100,
          reasoning: 'Creative agent optimized for writing tasks',
          settings: {
            temperature: 0.9,
            maxTokens: 3000,
            topP: 0.95,
          }
        }
      };
    }
    
    // Support and customer service agents
    if (name.includes('support') || name.includes('service') || description.includes('help')) {
      return {
        [LLMTaskType.CLASSIFICATION]: {
          priority: 95,
          reasoning: 'Support agents need to classify user issues quickly',
        },
        [LLMTaskType.SUMMARIZATION]: {
          priority: 90,
          reasoning: 'Support agents summarize conversations and issues',
        }
      };
    }
    
    // Default optimization for general agents
    return {
      [LLMTaskType.REASONING]: {
        reasoning: 'General agent with balanced reasoning capabilities',
      }
    };
  }

  private async seedAgentPreferences(agentPreferences: DeepPartial<AgentLLMPreference>[]): Promise<void> {
    try {
      const agentLLMPrefRepo = this.dataSource.getRepository(AgentLLMPreference);
      
      console.log(`   🌱 Seeding ${agentPreferences.length} agent LLM preferences...`);
      
      // Use bulk insert for efficiency
      if (agentPreferences.length > 0) {
        await agentLLMPrefRepo.save(agentPreferences);
        console.log(`   ✅ Successfully seeded ${agentPreferences.length} agent LLM preferences`);
      }
    } catch (error) {
      console.error('   ❌ Failed to seed agent LLM preferences:', error);
      throw error;
    }
  }
}