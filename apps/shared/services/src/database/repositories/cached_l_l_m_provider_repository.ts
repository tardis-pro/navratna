import { LLMProviderRepository } from './l_l_m_provider_repository';
import { redisCacheService } from '../../redis_cache_service';
import type { llmProviders } from '../drizzle/schemas/intelligence_schema';

type LLMProviderRow = typeof llmProviders.$inferSelect;

export class CachedLLMProviderRepository extends LLMProviderRepository {
  private readonly CACHE_TTL = { GLOBAL_PROVIDERS: 600, PROVIDER: 300 };

  async findActiveProviders(): Promise<LLMProviderRow[]> {
    const cacheKey = 'llm_providers:active:global';
    try {
      const cached = await redisCacheService.get(cacheKey);
      if (typeof cached === 'string') return JSON.parse(cached) as LLMProviderRow[];
    } catch { /* cache miss */ }
    const result = await super.findActiveProviders();
    try {
      await redisCacheService.set(
        cacheKey,
        JSON.stringify(result),
        this.CACHE_TTL.GLOBAL_PROVIDERS
      );
    } catch { /* cache write failed */ }
    return result;
  }

  async invalidateProviderCache(_providerId: string): Promise<void> {
    const pattern = 'llm_provider:*';
    const keys = await redisCacheService.keys(pattern);
    for (const key of keys) {
      try {
        await redisCacheService.del(key);
      } catch { /* ignore */ }
    }
    try {
      await redisCacheService.del('llm_providers:active:global');
    } catch { /* ignore */ }
  }

  async invalidateProviderSpecificCache(_key: string): Promise<void> {
    const pattern = 'llm_provider:*';
    const keys = await redisCacheService.keys(pattern);
    for (const key of keys) {
      try {
        await redisCacheService.del(key);
      } catch { /* ignore */ }
    }
  }

  async invalidateGlobalProviderCache(): Promise<void> {
    try {
      await redisCacheService.del('llm_providers:active:global');
    } catch { /* ignore */ }
    const pattern = 'llm_provider:*';
    const keys = await redisCacheService.keys(pattern);
    for (const key of keys) {
      try {
        await redisCacheService.del(key);
      } catch { /* ignore */ }
    }
  }

  async warmUpCache(): Promise<void> {
    await this.findActiveProviders();
  }
}
