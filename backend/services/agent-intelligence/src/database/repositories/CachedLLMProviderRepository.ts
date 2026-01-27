import { LLMProviderRepository } from './LLMProviderRepository.js';
import { LLMProvider } from '../../entities/llmProvider.entity.js';
import { LLMProviderType } from '@uaip/types';
import { redisCacheService } from '../../redis-cache.service.js';
import { logger } from '@uaip/utils';

/**
 * Cached LLM Provider Repository
 * Extends the base LLMProviderRepository with Redis caching for improved performance
 */
export class CachedLLMProviderRepository extends LLMProviderRepository {
  private readonly CACHE_TTL = {
    ACTIVE_PROVIDERS: 900, // 15 minutes
    PROVIDERS_BY_TYPE: 900, // 15 minutes
    BEST_PROVIDER: 600, // 10 minutes
    PROVIDER_BY_NAME: 1800, // 30 minutes
  };

  private readonly CACHE_KEYS = {
    ACTIVE_PROVIDERS: () => 'llm_providers:active:global',
    PROVIDERS_BY_TYPE: (type: LLMProviderType) => `llm_providers:type:global:${type}`,
    BEST_PROVIDER: (type?: LLMProviderType) => `llm_provider:best:global:${type || 'any'}`,
    PROVIDER_BY_NAME: (name: string) => `llm_provider:name:${name}`,
  };

  /**
   * Find all active providers with caching
   */
  async findActiveProviders(useCache = true): Promise<LLMProvider[]> {
    const cacheKey = this.CACHE_KEYS.ACTIVE_PROVIDERS();

    if (useCache) {
      const cached = await redisCacheService.get<LLMProvider[]>(cacheKey);
      if (cached) {
        logger.debug('Active LLM providers retrieved from cache');
        return cached;
      }
    }

    // Cache miss - get from database
    const providers = await super.findActiveProviders();

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, providers, this.CACHE_TTL.ACTIVE_PROVIDERS);
      logger.debug('Active LLM providers cached', { count: providers.length });
    }

    return providers;
  }

  /**
   * Find providers by type with caching
   */
  async findByType(type: LLMProviderType, useCache = true): Promise<LLMProvider[]> {
    const cacheKey = this.CACHE_KEYS.PROVIDERS_BY_TYPE(type);

    if (useCache) {
      const cached = await redisCacheService.get<LLMProvider[]>(cacheKey);
      if (cached) {
        logger.debug('LLM providers by type retrieved from cache', { type });
        return cached;
      }
    }

    // Cache miss - get from database
    const providers = await super.findByType(type);

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, providers, this.CACHE_TTL.PROVIDERS_BY_TYPE);
      logger.debug('LLM providers by type cached', { type, count: providers.length });
    }

    return providers;
  }

  /**
   * Find provider by name with caching
   */
  async findByName(name: string, useCache = true): Promise<LLMProvider | null> {
    const cacheKey = this.CACHE_KEYS.PROVIDER_BY_NAME(name);

    if (useCache) {
      const cached = await redisCacheService.get<LLMProvider | null>(cacheKey);
      if (cached) {
        logger.debug('LLM provider by name retrieved from cache', { name });
        return cached;
      }
    }

    // Cache miss - get from database
    const provider = await super.findByName(name);

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, provider, this.CACHE_TTL.PROVIDER_BY_NAME);
      logger.debug('LLM provider by name cached', { name, found: !!provider });
    }

    return provider;
  }

  /**
   * Find the best available provider with caching
   */
  async findBestProvider(type?: LLMProviderType, useCache = true): Promise<LLMProvider | null> {
    const cacheKey = this.CACHE_KEYS.BEST_PROVIDER(type);

    if (useCache) {
      const cached = await redisCacheService.get<LLMProvider | null>(cacheKey);
      if (cached) {
        logger.debug('Best LLM provider retrieved from cache', { type });
        return cached;
      }
    }

    // Cache miss - get from database
    const provider = await super.findBestProvider(type);

    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, provider, this.CACHE_TTL.BEST_PROVIDER);
      logger.debug('Best LLM provider cached', { type, providerId: provider?.id });
    }

    return provider;
  }

  /**
   * Create a new LLM provider and invalidate cache
   */
  async createProvider(data: any): Promise<LLMProvider> {
    const provider = await super.createProvider(data);

    // Invalidate relevant caches
    await this.invalidateGlobalProviderCache();

    return provider;
  }

  /**
   * Update provider configuration and invalidate cache
   */
  async updateProvider(id: string, data: any): Promise<LLMProvider> {
    const provider = await super.updateProvider(id, data);

    // Invalidate relevant caches
    await this.invalidateGlobalProviderCache();

    return provider;
  }

  /**
   * Update provider status and invalidate cache
   */
  async updateStatus(id: string, status: any): Promise<void> {
    await super.updateStatus(id, status);

    // Invalidate relevant caches
    await this.invalidateGlobalProviderCache();
  }

  /**
   * Delete a provider and invalidate cache
   */
  async deleteProvider(id: string): Promise<void> {
    await super.deleteProvider(id);

    // Invalidate relevant caches
    await this.invalidateGlobalProviderCache();
  }

  /**
   * Invalidate all global provider caches
   */
  async invalidateGlobalProviderCache(): Promise<void> {
    const patterns = [
      this.CACHE_KEYS.ACTIVE_PROVIDERS(),
      'llm_providers:type:global:*',
      'llm_provider:best:global:*',
      'llm_provider:name:*',
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

    logger.info('Global LLM provider cache invalidated', { patterns });
  }

  /**
   * Warm up cache by pre-loading common queries
   */
  async warmUpCache(): Promise<void> {
    logger.info('Warming up LLM provider cache...');

    try {
      // Pre-load active providers
      await this.findActiveProviders(true);

      // Pre-load providers by common types
      const commonTypes = [
        LLMProviderType.OPENAI,
        LLMProviderType.ANTHROPIC,
        LLMProviderType.OLLAMA,
        LLMProviderType.LLMSTUDIO,
      ];

      for (const type of commonTypes) {
        await this.findByType(type, true);
        await this.findBestProvider(type, true);
      }

      // Pre-load best provider (any type)
      await this.findBestProvider(undefined, true);

      logger.info('LLM provider cache warmed up successfully');
    } catch (error) {
      logger.error('Error warming up LLM provider cache', { error: error.message });
    }
  }

  /**
   * Get cache health status for global providers
   */
  async getCacheHealthStatus(): Promise<{
    cached: boolean;
    keys: string[];
    stats: {
      activeProviders: boolean;
      bestProvider: boolean;
      typeBasedCacheCount: number;
    };
  }> {
    const keys = [this.CACHE_KEYS.ACTIVE_PROVIDERS(), this.CACHE_KEYS.BEST_PROVIDER()];

    const stats = {
      activeProviders: await redisCacheService.exists(keys[0]),
      bestProvider: await redisCacheService.exists(keys[1]),
      typeBasedCacheCount: 0,
    };

    // Count type-based cache entries
    const typeKeys = await redisCacheService.keys('llm_providers:type:global:*');
    stats.typeBasedCacheCount = typeKeys.length;

    return {
      cached: stats.activeProviders || stats.bestProvider || stats.typeBasedCacheCount > 0,
      keys: [...keys, ...typeKeys],
      stats,
    };
  }
}
