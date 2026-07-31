import {
  IntegrationProviderSeed,
  INTEGRATION_CATALOG,
  type IntegrationCatalogEntry,
} from '../../database/seeders/integration_provider_seed';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    selectRowsByTable: new Map<string, unknown[]>(),
    providerInserts: [] as Record<string, unknown>[],
    providerUpdates: [] as Record<string, unknown>[],
    serverInserts: [] as Record<string, unknown>[],
    serverUpdates: [] as Record<string, unknown>[],
  },
}));

/**
 * The seed touches three tables through one db handle, so the stub keys its
 * behaviour off the drizzle table name rather than call order — ordering-based
 * stubs silently mis-attribute rows the moment the seed's query order changes.
 */
vi.mock('../../database/drizzle/clients/index', () => {
  const tableNameOf = (table: unknown): string => {
    const symbols = Object.getOwnPropertySymbols(table as object);
    for (const symbol of symbols) {
      if (!symbol.description?.includes('Name')) continue;
      const value = (table as Record<symbol, unknown>)[symbol];
      if (typeof value === 'string') return value;
    }
    return 'unknown';
  };

  return {
    getControlDb: () => ({
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () => mocks.selectRowsByTable.get(tableNameOf(table)) ?? [],
          }),
        }),
      }),
      insert: (table: unknown) => {
        const name = tableNameOf(table);
        return {
          values: (values: Record<string, unknown>) => {
            if (name === 'integration_providers') {
              mocks.providerInserts.push(values);
              return {
                returning: async () => [{ id: `generated-${String(values.key)}` }],
              };
            }
            mocks.serverInserts.push(values);
            return Promise.resolve(undefined);
          },
        };
      },
      update: (table: unknown) => {
        const name = tableNameOf(table);
        return {
          set: (patch: Record<string, unknown>) => ({
            where: async () => {
              if (name === 'integration_providers') mocks.providerUpdates.push(patch);
              else mocks.serverUpdates.push(patch);
            },
          }),
        };
      },
    }),
  };
});

const resetMocks = () => {
  mocks.selectRowsByTable.clear();
  mocks.providerInserts.length = 0;
  mocks.providerUpdates.length = 0;
  mocks.serverInserts.length = 0;
  mocks.serverUpdates.length = 0;
};

beforeEach(() => {
  resetMocks();
  mocks.selectRowsByTable.set('oauth_providers', [{ id: 'oauth-provider-id' }]);
});

