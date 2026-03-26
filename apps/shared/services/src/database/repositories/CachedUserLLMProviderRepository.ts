import { UserLLMProviderRepository } from './UserLLMProviderRepository';
import { redisCacheService } from '../../redis-cache.service';
import { logger } from '@uaip/utils';

export class CachedUserLLMProviderRepository extends UserLLMProviderRepository {
  private readonly CACHE_TTL = { ACTIVE_PROVIDERS: 300, PROVIDER_BY_ID: 600, USER_PROVIDERS: 300 };

  async findById(id: string) {
    const key = `user_llm_provider:${id}`;
    try {
      const cached = await redisCacheService.get(key);
      if (typeof cached === 'string') return JSON.parse(cached);
    } catch {}
    const result = await super.findById(id);
    if (result) {
      try {
        await redisCacheService.set(key, JSON.stringify(result), this.CACHE_TTL.PROVIDER_BY_ID);
      } catch {}
    }
    return result;
  }

  async invalidate(id: string): Promise<void> {
    try {
      await redisCacheService.del(`user_llm_provider:${id}`);
    } catch {}
  }

  async invalidateUserProviderCache(userId: string): Promise<void> {
    const pattern = `user_llm_provider:*:${userId}*`;
    const keys = await redisCacheService.keys(pattern);
    for (const key of keys) {
      try {
        await redisCacheService.del(key);
      } catch {}
    }
    const userProviders = await this.findByUserId(userId);
    for (const provider of userProviders) {
      if (provider.id) {
        try {
          await redisCacheService.del(`user_llm_provider:${provider.id}`);
        } catch {}
      }
    }
  }

  async invalidateProviderSpecificCache(providerId: string, userId: string): Promise<void> {
    const key = `user_llm_provider:${providerId}:${userId}`;
    try {
      await redisCacheService.del(key);
    } catch {}
    const userProviders = await this.findByUserId(userId);
    for (const provider of userProviders) {
      if (provider.id) {
        try {
          await redisCacheService.del(`user_llm_provider:${provider.id}`);
        } catch {}
      }
    }
  }

  async findActiveProvidersByUser(
    userId: string,
    useCache = true
  ): Promise<Record<string, unknown>[]> {
    const cacheKey = `user_llm_providers:active:${userId}`;
    if (useCache) {
      try {
        const cached = await redisCacheService.get(cacheKey);
        if (typeof cached === 'string') return JSON.parse(cached);
      } catch {}
    }
    const result = await this.findActiveByUserId(userId);
    if (useCache && result.length > 0) {
      try {
        await redisCacheService.set(
          cacheKey,
          JSON.stringify(result),
          this.CACHE_TTL.ACTIVE_PROVIDERS
        );
      } catch {}
    }
    return result;
  }

  async getCacheHealthStatus(userId: string): Promise<{
    cached: boolean;
    keys: string[];
    stats: { activeProviders: boolean; allProviders: boolean };
  }> {
    const cacheKey = `user_llm_providers:active:${userId}`;
    const keys = [cacheKey];
    const cached = await redisCacheService.exists(cacheKey);
    return {
      cached,
      keys,
      stats: {
        activeProviders: cached,
        allProviders: cached,
      },
    };
  }
}
