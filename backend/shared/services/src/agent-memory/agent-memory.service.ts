import {
  WorkingMemory,
  WorkingMemoryUpdate,
  Episode,
  EpisodicQuery,
  SemanticMemory,
  ConsolidationResult,
  KnowledgeItem,
  KnowledgeIngestRequest,
  SourceType,
  KnowledgeType
} from '@uaip/types';
import { WorkingMemoryManager } from './working-memory.manager.js';
import { EpisodicMemoryManager } from './episodic-memory.manager.js';
import { SemanticMemoryManager } from './semantic-memory.manager.js';
import { MemoryConsolidator } from './memory-consolidator.service.js';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service.js';

export class AgentMemoryService {
  constructor(
    private readonly workingMemoryManager: WorkingMemoryManager,
    private readonly episodicMemoryManager: EpisodicMemoryManager,
    private readonly semanticMemoryManager: SemanticMemoryManager,
    private readonly memoryConsolidator: MemoryConsolidator,
    private readonly knowledgeGraphService: KnowledgeGraphService
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

  async addEpisode(agentId: string, episode: Episode): Promise<void> {
    await this.storeEpisode(agentId, episode);
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
    
    const memoryPressure = workingMemory?.metadata.memoryPressure;
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

  // Knowledge Graph Integration
  /**
   * Store agent knowledge using the knowledge graph service
   */
  async storeAgentKnowledge(agentId: string, knowledge: {
    content: string;
    type?: KnowledgeType;
    tags?: string[];
    sourceIdentifier: string;
    metadata?: Record<string, any>;
    confidence?: number;
  }): Promise<KnowledgeItem> {
    const knowledgeRequest: KnowledgeIngestRequest = {
      content: knowledge.content,
      type: knowledge.type || KnowledgeType.EXPERIENTIAL,
      tags: knowledge.tags || [],
      source: {
        type: SourceType.AGENT_INTERACTION,
        identifier: knowledge.sourceIdentifier,
        metadata: knowledge.metadata || {}
      },
      confidence: knowledge.confidence || 0.8
    };

    const result = await this.knowledgeGraphService.ingest([{
      ...knowledgeRequest,
      scope: { agentId }
    }]);

    return result.items[0];
  }

  /**
   * Search agent's knowledge using the knowledge graph
   */
  async searchAgentKnowledge(agentId: string, query: string, options: {
    limit?: number;
    types?: KnowledgeType[];
    tags?: string[];
    includeRelationships?: boolean;
  } = {}): Promise<KnowledgeItem[]> {
    const result = await this.knowledgeGraphService.search({
      query,
      filters: {
        types: options.types,
        tags: options.tags
      },
      options: {
        limit: options.limit || 10,
        includeRelationships: options.includeRelationships || false
      },
      timestamp: Date.now(),
      scope: { agentId }
    });

    return result.items;
  }

  /**
   * Get contextual knowledge for agent operations
   */
  async getContextualKnowledge(agentId: string, context: {
    currentOperation?: string;
    discussionHistory?: any[];
    relevantTags?: string[];
  }): Promise<KnowledgeItem[]> {
    return this.knowledgeGraphService.getContextualKnowledge({
      discussionHistory: context.discussionHistory,
      relevantTags: context.relevantTags,
      scope: { agentId }
    });
  }

  /**
   * Store episode as knowledge in the knowledge graph
   */
  async storeEpisodeAsKnowledge(agentId: string, episode: Episode): Promise<KnowledgeItem> {
    const content = this.episodeToKnowledgeContent(episode);
    
    return this.storeAgentKnowledge(agentId, {
      content,
      type: KnowledgeType.EPISODIC,
      tags: [episode.type, 'episode', ...episode.context.who],
      sourceIdentifier: episode.episodeId,
      metadata: {
        episodeType: episode.type,
        significance: episode.significance,
        context: episode.context
      },
      confidence: episode.significance.importance
    });
  }

  /**
   * Store semantic concept as knowledge
   */
  async storeConceptAsKnowledge(agentId: string, concept: SemanticMemory): Promise<KnowledgeItem> {
    const content = this.conceptToKnowledgeContent(concept);
    
    return this.storeAgentKnowledge(agentId, {
      content,
      type: KnowledgeType.SEMANTIC,
      tags: [concept.concept, 'concept', ...concept.usage.contexts],
      sourceIdentifier: `concept-${concept.concept}`,
      metadata: {
        concept: concept.concept,
        properties: concept.knowledge.properties,
        relationships: concept.knowledge.relationships,
        usage: concept.usage
      },
      confidence: concept.confidence
    });
  }

  private episodeToKnowledgeContent(episode: Episode): string {
    return `Episode: ${episode.context.what}
When: ${episode.context.when}
Where: ${episode.context.where}
Who: ${episode.context.who.join(', ')}
Why: ${episode.context.why}
How: ${episode.context.how}

Actions taken: ${episode.experience.actions.map(a => a.description).join('; ')}
Outcomes: ${episode.experience.outcomes.map(o => o.description).join('; ')}
Learnings: ${episode.experience.learnings.join('; ')}

Significance: Importance=${episode.significance.importance}, Novelty=${episode.significance.novelty}, Success=${episode.significance.success}`;
  }

  private conceptToKnowledgeContent(concept: SemanticMemory): string {
    return `Concept: ${concept.concept}
Definition: ${concept.knowledge.definition}

Properties: ${Object.entries(concept.knowledge.properties).map(([k, v]) => `${k}: ${v}`).join('; ')}

Relationships: ${concept.knowledge.relationships.map(r => `${r.relationshipType} ${r.relatedConcept} (strength: ${r.strength})`).join('; ')}

Examples: ${concept.knowledge.examples.join('; ')}
Counter-examples: ${concept.knowledge.counterExamples.join('; ')}

Usage: Accessed ${concept.usage.timesAccessed} times, Success rate: ${concept.usage.successRate}, Contexts: ${concept.usage.contexts.join(', ')}`;
  }
} 