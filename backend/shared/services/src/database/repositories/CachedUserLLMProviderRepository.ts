import { UserLLMProviderRepository } from './UserLLMProviderRepository.js';
import { UserLLMProvider, UserLLMProviderType, UserLLMProviderStatus } from '../../entities/userLLMProvider.entity.js';
import { redisCacheService } from '../../redis-cache.service.js';
import { logger } from '@uaip/utils';

/**
 * Cached User LLM Provider Repository
 * Extends the base UserLLMProviderRepository with Redis caching for improved performance
 */
export class CachedUserLLMProviderRepository extends UserLLMProviderRepository {
  private readonly CACHE_TTL = {
    ACTIVE_PROVIDERS: 300, // 5 minutes (reduced from 15)
    PROVIDER_STATS: 300, // 5 minutes
    BEST_PROVIDER: 300, // 5 minutes (reduced from 10)
    PROVIDERS_BY_TYPE: 300, // 5 minutes (reduced from 15)
    HEALTH_CHECK_PROVIDERS: 300, // 5 minutes
  };

  private readonly CACHE_KEYS = {
    ACTIVE_PROVIDERS: (userId: string) => `llm_providers:active:${userId}`,
    ALL_PROVIDERS: (userId: string) => `llm_providers:all:${userId}`,
    PROVIDER_STATS: (id: string, userId: string) => `llm_provider_stats:${id}:${userId}`,
    BEST_PROVIDER: (userId: string, type?: UserLLMProviderType) => 
      `llm_provider:best:${userId}:${type || 'any'}`,
    PROVIDERS_BY_TYPE: (userId: string, type: UserLLMProviderType) => 
      `llm_providers:type:${userId}:${type}`,
    HEALTH_CHECK_PROVIDERS: (userId: string) => `llm_providers:health_check:${userId}`,
  };

