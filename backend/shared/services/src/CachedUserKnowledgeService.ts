import { UserKnowledgeService } from './user-knowledge.service.js';
import { KnowledgeGraphService } from './knowledge-graph/knowledge-graph.service.js';
import {
  KnowledgeItem,
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeIngestRequest,
  KnowledgeIngestResponse,
  KnowledgeType,
  SourceType,
} from '@uaip/types';
import { redisCacheService } from './redis-cache.service.js';
import { logger } from '@uaip/utils';

/**
 * Cached User Knowledge Service
 * Extends UserKnowledgeService with Redis caching for improved performance
 */
export class CachedUserKnowledgeService extends UserKnowledgeService {
  private readonly CACHE_TTL = {
    USER_KNOWLEDGE_STATS: 600, // 10 minutes
    KNOWLEDGE_SEARCH: 300, // 5 minutes
    KNOWLEDGE_BY_TAGS: 600, // 10 minutes
    CONVERSATION_HISTORY: 900, // 15 minutes
    USER_PREFERENCES: 1800, // 30 minutes
    CONVERSATION_PATTERNS: 900, // 15 minutes
    RELATED_KNOWLEDGE: 600, // 10 minutes
    KNOWLEDGE_ITEM: 300, // 5 minutes
  };

  private readonly CACHE_KEYS = {
    USER_KNOWLEDGE_STATS: (userId: string) => `knowledge:stats:${userId}`,
    KNOWLEDGE_SEARCH: (userId: string, query: string, filters: string) =>
      `knowledge:search:${userId}:${this.hashString(query + filters)}`,
    KNOWLEDGE_BY_TAGS: (userId: string, tags: string[], limit: number) =>
      `knowledge:tags:${userId}:${tags.sort().join(',')}:${limit}`,
    CONVERSATION_HISTORY: (userId: string, filters: string) =>
      `knowledge:conversations:${userId}:${this.hashString(filters)}`,
    USER_PREFERENCES: (userId: string, type?: string) =>
      `knowledge:preferences:${userId}:${type || 'all'}`,
    CONVERSATION_PATTERNS: (userId: string, type?: string) =>
      `knowledge:patterns:${userId}:${type || 'all'}`,
    RELATED_KNOWLEDGE: (userId: string, itemId: string, relationshipTypes?: string[]) =>
      `knowledge:related:${userId}:${itemId}:${relationshipTypes?.join(',') || 'all'}`,
    KNOWLEDGE_ITEM: (userId: string, itemId: string) => `knowledge:item:${userId}:${itemId}`,
  };

  constructor(knowledgeGraphService: KnowledgeGraphService) {
    super(knowledgeGraphService);
  }

