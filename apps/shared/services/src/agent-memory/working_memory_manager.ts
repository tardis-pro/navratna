import { WorkingMemory, WorkingMemoryUpdate, Interaction, EmotionalState } from '@uaip/types';
import Redis from 'ioredis';
import { logger } from '@uaip/utils';

export class WorkingMemoryManager {
  private redisUrl: string;
  private readonly redisClient: Redis;
  private readonly workingMemoryTtlSeconds = 24 * 60 * 60;

  constructor(redisUrl: string = 'redis://:uaip_redis_password@redis:6379') {
    this.redisUrl = redisUrl;
    this.redisClient = new Redis(this.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      commandTimeout: 5000,
      connectTimeout: 10000,
    });
    this.setupRedisListeners();
  }

  private setupRedisListeners(): void {
    this.redisClient.on('error', (error) => {
      logger.warn('Working memory Redis error', {
        error: error.message,
      });
    });

    this.redisClient.on('close', () => {
      logger.warn('Working memory Redis connection closed');
    });
  }

  private async getRedisClient(): Promise<Redis | null> {
    try {
      if (this.redisClient.status === 'wait') {
        await this.redisClient.connect();
      }

      return this.redisClient;
    } catch (error) {
      logger.warn('Working memory Redis unavailable, skipping cache operation', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private getWorkingMemoryKey(agentId: string): string {
    return `agent:memory:working:${agentId}`;
  }

  async initializeWorkingMemory(agentId: string, sessionId: string): Promise<WorkingMemory> {
    const workingMemory: WorkingMemory = {
      agentId,
      sessionId,
      currentContext: {
        activeThoughts: {
          reasoning: [],
          hypotheses: [],
          nextActions: [],
          uncertainties: [],
        },
      },
      shortTermMemory: {
        recentInteractions: [],
        temporaryLearnings: [],
        contextualCues: [],
        emotionalState: {
          mood: 'neutral',
          confidence: 0.7,
          engagement: 0.8,
          stress: 0.2,
        },
      },
      workingSet: {
        relevantKnowledge: [],
        activeSkills: [],
        availableTools: [],
        currentStrategy: 'adaptive',
      },
      metadata: {
        lastUpdated: new Date(),
        sessionStarted: new Date(),
        memoryPressure: 0.0,
        consolidationNeeded: false,
      },
    };

    await this.storeWorkingMemory(agentId, workingMemory);
    return workingMemory;
  }

  async getWorkingMemory(agentId: string): Promise<WorkingMemory | null> {
    try {
      const client = await this.getRedisClient();
      if (!client) {
        return null;
      }

      const stored = await client.get(this.getWorkingMemoryKey(agentId));
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      logger.warn('Working memory retrieval error', {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async updateWorkingMemory(agentId: string, update: WorkingMemoryUpdate): Promise<void> {
    const current = await this.getWorkingMemory(agentId);
    if (!current) {
      console.warn(`No working memory found for agent ${agentId}`);
      return;
    }

    // Apply updates
    if (update.currentContext) {
      current.currentContext = { ...current.currentContext, ...update.currentContext };
    }

    if (update.shortTermMemory) {
      current.shortTermMemory = { ...current.shortTermMemory, ...update.shortTermMemory };
    }

    if (update.retrievedEpisodes) {
      // Add retrieved episodes to working set
      current.workingSet.relevantKnowledge = [
        ...current.workingSet.relevantKnowledge,
        ...update.retrievedEpisodes.map((episode) => ({
          itemId: episode.episodeId,
          relevance: episode.significance.importance,
          lastAccessed: new Date(),
        })),
      ];
    }

    if (update.relevantConcepts) {
      // Add concepts to working set
      current.workingSet.relevantKnowledge = [
        ...current.workingSet.relevantKnowledge,
        ...update.relevantConcepts.map((concept) => ({
          itemId: concept.concept,
          relevance: concept.confidence,
          lastAccessed: new Date(),
        })),
      ];
    }

    if (update.lastInteraction) {
      current.shortTermMemory.recentInteractions.unshift({
        id: `interaction-${Date.now()}`,
        type: 'conversation',
        description: update.lastInteraction.input,
        timestamp: update.lastInteraction.timestamp,
        participants: [],
        context: { response: update.lastInteraction.response },
        success: true,
        impact: 0.5,
        novelty: 0.5,
        emotionalIntensity: 0.5,
        emotionalResponse: {
          emotion: 'neutral',
          intensity: 0.5,
          trigger: 'interaction',
          timestamp: new Date(),
        },
      });

      // Keep only recent interactions
      if (current.shortTermMemory.recentInteractions.length > 20) {
        current.shortTermMemory.recentInteractions =
          current.shortTermMemory.recentInteractions.slice(0, 20);
      }
    }

    // Update metadata
    current.metadata.lastUpdated = new Date();
    current.metadata.memoryPressure = this.calculateMemoryPressure(current);
    current.metadata.consolidationNeeded = current.metadata.memoryPressure > 0.8;

    await this.storeWorkingMemory(agentId, current);
    await this.checkMemoryPressure(agentId);
  }

  async checkMemoryPressure(agentId: string): Promise<void> {
    const memory = await this.getWorkingMemory(agentId);
    if (!memory) {
      return;
    }

    const thoughtsCount = Object.values(memory.currentContext.activeThoughts).flat().length;
    const interactionsCount = memory.shortTermMemory.recentInteractions.length;
    const knowledgeCount = memory.workingSet.relevantKnowledge.length;
    const currentItems = thoughtsCount + interactionsCount + knowledgeCount;
    const maxItems = 100;

    const calculatedPressure = Math.min(currentItems / maxItems, 1.0);
    const pressure =
      typeof memory.metadata.memoryPressure === 'number'
        ? memory.metadata.memoryPressure
        : calculatedPressure;

    if (pressure > 0.8) {
      logger.warn('High memory pressure detected', {
        agentId,
        pressure,
        currentItems,
        maxItems,
      });
    }
  }

  async addThought(
    agentId: string,
    thought: string,
    type: 'reasoning' | 'hypothesis' | 'action' | 'uncertainty'
  ): Promise<void> {
    const current = await this.getWorkingMemory(agentId);
    if (!current) return;

    switch (type) {
      case 'reasoning':
        current.currentContext.activeThoughts.reasoning.push(thought);
        break;
      case 'hypothesis':
        current.currentContext.activeThoughts.hypotheses.push(thought);
        break;
      case 'action':
        current.currentContext.activeThoughts.nextActions.push(thought);
        break;
      case 'uncertainty':
        current.currentContext.activeThoughts.uncertainties.push(thought);
        break;
    }

    // Limit working memory size
    this.trimWorkingMemory(current);
    current.metadata.lastUpdated = new Date();

    await this.storeWorkingMemory(agentId, current);
  }

  async updateEmotionalState(agentId: string, emotion: Partial<EmotionalState>): Promise<void> {
    const current = await this.getWorkingMemory(agentId);
    if (!current) return;

    current.shortTermMemory.emotionalState = {
      ...current.shortTermMemory.emotionalState,
      ...emotion,
    };
    current.metadata.lastUpdated = new Date();

    await this.storeWorkingMemory(agentId, current);
  }

  async addInteraction(agentId: string, interaction: Interaction): Promise<void> {
    const current = await this.getWorkingMemory(agentId);
    if (!current) return;

    current.shortTermMemory.recentInteractions.unshift(interaction);

    // Keep only last 20 interactions in working memory
    if (current.shortTermMemory.recentInteractions.length > 20) {
      current.shortTermMemory.recentInteractions = current.shortTermMemory.recentInteractions.slice(
        0,
        20
      );
    }

    current.metadata.lastUpdated = new Date();
    await this.storeWorkingMemory(agentId, current);
  }

  private async storeWorkingMemory(agentId: string, memory: WorkingMemory): Promise<void> {
    try {
      const client = await this.getRedisClient();
      if (!client) {
        return;
      }

      await client.set(
        this.getWorkingMemoryKey(agentId),
        JSON.stringify(memory),
        'EX',
        this.workingMemoryTtlSeconds
      );
    } catch (error) {
      logger.warn('Working memory storage error', {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private calculateMemoryPressure(memory: WorkingMemory): number {
    const thoughtsCount = Object.values(memory.currentContext.activeThoughts).flat().length;
    const interactionsCount = memory.shortTermMemory.recentInteractions.length;
    const knowledgeCount = memory.workingSet.relevantKnowledge.length;

    const totalItems = thoughtsCount + interactionsCount + knowledgeCount;
    const maxCapacity = 100; // Configurable working memory capacity

    return Math.min(totalItems / maxCapacity, 1.0);
  }

  async getActiveAgentIds(): Promise<string[]> {
    try {
      const client = await this.getRedisClient();
      if (!client) {
        return [];
      }

      const prefix = 'agent:memory:working:';
      const agentIds: string[] = [];
      let cursor = '0';

      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = nextCursor;
        for (const key of keys) {
          agentIds.push(key.slice(prefix.length));
        }
      } while (cursor !== '0');

      return agentIds;
    } catch (error) {
      logger.warn('Failed to scan active agent working memory keys', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private trimWorkingMemory(memory: WorkingMemory): void {
    // Trim thoughts to keep most recent and important
    const maxThoughts = 10;
    Object.keys(memory.currentContext.activeThoughts).forEach((key) => {
      const activeThoughts = memory.currentContext.activeThoughts;
      // @ts-expect-error -- Object.keys always returns runtime keys; key is keyof activeThoughts at runtime
      const thoughts: string[] = activeThoughts[key];
      if (thoughts.length > maxThoughts) {
        // @ts-expect-error -- Object.keys always returns runtime keys; key is keyof activeThoughts at runtime
        activeThoughts[key] = thoughts.slice(-maxThoughts);
      }
    });
  }
}
