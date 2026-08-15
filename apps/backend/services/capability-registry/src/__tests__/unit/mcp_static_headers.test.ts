import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
  process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt';
});

const { buildAuthHeaders } = await import('../../services/authenticated_mcp_transport');

/**
 * The bug this covers: a `credentialMode: 'none'` MCP server carries its own
 * standing credential in the encrypted `headers` column of its `mcp_servers`
 * row. McpConnectionResolver.loadServer() never selected that column,
 * McpResolvedConnection had no field for it, and buildAuthHeaders returned {}
 * whenever `credential` was absent. So the one server with stored headers went
 * out unauthenticated and the far end answered "missing or invalid project
 * capability" — an error that reads like a problem on the far side.
 */
describe('buildAuthHeaders', () => {
  it('sends the static headers when there is no per-caller credential', () => {
    const headers = buildAuthHeaders({
      url: 'https://example.invalid/mcp',
      staticHeaders: { Authorization: 'Bearer standing-capability-token' },
    });
    expect(headers).toEqual({ Authorization: 'Bearer standing-capability-token' });
  });

  it('still returns an empty object when there is nothing to send', () => {
    expect(buildAuthHeaders({ url: 'https://example.invalid/mcp' })).toEqual({});
  });

  it('formats a resolved credential with the configured header and scheme', () => {
    const headers = buildAuthHeaders({
      url: 'https://example.invalid/mcp',
      authHeaderName: 'X-Api-Key',
      authScheme: '',
      credential: { accessToken: 'tok', tokenVersion: 1 },
    });
    expect(headers).toEqual({ 'X-Api-Key': 'tok' });
  });

  it('carries both a credential and unrelated static headers', () => {
    const headers = buildAuthHeaders({
      url: 'https://example.invalid/mcp',
      staticHeaders: { 'X-Project': 'navratna' },
      credential: { accessToken: 'tok', tokenVersion: 1 },
    });
    expect(headers).toEqual({ 'X-Project': 'navratna', Authorization: 'Bearer tok' });
  });

  it('lets the caller-scoped credential win a key collision', () => {
    const headers = buildAuthHeaders({
      url: 'https://example.invalid/mcp',
      staticHeaders: { Authorization: 'Bearer standing' },
      credential: { accessToken: 'caller', tokenVersion: 2 },
    });
    expect(headers).toEqual({ Authorization: 'Bearer caller' });
  });
});
