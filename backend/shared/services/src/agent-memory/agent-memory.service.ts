import {
  WorkingMemory,
  WorkingMemoryUpdate,
  Episode,
  EpisodicQuery,
  SemanticMemory,
  ConsolidationResult
} from '@uaip/types';
import { WorkingMemoryManager } from './working-memory.manager.js';
import { EpisodicMemoryManager } from './episodic-memory.manager.js';
import { SemanticMemoryManager } from './semantic-memory.manager.js';
import { MemoryConsolidator } from './memory-consolidator.service.js';

export class AgentMemoryService {
  constructor(
    private readonly workingMemoryManager: WorkingMemoryManager,
    private readonly episodicMemoryManager: EpisodicMemoryManager,
    private readonly semanticMemoryManager: SemanticMemoryManager,
    private readonly memoryConsolidator: MemoryConsolidator
  ) {}

  // Working Memory Operations
  async getWorkingMemory(agentId: string): Promise<WorkingMemory | null> {
    return this.workingMemoryManager.getWorkingMemory(agentId);
  }

  async updateWorkingMemory(agentId: string, update: WorkingMemoryUpdate): Promise<void> {
    await this.workingMemoryManager.updateWorkingMemory(agentId, update);
  }

  async initializeWorkingMemory(agentId: string, sessionId: string): Promise<WorkingMemory> {
    return this.workingMemoryManager.initializeWorkingMemory(agentId, sessionId);
  }

  async addThought(agentId: string, thought: string, type: 'reasoning' | 'hypothesis' | 'action' | 'uncertainty'): Promise<void> {
    await this.workingMemoryManager.addThought(agentId, thought, type);
  }

  async updateEmotionalState(agentId: string, emotion: Partial<any>): Promise<void> {
    await this.workingMemoryManager.updateEmotionalState(agentId, emotion);
  }

  // Episodic Memory Operations
  async getEpisodicMemory(agentId: string, query: EpisodicQuery): Promise<Episode[]> {
    return this.episodicMemoryManager.retrieveEpisodes(agentId, query);
  }

  async storeEpisode(agentId: string, episode: Episode): Promise<void> {
    await this.episodicMemoryManager.storeEpisode(agentId, episode);
  }

  async findSimilarEpisodes(agentId: string, currentSituation: string): Promise<Episode[]> {
    return this.episodicMemoryManager.findSimilarEpisodes(agentId, currentSituation);
  }

  async getEpisodesByTimeRange(agentId: string, startDate: Date, endDate: Date): Promise<Episode[]> {
    return this.episodicMemoryManager.getEpisodesByTimeRange(agentId, startDate, endDate);
  }

  // Semantic Memory Operations
  async getSemanticMemory(agentId: string, concept: string): Promise<SemanticMemory[]> {
    const conceptMemory = await this.semanticMemoryManager.getConcept(agentId, concept);
    return conceptMemory ? [conceptMemory] : [];
  }

  async updateSemanticMemory(agentId: string, concept: SemanticMemory): Promise<void> {
    await this.semanticMemoryManager.storeConcept(agentId, concept);
  }

  async getRelatedConcepts(agentId: string, conceptName: string): Promise<SemanticMemory[]> {
    return this.semanticMemoryManager.getRelatedConcepts(agentId, conceptName);
  }

  async updateConceptUsage(agentId: string, conceptName: string, success: boolean): Promise<void> {
    await this.semanticMemoryManager.updateConceptUsage(agentId, conceptName, success);
  }

  // Memory Consolidation
  async consolidateMemories(agentId: string): Promise<ConsolidationResult> {
    return this.memoryConsolidator.consolidateMemories(agentId);
  }

  async shouldConsolidate(agentId: string): Promise<boolean> {
    const workingMemory = await this.getWorkingMemory(agentId);
    return workingMemory?.metadata.consolidationNeeded || false;
  }