describe('INTEGRATION_CATALOG', () => {
  it('covers every provider the user asked to connect', () => {
    const keys = INTEGRATION_CATALOG.map((entry) => entry.key);

    expect(keys).toEqual(
      expect.arrayContaining([
        'github',
        'slack',
        'jira',
        'confluence',
        'cloudflare',
        'vercel',
      ])
    );
  });

  it('gives every entry a unique key, since tool ids embed it', () => {
    const keys = INTEGRATION_CATALOG.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('points every entry at an https MCP endpoint', () => {
    for (const entry of INTEGRATION_CATALOG) {
      expect(entry.mcpUrl.startsWith('https://'), `${entry.key} must use https`).toBe(true);
    }
  });

  it('requires the caller\'s own credential for every provider that acts on their account', () => {
    for (const entry of INTEGRATION_CATALOG) {
      if (entry.credentialMode === 'none') continue;
      expect(entry.credentialMode, `${entry.key}`).toBe('caller_connection');
      expect(entry.oauthProviderName, `${entry.key} needs an OAuth provider`).toBeTruthy();
    }
  });

  it('declares no OAuth provider for a public server', () => {
    const publicEntries = INTEGRATION_CATALOG.filter((entry) => entry.credentialMode === 'none');

    expect(publicEntries.length).toBeGreaterThan(0);
    for (const entry of publicEntries) {
      expect(entry.oauthProviderName).toBeUndefined();
    }
  });

  it('routes Jira and Confluence to the same Atlassian endpoint under distinct keys', () => {
    const jira = INTEGRATION_CATALOG.find((entry) => entry.key === 'jira');
    const confluence = INTEGRATION_CATALOG.find((entry) => entry.key === 'confluence');

    expect(jira?.mcpUrl).toBe(confluence?.mcpUrl);
    expect(jira?.key).not.toBe(confluence?.key);
  });
});

describe('seeding a fresh database', () => {
  it('creates a provider and a server row for every catalog entry', async () => {
    const result = await new IntegrationProviderSeed().seed();

    expect(result.providersSeeded).toHaveLength(INTEGRATION_CATALOG.length);
    expect(result.serversSeeded).toHaveLength(INTEGRATION_CATALOG.length);
    expect(mocks.providerUpdates).toHaveLength(0);
  });

  it('registers each MCP server under its catalog key', async () => {
    await new IntegrationProviderSeed().seed();

    const serverKeys = mocks.serverInserts.map((row) => row.serverKey);
    expect(serverKeys).toEqual(INTEGRATION_CATALOG.map((entry) => entry.key));
  });

  it('registers remote servers as streamable HTTP, never stdio', async () => {
    await new IntegrationProviderSeed().seed();

    for (const row of mocks.serverInserts) {
      expect(row.transportType).toBe('streamable-http');
      expect(row.command).toBeUndefined();
    }
  });

  it('links each server to the provider row it just created', async () => {
    await new IntegrationProviderSeed().seed();

    for (const row of mocks.serverInserts) {
      expect(typeof row.providerId).toBe('string');
      expect(String(row.providerId)).toMatch(/^generated-/);
    }
  });

  it('never auto-starts a remote server, which has no process to spawn', async () => {
    await new IntegrationProviderSeed().seed();

    for (const row of mocks.serverInserts) {
      expect(row.autoStart).toBe(false);
    }
  });

  it('rates every remote integration server HIGH, since it acts on a third-party account', async () => {
    await new IntegrationProviderSeed().seed();

    for (const row of mocks.serverInserts) {
      expect(row.securityLevel).toBe('high');
    }
  });

  it('carries the credential mode declared in the catalog', async () => {
    await new IntegrationProviderSeed().seed();

    const byKey = new Map(mocks.serverInserts.map((row) => [row.serverKey, row]));
    for (const entry of INTEGRATION_CATALOG) {
      expect(byKey.get(entry.key)?.credentialMode).toBe(entry.credentialMode);
    }
  });

  it('catalogues a provider even when its OAuth credentials are absent', async () => {
    mocks.selectRowsByTable.set('oauth_providers', []);

    const result = await new IntegrationProviderSeed().seed();

    expect(result.providersSeeded).toHaveLength(INTEGRATION_CATALOG.length);
    expect(mocks.providerInserts.every((row) => row.oauthProviderId === null)).toBe(true);
  });
});

describe('re-running the seed', () => {
  it('updates instead of duplicating', async () => {
    mocks.selectRowsByTable.set('integration_providers', [{ id: 'existing-provider' }]);
    mocks.selectRowsByTable.set('mcp_servers', [{ id: 'existing-server' }]);

    const result = await new IntegrationProviderSeed().seed();

    expect(result.providersSeeded).toHaveLength(0);
    expect(result.serversSeeded).toHaveLength(0);
    expect(result.providersUpdated).toHaveLength(INTEGRATION_CATALOG.length);
    expect(result.serversUpdated).toHaveLength(INTEGRATION_CATALOG.length);
  });

  it('never rewrites server_key, because discovered tool ids embed it', async () => {
    mocks.selectRowsByTable.set('integration_providers', [{ id: 'existing-provider' }]);
    mocks.selectRowsByTable.set('mcp_servers', [{ id: 'existing-server' }]);

    await new IntegrationProviderSeed().seed();

    for (const patch of mocks.serverUpdates) {
      expect(patch).not.toHaveProperty('serverKey');
    }
  });

  it('refreshes the endpoint when a provider moves its MCP server', async () => {
    mocks.selectRowsByTable.set('integration_providers', [{ id: 'existing-provider' }]);
    mocks.selectRowsByTable.set('mcp_servers', [{ id: 'existing-server' }]);

    await new IntegrationProviderSeed().seed();

    const urls = mocks.serverUpdates.map((patch) => patch.url);
    expect(urls).toEqual(INTEGRATION_CATALOG.map((entry) => entry.mcpUrl));
  });
});

describe('adding a provider is data-only', () => {
  const notion: IntegrationCatalogEntry = {
    key: 'notion',
    displayName: 'Notion',
    description: 'Notion pages and databases',
    mcpUrl: 'https://mcp.notion.com/mcp',
    credentialMode: 'caller_connection',
    oauthProviderName: 'Notion',
  };

  it('adds a seventh provider with no code change', async () => {
    const result = await new IntegrationProviderSeed([...INTEGRATION_CATALOG, notion]).seed();

    expect(result.providersSeeded).toContain('notion');
    expect(result.serversSeeded).toContain('notion');

    const server = mocks.serverInserts.find((row) => row.serverKey === 'notion');
    expect(server).toBeDefined();
    expect(server?.url).toBe('https://mcp.notion.com/mcp');
    expect(server?.transportType).toBe('streamable-http');
    expect(server?.credentialMode).toBe('caller_connection');
  });

  it('derives that provider\'s tool id prefix from its key alone', async () => {
    await new IntegrationProviderSeed([notion]).seed();

    const server = mocks.serverInserts[0];
    expect(`mcp-${String(server.serverKey)}-search`).toBe('mcp-notion-search');
  });

  it('seeds a brand-new provider without touching the built-in catalog', async () => {
    const result = await new IntegrationProviderSeed([notion]).seed();

    expect(result.providersSeeded).toEqual(['notion']);
    expect(mocks.serverInserts).toHaveLength(1);
  });

  it('supports a provider that authenticates with a non-standard header', async () => {
    await new IntegrationProviderSeed([
      { ...notion, key: 'custom', authHeaderName: 'X-API-Key', authScheme: '' },
    ]).seed();

    expect(mocks.serverInserts[0]).toMatchObject({
      authHeaderName: 'X-API-Key',
      authScheme: '',
    });
  });
});
