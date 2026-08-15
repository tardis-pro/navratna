/**
 * Which stored tool rows the read-only lowering actually reaches.
 *
 * The first version of this migration matched `%:<name>` only. It updated 20 rows
 * and logged a confident success while changing nothing that mattered: the row
 * the nightly triage resolves is `mcp-navratna-tardis-agent-find_anomalies`,
 * which has no colon in it. These cases exist so a pattern that misses the shape
 * in use fails here rather than in a green log line.
 */

import { describe, it, expect } from 'vitest';
import { readOnlyToolPatterns } from '../../database/migrations/lower_read_only_federation_tools';

/** SQL LIKE, restricted to the one wildcard these patterns use. */
function likeMatches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

function matchedByAny(value: string): boolean {
  return readOnlyToolPatterns().some((p) => likeMatches(p, value));
}

describe('readOnlyToolPatterns', () => {
  it.each([
    'federation:2cfd34e2-a8d4-47da-8242-352a080df1f9:find_anomalies',
    'federation:90aad686-ed5f-4177-9428-f0ef8d60d032:release_history',
  ])('matches the colon-delimited federation id %s', (name) => {
    expect(matchedByAny(name)).toBe(true);
  });

  it.each([
    'mcp-navratna-tardis-agent-find_anomalies',
    'mcp-navratna-tardis-agent-recent_errors',
    'mcp-navratna-tardis-agent-http_errors',
    'mcp-navratna-tardis-agent-release_history',
    'mcp-navratna-find_anomalies',
    'mcp-navratna-tardis-agent-code_quality',
  ])('matches the hyphen-delimited MCP id %s — the shape that is actually resolved', (name) => {
    expect(matchedByAny(name)).toBe(true);
  });

  it.each([
    'mcp-navratna-tardis-agent-create_task',
    'mcp-navratna-tardis-agent-restart',
    'mcp-navratna-tardis-agent-rollback',
    'mcp-navratna-tardis-agent-write_dev_file',
  ])('leaves the write-capable tool %s alone', (name) => {
    expect(matchedByAny(name)).toBe(false);
  });

  it('does not swallow a differently-named tool that merely ends the same way', () => {
    // Anchoring the hyphen pattern on the `mcp-` prefix is what prevents this;
    // a bare `%-<name>` would match it.
    expect(matchedByAny('federation:abc:custom-find_anomalies')).toBe(false);
  });

  it('covers both shapes for every name, so neither path can be half-fixed', () => {
    expect(readOnlyToolPatterns()).toHaveLength(10);
  });
});
