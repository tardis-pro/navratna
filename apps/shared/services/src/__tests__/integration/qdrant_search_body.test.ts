import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { QdrantService } from '../../qdrant_service';

const TENANT = '00000000-0000-0000-0000-000000000001';

/**
 * Validates the SEARCH BODY that actually goes over the wire.
 *
 * The production failure was not a wrong result — it was a malformed request:
 * Qdrant answered 400 "Expected some form of condition ... at line 1 column
 * 13086" (just past the 1024-float vector, i.e. at `filter`) and the caller
 * swallowed it into a keyword fallback. The unit tests cover the builder; this
 * asserts the request QdrantService.search emits, applying the same structural
 * rules Qdrant enforces, so a regression is caught as a bad body rather than as
 * a quietly empty result set.
 */
type SearchBody = {
  vector: number[];
  filter?: {
    must?: unknown[];
    must_not?: unknown[];
  };
};

/** The subset of Qdrant's condition grammar this code path can produce. */
function assertValidCondition(condition: unknown, where: string): void {
  expect(condition, `${where}: condition must be an object`).toBeTypeOf('object');
  const record = condition as Record<string, unknown>;

  if ('has_id' in record) {
    expect(Array.isArray(record.has_id), `${where}: has_id must be an array`).toBe(true);
    return;
  }

  expect(Object.keys(record).sort(), `${where}: field condition shape`).toEqual(['key', 'match']);
  expect(record.key, `${where}: key must be a string`).toBeTypeOf('string');

  const match = record.match as Record<string, unknown>;
  expect(Object.keys(match), `${where}: match shape`).toEqual(['value']);

  // The crux: Qdrant `match.value` is a keyword/integer/bool. An array or
  // object here is exactly what produced the 400.
  const value = match.value;
  const isScalar =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  expect(isScalar, `${where}: match.value must be scalar, got ${JSON.stringify(value)}`).toBe(true);
}

function assertValidSearchBody(body: SearchBody): void {
  if (!body.filter) return;
  expect(Object.keys(body.filter).every((k) => k === 'must' || k === 'must_not')).toBe(true);

  for (const [index, condition] of (body.filter.must ?? []).entries()) {
    assertValidCondition(condition, `must[${index}]`);
  }
  for (const [index, condition] of (body.filter.must_not ?? []).entries()) {
    assertValidCondition(condition, `must_not[${index}]`);
  }
}

describe('QdrantService search body', () => {
  let bodies: SearchBody[];

  beforeEach(() => {
    bodies = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.endsWith('/healthz')) {
          return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        }
        if (urlStr.endsWith('/points/search')) {
          bodies.push(JSON.parse(String(init?.body)) as SearchBody);
          return new Response(JSON.stringify({ result: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ result: {} }), { status: 200 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const service = () => new QdrantService('http://mock-qdrant:6333');

  it('emits a body Qdrant accepts for a plain tenant-scoped search', async () => {
    await service().search([0.1, 0.2], { limit: 5, tenantId: TENANT });

    expect(bodies).toHaveLength(1);
    assertValidSearchBody(bodies[0]);
    expect(bodies[0].filter?.must).toEqual([{ key: 'tenant_id', match: { value: TENANT } }]);
  });

  it('emits a valid body when scalar payload filters are supplied', async () => {
    await service().search([0.1, 0.2], {
      limit: 5,
      tenantId: TENANT,
      filters: { source_type: 'USER_INPUT' },
    });

    assertValidSearchBody(bodies[0]);
    expect(bodies[0].filter?.must).toContainEqual({
      key: 'source_type',
      match: { value: 'USER_INPUT' },
    });
  });

  it('emits must_not/has_id for id exclusion rather than a payload match', async () => {
    await service().search([0.1, 0.2], {
      limit: 5,
      tenantId: TENANT,
      excludeIds: ['doc-1'],
    });

    assertValidSearchBody(bodies[0]);
    expect(bodies[0].filter?.must_not).toEqual([{ has_id: ['doc-1'] }]);
  });

  it('never emits the double-wrapped filter that Qdrant rejected', async () => {
    // Reproduces the original defect: a caller handing back a built filter.
    const alreadyBuilt = { must: [{ key: 'tenant_id', match: { value: TENANT } }] };

    await expect(
      service().search([0.1, 0.2], {
        limit: 5,
        tenantId: TENANT,
        filters: alreadyBuilt as unknown as Record<string, never>,
      })
    ).rejects.toThrow(/must be a string, number or boolean/);

    // It failed before reaching the network, which is the point: a malformed
    // filter can no longer reach Qdrant and be mistaken for "no results".
    expect(bodies).toHaveLength(0);
  });
});
