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

    it('proxies provision_queued events unchanged', async () => {
      const sseLines = [
        'id: sess-001-1\n',
        'event: provision_queued\n',
        'data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"provision_queued","payload":{"stage":"queued"}}\n',
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
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      const event = events[0] as { type: string; payload: { stage: string } } | undefined;
      expect(event?.type).toBe('provision_queued');
      expect(event?.payload.stage).toBe('queued');
    });

    it('proxies provision_ready events unchanged', async () => {
      const sseLines = [
        'id: sess-001-1\n',
        'event: provision_ready\n',
        'data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"provision_ready","payload":{"stage":"ready"}}\n',
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
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      const event = events[0] as { type: string } | undefined;
      expect(event?.type).toBe('provision_ready');
    });

    it('proxies receipt events with file_read kind unchanged', async () => {
      const sseLines = [
        'id: sess-001-1\n',
        'event: receipt\n',
        'data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"receipt","payload":{"kind":"file_read","path":"/workspace/a.ts","lineCount":42}}\n',
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
        onError: (err) => { throw new Error(`Unexpected: ${err.code}`); },
      });

      await new Promise((r) => setTimeout(r, 50));
      const event = events[0] as { type: string; payload: { kind: string; path: string } } | undefined;
      expect(event?.type).toBe('receipt');
      expect(event?.payload.kind).toBe('file_read');
    });

    it('proxies receipt events with shell_run kind unchanged', async () => {
      const sseLines = [
        'id: sess-001-1\n',
        'event: receipt\n',
        'data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"receipt","payload":{"kind":"shell_run","command":"sha256:abc123","exitCode":0,"stdoutTail":"","durationMs":100}}\n',
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
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      const event = events[0] as { type: string; payload: { kind: string; command: string } } | undefined;
      expect(event?.payload.kind).toBe('shell_run');
      expect(event?.payload.command).toBe('sha256:abc123');
    });

    it('proxies test_run_start events unchanged', async () => {
      const sseLines = [
        'id: sess-001-1\n',
        'event: test_run_start\n',
        'data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"test_run_start","payload":{"runner":"vitest","fileCount":3}}\n',
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
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      const event = events[0] as { type: string; payload: { runner: string } } | undefined;
      expect(event?.type).toBe('test_run_start');
      expect(event?.payload.runner).toBe('vitest');
    });

    it('proxies test_case_result events unchanged', async () => {
      const sseLines = [
        'id: sess-001-1\n',
        'event: test_case_result\n',
        'data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"test_case_result","payload":{"name":"test A","file":"a.test.ts","status":"pass","durationMs":10}}\n',
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
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      const event = events[0] as { type: string; payload: { status: string } } | undefined;
      expect(event?.type).toBe('test_case_result');
      expect(event?.payload.status).toBe('pass');
    });

    it('proxies test_run_end events unchanged', async () => {
      const sseLines = [
        'id: sess-001-1\n',
        'event: test_run_end\n',
        'data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"test_run_end","payload":{"passed":3,"failed":0,"skipped":1,"durationMs":100,"success":true}}\n',
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
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      const event = events[0] as { type: string; payload: { success: boolean } } | undefined;
      expect(event?.type).toBe('test_run_end');
      expect(event?.payload.success).toBe(true);
    });

    it('proxies backpressure events unchanged', async () => {
      const sseLines = [
        'id: sess-001-1\n',
        'event: backpressure\n',
        'data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"backpressure","payload":{"droppedAfterSeq":5}}\n',
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
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      const event = events[0] as { type: string; payload: { droppedAfterSeq: number } } | undefined;
      expect(event?.type).toBe('backpressure');
      expect(event?.payload.droppedAfterSeq).toBe(5);
    });

    it('proxies agent_end events with timing fields unchanged', async () => {
      const sseLines = [
        'id: sess-001-1\n',
        'event: agent_end\n',
        'data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"agent_end","payload":{"event":{},"turnDurationMs":500,"timeToFirstTokenMs":100}}\n',
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
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      const event = events[0] as { type: string; payload: { turnDurationMs: number; timeToFirstTokenMs?: number } } | undefined;
      expect(event?.type).toBe('agent_end');
      expect(event?.payload.turnDurationMs).toBe(500);
      expect(event?.payload.timeToFirstTokenMs).toBe(100);
    });

    it('proxies recoverable error events unchanged', async () => {
      const sseLines = [
        'id: sess-001-1\n',
        'event: error\n',
        'data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"error","payload":{"code":"UNKNOWN_EVENT","message":"Unsupported upstream event was ignored","recoverable":true}}\n',
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
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      const event = events[0] as { type: string; payload: { code: string; recoverable: boolean } } | undefined;
      expect(event?.type).toBe('error');
      expect(event?.payload.code).toBe('UNKNOWN_EVENT');
      expect(event?.payload.recoverable).toBe(true);
    });

    it('redacts credentials from receipt events', async () => {
      const secretToken = 'sk-leaked-in-receipt';
      const sseLines = [
        'id: sess-001-1\n',
        'event: receipt\n',
        `data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"receipt","payload":{"kind":"shell_run","command":"${secretToken}","exitCode":0,"stdoutTail":"","durationMs":100}}\n`,
        '\n',
      ];
      fetchMock.mockResolvedValue(makeSseResponse(sseLines));

      const events: unknown[] = [];
      const ctrl = new AbortController();
      client.streamEvents({
        baseUrl: BASE_URL,
        token: TOKEN,
        sessionId: SESSION_ID,
        credentialSecrets: [secretToken],
        signal: ctrl.signal,
        onEvent: (ev) => { events.push(ev); },
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain(secretToken);
      expect(serialized).toContain('[REDACTED]');
    });

    it('redacts credentials from provision events', async () => {
      const secretCloneUrl = 'https://secret-token@github.com/owner/repo.git';
      const sseLines = [
        'id: sess-001-1\n',
        'event: provision_cloning\n',
        `data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"provision_cloning","payload":{"stage":"cloning","detail":"${secretCloneUrl}"}}\n`,
        '\n',
      ];
      fetchMock.mockResolvedValue(makeSseResponse(sseLines));

      const events: unknown[] = [];
      const ctrl = new AbortController();
      client.streamEvents({
        baseUrl: BASE_URL,
        token: TOKEN,
        sessionId: SESSION_ID,
        credentialSecrets: [secretCloneUrl],
        signal: ctrl.signal,
        onEvent: (ev) => { events.push(ev); },
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain(secretCloneUrl);
      expect(serialized).toContain('[REDACTED]');
    });

    it('rejects SSE events that fail schema validation for receipt', async () => {
      const sseLines = [
        'id: sess-001-1\n',
        'event: receipt\n',
        'data: {"id":"sess-001-1","seq":1,"sessionId":"sess-001","timestamp":1234567890,"type":"receipt","payload":{"kind":"unknown_kind"}}\n',
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
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(events.length).toBe(0);
    });

    it('rejects SSE events with session mismatch for backpressure', async () => {
      const sseLines = [
        'id: sess-001-1\n',
        'event: backpressure\n',
        'data: {"id":"sess-001-1","seq":1,"sessionId":"other-session","timestamp":1234567890,"type":"backpressure","payload":{"droppedAfterSeq":5}}\n',
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
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(events.length).toBe(0);
    });
  });
});
