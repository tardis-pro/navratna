import { LLMProviderRepository } from './LLMProviderRepository';
import { redisCacheService } from '../../redis-cache.service';

export class CachedLLMProviderRepository extends LLMProviderRepository {
  private readonly CACHE_TTL = { GLOBAL_PROVIDERS: 600, PROVIDER: 300 };

  async findActiveProviders(): Promise<Record<string, unknown>[]> {
    const cacheKey = 'llm_providers:active:global';
    try {
      const cached = await redisCacheService.get(cacheKey);
      if (typeof cached === 'string') return JSON.parse(cached);
    } catch {}
    const result = await this.findMany({ is_active: true });
    try { await redisCacheService.set(cacheKey, JSON.stringify(result), this.CACHE_TTL.GLOBAL_PROVIDERS); } catch {}
    return result;
  }

  async invalidateProviderCache(_providerId: string): Promise<void> {
    const pattern = 'llm_provider:*';
    const keys = await redisCacheService.keys(pattern);
    for (const key of keys) {
      try { await redisCacheService.del(key); } catch {}
    }
    try { await redisCacheService.del('llm_providers:active:global'); } catch {}
  }

  async invalidateProviderSpecificCache(_key: string): Promise<void> {
    const pattern = 'llm_provider:*';
    const keys = await redisCacheService.keys(pattern);
    for (const key of keys) {
      try { await redisCacheService.del(key); } catch {}
    }
  }

  async invalidateGlobalProviderCache(): Promise<void> {
    try { await redisCacheService.del('llm_providers:active:global'); } catch {}
    const pattern = 'llm_provider:*';
    const keys = await redisCacheService.keys(pattern);
    for (const key of keys) {
      try { await redisCacheService.del(key); } catch {}
    }
  }

  async warmUpCache(): Promise<void> {
    await this.findActiveProviders();
  }
}
