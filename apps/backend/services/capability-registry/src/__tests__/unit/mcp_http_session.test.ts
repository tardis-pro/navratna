import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// @uaip/config throws FATAL at module-eval time when these are absent, and it is
// pulled in transitively. Set them before any dynamic import runs.
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.DELETION_HASH_SALT ??= 'test-deletion-hash-salt';

/**
 * Streamable-HTTP MCP servers issue an `mcp-session-id` response header on
 * `initialize` and then reject every later request that omits it:
 *   {"code":-32000,"message":"Bad Request: Mcp-Session-Id header is required"}
 * Verified live against https://gitmcp.io/docs.
 */

type FetchArgs = { url: string; headers: Record<string, string>; body: string };

const calls: FetchArgs[] = [];

function jsonResponse(payload: unknown, sessionId?: string): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (sessionId) headers.set('mcp-session-id', sessionId);
  return new Response(JSON.stringify(payload), { status: 200, headers });
}

describe('MCPClientService streamable-HTTP session handling', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures mcp-session-id from initialize and replays it on later requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string>;
        const body = String(init.body);
        calls.push({ url, headers, body });

        const parsed: unknown = JSON.parse(body);
        const method =
          typeof parsed === 'object' && parsed !== null && 'method' in parsed
            ? String((parsed as { method: unknown }).method)
            : '';

        if (method === 'initialize') {
          return jsonResponse(
            {
              jsonrpc: '2.0',
              id: 1,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: { listChanged: true } },
                serverInfo: { name: 'TestMCP', version: '1.0.0' },
              },
            },
            'session-abc-123'
          );
        }

        if (!headers['Mcp-Session-Id']) {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32000, message: 'Bad Request: Mcp-Session-Id header is required' },
            }),
            { status: 400, headers: { 'content-type': 'application/json' } }
          );
        }

        return jsonResponse({
          jsonrpc: '2.0',
          id: 2,
          result: { tools: [{ name: 'fetch_documentation', description: 'docs', inputSchema: {} }] },
        });
      })
    );

    const { MCPClientService } = await import('../../services/mcp_client_service.js');
    const service = MCPClientService.getInstance();

    const remoteServerRow: Record<string, unknown> = {
      id: 'srv-1',
      name: 'probe-remote',
      command: null,
      args: [],
      env: null,
      workingDirectory: null,
      transportType: 'streamable-http',
      url: 'https://example.test/mcp',
      headers: null,
      enabled: true,
    };
    const fakeRepo = {
      getServerByName: async (): Promise<typeof remoteServerRow> => remoteServerRow,
      getAllServers: async (): Promise<(typeof remoteServerRow)[]> => [],
      createServer: async (): Promise<typeof remoteServerRow> => remoteServerRow,
      updateServer: async (): Promise<typeof remoteServerRow> => remoteServerRow,
      deleteServer: async (): Promise<void> => undefined,
    };
    Reflect.set(service, 'mcpRepo', fakeRepo);

    await service.startServer('probe-remote');

    const initializeCall = calls.find((c) => c.body.includes('"initialize"'));
    expect(initializeCall, 'initialize must be sent').toBeDefined();

    const laterCalls = calls.filter((c) => !c.body.includes('"initialize"'));
    expect(laterCalls.length, 'a follow-up request must be made after initialize').toBeGreaterThan(
      0
    );

    for (const call of laterCalls) {
      expect(
        call.headers['Mcp-Session-Id'],
        'every request after initialize must replay the session id returned by the server, ' +
          'otherwise the server rejects it with -32000'
      ).toBe('session-abc-123');
    }

    const state = service.getServerStatus('probe-remote');
    expect(state?.tools?.map((t) => t.name)).toContain('fetch_documentation');

    await service.stopServer('probe-remote');
  });
});
