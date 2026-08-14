// D3 — federation runtime for the execution mesh.
//
// Covers the four load-bearing behaviours of the tardis-assimilation D3 slice:
//   1. Descriptor resolution: `federation:<sub>:<tool>` ids resolve to the
//      `federation` runtime with the producer's OWN endpoint (never the static
//      worker URL), TTL-cached, and fail closed to `{}` on any miss.
//   2. Dispatch: a JSON-RPC 2.0 `tools/call` POSTed to that endpoint with a
//      per-call scoped RS256 Bearer token (D6) — never unauthenticated.
//   3. NO native fallback: a federated transport failure is a NODE_ERROR-style
//      failure, not a silent native execution (deliberate divergence from the
//      worker tier).
//   4. Envelope endpoint plumbing: the endpoint travels on the envelope.

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
  process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt';
  process.env.NODE_ENV ||= 'test';
});

const { mocks } = vi.hoisted(() => ({
  mocks: {
    subdomains: new Map<string, Record<string, unknown>>(),
    getSubdomainCalls: 0,
  },
}));

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/utils')>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

// The real EventBusService opens BullMQ/Redis connections on subscribe(); the
// registry only uses it for register/heartbeat topics, which this test drives
// directly through registerNode.
vi.mock('@uaip/infra', () => ({
  EventBusService: {
    getInstance: () => ({
      subscribe: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(undefined),
      publishAndWaitForResponse: vi.fn().mockRejectedValue(new Error('bus unused in test')),
    }),
  },
}));

vi.mock('../../services/federation_registry_service.js', () => ({
  FederationRegistryService: {
    getInstance: () => ({
      getSubdomainById: async (id: string) => {
        mocks.getSubdomainCalls += 1;
        return mocks.subdomains.get(id) ?? null;
      },
    }),
  },
}));

const HEALTHY_SUBDOMAIN = {
  id: 'sub-1',
  status: 'healthy',
  transport: 'streamable-http',
  mcpServerUrl: 'https://weather.tardis.digital/mcp',
};

const loadDescriptor = async (): Promise<
  typeof import('../../services/execution_mesh/descriptor')
> => {
  vi.resetModules();
  return await import('../../services/execution_mesh/descriptor');
};

beforeEach(() => {
  mocks.subdomains = new Map([['sub-1', { ...HEALTHY_SUBDOMAIN }]]);
  mocks.getSubdomainCalls = 0;
});

describe('parseFederatedToolId', () => {
  it('parses federation:<subdomainId>:<toolName>', async () => {
    const { parseFederatedToolId } = await loadDescriptor();
    expect(parseFederatedToolId('federation:sub-1:get_weather')).toEqual({
      subdomainId: 'sub-1',
      toolName: 'get_weather',
    });
  });

  it('keeps colons inside the tool name with the tool', async () => {
    const { parseFederatedToolId } = await loadDescriptor();
    expect(parseFederatedToolId('federation:sub-1:ns:tool')).toEqual({
      subdomainId: 'sub-1',
      toolName: 'ns:tool',
    });
  });

  it('rejects non-federation ids and malformed shapes', async () => {
    const { parseFederatedToolId } = await loadDescriptor();
    expect(parseFederatedToolId('mcp-github-create_issue')).toBeNull();
    expect(parseFederatedToolId('federation:')).toBeNull();
    expect(parseFederatedToolId('federation::tool')).toBeNull();
    expect(parseFederatedToolId('federation:sub-1:')).toBeNull();
  });
});

describe('federated tool descriptor resolution', () => {
  it('resolves a healthy http producer to the federation runtime with its OWN endpoint', async () => {
    const { resolveToolDescriptor } = await loadDescriptor();
    const descriptor = await resolveToolDescriptor('federation:sub-1:get_weather');

    expect(descriptor).toEqual({
      runtime: 'federation',
      transport: 'streamable-http',
      endpoint: 'https://weather.tardis.digital/mcp',
    });
  });

  it('fails closed to {} for an unknown subdomain', async () => {
    const { resolveToolDescriptor } = await loadDescriptor();
    const descriptor = await resolveToolDescriptor('federation:nope:get_weather');
    expect(descriptor).toEqual({});
  });

  it('fails closed to {} for a deregistered subdomain', async () => {
    mocks.subdomains.set('sub-1', { ...HEALTHY_SUBDOMAIN, status: 'deregistered' });
    const { resolveToolDescriptor } = await loadDescriptor();
    const descriptor = await resolveToolDescriptor('federation:sub-1:get_weather');
    expect(descriptor).toEqual({});
  });

  it('fails closed to {} for a stdio producer (not direct-diallable)', async () => {
    mocks.subdomains.set('sub-1', { ...HEALTHY_SUBDOMAIN, transport: 'stdio' });
    const { resolveToolDescriptor } = await loadDescriptor();
    const descriptor = await resolveToolDescriptor('federation:sub-1:get_weather');
    expect(descriptor).toEqual({});
  });

  it('caches the registry lookup within the TTL (one DB hit for repeat calls)', async () => {
    const { resolveToolDescriptor } = await loadDescriptor();
    await resolveToolDescriptor('federation:sub-1:get_weather');
    await resolveToolDescriptor('federation:sub-1:other_tool');
    expect(mocks.getSubdomainCalls).toBe(1);
  });

  it('never routes a federated id to the static worker tier', async () => {
    const { resolveToolDescriptor } = await loadDescriptor();
    const descriptor = await resolveToolDescriptor('federation:sub-1:get_weather');
    expect(descriptor.runtime).not.toBe('worker');
    expect(descriptor.sandbox).toBeUndefined();
  });
});

