import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// @uaip/config throws FATAL at module-eval time when these are absent, and it is
// pulled in transitively. Set them before any dynamic import runs.
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.DELETION_HASH_SALT ??= 'test-deletion-hash-salt';

/**
 * Reproduces the live outage of 2026-08-16 on proj-navratna.
 *
 *   00:49  gateway boots, MCP server starts, 28 tools discovered
 *   05:04  the remote tardis-dev-agent pod is replaced; the cached
 *          streamable-http session dies with it
 *   05:56  every tool call since fails with "Server ... is not running"
 *
 * The remote was healthy throughout — POSTing `initialize` with the gateway's
 * own stored token returned 200. The bug was entirely client-side: the health
 * check moved the server to 'error', and the health loop only ever visited
 * servers already 'running', so nothing could move it back. Only restarting the
 * gateway process cleared it.
 */

type FetchArgs = { url: string; headers: Record<string, string>; body: string };

function methodOf(body: string): string {
  const parsed: unknown = JSON.parse(body);
  return typeof parsed === 'object' && parsed !== null && 'method' in parsed
    ? String((parsed as { method: unknown }).method)
    : '';
}

function jsonResponse(payload: unknown, sessionId?: string): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (sessionId) headers.set('mcp-session-id', sessionId);
  return new Response(JSON.stringify(payload), { status: 200, headers });
}

function initializeResult(id: number): unknown {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      protocolVersion: '2024-11-05',
      // Verbatim shape the real tardis-dev agent returns.
      capabilities: { tools: {} },
      serverInfo: { name: 'tardis-dev', version: '1.0.0' },
    },
  };
}

const remoteServerRow: Record<string, unknown> = {
  id: 'srv-reconnect',
  name: 'probe-reconnect',
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
  // executeTool books a job record around every dispatch.
  createToolCall: async (): Promise<{ id: string }> => ({ id: 'job-1' }),
  startToolCall: async (): Promise<void> => undefined,
  completeToolCall: async (): Promise<void> => undefined,
  failToolCall: async (): Promise<void> => undefined,
};

describe('MCPClientService reconnect after transport drop', () => {
  const calls: FetchArgs[] = [];
  /** Flipped to simulate the remote pod being replaced mid-session. */
  let podAlive = true;
  let sessionCounter = 0;

  beforeEach(() => {
    calls.length = 0;
    podAlive = true;
    sessionCounter = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string>;
        const body = String(init.body);
        calls.push({ url, headers, body });
        const method = methodOf(body);

        if (!podAlive) {
          // A replaced pod refuses the old session, exactly as the spec requires.
          return new Response('Session not found', { status: 404 });
        }

        if (method === 'initialize') {
          sessionCounter += 1;
          return jsonResponse(initializeResult(1), `session-${sessionCounter}`);
        }

        if (method === 'tools/list') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: 2,
            result: { tools: [{ name: 'list_tasks', description: 'tasks', inputSchema: {} }] },
          });
        }

        return jsonResponse({ jsonrpc: '2.0', id: 3, result: {} });
      })
    );
  });

  afterEach(async () => {
    const { MCPClientService } = await import('../../services/mcp_client_service.js');
    await MCPClientService.getInstance().stopServer('probe-reconnect');
    vi.unstubAllGlobals();
  });

  // startServer runs a full discovery handshake whose graph/registry writes retry
  // against absent backends, so this lands near 4.5s on a cold transform — close
  // enough to vitest's 5s default that a loaded full-suite run tips into a
  // timeout. Observed once. The headroom is for the fixture, not the assertions.
  it('recovers a dead session instead of failing every call until process restart', async () => {
    const { MCPClientService } = await import('../../services/mcp_client_service.js');
    const service = MCPClientService.getInstance();
    Reflect.set(service, 'mcpRepo', fakeRepo);

    await service.startServer('probe-reconnect');
    expect(service.getServerStatus('probe-reconnect')?.status).toBe('running');

    // 05:04 — the remote pod is replaced.
    podAlive = false;

    // The 30s health probe notices and marks the server 'error'.
    await Reflect.get(service, 'performHealthCheck').call(service, 'probe-reconnect');
    const downState = service.getServerStatus('probe-reconnect');
    expect(downState?.status, 'a failed probe still marks the server error').toBe('error');
    expect(
      downState?.httpSessionId,
      'the dead session id must be dropped, not replayed into a 404 forever'
    ).toBeUndefined();

    // 05:56 — the remote is healthy again, and a tool call arrives.
    podAlive = true;

    // Backoff would otherwise hold the first retry until the next tick; the
    // point under test is recovery, not the delay, so clear the window.
    const state = service.getServerStatus('probe-reconnect')!;
    Reflect.set(state, 'nextReconnectAt', undefined);

    const result = await service.executeTool('probe-reconnect', 'list_tasks', {});
    expect(result, 'the call must succeed rather than throw "is not running"').toBeDefined();
    expect(service.getServerStatus('probe-reconnect')?.status).toBe('running');

    const initializes = calls.filter((c) => methodOf(c.body) === 'initialize');
    expect(
      initializes.length,
      'reconnect must run a fresh initialize handshake, not reuse the dead session'
    ).toBeGreaterThan(1);
  }, 20000);

  it('backs off rather than hammering a remote that is still down', async () => {
    const { MCPClientService } = await import('../../services/mcp_client_service.js');
    const service = MCPClientService.getInstance();
    Reflect.set(service, 'mcpRepo', fakeRepo);

    await service.startServer('probe-reconnect');

    podAlive = false;
    await Reflect.get(service, 'performHealthCheck').call(service, 'probe-reconnect');

    const state = service.getServerStatus('probe-reconnect')!;
    const scheduledAt = Reflect.get(state, 'nextReconnectAt') as number | undefined;
    expect(scheduledAt, 'a failed probe must schedule a retry').toBeDefined();
    expect(scheduledAt! - Date.now()).toBeGreaterThan(0);

    const before = calls.length;
    // Inside the backoff window, a caller must not trigger a new attempt.
    await expect(service.executeTool('probe-reconnect', 'list_tasks', {})).rejects.toThrow(
      /is not running/
    );
    expect(
      calls.length,
      'the remote is shared; a call inside the backoff window must not reach it'
    ).toBe(before);
  }, 20000);
});
