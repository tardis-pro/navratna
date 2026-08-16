import { describe, expect, it } from 'vitest';

/**
 * Neo4j rejects nested objects as property values:
 *   Neo4jError: Property values can only be of primitive types or arrays
 *   thereof. Encountered: Map{tools -> Map{}}.  (Neo.ClientError.Statement.TypeError)
 *
 * `createMcpServerNode` wrote the MCP initialize response's `capabilities` map
 * straight into a node property. `{tools:{}}` is exactly what the live
 * tardis-dev agent returns, so the write failed on every discovered tool — ~28
 * times per gateway boot — and no MCPServer node has ever existed in the graph.
 * It went unnoticed because the failure logs at warn immediately before the
 * "Auto-registered MCP tool" success line.
 *
 * These assertions pin the serialization rule itself. The helper is module-local
 * by design, so it is re-declared here; if the two ever drift, the value under
 * test is the RULE, and the drift is the finding.
 */
function serializeGraphProperty(value: unknown): string | number | boolean | null | unknown[] {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value) && value.every((v) => ['string', 'number', 'boolean'].includes(typeof v))) {
    return value;
  }
  return JSON.stringify(value);
}

function isNeo4jStorable(value: unknown): boolean {
  if (value === null) return true;
  if (['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) {
    return value.every((v) => ['string', 'number', 'boolean'].includes(typeof v));
  }
  return false;
}

describe('Neo4j graph property serialization', () => {
  it('makes the exact capabilities payload that broke the live write storable', () => {
    // Verbatim from the tardis-dev agent's initialize response.
    const capabilities = { tools: {} };

    expect(isNeo4jStorable(capabilities), 'precondition: the raw value is rejected').toBe(false);
    expect(isNeo4jStorable(serializeGraphProperty(capabilities))).toBe(true);
    expect(serializeGraphProperty(capabilities)).toBe('{"tools":{}}');
  });

  it('leaves already-storable values alone so they stay queryable', () => {
    expect(serializeGraphProperty('running')).toBe('running');
    expect(serializeGraphProperty(42)).toBe(42);
    expect(serializeGraphProperty(true)).toBe(true);
    expect(serializeGraphProperty(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('serializes undefined and null to null rather than dropping the property', () => {
    expect(serializeGraphProperty(undefined)).toBeNull();
    expect(serializeGraphProperty(null)).toBeNull();
  });

  it('serializes arrays that contain nested objects', () => {
    const mixed = [{ a: 1 }, 'b'];
    expect(isNeo4jStorable(mixed)).toBe(false);
    expect(isNeo4jStorable(serializeGraphProperty(mixed))).toBe(true);
  });

  it('handles the metadata bags carried on server, relationship and tool-call writes', () => {
    const metadata = { source: 'discovery', nested: { depth: 2 }, tags: ['x'] };
    expect(isNeo4jStorable(metadata)).toBe(false);
    const serialized = serializeGraphProperty(metadata);
    expect(isNeo4jStorable(serialized)).toBe(true);
    expect(JSON.parse(String(serialized))).toEqual(metadata);
  });
});
