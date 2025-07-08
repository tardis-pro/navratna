import { redisCacheService } from './redis-cache.service.js';
import { CachedUserService } from './services/CachedUserService.js';
import { CachedUserKnowledgeService } from './CachedUserKnowledgeService.js';
import { CachedUserLLMProviderRepository } from './database/repositories/CachedUserLLMProviderRepository.js';
import { CachedLLMProviderRepository } from './database/repositories/CachedLLMProviderRepository.js';
import { logger } from '@uaip/utils';

/**
 * Cache Manager Service
 * Centralized cache management with intelligent invalidation strategies
 */
export class CacheManager {
  private static instance: CacheManager;
  private cachedUserService: CachedUserService | null = null;
  private cachedUserKnowledgeService: CachedUserKnowledgeService | null = null;
  private cachedUserLLMProviderRepository: CachedUserLLMProviderRepository | null = null;
  private cachedLLMProviderRepository: CachedLLMProviderRepository | null = null;

  private constructor() {}

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Initialize cache manager with service dependencies
   */
  public async initialize(services: {
    userService?: CachedUserService;
    userKnowledgeService?: CachedUserKnowledgeService;
    userLLMProviderRepository?: CachedUserLLMProviderRepository;
    llmProviderRepository?: CachedLLMProviderRepository;
  }): Promise<void> {
    this.cachedUserService = services.userService || null;
    this.cachedUserKnowledgeService = services.userKnowledgeService || null;
    this.cachedUserLLMProviderRepository = services.userLLMProviderRepository || null;
    this.cachedLLMProviderRepository = services.llmProviderRepository || null;

    // Initialize Redis cache service
    await redisCacheService.initialize();
    
    logger.info('Cache manager initialized successfully');
  }

  /**
   * User-related cache operations
   */
  public async invalidateUserCache(userId: string, options: {
    includeProviders?: boolean;
    includeKnowledge?: boolean;
  } = {}): Promise<void> {
    const { includeProviders = true, includeKnowledge = true } = options;

    logger.info('Invalidating user cache', { userId, includeProviders, includeKnowledge });

    const promises: Promise<void>[] = [];

    // Invalidate user service cache
    if (this.cachedUserService) {
      promises.push(this.cachedUserService.invalidateAllUserCaches(userId));
    }

    // Invalidate LLM provider cache
    if (includeProviders && this.cachedUserLLMProviderRepository) {
      promises.push(this.cachedUserLLMProviderRepository.invalidateUserProviderCache(userId));
    }

    // Invalidate knowledge cache
    if (includeKnowledge && this.cachedUserKnowledgeService) {
      promises.push(this.cachedUserKnowledgeService.invalidateUserKnowledgeCache(userId));
    }

    await Promise.all(promises);
    logger.info('User cache invalidated successfully', { userId });
  }

  /**
   * LLM provider-related cache operations
   */
  public async invalidateProviderCache(providerId: string, userId?: string): Promise<void> {
    logger.info('Invalidating provider cache', { providerId, userId });

    const promises: Promise<void>[] = [];

    // Invalidate global provider cache
    if (this.cachedLLMProviderRepository) {
      promises.push(this.cachedLLMProviderRepository.invalidateGlobalProviderCache());
    }

    // Invalidate user-specific provider cache
    if (userId && this.cachedUserLLMProviderRepository) {
      promises.push(this.cachedUserLLMProviderRepository.invalidateProviderSpecificCache(providerId, userId));
    }

    await Promise.all(promises);
    logger.info('Provider cache invalidated successfully', { providerId, userId });
  }

  /**
   * Knowledge-related cache operations
   */
  public async invalidateKnowledgeCache(userId: string, itemId?: string): Promise<void> {
    logger.info('Invalidating knowledge cache', { userId, itemId });

    if (!this.cachedUserKnowledgeService) {
      logger.warn('User knowledge service not initialized');
      return;
    }

    if (itemId) {
      await this.cachedUserKnowledgeService.invalidateKnowledgeItemCache(userId, itemId);
    } else {
      await this.cachedUserKnowledgeService.invalidateUserKnowledgeCache(userId);
    }

    logger.info('Knowledge cache invalidated successfully', { userId, itemId });
  }

