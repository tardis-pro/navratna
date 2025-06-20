import { 
  KnowledgeItem, 
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeIngestRequest,
  KnowledgeIngestResponse,
  KnowledgeFilters
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
  }> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Get all user knowledge
    const allResults = await this.knowledgeGraphService.search({
      query: '',
      filters: {},
      options: { limit: 1000 },
      timestamp: Date.now(),
      scope: { userId }
    });
    
    // Get recent knowledge
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
    
    // Calculate statistics
    const itemsByType: Record<string, number> = {};
    allResults.items.forEach(item => {
      itemsByType[item.type] = (itemsByType[item.type] || 0) + 1;
    });
    
    return {
      totalItems: allResults.items.length,
      itemsByType,
      recentActivity: {
        itemsThisWeek: recentWeek.items.length,
        itemsThisMonth: recentMonth.items.length
      }
    };
  }

  /**
   * Find related knowledge items for a user
   */
  async findRelatedKnowledge(userId: string, itemId: string, relationshipTypes?: string[]): Promise<KnowledgeItem[]> {
    return this.knowledgeGraphService.findRelated(itemId, relationshipTypes, { userId });
  }
} 