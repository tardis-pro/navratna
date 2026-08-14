import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingService } from '../../knowledge-graph/embedding_service';
import { RelationshipDetector } from '../../knowledge-graph/relationship_detector_service';
import type { KnowledgeRepository } from '../../database/repositories/knowledge_repository';

/**
 * Deterministic fake embedding: a 4-dim vector derived from the text so
 * different texts map to different vectors and the same text is stable.
 */
function fakeVector(text: string): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 9973;
  }
  return [hash % 7, (hash >> 2) % 11, text.length % 13, 1];
}

interface FetchCall {
  inputs: string[];
}

/**
 * Install a fetch stub that records every embeddings request and answers in
 * OpenAI shape. Returns the recorded calls.
 */
function stubFetch(options: { shuffleIndexes?: boolean } = {}): FetchCall[] {
  const calls: FetchCall[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? '{}') as { input: string | string[] };
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      calls.push({ inputs });

      const data = inputs.map((text, index) => ({
        embedding: fakeVector(text),
        index,
      }));

      if (options.shuffleIndexes) {
        data.reverse();
      }

      return {
        ok: true,
        statusText: 'OK',
        json: async () => ({ data }),
      };
    })
  );

  return calls;
}

/**
 * Each test needs a cold cache. The cache is process-wide and keyed by model,
 * so a unique model name per service gives isolation without exposing internals.
 */
let modelCounter = 0;
function freshService(): EmbeddingService {
  modelCounter++;
  return new EmbeddingService({
    apiKey: 'test-key',
    model: `test-model-${modelCounter}`,
    provider: { endpoint: 'https://embeddings.test/v1/embeddings', source: 'database' },
  });
}

describe('EmbeddingService batching', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('embeds many texts in a single request', async () => {
    const calls = stubFetch();
    const service = freshService();
    const texts = Array.from({ length: 40 }, (_, i) => `unique text ${i}`);

    const vectors = await service.generateBatchEmbeddings(texts);

    expect(vectors).toHaveLength(40);
    expect(calls).toHaveLength(1);
    expect(calls[0].inputs).toHaveLength(40);
  });

  it('returns vectors aligned to input order even when the provider reorders them', async () => {
    stubFetch({ shuffleIndexes: true });
    const service = freshService();
    const texts = ['alpha', 'beta', 'gamma'];

    const vectors = await service.generateBatchEmbeddings(texts);

    expect(vectors[0]).toEqual(fakeVector('alpha'));
    expect(vectors[1]).toEqual(fakeVector('beta'));
    expect(vectors[2]).toEqual(fakeVector('gamma'));
  });

  it('sends duplicate texts to the provider only once but returns one vector per input', async () => {
    const calls = stubFetch();
    const service = freshService();

    const vectors = await service.generateBatchEmbeddings(['same', 'other', 'same', 'same']);

    expect(vectors).toHaveLength(4);
    expect(calls[0].inputs).toEqual(['same', 'other']);
    expect(vectors[0]).toEqual(vectors[2]);
    expect(vectors[0]).toEqual(vectors[3]);
  });

  it('serves repeat texts from cache without another provider call', async () => {
    const calls = stubFetch();
    const service = freshService();

    await service.generateBatchEmbeddings(['cached one', 'cached two']);
    expect(calls).toHaveLength(1);

    const again = await service.generateBatchEmbeddings(['cached one', 'cached two']);

    expect(calls).toHaveLength(1);
    expect(again[0]).toEqual(fakeVector('cached one'));
    expect(again[1]).toEqual(fakeVector('cached two'));
  });

  it('shares the cache between single and batch calls', async () => {
    const calls = stubFetch();
    const service = freshService();

    await service.generateEmbedding('shared text');
    expect(calls).toHaveLength(1);

    await service.generateBatchEmbeddings(['shared text']);
    expect(calls).toHaveLength(1);
  });

  it('splits batches above the per-request input cap', async () => {
    const calls = stubFetch();
    const service = freshService();
    const texts = Array.from({ length: 150 }, (_, i) => `capped text ${i}`);

    const vectors = await service.generateBatchEmbeddings(texts);

    expect(vectors).toHaveLength(150);
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.inputs.length <= 64)).toBe(true);
  });

  it('does not mutate a cached vector when a caller edits the returned array', async () => {
    stubFetch();
    const service = freshService();

    const first = await service.generateEmbedding('immutable');
    first[0] = 9999;

    const second = await service.generateEmbedding('immutable');
    expect(second[0]).not.toBe(9999);
  });

  it('falls back to per-text calls when a batch request fails', async () => {
    let batchAttempted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? '{}') as { input: string | string[] };
        const inputs = Array.isArray(body.input) ? body.input : [body.input];

        if (inputs.length > 1) {
          batchAttempted = true;
          return { ok: false, statusText: 'Payload Too Large', json: async () => ({}) };
        }

        return {
          ok: true,
          statusText: 'OK',
          json: async () => ({ data: [{ embedding: fakeVector(inputs[0]), index: 0 }] }),
        };
      })
    );

    const service = freshService();
    const vectors = await service.generateBatchEmbeddings(['one', 'two']);

    expect(batchAttempted).toBe(true);
    expect(vectors[0]).toEqual(fakeVector('one'));
    expect(vectors[1]).toEqual(fakeVector('two'));
  });

  it('chunks a long document into one batched request', async () => {
    const calls = stubFetch();
    const service = freshService();
    const longContent = Array.from(
      { length: 30 },
      (_, i) => `Sentence number ${i} carries enough words to push past the chunk boundary.`
    ).join(' ');

    const vectors = await service.generateEmbeddings(longContent);

    expect(vectors.length).toBeGreaterThan(1);
    expect(calls).toHaveLength(1);
  });
});