  /**
   * Warm up caches for a user
   */
  public async warmUpUserCache(userId: string): Promise<void> {
    logger.info('Warming up user cache', { userId });

    const promises: Promise<void>[] = [];

    // Warm up user service cache
    if (this.cachedUserService) {
      promises.push(this.cachedUserService.warmUpUserCache(userId));
    }

    // Warm up knowledge service cache
    if (this.cachedUserKnowledgeService) {
      promises.push(this.cachedUserKnowledgeService.warmUpUserCache(userId));
    }

    await Promise.all(promises);
    logger.info('User cache warmed up successfully', { userId });
  }

  /**
   * Warm up global caches
   */
  public async warmUpGlobalCache(): Promise<void> {
    logger.info('Warming up global cache');

    const promises: Promise<void>[] = [];

    // Warm up global LLM provider cache
    if (this.cachedLLMProviderRepository) {
      promises.push(this.cachedLLMProviderRepository.warmUpCache());
    }

    await Promise.all(promises);
    logger.info('Global cache warmed up successfully');
  }

  /**
   * Bulk operations for multiple users
   */
  public async bulkInvalidateUserCaches(userIds: string[]): Promise<void> {
    logger.info('Bulk invalidating user caches', { userCount: userIds.length });

    const promises = userIds.map(userId => this.invalidateUserCache(userId));
    await Promise.all(promises);

    logger.info('Bulk user cache invalidation completed', { userCount: userIds.length });
  }

  public async bulkWarmUpUserCaches(userIds: string[]): Promise<void> {
    logger.info('Bulk warming up user caches', { userCount: userIds.length });

    const promises = userIds.map(userId => this.warmUpUserCache(userId));
    await Promise.all(promises);

    logger.info('Bulk user cache warm-up completed', { userCount: userIds.length });
  }

  /**
   * Cache health monitoring
   */
  public async getHealthStatus(): Promise<{
    redis: any;
    services: {
      userService: boolean;
      userKnowledgeService: boolean;
      userLLMProviderRepository: boolean;
      llmProviderRepository: boolean;
    };
    statistics: {
      totalKeys: number;
      keysByPattern: Record<string, number>;
      memoryUsage?: string;
    };
  }> {
    const redisHealth = await redisCacheService.healthCheck();
    const client = await redisCacheService.getClient();

    const services = {
      userService: this.cachedUserService !== null,
      userKnowledgeService: this.cachedUserKnowledgeService !== null,
      userLLMProviderRepository: this.cachedUserLLMProviderRepository !== null,
      llmProviderRepository: this.cachedLLMProviderRepository !== null,
    };

    let statistics = {
      totalKeys: 0,
      keysByPattern: {} as Record<string, number>,
      memoryUsage: undefined as string | undefined,
    };

    if (client) {
      try {
        const totalKeys = await client.dbsize();
        const patterns = [
          'user:*',
          'llm_provider*',
          'knowledge:*',
          'refresh_token:*',
          'password_reset_token:*',
        ];

        const keysByPattern: Record<string, number> = {};
        for (const pattern of patterns) {
          const keys = await redisCacheService.keys(pattern);
          keysByPattern[pattern] = keys.length;
        }

        const memoryInfo = await client.info('memory');
        const memoryMatch = memoryInfo.match(/used_memory_human:([^\r\n]+)/);
        const memoryUsage = memoryMatch ? memoryMatch[1].trim() : undefined;

        statistics = {
          totalKeys,
          keysByPattern,
          memoryUsage,
        };
      } catch (error) {
        logger.error('Error getting cache statistics', { error: error.message });
      }
    }

    return {
      redis: redisHealth,
      services,
      statistics,
    };
  }

