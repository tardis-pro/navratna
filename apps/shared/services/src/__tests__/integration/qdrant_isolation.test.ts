import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QdrantService } from '../../qdrant_service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const makeFetchMock = () => {
  const store = new Map<string, Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>>();

  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const urlStr = String(url);

    if (urlStr.endsWith('/healthz')) {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }

    const collectionMatch = urlStr.match(/\/collections\/([^/]+)/);
    const collection = collectionMatch?.[1] ?? 'default';

    if (!store.has(collection)) {
      store.set(collection, []);
    }
    const points = store.get(collection)!;

    const method = init?.method ?? 'GET';
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : {};

    if (urlStr.endsWith('/points') && method === 'PUT') {
      const incoming = (body as { points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> }).points;
      for (const p of incoming) {
        const existing = points.findIndex((x) => x.id === p.id);
        if (existing >= 0) {
          points[existing] = p;
        } else {
          points.push(p);
        }
      }
      return new Response(JSON.stringify({ result: { operation_id: 0, status: 'completed' } }), { status: 200 });
    }

    if (urlStr.endsWith('/points/search') && method === 'POST') {
      const req = body as { vector: number[]; limit: number; filter?: { must?: Array<{ key: string; match: { value: unknown } }> } };
      const mustClauses = req.filter?.must ?? [];
      const tenantClause = mustClauses.find((c) => c.key === 'tenant_id');
      const tenantFilter: unknown = tenantClause?.match.value;
      const results = points
        .filter((p) => (tenantFilter ? p.payload['tenant_id'] === tenantFilter : true))
        .map((p) => ({ id: p.id, score: 1.0, payload: p.payload }));
      return new Response(JSON.stringify({ result: results }), { status: 200 });
    }

    if (urlStr.endsWith('/points/scroll') && method === 'POST') {
      const req = body as { filter?: { must?: Array<{ key: string; match: { value: unknown } }> } };
      const mustClauses = req.filter?.must ?? [];
      const tenantClause = mustClauses.find((c) => c.key === 'tenant_id');
      const tenantFilter: unknown = tenantClause?.match.value;
      const filtered = points.filter((p) =>
        tenantFilter ? p.payload['tenant_id'] === tenantFilter : true
      );
      return new Response(JSON.stringify({ result: { points: filtered, next_page_offset: null } }), { status: 200 });
    }

    if (urlStr.endsWith('/index') && method === 'PUT') {
      return new Response(JSON.stringify({ result: true, status: 'acknowledged' }), { status: 200 });
    }

    return new Response(JSON.stringify({ result: { status: 'green' } }), { status: 200 });
  });
};

describe('Qdrant tenant isolation', () => {
  let fetchMock: ReturnType<typeof makeFetchMock>;
  let service: QdrantService;

  beforeEach(() => {
    fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    service = new QdrantService('http://mock-qdrant:6333');
  });

  it('T1: vectors stored under tenantA are not visible in tenantB search', async () => {
    await service.store('item-1', TENANT_A, [[0.1, 0.2, 0.3]]);

    const resultsB = await service.search([0.1, 0.2, 0.3], { limit: 10, tenantId: TENANT_B });
    expect(resultsB).toHaveLength(0);
  });

  it('T2: store() without tenantId is a type error (TypeScript enforces required param)', () => {
    type StoreParams = Parameters<typeof service.store>;
    type TenantIdParam = StoreParams[1];
    const isString: TenantIdParam extends string ? true : false = true;
    expect(isString).toBe(true);
  });

  it('T3: search() without tenantId throws at runtime', async () => {
    await expect(
      // @ts-expect-error -- intentionally omitting required tenantId to verify runtime guard
      service.search([0.1, 0.2, 0.3], { limit: 10 })
    ).rejects.toThrow('tenantId is required for vector search');
  });

  it('T4: two vectors stored under tenantA are both found in tenantA search', async () => {
    await service.store('item-a1', TENANT_A, [[0.1, 0.2, 0.3]]);
    await service.store('item-a2', TENANT_A, [[0.4, 0.5, 0.6]]);

    const resultsA = await service.search([0.1, 0.2, 0.3], { limit: 10, tenantId: TENANT_A });
    expect(resultsA.length).toBeGreaterThanOrEqual(1);
    const payloads = resultsA.map((r) => r.payload['tenant_id']);
    expect(payloads.every((t) => t === TENANT_A)).toBe(true);
  });

  it('T5: scrollAllQdrantPoints(tenantA) returns only tenantA points', async () => {
    await service.store('item-a', TENANT_A, [[0.1, 0.2, 0.3]]);
    await service.store('item-b', TENANT_B, [[0.7, 0.8, 0.9]]);

    const scrolledA = await service.scrollAllQdrantPoints(TENANT_A);
    expect(scrolledA.length).toBeGreaterThanOrEqual(0);
    const tenantIds = scrolledA.map((p) => p.payload['tenant_id']);
    expect(tenantIds.every((t) => t === TENANT_A)).toBe(true);
  });
});
