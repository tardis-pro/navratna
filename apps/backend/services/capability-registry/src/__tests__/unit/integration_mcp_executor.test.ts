import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
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

const { IntegrationMcpExecutor } = await import('../../services/integration_mcp_executor');
const { McpSessionCache } = await import('../../services/authenticated_mcp_transport');

type Executor = InstanceType<typeof IntegrationMcpExecutor>;
type ExecutorOptions = ConstructorParameters<typeof IntegrationMcpExecutor>[0];
type ResolverStub = NonNullable<ExecutorOptions>['resolver'];
type ClientFactory = NonNullable<ExecutorOptions>['createClient'];

const PROJECT_ID = 'proj-1';
const AGENT_ID = 'agent-1';
const ACTOR_ID = 'user-1';
const CONNECTION_ID = 'conn-1';

const request = (overrides: Record<string, string> = {}) => ({
  serverKey: 'github',
  projectId: PROJECT_ID,
  agentId: AGENT_ID,
  actorUserId: ACTOR_ID,
  ...overrides,
});

const connection = (overrides: Record<string, unknown> = {}) => ({
  serverKey: 'github',
  url: 'https://api.githubcopilot.com/mcp/',
  credentialMode: 'caller_connection' as const,
  connectionId: CONNECTION_ID,
  providerId: 'provider-1',
  credential: { accessToken: 'token-A', tokenVersion: 1 },
  ...overrides,
});

interface Harness {
  executor: Executor;
  resolve: ReturnType<typeof vi.fn>;
  createClient: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  createdWith: Record<string, unknown>[];
}

const httpError = (code: number): Error => Object.assign(new Error(`HTTP ${code}`), { code });

const makeHarness = (overrides: { resolved?: Record<string, unknown> } = {}): Harness => {
  const listTools = vi.fn().mockResolvedValue({ tools: [] });
  const callTool = vi.fn().mockResolvedValue({ content: [] });
  const close = vi.fn().mockResolvedValue(undefined);
  const createdWith: Record<string, unknown>[] = [];

  const createClient = vi.fn().mockImplementation(async (options: Record<string, unknown>) => {
    createdWith.push(options);
    return { client: { listTools, callTool }, transport: {}, sessionId: 'sess', close };
  });

  const resolve = vi.fn().mockResolvedValue(connection(overrides.resolved));

  const executor = new IntegrationMcpExecutor({
    resolver: { resolve } as unknown as ResolverStub,
    sessionCache: new McpSessionCache({ maxEntries: 8, idleTtlMs: 60_000 }),
    createClient: createClient as unknown as ClientFactory,
    // Injected so the default probe never makes a REAL network request from a unit
    // test: it re-elicits the challenge by calling the server, which would leave
    // these tests network-dependent and slow.
    discoverProtectedResource: async () => null,
  });

  return { executor, resolve, createClient, listTools, callTool, close, createdWith };
};

describe('listTools', () => {
  it('returns the remote catalog as descriptors', async () => {
    const h = makeHarness();
    h.listTools.mockResolvedValue({
      tools: [
        { name: 'create_issue', description: 'Create an issue', inputSchema: { type: 'object' } },
        { name: 'search', inputSchema: { type: 'object', properties: { q: {} } } },
      ],
    });

    const tools = await h.executor.listTools(request());

    expect(tools).toEqual([
      { name: 'create_issue', description: 'Create an issue', inputSchema: { type: 'object' } },
      { name: 'search', description: undefined, inputSchema: { type: 'object', properties: { q: {} } } },
    ]);
  });

  it('defaults a missing input schema to an empty object', async () => {
    const h = makeHarness();
    h.listTools.mockResolvedValue({ tools: [{ name: 'noargs' }] });

    const [tool] = await h.executor.listTools(request());

    expect(tool.inputSchema).toEqual({});
  });
});

describe('callTool', () => {
  it('forwards the tool name and arguments unchanged', async () => {
    const h = makeHarness();

    await h.executor.callTool(request(), 'create_issue', { title: 'Bug', body: 'Broken' });

    expect(h.callTool).toHaveBeenCalledWith({
      name: 'create_issue',
      arguments: { title: 'Bug', body: 'Broken' },
    });
  });

  it('returns the provider result verbatim', async () => {
    const h = makeHarness();
    h.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'created #12' }] });

    const result = await h.executor.callTool(request(), 'create_issue', {});

    expect(result).toEqual({ content: [{ type: 'text', text: 'created #12' }] });
  });
});