  /**
   * Cache cleanup operations
   */
  public async cleanupExpiredKeys(): Promise<void> {
    logger.info('Starting cache cleanup for expired keys');

    try {
      const client = await redisCacheService.getClient();
      if (!client) {
        logger.warn('Redis client not available for cleanup');
        return;
      }

      // Redis automatically handles TTL expiration, but we can manually clean up
      // specific patterns if needed
      const patterns = [
        'refresh_token:*',
        'password_reset_token:*',
      ];

      for (const pattern of patterns) {
        const keys = await redisCacheService.keys(pattern);
        for (const key of keys) {
          const ttl = await client.ttl(key);
          if (ttl === -1) {
            // Key exists but has no TTL, might be orphaned
            logger.debug('Found key without TTL, investigating', { key });
          }
        }
      }

      logger.info('Cache cleanup completed');
    } catch (error) {
      logger.error('Error during cache cleanup', { error: error.message });
    }
  }

  /**
   * Emergency cache operations
   */
  public async flushAllCaches(): Promise<void> {
    logger.warn('Flushing all caches - this is an emergency operation');

    try {
      await redisCacheService.flushdb();
      logger.warn('All caches flushed successfully');
    } catch (error) {
      logger.error('Error flushing caches', { error: error.message });
      throw error;
    }
  }

  /**
   * Cache performance monitoring
   */
  public async getPerformanceMetrics(): Promise<{
    hitRate: number;
    missRate: number;
    averageResponseTime: number;
    keyCount: number;
    memoryUsage: string;
  }> {
    const client = await redisCacheService.getClient();
    if (!client) {
      return {
        hitRate: 0,
        missRate: 0,
        averageResponseTime: 0,
        keyCount: 0,
        memoryUsage: '0B',
      };
    }

    try {
      const info = await client.info('stats');
      const keyspaceHits = this.extractInfoValue(info, 'keyspace_hits');
      const keyspaceMisses = this.extractInfoValue(info, 'keyspace_misses');
      const totalOps = keyspaceHits + keyspaceMisses;

      const hitRate = totalOps > 0 ? (keyspaceHits / totalOps) * 100 : 0;
      const missRate = totalOps > 0 ? (keyspaceMisses / totalOps) * 100 : 0;

      const keyCount = await client.dbsize();
      const memoryInfo = await client.info('memory');
      const memoryUsage = this.extractInfoValue(memoryInfo, 'used_memory_human') || '0B';

      // Simple response time test
      const start = Date.now();
      await client.ping();
      const averageResponseTime = Date.now() - start;

      return {
        hitRate,
        missRate,
        averageResponseTime,
        keyCount,
        memoryUsage,
      };
    } catch (error) {
      logger.error('Error getting performance metrics', { error: error.message });
      return {
        hitRate: 0,
        missRate: 0,
        averageResponseTime: 0,
        keyCount: 0,
        memoryUsage: '0B',
      };
    }
  }

  /**
   * Schedule periodic cache maintenance
   */
  public startCacheMaintenance(intervalMinutes: number = 30): void {
    logger.info('Starting cache maintenance scheduler', { intervalMinutes });

    setInterval(async () => {
      try {
        await this.cleanupExpiredKeys();
        
        const health = await this.getHealthStatus();
        logger.info('Cache maintenance completed', {
          totalKeys: health.statistics.totalKeys,
          memoryUsage: health.statistics.memoryUsage,
        });
      } catch (error) {
        logger.error('Error during scheduled cache maintenance', { error: error.message });
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Helper method to extract values from Redis INFO output
   */
  private extractInfoValue(info: string, key: string): any {
    const match = info.match(new RegExp(`${key}:([^\\r\\n]+)`));
    if (match) {
      const value = match[1].trim();
      // Try to parse as number if possible
      const numValue = Number(value);
      return isNaN(numValue) ? value : numValue;
    }
    return null;
  }
}

// Export singleton instance
export const cacheManager = CacheManager.getInstance();