import { describe, expect, it } from 'vitest';

import { buildVectorFilters } from '../../qdrant_service';

const TENANT = '00000000-0000-0000-0000-000000000001';

/**
 * Regression cover for the filter shape Qdrant actually accepts.
 *
 * The live failure this locks down: callers passed an ALREADY-BUILT filter
 * (`{ must: [...] }`) as `additionalFilters`, so the builder wrapped it again
 * into `{ key: 'must', match: { value: [ ...conditions ] } }`. Qdrant answered
 * 400 "Expected some form of condition" for the whole body, and because the
 * caller caught it and fell back to keyword search, every semantic search
 * silently degraded instead of failing.
 */
describe('buildVectorFilters', () => {
  it('always pins tenant_id, which is the isolation boundary', () => {
    expect(buildVectorFilters(TENANT)).toEqual({
      must: [{ key: 'tenant_id', match: { value: TENANT } }],
    });
  });

  it('refuses a tenantless call rather than searching across tenants', () => {
    expect(() => buildVectorFilters('')).toThrow(/tenantId is required/);
  });

  it('appends scalar conditions in Qdrant match form', () => {
    expect(buildVectorFilters(TENANT, { source_type: 'USER_INPUT', chunk_index: 0 })).toEqual({
      must: [
        { key: 'tenant_id', match: { value: TENANT } },
        { key: 'source_type', match: { value: 'USER_INPUT' } },
        { key: 'chunk_index', match: { value: 0 } },
      ],
    });
  });

  it('skips undefined values instead of emitting a match on undefined', () => {
    const filter = buildVectorFilters(TENANT, { user_id: undefined });
    expect(filter).toEqual({ must: [{ key: 'tenant_id', match: { value: TENANT } }] });
  });

  // The actual production bug: a pre-built filter passed straight back in.
  it('throws when handed an already-built filter instead of double-wrapping it', () => {
    const alreadyBuilt = buildVectorFilters(TENANT) as unknown as Record<string, never>;
    expect(() => buildVectorFilters(TENANT, alreadyBuilt)).toThrow(
      /must be a string, number or boolean — got array/
    );
  });

  it('throws on an array value, which Qdrant match cannot express', () => {
    const filters = { tags: ['a', 'b'] } as unknown as Record<string, never>;
    expect(() => buildVectorFilters(TENANT, filters)).toThrow(/got array/);
  });

  it('throws on an object value such as a timeRange or scope', () => {
    const filters = { timeRange: { start: new Date(), end: new Date() } } as unknown as Record<
      string,
      never
    >;
    expect(() => buildVectorFilters(TENANT, filters)).toThrow(/got object/);
  });

  it('expresses id exclusion as must_not/has_id, not a payload match', () => {
    const filter = buildVectorFilters(TENANT, undefined, ['doc-1']);
    expect(filter).toEqual({
      must: [{ key: 'tenant_id', match: { value: TENANT } }],
      must_not: [{ has_id: ['doc-1'] }],
    });
  });

  it('omits must_not entirely when nothing is excluded', () => {
    expect(buildVectorFilters(TENANT, undefined, [])).not.toHaveProperty('must_not');
  });
});
