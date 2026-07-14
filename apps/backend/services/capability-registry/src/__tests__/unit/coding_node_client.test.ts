import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodingNodeClient } from '../../services/execution_mesh/coding_node_client.js';

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeSseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
}

function makeSseResponse(lines: string[], status = 200): Response {
  return new Response(makeSseStream(lines), {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

const BASE_URL = 'http://machine-abc.vm.app.internal:3009';
const TOKEN = 'test-bearer-token';
const SESSION_ID = 'sess-001';

describe('CodingNodeClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: CodingNodeClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new CodingNodeClient({ fetch: fetchMock as typeof globalThis.fetch });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSession', () => {
    it('sends Authorization header and parses response', async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ sessionId: SESSION_ID, state: 'CREATING' }));
      const req = {
        sessionId: SESSION_ID,
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        repositoryId: '12345678',
        workspacePath: '/workspace',
        llmCredentials: [],
      };
      const result = await client.createSession(BASE_URL, TOKEN, req);
      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/sessions`);
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it('returns NODE_AUTH_FAILED on 401', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 401 }));
      const result = await client.createSession(BASE_URL, TOKEN, { sessionId: 's', workspaceId: 'w', projectId: 'p', userId: 'u', tenantId: 't', repositoryId: '11111111', workspacePath: '/workspace', llmCredentials: [] });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('NODE_AUTH_FAILED');
    });

    it('returns NODE_UNREACHABLE on network error', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await client.createSession(BASE_URL, TOKEN, { sessionId: 's', workspaceId: 'w', projectId: 'p', userId: 'u', tenantId: 't', repositoryId: '11111111', workspacePath: '/workspace', llmCredentials: [] });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('NODE_UNREACHABLE');
    });
  });

  describe('prompt', () => {
    it('does not include token in URL or body', async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ sessionId: SESSION_ID, state: 'PROMPTING' }));
      await client.prompt(BASE_URL, TOKEN, SESSION_ID, 'hello', 'idem-1');
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/sessions/');
      expect(url).not.toContain(TOKEN);
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.message).toBe('hello');
      expect(body.idempotencyKey).toBe('idem-1');
      expect(JSON.stringify(body)).not.toContain(TOKEN);
    });
  });

  describe('abort', () => {
    it('posts to abort endpoint with bearer token', async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ sessionId: SESSION_ID, state: 'READY' }));
      const result = await client.abort(BASE_URL, TOKEN, SESSION_ID);
      expect(result.ok).toBe(true);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/abort');
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    });
  });

  describe('close', () => {
    it('returns ok on 204', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
      const result = await client.close(BASE_URL, TOKEN, SESSION_ID);
      expect(result.ok).toBe(true);
    });

    it('returns ok on 404 (already gone)', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
      const result = await client.close(BASE_URL, TOKEN, SESSION_ID);
      expect(result.ok).toBe(true);
    });
  });

  describe('streamEvents – SSE proxy', () => {
    it('parses valid SSE frames and calls onEvent', async () => {
      const sseLines = [
        'id: sess-001-1\n',
        'event: agent_start\n',
        'data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"agent_start","payload":{}}\n',
        '\n',
      ];
      fetchMock.mockResolvedValue(makeSseResponse(sseLines));

      const events: unknown[] = [];
      const ctrl = new AbortController();
      client.streamEvents({
        baseUrl: BASE_URL,
        token: TOKEN,
        sessionId: SESSION_ID,
        credentialSecrets: [],
        signal: ctrl.signal,
        onEvent: (ev) => { events.push(ev); },
        onError: (err) => { throw new Error(`Unexpected error: ${err.code}`); },
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(events.length).toBeGreaterThan(0);
    });

    it('redacts credential values from SSE events', async () => {
      const secretToken = 'sk-secret-12345678';
      const sseLines = [
        'id: sess-001-1\n',
        'event: message_update\n',
        `data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"message_update","payload":{"delta":"using key ${secretToken} for auth"}}\n`,
        '\n',
      ];
      fetchMock.mockResolvedValue(makeSseResponse(sseLines));

      const rawEvents: unknown[] = [];
      const ctrl = new AbortController();
      client.streamEvents({
        baseUrl: BASE_URL,
        token: TOKEN,
        sessionId: SESSION_ID,
        credentialSecrets: [secretToken],
        signal: ctrl.signal,
        onEvent: (ev) => { rawEvents.push(ev); },
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      const serialized = JSON.stringify(rawEvents);
      expect(serialized).not.toContain(secretToken);
      expect(serialized).toContain('[REDACTED]');
    });

    it('forwards Last-Event-ID header to node', async () => {
      fetchMock.mockResolvedValue(makeSseResponse([]));
      const ctrl = new AbortController();
      client.streamEvents({
        baseUrl: BASE_URL,
        token: TOKEN,
        sessionId: SESSION_ID,
        lastEventId: 'sess-001-42',
        credentialSecrets: [],
        signal: ctrl.signal,
        onEvent: () => undefined,
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 20));
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['Last-Event-ID']).toBe('sess-001-42');
    });

    it('stops streaming when signal is aborted', async () => {
      let enqueued = 0;
      const slowStream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          await new Promise((r) => setTimeout(r, 20));
          enqueued += 1;
          controller.enqueue(new TextEncoder().encode(': ping\n\n'));
        },
      });
      fetchMock.mockResolvedValue(new Response(slowStream, { status: 200 }));

      const ctrl = new AbortController();
      let errorCalled = false;
      client.streamEvents({
        baseUrl: BASE_URL,
        token: TOKEN,
        sessionId: SESSION_ID,
        credentialSecrets: [],
        signal: ctrl.signal,
        onEvent: () => undefined,
        onError: () => { errorCalled = true; },
      });

      await new Promise((r) => setTimeout(r, 10));
      ctrl.abort();
      await new Promise((r) => setTimeout(r, 50));
      expect(errorCalled).toBe(false);
      expect(enqueued).toBeLessThan(5);
    });

    it('calls onError when node returns 401', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 401 }));
      const ctrl = new AbortController();
      let errorCode: string | undefined;
      client.streamEvents({
        baseUrl: BASE_URL,
        token: TOKEN,
        sessionId: SESSION_ID,
        credentialSecrets: [],
        signal: ctrl.signal,
        onEvent: () => undefined,
        onError: (err) => { errorCode = err.code; },
      });
      await new Promise((r) => setTimeout(r, 30));
      expect(errorCode).toBe('NODE_AUTH_FAILED');
    });
  });
});