describe('RelationshipDetector embedding cost', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('embeds the new item and all candidates in one request', async () => {
    const calls = stubFetch();
    const service = freshService();

    const recentRows = Array.from({ length: 50 }, (_, i) => ({
      id: `item-${i}`,
      content: `recent knowledge item ${i}`,
      type: 'FACTUAL',
      tags: [],
      confidence: 0.8,
      accessLevel: 'public',
      sourceIdentifier: `src-${i}`,
      sourceType: 'USER_INPUT',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      summary: null,
      userId: null,
      agentId: null,
      organizationId: null,
      createdBy: null,
    }));

    const repository = {
      findRecentItems: vi.fn(async () => recentRows),
      findItemsByTags: vi.fn(async () => []),
    } as unknown as KnowledgeRepository;

    const detector = new RelationshipDetector(service, repository);

    await detector.detectRelationships({
      id: 'new-item',
      content: 'a brand new knowledge item',
      type: 'FACTUAL',
      tags: [],
      confidence: 0.8,
      accessLevel: 'public',
      sourceIdentifier: 'src-new',
      sourceType: 'USER_INPUT',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    // Previously this path issued 1 + 50 sequential embedding requests.
    expect(calls).toHaveLength(1);
    expect(calls[0].inputs).toHaveLength(51);
    expect(calls[0].inputs[0]).toBe('a brand new knowledge item');
  });

  it('excludes the new item from its own candidate comparison', async () => {
    const calls = stubFetch();
    const service = freshService();

    const repository = {
      findRecentItems: vi.fn(async () => [
        {
          id: 'new-item',
          content: 'a brand new knowledge item',
          type: 'FACTUAL',
          tags: [],
          confidence: 0.8,
          accessLevel: 'public',
          sourceIdentifier: 'src-new',
          sourceType: 'USER_INPUT',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          summary: null,
          userId: null,
          agentId: null,
          organizationId: null,
          createdBy: null,
        },
      ]),
      findItemsByTags: vi.fn(async () => []),
    } as unknown as KnowledgeRepository;

    const detector = new RelationshipDetector(service, repository);

    const relationships = await detector.detectRelationships({
      id: 'new-item',
      content: 'a brand new knowledge item',
      type: 'FACTUAL',
      tags: [],
      confidence: 0.8,
      accessLevel: 'public',
      sourceIdentifier: 'src-new',
      sourceType: 'USER_INPUT',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    expect(relationships).toEqual([]);
    expect(calls[0].inputs).toEqual(['a brand new knowledge item']);
  });
});
