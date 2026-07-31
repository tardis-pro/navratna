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
  publish: ReturnType<typeof vi.fn>;
  eventBus: { publish: ReturnType<typeof vi.fn> };
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
  const publish = vi.fn().mockResolvedValue(undefined);

  const discovery = new IntegrationCatalogDiscovery({
    resolver: { listIntegrationServers } as unknown as NonNullable<DiscoveryOptions>['resolver'],
    executor: { listCatalogTools } as unknown as NonNullable<DiscoveryOptions>['executor'],
  });

  return { discovery, listIntegrationServers, listCatalogTools, publish, eventBus: { publish } };
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
