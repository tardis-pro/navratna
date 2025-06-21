import {
  WorkingMemory,
  WorkingMemoryUpdate,
  Interaction,
  EmotionalState
} from '@uaip/types';

export class WorkingMemoryManager {
  private redisUrl: string;

  constructor(redisUrl: string = 'redis://:uaip_redis_password@redis:6379') {
    this.redisUrl = redisUrl;
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
          uncertainties: []
        }
      },
      shortTermMemory: {
        recentInteractions: [],
        temporaryLearnings: [],
        contextualCues: [],
        emotionalState: {
          mood: 'neutral',
          confidence: 0.7,
          engagement: 0.8,
          stress: 0.2
        }
      },
      workingSet: {
        relevantKnowledge: [],
        activeSkills: [],
        availableTools: [],
        currentStrategy: 'adaptive'
      },
      metadata: {
        lastUpdated: new Date(),
        sessionStarted: new Date(),
        memoryPressure: 0.0,
        consolidationNeeded: false
      }
    };

    await this.storeWorkingMemory(agentId, workingMemory);
    return workingMemory;
  }

  async getWorkingMemory(agentId: string): Promise<WorkingMemory | null> {
    try {
      // In a real implementation, this would use Redis
      // For now, we'll simulate with in-memory storage
      const stored = this.memoryCache.get(this.getWorkingMemoryKey(agentId));
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Working memory retrieval error:', error);
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
        ...update.retrievedEpisodes.map(episode => ({
          itemId: episode.episodeId,
          relevance: episode.significance.importance,
          lastAccessed: new Date()
        }))
      ];
    }

    if (update.relevantConcepts) {
      // Add concepts to working set
      current.workingSet.relevantKnowledge = [
        ...current.workingSet.relevantKnowledge,
        ...update.relevantConcepts.map(concept => ({
          itemId: concept.concept,
          relevance: concept.confidence,
          lastAccessed: new Date()
        }))
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
          timestamp: new Date()
        }
      });

      // Keep only recent interactions
      if (current.shortTermMemory.recentInteractions.length > 20) {
        current.shortTermMemory.recentInteractions = current.shortTermMemory.recentInteractions.slice(0, 20);
      }
    }

    // Update metadata
    current.metadata.lastUpdated = new Date();
    current.metadata.memoryPressure = this.calculateMemoryPressure(current);
    current.metadata.consolidationNeeded = current.metadata.memoryPressure > 0.8;

    await this.storeWorkingMemory(agentId, current);
  }

  async addThought(agentId: string, thought: string, type: 'reasoning' | 'hypothesis' | 'action' | 'uncertainty'): Promise<void> {
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
      ...emotion
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
      current.shortTermMemory.recentInteractions = current.shortTermMemory.recentInteractions.slice(0, 20);
    }

    current.metadata.lastUpdated = new Date();
    await this.storeWorkingMemory(agentId, current);
  }

  private async storeWorkingMemory(agentId: string, memory: WorkingMemory): Promise<void> {
    try {
      // In a real implementation, this would use Redis with TTL
      this.memoryCache.set(this.getWorkingMemoryKey(agentId), JSON.stringify(memory));
    } catch (error) {
      console.error('Working memory storage error:', error);
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

  private trimWorkingMemory(memory: WorkingMemory): void {
    // Trim thoughts to keep most recent and important
    const maxThoughts = 10;
    Object.keys(memory.currentContext.activeThoughts).forEach(key => {
      const thoughts = memory.currentContext.activeThoughts[key as keyof typeof memory.currentContext.activeThoughts];
      if (thoughts.length > maxThoughts) {
        memory.currentContext.activeThoughts[key as keyof typeof memory.currentContext.activeThoughts] = 
          thoughts.slice(-maxThoughts);
      }
    });
  }

  // Simple in-memory cache for demonstration
  // In production, this would be replaced with actual Redis client
  private memoryCache = new Map<string, string>();
} 