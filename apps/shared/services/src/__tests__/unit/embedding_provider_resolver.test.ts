import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findActiveProvidersMock = vi.fn();

vi.mock('@uaip/utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('@uaip/utils')>();
  return {
    ...original,
    isEncryptedApiKey: (value: string) => {
      const parts = value.split(':');
      return parts.length === 3 && parts.every((part) => part.length > 0 && /^[\da-f]+$/i.test(part));
    },
  };
});

vi.mock('../../database/repositories/l_l_m_provider_repository', () => ({
  LLMProviderRepository: class {
    findActiveProviders = findActiveProvidersMock;
  },
}));

const ENV_KEYS = [
  'EMBEDDINGS_URL',
  'EMBEDDINGS_API_KEY',
  'EMBEDDINGS_MODEL',
  'OPENAI_API_KEY',
  'RERANKING_URL',
  'RERANKING_API_KEY',
  'RERANKING_MODEL',
];

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

function databaseProvider(usageType: 'embedding' | 'reranking', baseUrl: string, apiKey: string) {
  return {
    id: `provider-${usageType}`,
    usageType,
    baseUrl,
    apiKeyEncrypted: apiKey,
    defaultModel: 'provider-model',
    isActive: true,
  };
}

describe('embedding_provider_resolver', () => {
  beforeEach(() => {
    clearEnv();
    findActiveProvidersMock.mockReset();
  });

  afterEach(() => {
    clearEnv();
    vi.resetModules();
  });

  it.each([
    ['https://provider.example', 'https://provider.example/v1/embeddings'],
    ['https://provider.example/v1', 'https://provider.example/v1/embeddings'],
    ['https://provider.example/v1/embeddings', 'https://provider.example/v1/embeddings'],
  ])('normalizes DB embedding base %s to %s', async (baseUrl, endpoint) => {
    findActiveProvidersMock.mockResolvedValue([databaseProvider('embedding', baseUrl, 'decrypted-key')]);
    const { resolveEmbeddingProvider } = await import('../../knowledge-graph/embedding_provider_resolver');

    await expect(resolveEmbeddingProvider()).resolves.toMatchObject({
      endpoint,
      source: 'database',
      apiKey: 'decrypted-key',
    });
  });

  it.each([
    ['https://provider.example', 'https://provider.example/v1/rerank'],
    ['https://provider.example/v1', 'https://provider.example/v1/rerank'],
    ['https://provider.example/v1/rerank', 'https://provider.example/v1/rerank'],
  ])('normalizes DB reranking base %s to %s without duplicate paths', async (baseUrl, endpoint) => {
    findActiveProvidersMock.mockResolvedValue([databaseProvider('reranking', baseUrl, 'rerank-key')]);
    const { resolveRerankingProvider } = await import('../../knowledge-graph/embedding_provider_resolver');

    await expect(resolveRerankingProvider()).resolves.toMatchObject({ endpoint, source: 'database' });
  });

  it('preserves exact environment endpoints', async () => {
    findActiveProvidersMock.mockResolvedValue([]);
    process.env.EMBEDDINGS_URL = 'https://env.example/custom-embedding-path';
    process.env.RERANKING_URL = 'https://env.example/custom-reranking-path';
    const { resolveEmbeddingProvider, resolveRerankingProvider } = await import(
      '../../knowledge-graph/embedding_provider_resolver'
    );

    expect((await resolveEmbeddingProvider()).endpoint).toBe('https://env.example/custom-embedding-path');
    expect((await resolveRerankingProvider())?.endpoint).toBe('https://env.example/custom-reranking-path');
  });

  it('omits an encrypted-looking credential returned unresolved by the repository', async () => {
    findActiveProvidersMock.mockResolvedValue([
      databaseProvider('embedding', 'https://provider.example/v1', 'aabb:ccdd:eeff'),
    ]);
    const { resolveEmbeddingProvider } = await import('../../knowledge-graph/embedding_provider_resolver');

    const provider = await resolveEmbeddingProvider();
    expect(provider.apiKey).toBeUndefined();
  });

  it('uses embedding environment credentials and model', async () => {
    findActiveProvidersMock.mockResolvedValue([]);
    process.env.EMBEDDINGS_URL = 'https://env.example/embeddings';
    process.env.EMBEDDINGS_API_KEY = 'env-key';
    process.env.EMBEDDINGS_MODEL = 'env-model';
    const { resolveEmbeddingProvider } = await import('../../knowledge-graph/embedding_provider_resolver');

    await expect(resolveEmbeddingProvider()).resolves.toMatchObject({
      endpoint: 'https://env.example/embeddings',
      source: 'environment',
      apiKey: 'env-key',
      model: 'env-model',
    });
  });

  it('uses OPENAI_API_KEY when EMBEDDINGS_API_KEY is absent', async () => {
    findActiveProvidersMock.mockResolvedValue([]);
    process.env.OPENAI_API_KEY = 'openai-key';
    const { resolveEmbeddingProvider } = await import('../../knowledge-graph/embedding_provider_resolver');
    expect((await resolveEmbeddingProvider()).apiKey).toBe('openai-key');
  });

  it('has no localhost defaults and returns null without a reranker', async () => {
    findActiveProvidersMock.mockResolvedValue([]);
    const { resolveEmbeddingProvider, resolveRerankingProvider } = await import(
      '../../knowledge-graph/embedding_provider_resolver'
    );

    expect((await resolveEmbeddingProvider()).endpoint).not.toContain('localhost');
    await expect(resolveRerankingProvider()).resolves.toBeNull();
  });

  it('falls back to the exact environment endpoint when repository lookup fails', async () => {
    findActiveProvidersMock.mockRejectedValue(new Error('db down'));
    process.env.EMBEDDINGS_URL = 'https://env.example/exact';
    const { resolveEmbeddingProvider } = await import('../../knowledge-graph/embedding_provider_resolver');
    expect((await resolveEmbeddingProvider()).endpoint).toBe('https://env.example/exact');
  });
});
