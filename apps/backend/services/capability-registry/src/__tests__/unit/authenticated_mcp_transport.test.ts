import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  // config.ts throws at module scope without these, aborting the suite at import
  // time. capability-registry has no vitest setupFile.
  process.env.JWT_SECRET ||= 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
  process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt';
});

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/utils')>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

const {
  McpSessionCache,
  buildAuthHeaders,
  createAuthenticatedMcpClient,
  serializeSessionKey,
} = await import('../../services/authenticated_mcp_transport');

type AuthenticatedMcpClient = Awaited<ReturnType<typeof createAuthenticatedMcpClient>>;
type McpSessionKey = Parameters<typeof serializeSessionKey>[0];

const credential = (accessToken: string, tokenVersion = 1) => ({ accessToken, tokenVersion });

const key = (overrides: Partial<McpSessionKey> = {}): McpSessionKey => ({
  serverKey: 'github',
  connectionId: 'conn-a',
  projectId: 'proj-1',
  agentId: 'agent-1',
  tokenVersion: 1,
  ...overrides,
});

/**
 * Minimal streamable-HTTP MCP server. The initialize response must echo the id the
 * SDK actually generated, so the body is parsed rather than hardcoded.
 */
const makeRecordingFetch = () => {
  const authorizationHeaders: string[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const authorization = headers.get('authorization');
    if (authorization) authorizationHeaders.push(authorization);

    const raw = typeof init?.body === 'string' ? init.body : '';
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const id =
      typeof parsed === 'object' && parsed !== null && 'id' in parsed
        ? (parsed as { id: unknown }).id
        : 0;

    const isNotification = !(typeof parsed === 'object' && parsed !== null && 'id' in parsed);
    if (isNotification) return new Response(null, { status: 202 });

    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'fake-mcp', version: '1.0.0' },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  return { fetchImpl, authorizationHeaders };
};

const stubClient = (close: () => Promise<void> = async () => undefined): AuthenticatedMcpClient =>
  ({ close } as unknown as AuthenticatedMcpClient);

describe('buildAuthHeaders', () => {
  it('sends no auth header for an unauthenticated server', () => {
    expect(buildAuthHeaders({ url: 'https://mcp.example.com' })).toEqual({});
  });

  it('never emits a header containing "undefined" when the credential is absent', () => {
    const headers = buildAuthHeaders({ url: 'https://mcp.example.com' });
    expect(JSON.stringify(headers)).not.toContain('undefined');
  });

  it('defaults to Bearer on Authorization', () => {
    expect(
      buildAuthHeaders({ url: 'https://mcp.example.com', credential: credential('tok') })
    ).toEqual({ Authorization: 'Bearer tok' });
  });

  it('honours a custom header name with an empty scheme and adds no leading space', () => {
    const headers = buildAuthHeaders({
      url: 'https://mcp.example.com',
      credential: credential('tok'),
      authHeaderName: 'X-API-Key',
      authScheme: '',
    });
    expect(headers).toEqual({ 'X-API-Key': 'tok' });
    expect(headers['X-API-Key'].startsWith(' ')).toBe(false);
  });

  it('honours a custom scheme', () => {
    expect(
      buildAuthHeaders({
        url: 'https://mcp.example.com',
        credential: credential('tok'),
        authScheme: 'token',
      })
    ).toEqual({ Authorization: 'token tok' });
  });
});

describe('serializeSessionKey', () => {
  it('is stable for identical keys', () => {
    expect(serializeSessionKey(key())).toBe(serializeSessionKey(key()));
  });

  it.each([
    ['connectionId', { connectionId: 'conn-b' }],
    ['tokenVersion', { tokenVersion: 2 }],
    ['projectId', { projectId: 'proj-2' }],
    ['agentId', { agentId: 'agent-2' }],
    ['serverKey', { serverKey: 'slack' }],
  ])('changes when %s changes', (_field, overrides) => {
    expect(serializeSessionKey(key(overrides))).not.toBe(serializeSessionKey(key()));
  });

  it('cannot be collided by field values that merge across the separator', () => {
    const left = serializeSessionKey(key({ serverKey: 'a', connectionId: 'bc' }));
    const right = serializeSessionKey(key({ serverKey: 'ab', connectionId: 'c' }));
    expect(left).not.toBe(right);
  });
});