describe('federation dispatch (scheduler)', () => {
  const loadScheduler = async (): Promise<
    typeof import('../../services/execution_mesh/scheduler')
  > => {
    vi.resetModules();
    return await import('../../services/execution_mesh/scheduler');
  };

  const envelopeFor = (
    toolId: string,
    endpoint?: string
  ): import('@uaip/types').ExecutionRequestEnvelope => ({
    correlationId: 'corr_test_1',
    toolId,
    params: { city: 'berlin' },
    ctx: { userId: 'user-1', scopedToken: 'outer' },
    runtime: 'federation',
    deadlineMs: 5_000,
    idempotencyKey: 'idem-1',
    ...(endpoint ? { endpoint } : {}),
  });

  let fetchMock: ReturnType<typeof vi.fn>;
  let nativeExecutor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    nativeExecutor = vi.fn().mockResolvedValue({ native: true });
  });

  const jsonResponse = (body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('POSTs a JSON-RPC tools/call to the producer endpoint with a Bearer scoped token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ jsonrpc: '2.0', id: 'corr_test_1', result: { temp: 21 } })
    );

    const { ExecutionScheduler } = await loadScheduler();
    const scheduler = ExecutionScheduler.getInstance();
    scheduler.ensureNativeNode(nativeExecutor);

    const result = await scheduler.schedule(
      envelopeFor('federation:sub-1:get_weather', 'https://weather.tardis.digital/mcp')
    );

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ temp: 21 });
    expect(nativeExecutor).not.toHaveBeenCalled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://weather.tardis.digital/mcp');

    const headers = init.headers as Record<string, string>;
    const auth = headers.Authorization;
    expect(auth).toMatch(/^Bearer /);
    // Real per-call token, not the legacy 'system' placeholder.
    expect(auth).not.toBe('Bearer system');
    // RS256 JWS compact form: three dot-separated base64url segments.
    expect(auth.slice('Bearer '.length).split('.')).toHaveLength(3);

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'get_weather', arguments: { city: 'berlin' } },
    });
  });

  it('mints a verifiable RS256 token scoped to the single call (aud tardis-federation)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 'x', result: {} }));

    const { ExecutionScheduler } = await loadScheduler();
    const scheduler = ExecutionScheduler.getInstance();
    scheduler.ensureNativeNode(nativeExecutor);
    await scheduler.schedule(
      envelopeFor('federation:sub-1:get_weather', 'https://weather.tardis.digital/mcp')
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const token = (init.headers as Record<string, string>).Authorization.slice('Bearer '.length);

    const { verifyJWT } = await import('@uaip/middleware');
    const { FEDERATION_TOKEN_AUDIENCE } = await import(
      '../../services/execution_mesh/scoped_token'
    );
    const payload = await verifyJWT(token, { audience: FEDERATION_TOKEN_AUDIENCE });

    expect(payload.sub).toBe('user-1');
    expect(payload.toolId).toBe('federation:sub-1:get_weather');
    expect(payload.correlationId).toBe('corr_test_1');
    expect(payload.iss).toBe('uaip');
    // Single-call lifetime: <= 60s.
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBeLessThanOrEqual(60);
  });

  it('NEVER falls back to native when the producer is unreachable (fails loud)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const { ExecutionScheduler } = await loadScheduler();
    const scheduler = ExecutionScheduler.getInstance();
    scheduler.ensureNativeNode(nativeExecutor);

    const result = await scheduler.schedule(
      envelopeFor('federation:sub-1:get_weather', 'https://weather.tardis.digital/mcp')
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
    expect(nativeExecutor).not.toHaveBeenCalled();
  });

  it('fails (not native) when the producer returns non-2xx', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 503 }));

    const { ExecutionScheduler } = await loadScheduler();
    const scheduler = ExecutionScheduler.getInstance();
    scheduler.ensureNativeNode(nativeExecutor);

    const result = await scheduler.schedule(
      envelopeFor('federation:sub-1:get_weather', 'https://weather.tardis.digital/mcp')
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('503');
    expect(nativeExecutor).not.toHaveBeenCalled();
  });

  it('surfaces a JSON-RPC error object as a failed execution', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ jsonrpc: '2.0', id: 'x', error: { code: -32602, message: 'bad params' } })
    );

    const { ExecutionScheduler } = await loadScheduler();
    const scheduler = ExecutionScheduler.getInstance();
    scheduler.ensureNativeNode(nativeExecutor);

    const result = await scheduler.schedule(
      envelopeFor('federation:sub-1:get_weather', 'https://weather.tardis.digital/mcp')
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('bad params');
    expect(nativeExecutor).not.toHaveBeenCalled();
  });

  it('fails when the envelope carries no producer endpoint', async () => {
    const { ExecutionScheduler } = await loadScheduler();
    const scheduler = ExecutionScheduler.getInstance();
    scheduler.ensureNativeNode(nativeExecutor);

    const result = await scheduler.schedule(envelopeFor('federation:sub-1:get_weather'));

    expect(result.ok).toBe(false);
    expect(result.error).toContain('no producer endpoint');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(nativeExecutor).not.toHaveBeenCalled();
  });

  it('unwraps a single-event SSE response body', async () => {
    const sse = [
      'event: message',
      `data: ${JSON.stringify({ jsonrpc: '2.0', id: 'x', result: { ok: 1 } })}`,
      '',
    ].join('\n');
    fetchMock.mockResolvedValue(
      new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    );

    const { ExecutionScheduler } = await loadScheduler();
    const scheduler = ExecutionScheduler.getInstance();
    scheduler.ensureNativeNode(nativeExecutor);

    const result = await scheduler.schedule(
      envelopeFor('federation:sub-1:get_weather', 'https://weather.tardis.digital/mcp')
    );

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ ok: 1 });
  });
});
