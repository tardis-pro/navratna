import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProviderRerankingClient,
  createRerankingPort,
  normalizeRerankResponse,
} from '../../knowledge-graph/provider_reranking';

describe('normalizeRerankResponse', () => {
  it('normalizes the conventional Cohere/Jina shape { results: [{ index, relevance_score }] }', () => {
    const body = {
      results: [
        { index: 2, relevance_score: 0.91 },
        { index: 0, relevance_score: 0.42 },
      ],
    };

    const normalized = normalizeRerankResponse(body);

    expect(normalized).toEqual([
      { index: 2, score: 0.91 },
      { index: 0, score: 0.42 },
    ]);
  });

  it('accepts safe provider variants: bare array + score/relevanceScore fields + data wrapper', () => {
    expect(normalizeRerankResponse([{ index: 1, score: 0.7 }])).toEqual([
      { index: 1, score: 0.7 },
    ]);
    expect(normalizeRerankResponse({ data: [{ index: 3, relevanceScore: 0.5 }] })).toEqual([
      { index: 3, score: 0.5 },
    ]);
    expect(normalizeRerankResponse({ ranking: [{ index: 0, relevance_score: 0.2 }] })).toEqual([
      { index: 0, score: 0.2 },
    ]);
  });

  it('drops malformed entries rather than fabricating scores', () => {
    const body = {
      results: [
        { index: 0, relevance_score: 0.8 },
        { index: 1 },
        { relevance_score: 0.6 },
        'garbage',
      ],
    };

    expect(normalizeRerankResponse(body)).toEqual([{ index: 0, score: 0.8 }]);
  });

  it('throws when the body has no recognizable results array', () => {
    expect(() => normalizeRerankResponse({ foo: 'bar' })).toThrow();
    expect(() => normalizeRerankResponse(null)).toThrow();
  });
});

describe('createRerankingPort', () => {
  it('returns null when no reranking provider is configured', () => {
    expect(createRerankingPort(null)).toBeNull();
    expect(createRerankingPort(undefined)).toBeNull();
    expect(createRerankingPort({ endpoint: '' })).toBeNull();
  });

  it('returns a client when a provider base URL is present', () => {
    const port = createRerankingPort({ endpoint: 'https://rerank.example/v1/rerank' });
    expect(port).toBeInstanceOf(ProviderRerankingClient);
  });
});

describe('ProviderRerankingClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to the configured provider endpoint and sorts by score descending', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        results: [
          { index: 0, relevance_score: 0.3 },
          { index: 1, relevance_score: 0.9 },
        ],
      }),
    });

    const client = new ProviderRerankingClient({
      endpoint: 'https://rerank.example/v1/rerank',
      apiKey: 'rk',
      model: 'rerank-model',
    });

    const results = await client.rerank('query', ['doc-a', 'doc-b'], 2);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://rerank.example/v1/rerank',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer rk' }),
      })
    );
    expect(results).toEqual([
      { index: 1, score: 0.9 },
      { index: 0, score: 0.3 },
    ]);
    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(request.body)).toMatchObject({ top_n: 2 });
    expect(JSON.parse(request.body)).not.toHaveProperty('top_k');
  });

  it('uses only top_k for Voyage endpoints', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ results: [{ index: 0, relevance_score: 0.8 }] }),
    });
    const client = new ProviderRerankingClient({
      endpoint: 'https://api.voyageai.com/v1/rerank',
      model: 'rerank-2',
    });

    await client.rerank('query', ['document'], 1);

    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(request.body)).toMatchObject({ top_k: 1 });
    expect(JSON.parse(request.body)).not.toHaveProperty('top_n');
  });

  it('returns [] for empty documents without calling fetch', async () => {
    const client = new ProviderRerankingClient({ endpoint: 'https://rerank.example/v1/rerank' });
    const results = await client.rerank('query', ['', '   ']);
    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on non-OK responses (no fabricated scores)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({}),
    });
    const client = new ProviderRerankingClient({ endpoint: 'https://rerank.example/v1/rerank' });
    await expect(client.rerank('query', ['doc'])).rejects.toThrow(
      'Reranking provider error: 500'
    );
  });
});