describe('credential handling', () => {
  it('opens the session with the resolved credential', async () => {
    const h = makeHarness();

    await h.executor.listTools(request());

    expect(h.createdWith[0]).toMatchObject({
      url: 'https://api.githubcopilot.com/mcp/',
      credential: { accessToken: 'token-A', tokenVersion: 1 },
    });
  });

  it('re-resolves the credential on every call so a revoked binding stops working at once', async () => {
    const h = makeHarness();

    await h.executor.listTools(request());
    await h.executor.callTool(request(), 'search', {});

    expect(h.resolve).toHaveBeenCalledTimes(2);
  });

  it('refuses the call when the resolver rejects, without opening a session', async () => {
    const h = makeHarness();
    h.resolve.mockRejectedValue(
      Object.assign(new Error('No enabled integration connection'), {
        code: 'no_integration_connection',
      })
    );

    await expect(h.executor.callTool(request(), 'search', {})).rejects.toThrow(
      'No enabled integration connection'
    );
    expect(h.createClient).not.toHaveBeenCalled();
  });

  it('reuses one session for repeated calls on the same binding', async () => {
    const h = makeHarness();

    await h.executor.listTools(request());
    await h.executor.listTools(request());

    expect(h.createClient).toHaveBeenCalledTimes(1);
  });

  it('opens a separate session once the token version changes', async () => {
    const h = makeHarness();
    await h.executor.listTools(request());

    h.resolve.mockResolvedValue(
      connection({ credential: { accessToken: 'token-A2', tokenVersion: 2 } })
    );
    await h.executor.listTools(request());

    expect(h.createClient).toHaveBeenCalledTimes(2);
    expect(h.createdWith[1]).toMatchObject({
      credential: { accessToken: 'token-A2', tokenVersion: 2 },
    });
  });

  it('never shares a session between two users of the same server', async () => {
    const h = makeHarness();

    await h.executor.listTools(request({ agentId: 'agent-A' }));
    h.resolve.mockResolvedValue(
      connection({
        connectionId: 'conn-B',
        credential: { accessToken: 'token-B', tokenVersion: 1 },
      })
    );
    await h.executor.listTools(request({ agentId: 'agent-B' }));

    expect(h.createClient).toHaveBeenCalledTimes(2);
    expect(h.createdWith[0]).toMatchObject({ credential: { accessToken: 'token-A' } });
    expect(h.createdWith[1]).toMatchObject({ credential: { accessToken: 'token-B' } });
    expect(JSON.stringify(h.createdWith[0])).not.toContain('token-B');
    expect(JSON.stringify(h.createdWith[1])).not.toContain('token-A');
  });

  it('passes a provider-specific auth header and scheme through', async () => {
    const h = makeHarness({
      resolved: { authHeaderName: 'X-API-Key', authScheme: '' },
    });

    await h.executor.listTools(request());

    expect(h.createdWith[0]).toMatchObject({ authHeaderName: 'X-API-Key', authScheme: '' });
  });

  it('opens a public server session with no credential', async () => {
    const h = makeHarness({
      resolved: { credentialMode: 'none', credential: undefined, connectionId: '__public__' },
    });

    await h.executor.listTools(request());

    expect(h.createdWith[0].credential).toBeUndefined();
  });
});