  /**
   * Get user knowledge statistics with caching
   */
  async getUserKnowledgeStats(
    userId: string,
    useCache = true
  ): Promise<{
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
    const cacheKey = this.CACHE_KEYS.USER_KNOWLEDGE_STATS(userId);

    if (useCache) {
      const cached = await redisCacheService.get(cacheKey);
      if (cached) {
        logger.debug('User knowledge stats retrieved from cache', { userId });
        return cached;
      }
    }

    // Cache miss - get from database
    const stats = await super.getUserKnowledgeStats(userId);

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, stats, this.CACHE_TTL.USER_KNOWLEDGE_STATS);
      logger.debug('User knowledge stats cached', { userId, totalItems: stats.totalItems });
    }

    return stats;
  }

  /**
   * Search user knowledge with caching
   */
  async search(
    userId: string,
    request: Omit<KnowledgeSearchRequest, 'scope'>,
    useCache = true
  ): Promise<KnowledgeSearchResponse> {
    const filtersString = JSON.stringify(request.filters || {});
    const cacheKey = this.CACHE_KEYS.KNOWLEDGE_SEARCH(userId, request.query, filtersString);

    if (useCache) {
      const cached = await redisCacheService.get<KnowledgeSearchResponse>(cacheKey);
      if (cached) {
        logger.debug('Knowledge search results retrieved from cache', {
          userId,
          query: request.query,
        });
        return cached;
      }
    }

    // Cache miss - get from database
    const results = await super.search(userId, request);

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, results, this.CACHE_TTL.KNOWLEDGE_SEARCH);
      logger.debug('Knowledge search results cached', {
        userId,
        query: request.query,
        count: results.items.length,
      });
    }

    return results;
  }

  /**
   * Get knowledge by tags with caching
   */
  async getKnowledgeByTags(
    userId: string,
    tags: string[],
    limit: number = 20,
    useCache = true
  ): Promise<KnowledgeItem[]> {
    const cacheKey = this.CACHE_KEYS.KNOWLEDGE_BY_TAGS(userId, tags, limit);

    if (useCache) {
      const cached = await redisCacheService.get<KnowledgeItem[]>(cacheKey);
      if (cached) {
        logger.debug('Knowledge by tags retrieved from cache', { userId, tags, limit });
        return cached;
      }
    }

    // Cache miss - get from database
    const items = await super.getKnowledgeByTags(userId, tags, limit);

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, items, this.CACHE_TTL.KNOWLEDGE_BY_TAGS);
      logger.debug('Knowledge by tags cached', { userId, tags, limit, count: items.length });
    }

    return items;
  }

  /**
   * Get knowledge item with caching
   */
  async getKnowledgeItem(
    userId: string,
    itemId: string,
    useCache = true
  ): Promise<KnowledgeItem | null> {
    const cacheKey = this.CACHE_KEYS.KNOWLEDGE_ITEM(userId, itemId);

    if (useCache) {
      const cached = await redisCacheService.get<KnowledgeItem | null>(cacheKey);
      if (cached) {
        logger.debug('Knowledge item retrieved from cache', { userId, itemId });
        return cached;
      }
    }

    // Cache miss - get from database
    const item = await super.getKnowledgeItem(userId, itemId);

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, item, this.CACHE_TTL.KNOWLEDGE_ITEM);
      logger.debug('Knowledge item cached', { userId, itemId, found: !!item });
    }

    return item;
  }

  /**
   * Get conversation history with caching
   */
  async getConversationHistory(
    userId: string,
    filters?: {
      conversationId?: string;
      agentId?: string;
      limit?: number;
      dateRange?: { start: Date; end: Date };
    },
    useCache = true
  ): Promise<KnowledgeItem[]> {
    const filtersString = JSON.stringify(filters || {});
    const cacheKey = this.CACHE_KEYS.CONVERSATION_HISTORY(userId, filtersString);

    if (useCache) {
      const cached = await redisCacheService.get<KnowledgeItem[]>(cacheKey);
      if (cached) {
        logger.debug('Conversation history retrieved from cache', { userId, filters });
        return cached;
      }
    }

    // Cache miss - get from database
    const history = await super.getConversationHistory(userId, filters);

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, history, this.CACHE_TTL.CONVERSATION_HISTORY);
      logger.debug('Conversation history cached', { userId, filters, count: history.length });
    }

    return history;
  }

  /**
   * Get user preferences with caching
   */
  async getUserPreferences(
    userId: string,
    type?: string,
    useCache = true
  ): Promise<
    Array<{
      type: string;
      value: any;
      confidence: number;
      source: string;
      updatedAt: Date;
    }>
  > {
    const cacheKey = this.CACHE_KEYS.USER_PREFERENCES(userId, type);

    if (useCache) {
      const cached = await redisCacheService.get(cacheKey);
      if (cached) {
        logger.debug('User preferences retrieved from cache', { userId, type });
        return cached;
      }
    }

    // Cache miss - get from database
    const preferences = await super.getUserPreferences(userId, type);

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, preferences, this.CACHE_TTL.USER_PREFERENCES);
      logger.debug('User preferences cached', { userId, type, count: preferences.length });
    }

    return preferences;
  }

  /**
   * Get conversation patterns with caching
   */
  async getConversationPatterns(
    userId: string,
    type?: string,
    useCache = true
  ): Promise<
    Array<{
      type: string;
      description: string;
      frequency: number;
      confidence: number;
      examples: string[];
      lastObserved: Date;
    }>
  > {
    const cacheKey = this.CACHE_KEYS.CONVERSATION_PATTERNS(userId, type);

    if (useCache) {
      const cached = await redisCacheService.get(cacheKey);
      if (cached) {
        logger.debug('Conversation patterns retrieved from cache', { userId, type });
        return cached;
      }
    }

    // Cache miss - get from database
    const patterns = await super.getConversationPatterns(userId, type);

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, patterns, this.CACHE_TTL.CONVERSATION_PATTERNS);
      logger.debug('Conversation patterns cached', { userId, type, count: patterns.length });
    }

    return patterns;
  }

  /**
   * Find related knowledge with caching
   */
  async findRelatedKnowledge(
    userId: string,
    itemId: string,
    relationshipTypes?: string[],
    useCache = true
  ): Promise<KnowledgeItem[]> {
    const cacheKey = this.CACHE_KEYS.RELATED_KNOWLEDGE(userId, itemId, relationshipTypes);

    if (useCache) {
      const cached = await redisCacheService.get<KnowledgeItem[]>(cacheKey);
      if (cached) {
        logger.debug('Related knowledge retrieved from cache', {
          userId,
          itemId,
          relationshipTypes,
        });
        return cached;
      }
    }

    // Cache miss - get from database
    const related = await super.findRelatedKnowledge(userId, itemId, relationshipTypes);

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, related, this.CACHE_TTL.RELATED_KNOWLEDGE);
      logger.debug('Related knowledge cached', {
        userId,
        itemId,
        relationshipTypes,
        count: related.length,
      });
    }

    return related;
  }

  /**
   * Search conversations with caching
   */
  async searchConversations(
    userId: string,
    query: string,
    options?: {
      limit?: number;
      similarityThreshold?: number;
    },
    useCache = true
  ): Promise<KnowledgeItem[]> {
    const optionsString = JSON.stringify(options || {});
    const cacheKey = this.CACHE_KEYS.KNOWLEDGE_SEARCH(
      userId,
      `conversations:${query}`,
      optionsString
    );

    if (useCache) {
      const cached = await redisCacheService.get<KnowledgeItem[]>(cacheKey);
      if (cached) {
        logger.debug('Conversation search results retrieved from cache', { userId, query });
        return cached;
      }
    }

    // Cache miss - get from database
    const results = await super.searchConversations(userId, query, options);

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, results, this.CACHE_TTL.KNOWLEDGE_SEARCH);
      logger.debug('Conversation search results cached', { userId, query, count: results.length });
    }

    return results;
  }

  /**
   * Add knowledge and invalidate cache
   */
  async addKnowledge(
    userId: string,
    items: KnowledgeIngestRequest[]
  ): Promise<KnowledgeIngestResponse> {
    const result = await super.addKnowledge(userId, items);

    // Invalidate relevant caches
    await this.invalidateUserKnowledgeCache(userId);

    return result;
  }

  /**
   * Update knowledge and invalidate cache
   */
  async updateKnowledge(
    userId: string,
    itemId: string,
    updates: Partial<KnowledgeItem>
  ): Promise<KnowledgeItem> {
    const result = await super.updateKnowledge(userId, itemId, updates);

    // Invalidate relevant caches
    await this.invalidateUserKnowledgeCache(userId);
    await this.invalidateKnowledgeItemCache(userId, itemId);

    return result;
  }

  /**
   * Delete knowledge and invalidate cache
   */
  async deleteKnowledge(userId: string, itemId: string): Promise<void> {
    await super.deleteKnowledge(userId, itemId);

    // Invalidate relevant caches
    await this.invalidateUserKnowledgeCache(userId);
    await this.invalidateKnowledgeItemCache(userId, itemId);
  }

  /**
   * Store conversation memory and invalidate cache
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
    const result = await super.storeConversationMemory(
      userId,
      conversationId,
      userMessage,
      assistantResponse,
      metadata
    );

    // Invalidate relevant caches
    await this.invalidateUserKnowledgeCache(userId);
    await this.invalidateConversationCache(userId);

    return result;
  }

  /**
   * Store user preference and invalidate cache
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
    const result = await super.storeUserPreference(userId, preference);

    // Invalidate preference cache
    await this.invalidateUserPreferencesCache(userId);

    return result;
  }

  /**
   * Store conversation pattern and invalidate cache
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
    const result = await super.storeConversationPattern(userId, pattern);

    // Invalidate pattern cache
    await this.invalidateConversationPatternsCache(userId);

    return result;
  }

  /**
   * Invalidate all user knowledge caches
   */
  async invalidateUserKnowledgeCache(userId: string): Promise<void> {
    const patterns = [
      this.CACHE_KEYS.USER_KNOWLEDGE_STATS(userId),
      `knowledge:search:${userId}:*`,
      `knowledge:tags:${userId}:*`,
      `knowledge:item:${userId}:*`,
      `knowledge:related:${userId}:*`,
    ];

    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        const keys = await redisCacheService.keys(pattern);
        for (const key of keys) {
          await redisCacheService.del(key);
        }
      } else {
        await redisCacheService.del(pattern);
      }
    }

    logger.info('User knowledge cache invalidated', { userId, patterns });
  }

  /**
   * Invalidate conversation-related caches
   */
  async invalidateConversationCache(userId: string): Promise<void> {
    const patterns = [
      `knowledge:conversations:${userId}:*`,
      `knowledge:search:${userId}:*conversations*`,
    ];

    for (const pattern of patterns) {
      const keys = await redisCacheService.keys(pattern);
      for (const key of keys) {
        await redisCacheService.del(key);
      }
    }

    logger.debug('Conversation cache invalidated', { userId });
  }

  /**
   * Invalidate user preferences cache
   */
  async invalidateUserPreferencesCache(userId: string): Promise<void> {
    const patterns = [`knowledge:preferences:${userId}:*`];

    for (const pattern of patterns) {
      const keys = await redisCacheService.keys(pattern);
      for (const key of keys) {
        await redisCacheService.del(key);
      }
    }

    logger.debug('User preferences cache invalidated', { userId });
  }

  /**
   * Invalidate conversation patterns cache
   */
  async invalidateConversationPatternsCache(userId: string): Promise<void> {
    const patterns = [`knowledge:patterns:${userId}:*`];

    for (const pattern of patterns) {
      const keys = await redisCacheService.keys(pattern);
      for (const key of keys) {
        await redisCacheService.del(key);
      }
    }

    logger.debug('Conversation patterns cache invalidated', { userId });
  }

  /**
   * Invalidate specific knowledge item cache
   */
  async invalidateKnowledgeItemCache(userId: string, itemId: string): Promise<void> {
    const patterns = [
      this.CACHE_KEYS.KNOWLEDGE_ITEM(userId, itemId),
      `knowledge:related:${userId}:${itemId}:*`,
    ];

    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        const keys = await redisCacheService.keys(pattern);
        for (const key of keys) {
          await redisCacheService.del(key);
        }
      } else {
        await redisCacheService.del(pattern);
      }
    }

    logger.debug('Knowledge item cache invalidated', { userId, itemId });
  }

  /**
   * Warm up cache for a user
   */
  async warmUpUserCache(userId: string): Promise<void> {
    logger.info('Warming up user knowledge cache...', { userId });

    try {
      // Pre-load user knowledge stats
      await this.getUserKnowledgeStats(userId, true);

      // Pre-load recent conversations
      await this.getConversationHistory(userId, { limit: 20 }, true);

      // Pre-load user preferences
      await this.getUserPreferences(userId, undefined, true);

      // Pre-load conversation patterns
      await this.getConversationPatterns(userId, undefined, true);

      logger.info('User knowledge cache warmed up successfully', { userId });
    } catch (error) {
      logger.error('Error warming up user knowledge cache', { userId, error: error.message });
    }
  }

  /**
   * Get cache health status for user knowledge
   */
  async getCacheHealthStatus(userId: string): Promise<{
    cached: boolean;
    keys: string[];
    stats: {
      userStats: boolean;
      conversationHistory: boolean;
      preferences: boolean;
      patterns: boolean;
      searchCacheCount: number;
    };
  }> {
    const keys = [
      this.CACHE_KEYS.USER_KNOWLEDGE_STATS(userId),
      this.CACHE_KEYS.CONVERSATION_HISTORY(userId, '{}'),
      this.CACHE_KEYS.USER_PREFERENCES(userId),
      this.CACHE_KEYS.CONVERSATION_PATTERNS(userId),
    ];

    const stats = {
      userStats: await redisCacheService.exists(keys[0]),
      conversationHistory: await redisCacheService.exists(keys[1]),
      preferences: await redisCacheService.exists(keys[2]),
      patterns: await redisCacheService.exists(keys[3]),
      searchCacheCount: 0,
    };

    // Count search cache entries
    const searchKeys = await redisCacheService.keys(`knowledge:search:${userId}:*`);
    stats.searchCacheCount = searchKeys.length;

    return {
      cached: Object.values(stats).some((cached) => cached) || stats.searchCacheCount > 0,
      keys: [...keys, ...searchKeys],
      stats,
    };
  }

  /**
   * Helper method to hash strings for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}