describe('createAuthenticatedMcpClient', () => {
  it('sends the credential on the wire', async () => {
    const { fetchImpl, authorizationHeaders } = makeRecordingFetch();

    const client = await createAuthenticatedMcpClient({
      url: 'https://mcp.example.com/mcp',
      credential: credential('tok-live'),
      fetchImpl,
    });

    expect(authorizationHeaders.length).toBeGreaterThan(0);
    expect(authorizationHeaders.every((header) => header === 'Bearer tok-live')).toBe(true);
    await client.close();
  });

  it('sends no Authorization header for an unauthenticated server', async () => {
    const { fetchImpl, authorizationHeaders } = makeRecordingFetch();

    const client = await createAuthenticatedMcpClient({
      url: 'https://docs.mcp.example.com/mcp',
      fetchImpl,
    });

    expect(authorizationHeaders).toEqual([]);
    await client.close();
  });

  it("never reuses another binding's token", async () => {
    // Separate recorders: a single shared recorder cannot prove isolation, because
    // a lookup into one combined list can return the same entry for both bindings.
    const recorderA = makeRecordingFetch();
    const recorderB = makeRecordingFetch();

    const clientA = await createAuthenticatedMcpClient({
      url: 'https://mcp.example.com/mcp',
      credential: credential('token-A'),
      fetchImpl: recorderA.fetchImpl,
    });
    const clientB = await createAuthenticatedMcpClient({
      url: 'https://mcp.example.com/mcp',
      credential: credential('token-B'),
      fetchImpl: recorderB.fetchImpl,
    });

    expect(recorderA.authorizationHeaders.length).toBeGreaterThan(0);
    expect(recorderB.authorizationHeaders.length).toBeGreaterThan(0);

    expect(recorderA.authorizationHeaders.every((h) => h === 'Bearer token-A')).toBe(true);
    expect(recorderB.authorizationHeaders.every((h) => h === 'Bearer token-B')).toBe(true);

    expect(recorderA.authorizationHeaders.some((h) => h.includes('token-B'))).toBe(false);
    expect(recorderB.authorizationHeaders.some((h) => h.includes('token-A'))).toBe(false);

    expect(serializeSessionKey(key({ connectionId: 'conn-a' }))).not.toBe(
      serializeSessionKey(key({ connectionId: 'conn-b' }))
    );

    await clientA.close();
    await clientB.close();
  });
});