describe('expired remote session recovery', () => {
  it.each([401, 404])('reopens the session once after HTTP %i', async (status) => {
    const h = makeHarness();
    h.callTool.mockRejectedValueOnce(httpError(status)).mockResolvedValueOnce({ content: [] });

    const result = await h.executor.callTool(request(), 'search', {});

    expect(result).toEqual({ content: [] });
    expect(h.createClient).toHaveBeenCalledTimes(2);
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('recovers a listTools call the same way', async () => {
    const h = makeHarness();
    h.listTools
      .mockRejectedValueOnce(httpError(401))
      .mockResolvedValueOnce({ tools: [{ name: 'ok' }] });

    const tools = await h.executor.listTools(request());

    expect(tools).toHaveLength(1);
    expect(h.createClient).toHaveBeenCalledTimes(2);
  });

  it('treats an SDK UnauthorizedError as a retryable session error', async () => {
    const h = makeHarness();
    const unauthorized = Object.assign(new Error('unauthorized'), { name: 'UnauthorizedError' });
    h.callTool.mockRejectedValueOnce(unauthorized).mockResolvedValueOnce({ content: [] });

    await expect(h.executor.callTool(request(), 'search', {})).resolves.toEqual({ content: [] });
    expect(h.createClient).toHaveBeenCalledTimes(2);
  });

  it('retries at most once and surfaces a persistent failure', async () => {
    const h = makeHarness();
    h.callTool.mockRejectedValue(httpError(401));

    await expect(h.executor.callTool(request(), 'search', {})).rejects.toThrow('HTTP 401');
    expect(h.createClient).toHaveBeenCalledTimes(2);
    expect(h.callTool).toHaveBeenCalledTimes(2);
  });

  it.each([400, 403, 429, 500])('does not retry HTTP %i', async (status) => {
    const h = makeHarness();
    h.callTool.mockRejectedValue(httpError(status));

    await expect(h.executor.callTool(request(), 'search', {})).rejects.toThrow(`HTTP ${status}`);
    expect(h.createClient).toHaveBeenCalledTimes(1);
    expect(h.callTool).toHaveBeenCalledTimes(1);
  });

  it('propagates a provider error unchanged rather than masking it', async () => {
    const h = makeHarness();
    h.callTool.mockRejectedValue(new Error('repository not found'));

    await expect(h.executor.callTool(request(), 'search', {})).rejects.toThrow(
      'repository not found'
    );
    expect(h.createClient).toHaveBeenCalledTimes(1);
  });

  it('re-resolves the credential before reopening, so a token rotated mid-flight is used', async () => {
    const h = makeHarness();
    // A 401 is exactly what a rotated-out token looks like, so retrying with the
    // SAME credential can only fail again.
    h.resolve
      .mockResolvedValueOnce(connection())
      .mockResolvedValue(
        connection({ credential: { accessToken: 'token-B', tokenVersion: 2 } })
      );
    h.callTool.mockRejectedValueOnce(httpError(401)).mockResolvedValueOnce({ content: [] });

    await h.executor.callTool(request(), 'search', {});

    expect(h.resolve).toHaveBeenCalledTimes(2);
    expect(h.createdWith).toHaveLength(2);
    expect(h.createdWith[1]).toMatchObject({ credential: { accessToken: 'token-B' } });
  });

  it('keys the reopened session by the NEW token version, not the stale one', async () => {
    const h = makeHarness();
    h.resolve
      .mockResolvedValueOnce(connection())
      .mockResolvedValue(
        connection({ credential: { accessToken: 'token-B', tokenVersion: 2 } })
      );
    h.callTool.mockRejectedValueOnce(httpError(401)).mockResolvedValueOnce({ content: [] });

    await h.executor.callTool(request(), 'search', {});

    // A third call must reuse the rotated session rather than opening a fourth.
    await h.executor.callTool(request(), 'search', {});

    expect(h.createClient).toHaveBeenCalledTimes(2);
  });
});

describe('invalidateConnection', () => {
  it('drops the cached session so the next call reopens it', async () => {
    const h = makeHarness();

    await h.executor.listTools(request());
    await h.executor.invalidateConnection(CONNECTION_ID);
    await h.executor.listTools(request());

    expect(h.createClient).toHaveBeenCalledTimes(2);
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('leaves sessions for other connections untouched', async () => {
    const h = makeHarness();
    await h.executor.listTools(request());

    await h.executor.invalidateConnection('some-other-connection');
    await h.executor.listTools(request());

    expect(h.createClient).toHaveBeenCalledTimes(1);
    expect(h.close).not.toHaveBeenCalled();
  });
});

describe('a replica that never received the invalidation event', () => {
  // BullMQ Worker is a COMPETING consumer: one integration.credential.changed job
  // is delivered to exactly ONE Fly replica, so every other replica keeps its
  // cached session. These prove that a session cached on a replica that missed the
  // event can never be USED, which is what makes fan-out unnecessary for safety.

  it('refuses the call outright when the credential was revoked', async () => {
    const h = makeHarness();
    await h.executor.callTool(request(), 'create_issue', {});
    expect(h.createClient).toHaveBeenCalledTimes(1);

    // The event went to another replica; this one still holds the session. But
    // resolve() runs before the cache is consulted and now refuses.
    h.resolve.mockRejectedValue(new Error('Integration connection is revoked'));

    await expect(h.executor.callTool(request(), 'create_issue', {})).rejects.toThrow(/revoked/);
    expect(h.callTool).toHaveBeenCalledTimes(1);
  });

  it('never reuses the stale session after a rotation it did not observe', async () => {
    const h = makeHarness();
    await h.executor.callTool(request(), 'create_issue', {});

    h.resolve.mockResolvedValue(
      connection({ credential: { accessToken: 'token-B', tokenVersion: 2 } })
    );

    await h.executor.callTool(request(), 'create_issue', {});

    // A second client was opened: tokenVersion is part of the session key, so the
    // rotated credential cannot land on the session built from the old one.
    expect(h.createClient).toHaveBeenCalledTimes(2);
    expect(h.createdWith[1].credential).toMatchObject({ accessToken: 'token-B' });
  });

  it('resolves the credential again on every call, never caching it beside the session', async () => {
    const h = makeHarness();

    await h.executor.callTool(request(), 'create_issue', {});
    await h.executor.callTool(request(), 'create_issue', {});
    await h.executor.callTool(request(), 'create_issue', {});

    expect(h.resolve).toHaveBeenCalledTimes(3);
    expect(h.createClient).toHaveBeenCalledTimes(1);
  });
});

describe('a persistent 401 from a protected provider', () => {
  const unauthorized = () => Object.assign(new Error('HTTP 401'), { code: 401 });

  const protectedHarness = () => {
    const h = makeHarness();
    // Fails on the first attempt AND on the retry: the credential is not merely
    // stale, the server does not accept it at all.
    h.callTool.mockRejectedValue(unauthorized());
    return h;
  };

  it('reports which authorization server and scopes the provider requires', async () => {
    const h = protectedHarness();
    const discover = vi.fn().mockResolvedValue({
      resource: 'https://api.githubcopilot.com/mcp/',
      authorizationServers: ['https://github.com/login/oauth'],
      scopesSupported: ['repo', 'read:org'],
      resourceName: 'GitHub MCP Server',
    });
    h.executor.setProtectedResourceDiscovery(discover);

    await expect(h.executor.callTool(request(), 'create_issue', {})).rejects.toThrow(
      /github\.com\/login\/oauth/
    );
  });

  it('names the required scopes so the user knows what to grant', async () => {
    const h = protectedHarness();
    h.executor.setProtectedResourceDiscovery(
      vi.fn().mockResolvedValue({
        resource: 'https://api.githubcopilot.com/mcp/',
        authorizationServers: ['https://github.com/login/oauth'],
        scopesSupported: ['repo', 'read:org'],
      })
    );

    await expect(h.executor.callTool(request(), 'create_issue', {})).rejects.toThrow(/repo/);
  });

  it('surfaces the original error when the server advertises no metadata', async () => {
    const h = protectedHarness();
    h.executor.setProtectedResourceDiscovery(vi.fn().mockResolvedValue(null));

    // Nothing actionable to say, so the raw failure must not be swallowed.
    await expect(h.executor.callTool(request(), 'create_issue', {})).rejects.toThrow(/401/);
  });

  it('surfaces the original error when discovery itself fails', async () => {
    const h = protectedHarness();
    h.executor.setProtectedResourceDiscovery(vi.fn().mockRejectedValue(new Error('bad metadata')));

    await expect(h.executor.callTool(request(), 'create_issue', {})).rejects.toThrow(/401/);
  });

  it('does not probe when the call eventually succeeds on retry', async () => {
    const h = makeHarness();
    h.callTool.mockRejectedValueOnce(unauthorized()).mockResolvedValue({ content: [] });
    const discover = vi.fn();
    h.executor.setProtectedResourceDiscovery(discover);

    await h.executor.callTool(request(), 'create_issue', {});

    expect(discover).not.toHaveBeenCalled();
  });

  it('does not probe for a non-auth failure', async () => {
    const h = makeHarness();
    h.callTool.mockRejectedValue(new Error('boom'));
    const discover = vi.fn();
    h.executor.setProtectedResourceDiscovery(discover);

    await expect(h.executor.callTool(request(), 'create_issue', {})).rejects.toThrow(/boom/);
    expect(discover).not.toHaveBeenCalled();
  });

  it('does not probe for a persistent 404, which is retryable but not an auth failure', async () => {
    const h = makeHarness();
    // 404 IS retryable, so it reaches the explain step — unlike a plain error,
    // which never gets that far. Only this shape exercises the auth-only guard.
    h.callTool.mockRejectedValue(Object.assign(new Error('HTTP 404'), { code: 404 }));
    const discover = vi.fn();
    h.executor.setProtectedResourceDiscovery(discover);

    await expect(h.executor.callTool(request(), 'create_issue', {})).rejects.toThrow(/404/);
    expect(
      discover,
      'a retired session is not an authorization problem; probing would mislabel it'
    ).not.toHaveBeenCalled();
  });

  it('probes when the SDK reports UnauthorizedError with no status code', async () => {
    const h = protectedHarness();
    h.callTool.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { name: 'UnauthorizedError' })
    );
    h.executor.setProtectedResourceDiscovery(
      vi.fn().mockResolvedValue({
        resource: 'https://api.githubcopilot.com/mcp/',
        authorizationServers: ['https://github.com/login/oauth'],
        scopesSupported: [],
      })
    );

    await expect(h.executor.callTool(request(), 'create_issue', {})).rejects.toThrow(
      /github\.com\/login\/oauth/
    );
  });
});
