import { 
  KnowledgeItem, 
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeIngestRequest,
  KnowledgeIngestResponse,
  KnowledgeFilters,
  KnowledgeType,
  SourceType
} from '@uaip/types';
import { KnowledgeGraphService } from './knowledge-graph/knowledge-graph.service.js';

export class UserKnowledgeService {
  constructor(
    private readonly knowledgeGraphService: KnowledgeGraphService
  ) {}

  /**
   * Search user-specific knowledge
   */
  async search(userId: string, request: Omit<KnowledgeSearchRequest, 'scope'>): Promise<KnowledgeSearchResponse> {
    return this.knowledgeGraphService.search({
      ...request,
      scope: { userId }
    });
  }

  /**
   * Add knowledge to user's personal knowledge base
   */
  async addKnowledge(userId: string, items: KnowledgeIngestRequest[]): Promise<KnowledgeIngestResponse> {
    const scopedItems = items.map(item => ({
      ...item,
      scope: { userId }
    }));
    
    return this.knowledgeGraphService.ingest(scopedItems);
  }

  /**
   * Update user knowledge item
   */
  async updateKnowledge(userId: string, itemId: string, updates: Partial<KnowledgeItem>): Promise<KnowledgeItem> {
    // Ensure the item belongs to the user before updating
    const existingItem = await this.getKnowledgeItem(userId, itemId);
    if (!existingItem) {
      throw new Error('Knowledge item not found or not accessible by user');
    }
    
    return this.knowledgeGraphService.updateKnowledge(itemId, updates);
  }

  /**
   * Delete user knowledge item
   */
  async deleteKnowledge(userId: string, itemId: string): Promise<void> {
    // Ensure the item belongs to the user before deleting
    const existingItem = await this.getKnowledgeItem(userId, itemId);
    if (!existingItem) {
      throw new Error('Knowledge item not found or not accessible by user');
    }
    
    return this.knowledgeGraphService.deleteKnowledge(itemId);
  }

  /**
   * Get a specific user knowledge item
   */
  async getKnowledgeItem(userId: string, itemId: string): Promise<KnowledgeItem | null> {
    const results = await this.knowledgeGraphService.search({
      query: '',
      filters: { },
      options: { limit: 1 },
      timestamp: Date.now(),
      scope: { userId }
    });
    
    return results.items.find(item => item.id === itemId) || null;
  }

  /**
   * Get user's knowledge by tags
   */
  async getKnowledgeByTags(userId: string, tags: string[], limit: number = 20): Promise<KnowledgeItem[]> {
    const results = await this.knowledgeGraphService.search({
      query: tags.join(' '),
      filters: { tags },
      options: { limit },
      timestamp: Date.now(),
      scope: { userId }
    });
    
    return results.items;
  }

  /**
   * Get user's knowledge statistics
   */
  async getUserKnowledgeStats(userId: string): Promise<{
    totalItems: number;
    itemsByType: Record<string, number>;
    recentActivity: {
      itemsThisWeek: number;
      itemsThisMonth: number;
    };
    generalKnowledge: {
      totalItems: number;
      itemsByType: Record<string, number>;
    };
  }> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Get user-specific knowledge
    const userResults = await this.knowledgeGraphService.search({
      query: '',
      filters: {},
      options: { limit: 1000 },
      timestamp: Date.now(),
      scope: { userId }
    });
    
    // Get general knowledge (no userId scope - this includes your 370 synced nodes!)
    const generalResults = await this.knowledgeGraphService.search({
      query: '',
      filters: {},
      options: { limit: 2000 }, // Increased limit to capture all your synced nodes
      timestamp: Date.now(),
      scope: {} // No scope = general knowledge
    });
    
    // Get recent user knowledge
    const recentWeek = await this.knowledgeGraphService.search({
      query: '',
      filters: { 
        dateRange: { start: oneWeekAgo, end: new Date() }
      },
      options: { limit: 1000 },
      timestamp: Date.now(),
      scope: { userId }
    });
    
    const recentMonth = await this.knowledgeGraphService.search({
      query: '',
      filters: { 
        dateRange: { start: oneMonthAgo, end: new Date() }
      },
      options: { limit: 1000 },
      timestamp: Date.now(),
      scope: { userId }
    });
    
    // Calculate user knowledge statistics
    const userItemsByType: Record<string, number> = {};
    userResults.items.forEach(item => {
      userItemsByType[item.type] = (userItemsByType[item.type] || 0) + 1;
    });
    
    // Calculate general knowledge statistics  
    const generalItemsByType: Record<string, number> = {};
    generalResults.items.forEach(item => {
      generalItemsByType[item.type] = (generalItemsByType[item.type] || 0) + 1;
    });
    
