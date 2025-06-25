import { 
  KnowledgeItem, 
  KnowledgeScope, 
  KnowledgeSearchRequest,
  ContextRequest 
} from '@uaip/types';
import { KnowledgeGraphService } from './knowledge-graph/knowledge-graph.service.js';

export interface ContextOrchestrationConfig {
  maxTokens: number;
  agentWeight: number;
  userWeight: number;
  generalWeight: number;
  maxItemsPerLayer: number;
}

export class ContextOrchestrationService {
  private readonly defaultConfig: ContextOrchestrationConfig = {
    maxTokens: 4000,
    agentWeight: 1.0,
    userWeight: 0.8,
    generalWeight: 0.6,
    maxItemsPerLayer: 10
  };

  constructor(
    private readonly knowledgeGraphService: KnowledgeGraphService,
    private readonly config: Partial<ContextOrchestrationConfig> = {}
  ) {}

  /**
   * Orchestrates context retrieval across three layers: Agent -> User -> General
   * Returns ranked and merged results within token limits
   */
  async getOrchestatedContext(
    query: string,
    agentId?: string,
    userId?: string,
    options: {
      includeRelationships?: boolean;
      similarityThreshold?: number;
      config?: Partial<ContextOrchestrationConfig>;
    } = {}
  ): Promise<{
    items: KnowledgeItem[];
    layerBreakdown: {
      agent: number;
      user: number;
      general: number;
    };
    totalTokens: number;
    truncated: boolean;
  }> {
    const finalConfig = { ...this.defaultConfig, ...this.config, ...options.config };
    
    // Step 1: Retrieve from each layer
    const layerResults = await this.retrieveFromLayers(query, agentId, userId, finalConfig, options);
    
    // Step 2: Rank and merge results
    const rankedResults = this.rankAndMergeResults(layerResults, finalConfig);
    
    // Step 3: Apply token limits
    const finalResults = this.applyTokenLimits(rankedResults, finalConfig);
    
    return finalResults;
  }

  /**
   * Context-aware retrieval that considers discussion history and preferences
   */
  async getContextualKnowledge(
    context: ContextRequest & { agentId?: string; userId?: string },
    options: {
      config?: Partial<ContextOrchestrationConfig>;
    } = {}
  ): Promise<KnowledgeItem[]> {
    const finalConfig = { ...this.defaultConfig, ...this.config, ...options.config };
    
    // Extract query from context
    const query = this.extractQueryFromContext(context);
    
    // Get orchestrated context
    const result = await this.getOrchestatedContext(
      query,
      context.agentId,
      context.userId,
      { config: finalConfig }
    );
    
    return result.items;
  }

  private async retrieveFromLayers(
    query: string,
    agentId?: string,
    userId?: string,
    config: ContextOrchestrationConfig = this.defaultConfig,
    options: { includeRelationships?: boolean; similarityThreshold?: number } = {}
  ): Promise<{
    agent: KnowledgeItem[];
    user: KnowledgeItem[];
    general: KnowledgeItem[];
  }> {
    const searchRequest: KnowledgeSearchRequest = {
      query,
      options: {
        limit: config.maxItemsPerLayer,
        similarityThreshold: options.similarityThreshold || 0.7,
        includeRelationships: options.includeRelationships || false
      },
      timestamp: Date.now()
    };

    // Parallel retrieval from all layers
    const [agentResults, userResults, generalResults] = await Promise.all([
      // Agent-specific knowledge
      agentId ? this.knowledgeGraphService.search({
        ...searchRequest,
        scope: { agentId }
      }).then(r => r.items) : Promise.resolve([]),
      
      // User-specific knowledge
      userId ? this.knowledgeGraphService.search({
        ...searchRequest,
        scope: { userId }
      }).then(r => r.items) : Promise.resolve([]),
      
      // General knowledge
      this.knowledgeGraphService.search({
        ...searchRequest,
        scope: {}
      }).then(r => r.items)
    ]);

    return {
      agent: agentResults,
      user: userResults,
      general: generalResults
    };
  }

  private rankAndMergeResults(
    layerResults: { agent: KnowledgeItem[]; user: KnowledgeItem[]; general: KnowledgeItem[] },
    config: ContextOrchestrationConfig
  ): Array<KnowledgeItem & { score: number; layer: 'agent' | 'user' | 'general' }> {
    const scoredResults: Array<KnowledgeItem & { score: number; layer: 'agent' | 'user' | 'general' }> = [];
    
    // Score agent results
    layerResults.agent.forEach(item => {
      scoredResults.push({
        ...item,
        score: item.confidence * config.agentWeight,
        layer: 'agent'
      });
    });
    
    // Score user results
    layerResults.user.forEach(item => {
      scoredResults.push({
        ...item,
        score: item.confidence * config.userWeight,
        layer: 'user'
      });
    });
    
    // Score general results
    layerResults.general.forEach(item => {
      scoredResults.push({
        ...item,
        score: item.confidence * config.generalWeight,
        layer: 'general'
      });
    });
    
    // Remove duplicates (prefer higher-scored layers)
    const uniqueResults = new Map<string, KnowledgeItem & { score: number; layer: 'agent' | 'user' | 'general' }>();
    
    scoredResults
      .sort((a, b) => b.score - a.score) // Sort by score descending
      .forEach(item => {
        if (!uniqueResults.has(item.id)) {
          uniqueResults.set(item.id, item);
        }
      });
    
    return Array.from(uniqueResults.values()).sort((a, b) => b.score - a.score);
  }

  private applyTokenLimits(
    rankedResults: Array<KnowledgeItem & { score: number; layer: 'agent' | 'user' | 'general' }>,
    config: ContextOrchestrationConfig
  ): {
    items: KnowledgeItem[];
    layerBreakdown: { agent: number; user: number; general: number };
    totalTokens: number;
    truncated: boolean;
  } {
    const finalItems: KnowledgeItem[] = [];
    const layerBreakdown = { agent: 0, user: 0, general: 0 };
    let totalTokens = 0;
    let truncated = false;
    
    for (const item of rankedResults) {
      const itemTokens = this.estimateTokens(item);
      
      if (totalTokens + itemTokens > config.maxTokens) {
        truncated = true;
        break;
      }
      
      finalItems.push(item);
      layerBreakdown[item.layer]++;
      totalTokens += itemTokens;
    }
    
    return {
      items: finalItems,
      layerBreakdown,
      totalTokens,
      truncated
    };
  }

  private extractQueryFromContext(context: ContextRequest): string {
    // Extract meaningful query from context
    const queries: string[] = [];
    
    if (context.discussionHistory?.length) {
      // Get recent discussion topics
      const recentMessages = context.discussionHistory.slice(-3);
      queries.push(...recentMessages.map(msg => msg.content || '').filter(Boolean));
    }
    
    if (context.relevantTags?.length) {
      queries.push(context.relevantTags.join(' '));
    }
    
    if (context.participantExpertise?.length) {
      queries.push(context.participantExpertise.join(' '));
    }
    
    return queries.join(' ').trim() || 'general knowledge';
  }

  private estimateTokens(item: KnowledgeItem): number {
    // Rough token estimation (1 token ≈ 4 characters)
    const contentLength = item.content.length + (item.summary?.length || 0);
    const metadataLength = JSON.stringify(item.metadata).length;
    const tagsLength = item.tags.join(' ').length;
    
    return Math.ceil((contentLength + metadataLength + tagsLength) / 4);
  }
} 