  // Memory Analytics
  async getMemoryStatistics(agentId: string): Promise<{
    workingMemoryPressure: number;
    episodeCount: number;
    conceptCount: number;
    lastConsolidation: Date | null;
    memoryHealth: 'good' | 'moderate' | 'poor';
  }> {
    const workingMemory = await this.getWorkingMemory(agentId);
    const recentEpisodes = await this.getEpisodicMemory(agentId, {
      description: '',
      limit: 100
    });
    
    // Get concept count by searching for agent-specific concepts
    const concepts = await this.semanticMemoryManager.getRelatedConcepts(agentId, '');
    
    const memoryPressure = workingMemory?.metadata.memoryPressure || 0;
    const episodeCount = recentEpisodes.length;
    const conceptCount = concepts.length;
    
    let memoryHealth: 'good' | 'moderate' | 'poor' = 'good';
    if (memoryPressure > 0.8 || episodeCount > 1000) {
      memoryHealth = 'poor';
    } else if (memoryPressure > 0.6 || episodeCount > 500) {
      memoryHealth = 'moderate';
    }

    return {
      workingMemoryPressure: memoryPressure,
      episodeCount,
      conceptCount,
      lastConsolidation: null, // Would track this in practice
      memoryHealth
    };
  }

  // Memory Search and Retrieval
  async searchMemories(agentId: string, query: string, memoryTypes: ('working' | 'episodic' | 'semantic')[] = ['episodic', 'semantic']): Promise<{
    episodes: Episode[];
    concepts: SemanticMemory[];
    workingMemoryRelevant: boolean;
  }> {
    const results = {
      episodes: [] as Episode[],
      concepts: [] as SemanticMemory[],
      workingMemoryRelevant: false
    };

    if (memoryTypes.includes('episodic')) {
      results.episodes = await this.getEpisodicMemory(agentId, {
        description: query,
        limit: 10
      });
    }

    if (memoryTypes.includes('semantic')) {
      // Search for concepts related to the query
      results.concepts = await this.getRelatedConcepts(agentId, query);
    }

    if (memoryTypes.includes('working')) {
      const workingMemory = await this.getWorkingMemory(agentId);
      if (workingMemory) {
        // Check if query is relevant to current working memory
        const workingContent = [
          ...workingMemory.currentContext.activeThoughts.reasoning,
          ...workingMemory.currentContext.activeThoughts.hypotheses,
          ...workingMemory.shortTermMemory.recentInteractions.map(i => i.description)
        ].join(' ').toLowerCase();
        
        results.workingMemoryRelevant = workingContent.includes(query.toLowerCase());
      }
    }

    return results;
  }

  // Memory Cleanup
  async cleanupMemory(agentId: string, options: {
    removeOldEpisodes?: boolean;
    consolidateWorkingMemory?: boolean;
    optimizeSemanticMemory?: boolean;
  } = {}): Promise<{
    episodesRemoved: number;
    conceptsOptimized: number;
    workingMemoryConsolidated: boolean;
  }> {
    const result = {
      episodesRemoved: 0,
      conceptsOptimized: 0,
      workingMemoryConsolidated: false
    };

    if (options.consolidateWorkingMemory) {
      const consolidationResult = await this.consolidateMemories(agentId);
      result.workingMemoryConsolidated = consolidationResult.consolidated;
    }

    // Additional cleanup operations would be implemented here
    // For now, return the basic result
    return result;
  }

  // Memory Export/Import for agent persistence
  async exportAgentMemory(agentId: string): Promise<{
    workingMemory: WorkingMemory | null;
    recentEpisodes: Episode[];
    keyConcepts: SemanticMemory[];
    exportTimestamp: Date;
  }> {
    const workingMemory = await this.getWorkingMemory(agentId);
    const recentEpisodes = await this.getEpisodicMemory(agentId, {
      description: '',
      limit: 50
    });
    const keyConcepts = await this.getRelatedConcepts(agentId, '');

    return {
      workingMemory,
      recentEpisodes,
      keyConcepts: keyConcepts.slice(0, 20), // Top 20 concepts
      exportTimestamp: new Date()
    };
  }
} 