    return {
      totalItems: userResults.items.length,
      itemsByType: userItemsByType,
      recentActivity: {
        itemsThisWeek: recentWeek.items.length,
        itemsThisMonth: recentMonth.items.length
      },
      generalKnowledge: {
        totalItems: generalResults.items.length,
        itemsByType: generalItemsByType
      }
    };
  }

  /**
   * Find related knowledge items for a user
   */
  async findRelatedKnowledge(userId: string, itemId: string, relationshipTypes?: string[]): Promise<KnowledgeItem[]> {
    return this.knowledgeGraphService.findRelated(itemId, relationshipTypes, { userId });
  }

  /**
   * Store conversation memory with embeddings
   */
  async storeConversationMemory(
    userId: string,
    conversationId: string,
    userMessage: string,
    assistantResponse: string,
    metadata?: {
      agentId?: string;
      intent?: any;
      topic?: string;
      sentiment?: string;
    }
  ): Promise<KnowledgeItem> {
    const conversationTurn = {
      conversationId,
      userMessage,
      assistantResponse,
      timestamp: new Date(),
      ...metadata
    };

    const items = await this.addKnowledge(userId, [{
      content: JSON.stringify(conversationTurn),
      type: KnowledgeType.EPISODIC,
      tags: ['conversation', 'memory', metadata?.topic || 'general'].filter(Boolean),
      source: {
        type: SourceType.AGENT_INTERACTION,
        identifier: metadata?.agentId || conversationId,
        metadata: { conversationId }
      },
      confidence: 1.0
    }]);

    return items.items[0];
  }

  /**
   * Get conversation history for a user
   */
  async getConversationHistory(
    userId: string,
    filters?: {
      conversationId?: string;
      agentId?: string;
      limit?: number;
      dateRange?: { start: Date; end: Date };
    }
  ): Promise<KnowledgeItem[]> {
    const searchFilters: KnowledgeFilters = {
      tags: ['conversation', 'memory'],
      types: [KnowledgeType.EPISODIC]
    };

    if (filters?.dateRange) {
      searchFilters.timeRange = filters.dateRange;
    }

    const results = await this.search(userId, {
      query: filters?.conversationId || '',
      filters: searchFilters,
      options: {
        limit: filters?.limit || 50
      },
      timestamp: Date.now()
    });

    // Filter by conversation or agent if specified
    let items = results.items;
    if (filters?.conversationId) {
      items = items.filter(item => {
        const content = JSON.parse(item.content);
        return content.conversationId === filters.conversationId;
      });
    }
    if (filters?.agentId) {
      items = items.filter(item => {
        const content = JSON.parse(item.content);
        return content.agentId === filters.agentId;
      });
    }

    return items;
  }

  /**
   * Store user preference learned from conversations
   */
  async storeUserPreference(
    userId: string,
    preference: {
      type: string;
      value: any;
      confidence: number;
      source: string;
    }
  ): Promise<KnowledgeItem> {
    const items = await this.addKnowledge(userId, [{
      content: JSON.stringify(preference),
      type: KnowledgeType.CONCEPTUAL,
      tags: ['preference', 'user-behavior', preference.type],
      source: {
        type: SourceType.AGENT_EPISODE,
        identifier: preference.source
      },
      confidence: preference.confidence
    }]);

    return items.items[0];
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string, type?: string): Promise<Array<{
    type: string;
    value: any;
    confidence: number;
    source: string;
    updatedAt: Date;
  }>> {
    const tags = ['preference'];
    if (type) {
      tags.push(type);
    }

    const items = await this.getKnowledgeByTags(userId, tags, 100);
    
    return items.map(item => {
      const pref = JSON.parse(item.content);
      return {
        ...pref,
        updatedAt: item.updatedAt
      };
    });
  }

  /**
   * Store detected conversation pattern
   */
  async storeConversationPattern(
    userId: string,
    pattern: {
      type: 'query_sequence' | 'tool_preference' | 'topic_interest' | 'interaction_style';
      description: string;
      frequency: number;
      confidence: number;
      examples: string[];
    }
  ): Promise<KnowledgeItem> {
    const items = await this.addKnowledge(userId, [{
      content: JSON.stringify({
        ...pattern,
        lastObserved: new Date()
      }),
      type: KnowledgeType.PROCEDURAL,
      tags: ['pattern', 'conversation', pattern.type],
      source: {
        type: SourceType.AGENT_EPISODE,
        identifier: 'pattern-detection'
      },
      confidence: pattern.confidence
    }]);

    return items.items[0];
  }

  /**
   * Get user's conversation patterns
   */
  async getConversationPatterns(
    userId: string,
    type?: string
  ): Promise<Array<{
    type: string;
    description: string;
    frequency: number;
    confidence: number;
    examples: string[];
    lastObserved: Date;
  }>> {
    const tags = ['pattern', 'conversation'];
    if (type) {
      tags.push(type);
    }

    const items = await this.getKnowledgeByTags(userId, tags, 50);
    
    return items
      .map(item => JSON.parse(item.content))
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Search conversation history using semantic search
   */
  async searchConversations(
    userId: string,
    query: string,
    options?: {
      limit?: number;
      similarityThreshold?: number;
    }
  ): Promise<KnowledgeItem[]> {
    const results = await this.search(userId, {
      query,
      filters: {
        tags: ['conversation', 'memory'],
        types: [KnowledgeType.EPISODIC]
      },
      options: {
        limit: options?.limit || 10,
        similarityThreshold: options?.similarityThreshold || 0.7
      },
      timestamp: Date.now()
    });

    return results.items;
  }
} 