  /**
   * Find all active providers for a user with caching
   */
  async findActiveProvidersByUser(userId: string, useCache = true): Promise<UserLLMProvider[]> {
    const cacheKey = this.CACHE_KEYS.ACTIVE_PROVIDERS(userId);
    
    if (useCache) {
      const cached = await redisCacheService.get<UserLLMProvider[]>(cacheKey);
      if (cached) {
        logger.debug('Active LLM providers retrieved from cache', { userId });
        return cached;
      }
    }

    // Cache miss - get from database
    const providers = await super.findActiveProvidersByUser(userId);
    
    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, providers, this.CACHE_TTL.ACTIVE_PROVIDERS);
      logger.debug('Active LLM providers cached', { userId, count: providers.length });
    }

    return providers;
  }

  /**
   * Find all providers for a user (including inactive) with caching
   */
  async findAllProvidersByUser(userId: string, useCache = true): Promise<UserLLMProvider[]> {
    const cacheKey = this.CACHE_KEYS.ALL_PROVIDERS(userId);
    
    if (useCache) {
      const cached = await redisCacheService.get<UserLLMProvider[]>(cacheKey);
      if (cached) {
        logger.debug('All LLM providers retrieved from cache', { userId });
        return cached;
      }
    }

    // Cache miss - get from database
    const providers = await super.findAllProvidersByUser(userId);
    
    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, providers, this.CACHE_TTL.ACTIVE_PROVIDERS);
      logger.debug('All LLM providers cached', { userId, count: providers.length });
    }

    return providers;
  }

  /**
   * Find the best available provider for a user with caching
   */
  async findBestProviderForUser(userId: string, type?: UserLLMProviderType, useCache = true): Promise<UserLLMProvider | null> {
    const cacheKey = this.CACHE_KEYS.BEST_PROVIDER(userId, type);
    
    if (useCache) {
      const cached = await redisCacheService.get<UserLLMProvider | null>(cacheKey);
      if (cached) {
        logger.debug('Best LLM provider retrieved from cache', { userId, type });
        return cached;
      }
    }

    // Cache miss - get from database
    const provider = await super.findBestProviderForUser(userId, type);
    
    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, provider, this.CACHE_TTL.BEST_PROVIDER);
      logger.debug('Best LLM provider cached', { userId, type, providerId: provider?.id });
    }

    return provider;
  }

  /**
   * Find providers by user and type with caching
   */
  async findProvidersByUserAndType(userId: string, type: UserLLMProviderType, useCache = true): Promise<UserLLMProvider[]> {
    const cacheKey = this.CACHE_KEYS.PROVIDERS_BY_TYPE(userId, type);
    
    if (useCache) {
      const cached = await redisCacheService.get<UserLLMProvider[]>(cacheKey);
      if (cached) {
        logger.debug('LLM providers by type retrieved from cache', { userId, type });
        return cached;
      }
    }

    // Cache miss - get from database
    const providers = await super.findProvidersByUserAndType(userId, type);
    
    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, providers, this.CACHE_TTL.PROVIDERS_BY_TYPE);
      logger.debug('LLM providers by type cached', { userId, type, count: providers.length });
    }

    return providers;
  }

  /**
   * Get provider statistics with caching
   */
  async getProviderStats(id: string, userId: string, useCache = true): Promise<{
    totalRequests: string;
    totalTokensUsed: string;
    totalErrors: string;
    errorRate: number;
    lastUsedAt?: Date;
    healthStatus?: string;
  } | null> {
    const cacheKey = this.CACHE_KEYS.PROVIDER_STATS(id, userId);
    
    if (useCache) {
      const cached = await redisCacheService.get(cacheKey);
      if (cached) {
        logger.debug('LLM provider stats retrieved from cache', { id, userId });
        return cached;
      }
    }

    // Cache miss - get from database
    const stats = await super.getProviderStats(id, userId);
    
    // Cache the result
    if (useCache && stats) {
      await redisCacheService.set(cacheKey, stats, this.CACHE_TTL.PROVIDER_STATS);
      logger.debug('LLM provider stats cached', { id, userId });
    }

    return stats;
  }

  /**
   * Get providers needing health check with caching
   */
  async getProvidersNeedingHealthCheck(userId: string, minutesThreshold: number = 30, useCache = true): Promise<UserLLMProvider[]> {
    const cacheKey = this.CACHE_KEYS.HEALTH_CHECK_PROVIDERS(userId);
    
    if (useCache) {
      const cached = await redisCacheService.get<UserLLMProvider[]>(cacheKey);
      if (cached) {
        logger.debug('Providers needing health check retrieved from cache', { userId });
        return cached;
      }
    }

    // Cache miss - get from database
    const providers = await super.getProvidersNeedingHealthCheck(userId, minutesThreshold);
    
    // Cache the result (shorter TTL for health check data)
    if (useCache) {
      await redisCacheService.set(cacheKey, providers, this.CACHE_TTL.HEALTH_CHECK_PROVIDERS);
      logger.debug('Providers needing health check cached', { userId, count: providers.length });
    }

    return providers;
  }

  /**
   * Create a new user LLM provider and invalidate cache
   */
  async createUserProvider(data: {
    userId: string;
    name: string;
    description?: string;
    type: UserLLMProviderType;
    baseUrl?: string;
    apiKey?: string;
    defaultModel?: string;
    modelsList?: string[];
    configuration?: any;
    priority?: number;
  }): Promise<UserLLMProvider> {
    const provider = await super.createUserProvider(data);
    
    // Invalidate relevant caches
    await this.invalidateUserProviderCache(data.userId);
    
    return provider;
  }

  /**
   * Update provider configuration and invalidate cache
   */
  async updateProviderConfig(id: string, userId: string, config: {
    name?: string;
    description?: string;
    baseUrl?: string;
    defaultModel?: string;
    priority?: number;
    configuration?: any;
  }): Promise<void> {
    await super.updateProviderConfig(id, userId, config);
    
    // Invalidate relevant caches
    await this.invalidateUserProviderCache(userId);
    await this.invalidateProviderSpecificCache(id, userId);
  }

  /**
   * Update provider API key and invalidate cache
   */
  async updateApiKey(id: string, apiKey: string, userId: string): Promise<void> {
    await super.updateApiKey(id, apiKey, userId);
    
    // Invalidate relevant caches
    await this.invalidateUserProviderCache(userId);
    await this.invalidateProviderSpecificCache(id, userId);
  }

  /**
   * Update provider status and invalidate cache
   */
  async updateStatus(id: string, status: UserLLMProviderStatus, userId: string): Promise<void> {
    await super.updateStatus(id, status, userId);
    
    // Invalidate relevant caches
    await this.invalidateUserProviderCache(userId);
    await this.invalidateProviderSpecificCache(id, userId);
  }

  /**
   * Update provider usage statistics and invalidate cache
   */
  async updateUsageStats(id: string, tokensUsed: number, isError: boolean = false): Promise<void> {
    await super.updateUsageStats(id, tokensUsed, isError);
    
    // Get provider to find userId for cache invalidation
    const provider = await super.findById(id);
    if (provider) {
      await this.invalidateProviderSpecificCache(id, provider.userId);
    }
  }

  /**
   * Update health check result and invalidate cache
   */
  async updateHealthCheck(
    id: string, 
    result: { status: 'healthy' | 'unhealthy'; latency?: number; error?: string }
  ): Promise<void> {
    await super.updateHealthCheck(id, result);
    
    // Get provider to find userId for cache invalidation
    const provider = await super.findById(id);
    if (provider) {
      await this.invalidateProviderSpecificCache(id, provider.userId);
      await redisCacheService.del(this.CACHE_KEYS.HEALTH_CHECK_PROVIDERS(provider.userId));
    }
  }

  /**
   * Delete a user provider and invalidate cache
   */
  async deleteUserProvider(id: string, userId: string): Promise<void> {
    await super.deleteUserProvider(id, userId);
    
    // Invalidate relevant caches
    await this.invalidateUserProviderCache(userId);
    await this.invalidateProviderSpecificCache(id, userId);
  }

  /**
   * Invalidate all user provider caches
   */
  async invalidateUserProviderCache(userId: string): Promise<void> {
    const patterns = [
      this.CACHE_KEYS.ACTIVE_PROVIDERS(userId),
      this.CACHE_KEYS.ALL_PROVIDERS(userId),
      this.CACHE_KEYS.HEALTH_CHECK_PROVIDERS(userId),
      `llm_provider:best:${userId}:*`,
      `llm_providers:type:${userId}:*`,
    ];

    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        // Handle wildcard patterns
        const keys = await redisCacheService.keys(pattern);
        for (const key of keys) {
          await redisCacheService.del(key);
        }
      } else {
        await redisCacheService.del(pattern);
      }
    }

    logger.info('User LLM provider cache invalidated', { userId, patterns });
  }

  /**
   * Invalidate provider-specific caches
   */
  async invalidateProviderSpecificCache(id: string, userId: string): Promise<void> {
    const patterns = [
      this.CACHE_KEYS.PROVIDER_STATS(id, userId),
    ];

    for (const pattern of patterns) {
      await redisCacheService.del(pattern);
    }

    logger.debug('Provider-specific cache invalidated', { id, userId });
  }

  /**
   * Bulk cache invalidation for multiple providers
   */
  async bulkInvalidateProviderCache(providerIds: string[], userId: string): Promise<void> {
    // Invalidate user-level caches
    await this.invalidateUserProviderCache(userId);
    
    // Invalidate provider-specific caches
    for (const id of providerIds) {
      await this.invalidateProviderSpecificCache(id, userId);
    }

    logger.info('Bulk provider cache invalidation completed', { 
      providerIds, 
      userId, 
      count: providerIds.length 
    });
  }

  /**
   * Get cache health status for user providers
   */
  async getCacheHealthStatus(userId: string): Promise<{
    cached: boolean;
    keys: string[];
    stats: {
      activeProviders: boolean;
      allProviders: boolean;
      bestProvider: boolean;
      healthCheckProviders: boolean;
    };
  }> {
    const keys = [
      this.CACHE_KEYS.ACTIVE_PROVIDERS(userId),
      this.CACHE_KEYS.ALL_PROVIDERS(userId),
      this.CACHE_KEYS.BEST_PROVIDER(userId),
      this.CACHE_KEYS.HEALTH_CHECK_PROVIDERS(userId),
    ];

    const stats = {
      activeProviders: await redisCacheService.exists(keys[0]),
      allProviders: await redisCacheService.exists(keys[1]),
      bestProvider: await redisCacheService.exists(keys[2]),
      healthCheckProviders: await redisCacheService.exists(keys[3]),
    };

    return {
      cached: Object.values(stats).some(cached => cached),
      keys,
      stats
    };
  }
}