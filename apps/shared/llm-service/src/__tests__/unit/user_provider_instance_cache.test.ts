import { describe, expect, it, beforeEach, vi } from 'vitest';

import { UserLLMService } from '../../user_l_l_m_service.js';

/**
 * A provider instance captures its API key and base URL at construction. The
 * cache was keyed only on user+provider id, so once an instance was built from
 * a row with no credential, every later call reused it and kept failing with
 * HTTP 401 even after the key was saved — until the process restarted.
 */
type CacheProbe = {
  getOrCreateProviderInstance(provider: unknown): Promise<unknown>;
  createProviderInstance(provider: unknown): Promise<unknown>;
  providerCache: Map<string, unknown>;
};

function probe(): CacheProbe {
  return new UserLLMService() as unknown as CacheProbe;
}

function providerRow(apiKey: string | null, baseUrl = 'https://ai.tardis.digital/v1') {
  return {
    id: 'provider-1',
    userId: 'user-1',
    name: 'Tardis',
    type: 'custom',
    baseUrl,
    apiKeyEncrypted: apiKey,
    defaultModel: 'ultra-smart-reliable',
    configuration: {},
  };
}

let service: CacheProbe;
let created: Array<string | null>;

beforeEach(() => {
  service = probe();
  created = [];
  vi.spyOn(service, 'createProviderInstance').mockImplementation(async (provider: unknown) => {
    const row = provider as ReturnType<typeof providerRow>;
    created.push(row.apiKeyEncrypted);
    return { apiKey: row.apiKeyEncrypted, baseUrl: row.baseUrl };
  });
});

describe('user provider instance cache', () => {
  it('rebuilds the provider once a missing credential is supplied', async () => {
    await service.getOrCreateProviderInstance(providerRow(null));
    const afterKeyAdded = await service.getOrCreateProviderInstance(providerRow('sk-real-key'));

    expect(created).toEqual([null, 'sk-real-key']);
    expect((afterKeyAdded as { apiKey: string }).apiKey).toBe('sk-real-key');
  });

  it('rebuilds when the credential is rotated', async () => {
    await service.getOrCreateProviderInstance(providerRow('sk-old'));
    const rotated = await service.getOrCreateProviderInstance(providerRow('sk-new'));

    expect(created).toEqual(['sk-old', 'sk-new']);
    expect((rotated as { apiKey: string }).apiKey).toBe('sk-new');
  });

  it('rebuilds when the base URL changes', async () => {
    await service.getOrCreateProviderInstance(providerRow('sk-same'));
    await service.getOrCreateProviderInstance(providerRow('sk-same', 'https://other.example/v1'));

    expect(created).toHaveLength(2);
  });

  it('still caches when nothing changed', async () => {
    const first = await service.getOrCreateProviderInstance(providerRow('sk-same'));
    const second = await service.getOrCreateProviderInstance(providerRow('sk-same'));

    expect(created).toHaveLength(1);
    expect(second).toBe(first);
  });

  it('does not accumulate an entry per rotation', async () => {
    await service.getOrCreateProviderInstance(providerRow('sk-1'));
    await service.getOrCreateProviderInstance(providerRow('sk-2'));
    await service.getOrCreateProviderInstance(providerRow('sk-3'));

    expect(service.providerCache.size).toBe(1);
  });
});
