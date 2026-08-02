import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

import { LLMService } from '../../l_l_m_service.js';
import type { BaseProvider } from '../../providers/base_provider.js';

function providerConfig(provider: BaseProvider | undefined): { defaultModel?: string } {
  if (provider === undefined) {
    throw new Error('no openai provider was constructed — test needs updating');
  }
  // config is protected on BaseProvider, so it is only reachable reflectively.
  const held: unknown = Reflect.get(provider, 'config');
  if (typeof held !== 'object' || held === null) {
    throw new Error('provider has no config — test needs updating');
  }
  return held as { defaultModel?: string };
}

describe('LLMService provider construction', () => {
  beforeEach(() => {
    repoMocks.findMany.mockReset();
  });

  it('carries default_model from the database row into the provider config', async () => {
    repoMocks.findMany.mockResolvedValue([
      {
        id: 'p-1',
        name: 'tardis',
        type: 'openai',
        baseUrl: 'https://ai.tardis.digital/v1',
        apiKeyEncrypted: 'plaintext-key',
        defaultModel: 'dirt-cheap',
        configuration: {},
        isActive: true,
        priority: 1000,
      },
    ]);

    const service = new LLMService();
    // initializeFromDatabase only reaches for DatabaseService when the
    // repository is unset, so seeding it here keeps the test off the database.
    Reflect.set(service, 'llmProviderRepository', repoMocks);
    await Reflect.get(service, 'initializeFromDatabase').call(service);

    const providers = Reflect.get(service, 'providers') as Map<string, BaseProvider>;

    // OpenAIProvider falls back to config.defaultModel when a request names no
    // model. Without this field every platform-scoped call — onboarding
    // extraction included — throws "no model configured", however carefully the
    // llm_providers row was filled in.
    expect(providerConfig(providers.get('openai')).defaultModel).toBe('dirt-cheap');
  });
});
