import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { QdrantService, chunkPointId } from '../../qdrant_service';

const TENANT = '00000000-0000-0000-0000-000000000001';
const ITEM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/**
 * Characterises `QdrantService.store()`'s point-id scheme.
 *
 * `store()` maps embeddings with `id: index`, so the POINT ID is the chunk
 * index rather than anything derived from the knowledge item. Two consequences,
 * both asserted below against a Qdrant stand-in that upserts by id the way the
 * real one does:
 *
 *  1. WRITE: every item's chunk 0 is written as point id 0, so ingesting a
 *     second item overwrites the first item's vectors.
 *  2. READ: search returns `point.id`, which callers use as the knowledge item
 *     id to hydrate from Postgres — so they look up `0` and find nothing. The
 *     real id is carried in `payload.knowledge_item_id` and ignored.
 *
 * The `upsert()` path is included as the contrast case: it uses `id: doc.id`
 * and round-trips correctly, which is why `/knowledge/search` works while
 * chat-ingested knowledge does not.
 */
type Point = { id: string | number; vector: number[]; payload: Record<string, unknown> };

function makeQdrantStub() {
  const points: Point[] = [];

  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.endsWith('/healthz')) {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }

    const method = init?.method ?? 'GET';
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : {};

    // Real Qdrant upserts by point id: same id replaces the stored point.
    if (urlStr.endsWith('/points') && method === 'PUT') {
      for (const p of (body as { points: Point[] }).points) {
        const at = points.findIndex((x) => String(x.id) === String(p.id));
        if (at >= 0) points[at] = p;
        else points.push(p);
      }
      return new Response(JSON.stringify({ result: { status: 'completed' } }), { status: 200 });
    }

    if (urlStr.endsWith('/points/search') && method === 'POST') {
      return new Response(
        JSON.stringify({ result: points.map((p) => ({ id: p.id, score: 1, payload: p.payload })) }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ result: {} }), { status: 200 });
  });

  return { fetchMock, points };
}

describe('QdrantService.store point identity', () => {
  let stub: ReturnType<typeof makeQdrantStub>;
  let service: QdrantService;

  beforeEach(() => {
    stub = makeQdrantStub();
    vi.stubGlobal('fetch', stub.fetchMock);
    service = new QdrantService('http://mock-qdrant:6333');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps two different knowledge items as separate points', async () => {
    await service.store(ITEM_A, TENANT, [[0.1, 0.2]]);
    await service.store(ITEM_B, TENANT, [[0.3, 0.4]]);

    // Both items were ingested, so both must be retrievable. With `id: index`
    // they collide on point id 0 and only the last write survives.
    expect(stub.points).toHaveLength(2);

    const storedItemIds = stub.points.map((p) => p.payload.knowledge_item_id).sort();
    expect(storedItemIds).toEqual([ITEM_A, ITEM_B].sort());
  });

  it('does not let a later item overwrite an earlier item vectors', async () => {
    await service.store(ITEM_A, TENANT, [[0.1, 0.2]]);
    await service.store(ITEM_B, TENANT, [[0.3, 0.4]]);

    const itemA = stub.points.find((p) => p.payload.knowledge_item_id === ITEM_A);
    expect(itemA, 'item A vectors were overwritten by item B').toBeDefined();
    expect(itemA?.vector).toEqual([0.1, 0.2]);
  });

  it('returns an id callers can hydrate from Postgres', async () => {
    await service.store(ITEM_A, TENANT, [[0.1, 0.2]]);

    const [hit] = await service.search([0.1, 0.2], { limit: 5, tenantId: TENANT });

    // KnowledgeGraphService feeds this straight into repository.getItems(), so
    // it has to be the knowledge item id — not a chunk ordinal.
    expect(hit.id).toBe(ITEM_A);
  });

  it('keeps every chunk of one multi-chunk item', async () => {
    await service.store(ITEM_A, TENANT, [
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ]);

    expect(stub.points).toHaveLength(3);
    expect(new Set(stub.points.map((p) => String(p.id))).size).toBe(3);
  });

  // Contrast: the upsert() path is id-correct, which is why the routes built on
  // it return results while store()-ingested knowledge does not.
  it('upsert() already round-trips the document id', async () => {
    await service.upsert(TENANT, [{ id: ITEM_A, content: 'hello', embedding: [0.1, 0.2] }]);

    const [hit] = await service.search([0.1, 0.2], { limit: 5, tenantId: TENANT });
    expect(hit.id).toBe(ITEM_A);
  });

  it('re-ingesting an item replaces its chunks rather than duplicating them', async () => {
    await service.store(ITEM_A, TENANT, [
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    await service.store(ITEM_A, TENANT, [
      [0.5, 0.6],
      [0.7, 0.8],
    ]);

    // Ids derive from (item, chunk), so the second write lands on the same two
    // points. A random id would leave the stale copy behind for ever.
    expect(stub.points).toHaveLength(2);
    expect(stub.points.map((p) => p.vector)).toEqual([
      [0.5, 0.6],
      [0.7, 0.8],
    ]);
  });

  it('collapses several matching chunks of one item into a single hit', async () => {
    await service.store(ITEM_A, TENANT, [
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ]);

    const hits = await service.search([0.1, 0.2], { limit: 5, tenantId: TENANT });

    // All three chunks hydrate to the same Postgres row, so emitting each one
    // would spend the caller's limit and the context window on repeats.
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(ITEM_A);
  });
});

describe('chunkPointId', () => {
  it('is stable across calls, so a re-ingest overwrites in place', () => {
    expect(chunkPointId(ITEM_A, 0)).toBe(chunkPointId(ITEM_A, 0));
  });

  it('separates chunks of one item', () => {
    expect(chunkPointId(ITEM_A, 0)).not.toBe(chunkPointId(ITEM_A, 1));
  });

  it('separates the same chunk index across items, the original collision', () => {
    expect(chunkPointId(ITEM_A, 0)).not.toBe(chunkPointId(ITEM_B, 0));
  });

  it('emits a v5 UUID, the only non-integer id Qdrant accepts', () => {
    expect(chunkPointId(ITEM_A, 0)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