describe('McpSessionCache', () => {
  let clock: number;
  const now = () => clock;

  beforeEach(() => {
    clock = 1_000;
  });

  it('creates once and reuses the cached session', async () => {
    const cache = new McpSessionCache({ maxEntries: 4, idleTtlMs: 60_000, now });
    const factory = vi.fn().mockResolvedValue(stubClient());

    const first = await cache.getOrCreate(key(), factory);
    const second = await cache.getOrCreate(key(), factory);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(cache.size()).toBe(1);
  });

  it('opens separate sessions for different bindings', async () => {
    const cache = new McpSessionCache({ maxEntries: 4, idleTtlMs: 60_000, now });
    const factory = vi.fn().mockImplementation(async () => stubClient());

    await cache.getOrCreate(key({ connectionId: 'conn-a' }), factory);
    await cache.getOrCreate(key({ connectionId: 'conn-b' }), factory);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(cache.size()).toBe(2);
  });

  it('treats a bumped tokenVersion as a different session', async () => {
    const cache = new McpSessionCache({ maxEntries: 4, idleTtlMs: 60_000, now });
    const factory = vi.fn().mockImplementation(async () => stubClient());

    await cache.getOrCreate(key({ tokenVersion: 1 }), factory);
    await cache.getOrCreate(key({ tokenVersion: 2 }), factory);

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('singleflights concurrent creation of the same binding', async () => {
    const cache = new McpSessionCache({ maxEntries: 4, idleTtlMs: 60_000, now });
    const client = stubClient();
    let resolveFactory: (value: AuthenticatedMcpClient) => void = () => undefined;
    const factory = vi.fn().mockImplementation(
      () =>
        new Promise<AuthenticatedMcpClient>((resolve) => {
          resolveFactory = resolve;
        })
    );

    const both = Promise.all([cache.getOrCreate(key(), factory), cache.getOrCreate(key(), factory)]);
    // getOrCreate awaits expireIdle() before invoking the factory, so yield until the
    // factory has actually run and assigned resolveFactory.
    await vi.waitFor(() => expect(factory).toHaveBeenCalled());
    resolveFactory(client);
    const [first, second] = await both;

    expect(factory).toHaveBeenCalledTimes(1);
    expect(first).toBe(client);
    expect(second).toBe(client);
    expect(cache.size()).toBe(1);
  });

  it('does not poison the cache when creation fails', async () => {
    const cache = new McpSessionCache({ maxEntries: 4, idleTtlMs: 60_000, now });
    const client = stubClient();
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect failed'))
      .mockResolvedValueOnce(client);

    await expect(cache.getOrCreate(key(), factory)).rejects.toThrow('connect failed');
    expect(cache.size()).toBe(0);

    await expect(cache.getOrCreate(key(), factory)).resolves.toBe(client);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('evicts and closes the least recently used session past capacity', async () => {
    const cache = new McpSessionCache({ maxEntries: 2, idleTtlMs: 60_000, now });
    const closeA = vi.fn().mockResolvedValue(undefined);

    await cache.getOrCreate(key({ connectionId: 'a' }), async () => stubClient(closeA));
    clock += 10;
    await cache.getOrCreate(key({ connectionId: 'b' }), async () => stubClient());
    clock += 10;
    await cache.getOrCreate(key({ connectionId: 'c' }), async () => stubClient());

    expect(cache.size()).toBe(2);
    expect(closeA).toHaveBeenCalledTimes(1);
  });

  it('keeps a session alive when it is used again', async () => {
    const cache = new McpSessionCache({ maxEntries: 2, idleTtlMs: 60_000, now });
    const closeA = vi.fn().mockResolvedValue(undefined);
    const closeB = vi.fn().mockResolvedValue(undefined);

    await cache.getOrCreate(key({ connectionId: 'a' }), async () => stubClient(closeA));
    clock += 10;
    await cache.getOrCreate(key({ connectionId: 'b' }), async () => stubClient(closeB));
    clock += 10;
    await cache.getOrCreate(key({ connectionId: 'a' }), async () => stubClient());
    clock += 10;
    await cache.getOrCreate(key({ connectionId: 'c' }), async () => stubClient());

    expect(closeA).not.toHaveBeenCalled();
    expect(closeB).toHaveBeenCalledTimes(1);
  });

  it('expires an idle session and closes it', async () => {
    const cache = new McpSessionCache({ maxEntries: 4, idleTtlMs: 1_000, now });
    const close = vi.fn().mockResolvedValue(undefined);

    await cache.getOrCreate(key(), async () => stubClient(close));
    expect(cache.size()).toBe(1);

    clock += 5_000;
    await cache.getOrCreate(key({ connectionId: 'other' }), async () => stubClient());

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('invalidate evicts and closes the session', async () => {
    const cache = new McpSessionCache({ maxEntries: 4, idleTtlMs: 60_000, now });
    const close = vi.fn().mockResolvedValue(undefined);

    await cache.getOrCreate(key(), async () => stubClient(close));
    await cache.invalidate(key());

    expect(cache.size()).toBe(0);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('invalidateConnection drops every session for that connection and spares the rest', async () => {
    const cache = new McpSessionCache({ maxEntries: 8, idleTtlMs: 60_000, now });
    const closeDoomed1 = vi.fn().mockResolvedValue(undefined);
    const closeDoomed2 = vi.fn().mockResolvedValue(undefined);
    const closeKept = vi.fn().mockResolvedValue(undefined);

    await cache.getOrCreate(key({ connectionId: 'doomed', projectId: 'p1' }), async () =>
      stubClient(closeDoomed1)
    );
    await cache.getOrCreate(key({ connectionId: 'doomed', projectId: 'p2' }), async () =>
      stubClient(closeDoomed2)
    );
    await cache.getOrCreate(key({ connectionId: 'kept' }), async () => stubClient(closeKept));

    await cache.invalidateConnection('doomed');

    expect(cache.size()).toBe(1);
    expect(closeDoomed1).toHaveBeenCalledTimes(1);
    expect(closeDoomed2).toHaveBeenCalledTimes(1);
    expect(closeKept).not.toHaveBeenCalled();
  });

  it('still evicts when closing the session throws', async () => {
    const cache = new McpSessionCache({ maxEntries: 4, idleTtlMs: 60_000, now });
    const noisyClose = vi.fn().mockRejectedValue(new Error('already gone'));

    await cache.getOrCreate(key(), async () => stubClient(noisyClose));
    await expect(cache.invalidate(key())).resolves.toBeUndefined();

    expect(cache.size()).toBe(0);
    expect(noisyClose).toHaveBeenCalledTimes(1);
  });
});
