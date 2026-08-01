import { describe, expect, it, vi, beforeEach } from 'vitest';

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

const { IntegrationCatalogDiscovery } = await import(
  '../../services/integration_catalog_discovery'
);
const { McpConnectionError } = await import('@uaip/shared-services');

type DiscoveryOptions = ConstructorParameters<typeof IntegrationCatalogDiscovery>[0];

interface Harness {
  discovery: InstanceType<typeof IntegrationCatalogDiscovery>;
  listIntegrationServers: ReturnType<typeof vi.fn>;
  listCatalogTools: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  findBindingActor: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  eventBus: { publish: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
}

const server = (overrides: Record<string, unknown> = {}) => ({
  serverKey: 'cloudflare-docs',
  credentialMode: 'none' as const,
  enabled: true,
  ...overrides,
});

const makeHarness = (): Harness => {
  const listIntegrationServers = vi.fn().mockResolvedValue([server()]);
  const listCatalogTools = vi.fn().mockResolvedValue([
    { name: 'search_cloudflare_documentation', description: 'Search docs', inputSchema: {} },
  ]);
  const listTools = vi
    .fn()
    .mockResolvedValue([{ name: 'create_issue', description: 'Create', inputSchema: {} }]);
  const publish = vi.fn().mockResolvedValue(undefined);
  const subscribe = vi.fn().mockResolvedValue(undefined);
  const findBindingActor = vi.fn().mockResolvedValue('user-1');

  const discovery = new IntegrationCatalogDiscovery({
    resolver: { listIntegrationServers, findBindingActor } as unknown as NonNullable<
      DiscoveryOptions
    >['resolver'],
    executor: { listCatalogTools, listTools } as unknown as NonNullable<
      DiscoveryOptions
    >['executor'],
  });

  return {
    discovery,
    listIntegrationServers,
    listCatalogTools,
    listTools,
    findBindingActor,
    publish,
    subscribe,
    eventBus: { publish, subscribe },
  };
};

let h: Harness;

beforeEach(() => {
  h = makeHarness();
});

describe('discoverAll', () => {
  it('registers a public server\'s tools so an agent can see them', async () => {
    const result = await h.discovery.discoverAll(
      h.eventBus as unknown as Parameters<typeof h.discovery.discoverAll>[0]
    );

    expect(result.discovered).toEqual(['cloudflare-docs']);
    expect(result.toolCount).toBe(1);
    expect(h.publish).toHaveBeenCalledTimes(1);
  });

  it('publishes under the mcp- dispatch key, not the raw tool name', async () => {
    await h.discovery.discoverAll(
      h.eventBus as unknown as Parameters<typeof h.discovery.discoverAll>[0]
    );

    const payload = h.publish.mock.calls[0][1] as { tool: { name: string; displayName: string } };
    expect(payload.tool.name).toBe('mcp-cloudflare-docs-search_cloudflare_documentation');
    expect(payload.tool.displayName).toBe('search_cloudflare_documentation');
  });

  it('publishes on the channel ToolRegistry subscribes to', async () => {
    await h.discovery.discoverAll(
      h.eventBus as unknown as Parameters<typeof h.discovery.discoverAll>[0]
    );

    expect(h.publish.mock.calls[0][0]).toBe('tool.register');
  });

  it('records which server a tool came from', async () => {
    await h.discovery.discoverAll(
      h.eventBus as unknown as Parameters<typeof h.discovery.discoverAll>[0]
    );

    const payload = h.publish.mock.calls[0][1] as {
      tool: { metadata: Record<string, unknown> };
      serverName: string;
    };
    expect(payload.serverName).toBe('cloudflare-docs');
    expect(payload.tool.metadata).toMatchObject({
      mcpServer: 'cloudflare-docs',
      mcpTool: 'search_cloudflare_documentation',
      protocol: 'mcp',
    });
  });

  it('carries the remote input schema through to the registration', async () => {
    const schema = { type: 'object', properties: { query: { type: 'string' } } };
    h.listCatalogTools.mockResolvedValue([{ name: 'search', inputSchema: schema }]);

    await h.discovery.discoverAll(
      h.eventBus as unknown as Parameters<typeof h.discovery.discoverAll>[0]
    );

    const payload = h.publish.mock.calls[0][1] as { tool: { parameters: unknown } };
    expect(payload.tool.parameters).toEqual(schema);
  });

  it('registers every tool a server exposes', async () => {
    h.listCatalogTools.mockResolvedValue([
      { name: 'a', inputSchema: {} },
      { name: 'b', inputSchema: {} },
      { name: 'c', inputSchema: {} },
    ]);

    const result = await h.discovery.discoverAll(
      h.eventBus as unknown as Parameters<typeof h.discovery.discoverAll>[0]
    );

    expect(result.toolCount).toBe(3);
    expect(h.publish).toHaveBeenCalledTimes(3);
  });

  it('keeps two servers exposing the same tool name distinct', async () => {
    h.listIntegrationServers.mockResolvedValue([
      server({ serverKey: 'github' }),
      server({ serverKey: 'slack' }),
    ]);
    h.listCatalogTools.mockResolvedValue([{ name: 'search', inputSchema: {} }]);

    await h.discovery.discoverAll(
      h.eventBus as unknown as Parameters<typeof h.discovery.discoverAll>[0]
    );

    const names = h.publish.mock.calls.map(
      (call) => (call[1] as { tool: { name: string } }).tool.name
    );
    expect(names).toEqual(['mcp-github-search', 'mcp-slack-search']);
    expect(new Set(names).size).toBe(2);
  });
});

describe('servers that cannot be catalogued', () => {
  it('defers a server needing a user credential instead of failing it', async () => {
    h.listIntegrationServers.mockResolvedValue([server({ credentialMode: 'caller_connection' })]);
    h.listCatalogTools.mockRejectedValue(
      new McpConnectionError('needs a user connection', 'catalog_credential_required')
    );

    const result = await h.discovery.discoverAll(
      h.eventBus as unknown as Parameters<typeof h.discovery.discoverAll>[0]
    );

    expect(result.deferred).toEqual(['cloudflare-docs']);
    expect(result.failed).toEqual([]);
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('records a genuine failure rather than hiding it', async () => {
    h.listCatalogTools.mockRejectedValue(new Error('connection refused'));

    const result = await h.discovery.discoverAll(
      h.eventBus as unknown as Parameters<typeof h.discovery.discoverAll>[0]
    );

    expect(result.failed).toEqual(['cloudflare-docs']);
    expect(result.discovered).toEqual([]);
  });

  it('keeps discovering the remaining servers after one fails', async () => {
    h.listIntegrationServers.mockResolvedValue([
      server({ serverKey: 'broken' }),
      server({ serverKey: 'working' }),
    ]);
    h.listCatalogTools
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce([{ name: 'ok', inputSchema: {} }]);

    const result = await h.discovery.discoverAll(
      h.eventBus as unknown as Parameters<typeof h.discovery.discoverAll>[0]
    );

    expect(result.failed).toEqual(['broken']);
    expect(result.discovered).toEqual(['working']);
  });

  it('skips a disabled server entirely', async () => {
    h.listIntegrationServers.mockResolvedValue([server({ enabled: false })]);

    const result = await h.discovery.discoverAll(
      h.eventBus as unknown as Parameters<typeof h.discovery.discoverAll>[0]
    );

    expect(result.discovered).toEqual([]);
    expect(h.listCatalogTools).not.toHaveBeenCalled();
  });

  it('does not throw when there is no event bus to publish to', async () => {
    await expect(h.discovery.discoverAll(undefined)).resolves.toMatchObject({
      discovered: ['cloudflare-docs'],
    });
    expect(h.publish).not.toHaveBeenCalled();
  });
});

describe('discovery when a user links a connection', () => {
  const LINK = {
    serverKey: 'github',
    projectId: 'proj-1',
    agentId: 'agent-1',
    actorUserId: 'user-1',
  };

  const envelope = (payload: unknown) => ({
    id: 'evt_1',
    type: 'integration.connection.linked',
    source: 'security-gateway',
    data: payload,
    timestamp: new Date(),
    version: '1.0.0',
  });

  const subscribedHandler = async (): Promise<(event: unknown) => Promise<void>> => {
    await h.discovery.initialize(
      h.eventBus as unknown as Parameters<typeof h.discovery.initialize>[0]
    );
    return h.subscribe.mock.calls[0][1] as (event: unknown) => Promise<void>;
  };

  it('subscribes to the linked-connection event', async () => {
    await h.discovery.initialize(
      h.eventBus as unknown as Parameters<typeof h.discovery.initialize>[0]
    );

    expect(h.subscribe).toHaveBeenCalledTimes(1);
    expect(h.subscribe.mock.calls[0][0]).toBe('integration.connection.linked');
  });

  it('registers a caller_connection provider\'s tools, which boot discovery cannot', async () => {
    const handler = await subscribedHandler();

    await handler(envelope(LINK));

    expect(h.listTools).toHaveBeenCalledWith(LINK);
    expect(h.publish).toHaveBeenCalledTimes(1);
    const payload = h.publish.mock.calls[0][1] as { tool: { name: string } };
    expect(payload.tool.name).toBe('mcp-github-create_issue');
  });

  it('reads the payload out of the bus envelope', async () => {
    const handler = await subscribedHandler();

    await handler(envelope(LINK));

    expect(h.listTools).toHaveBeenCalledWith(LINK);
  });

  it('acts as the user recorded on the binding, not the one named in the event', async () => {
    h.findBindingActor.mockResolvedValue('real-owner');
    const handler = await subscribedHandler();

    await handler(envelope({ ...LINK, actorUserId: 'attacker' }));

    expect(h.listTools.mock.calls[0][0].actorUserId).toBe('real-owner');
  });

  it('resolves the actor from the exact binding named in the event', async () => {
    const handler = await subscribedHandler();

    await handler(envelope(LINK));

    expect(h.findBindingActor).toHaveBeenCalledWith('github', 'proj-1', 'agent-1');
  });

  it('discovers nothing when no binding backs the event', async () => {
    h.findBindingActor.mockResolvedValue(null);
    const handler = await subscribedHandler();

    await handler(envelope(LINK));

    expect(h.listTools).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('uses the linking user\'s own credential, not a catalog one', async () => {
    const handler = await subscribedHandler();

    await handler(envelope(LINK));

    expect(h.listCatalogTools).not.toHaveBeenCalled();
    expect(h.listTools.mock.calls[0][0].actorUserId).toBe('user-1');
  });

  it('scopes discovery to the exact project and agent that were linked', async () => {
    const handler = await subscribedHandler();

    await handler(envelope({ ...LINK, projectId: 'proj-9', agentId: 'agent-9' }));

    expect(h.listTools.mock.calls[0][0]).toMatchObject({
      projectId: 'proj-9',
      agentId: 'agent-9',
    });
  });

  it('publishes on the channel ToolRegistry subscribes to', async () => {
    const handler = await subscribedHandler();

    await handler(envelope(LINK));

    expect(h.publish.mock.calls[0][0]).toBe('tool.register');
  });

  it('registers every tool the provider exposes', async () => {
    h.listTools.mockResolvedValue([
      { name: 'create_issue', inputSchema: {} },
      { name: 'search', inputSchema: {} },
    ]);
    const handler = await subscribedHandler();

    await handler(envelope(LINK));

    expect(h.publish).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a missing serverKey', { projectId: 'p', agentId: 'a', actorUserId: 'u' }],
    ['a missing actorUserId', { serverKey: 's', projectId: 'p', agentId: 'a' }],
    ['a missing projectId', { serverKey: 's', agentId: 'a', actorUserId: 'u' }],
    ['a non-object payload', 'nope'],
  ])('ignores %s rather than discovering unscoped', async (_label, payload) => {
    const handler = await subscribedHandler();

    await handler(envelope(payload));

    expect(h.listTools).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('never fails the link when discovery throws', async () => {
    h.listTools.mockRejectedValue(new Error('provider unreachable'));
    const handler = await subscribedHandler();

    await expect(handler(envelope(LINK))).resolves.toBeUndefined();
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('reports how many tools it registered', async () => {
    h.listTools.mockResolvedValue([
      { name: 'a', inputSchema: {} },
      { name: 'b', inputSchema: {} },
    ]);

    const count = await h.discovery.discoverForConnection(
      LINK,
      h.eventBus as unknown as Parameters<typeof h.discovery.discoverAll>[0]
    );

    expect(count).toBe(2);
  });

  it('warns instead of subscribing when there is no event bus', async () => {
    await expect(h.discovery.initialize(undefined)).resolves.toBeUndefined();
    expect(h.subscribe).not.toHaveBeenCalled();
  });
});
