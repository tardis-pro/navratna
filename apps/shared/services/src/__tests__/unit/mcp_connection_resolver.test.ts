import { IntegrationConnectionStatus } from '@uaip/types';
import {
  integrationConnections,
  mcpServers,
  projectAgentIntegrationConnections,
  projects,
  projectMembers,
} from '../../database/drizzle/schemas/control_schema';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    rowsByTable: new Map<unknown, unknown[]>(),
    predicateColumnsByTable: new Map<unknown, string[]>(),
    decrypt: vi.fn(),
  },
}));

/**
 * Drizzle builds a WHERE clause into nested `queryChunks`; the referenced columns
 * appear as Column instances inside them. Walking them lets a test assert on the
 * predicate itself — without this the mock returns rows regardless of the WHERE,
 * so removing a condition (e.g. the provider check) would pass unnoticed.
 */
const collectPredicateColumns = (node: unknown, found: string[] = []): string[] => {
  if (!node || typeof node !== 'object') return found;

  const candidate = node as { name?: unknown; columnType?: unknown; queryChunks?: unknown };
  if (typeof candidate.name === 'string' && typeof candidate.columnType === 'string') {
    found.push(candidate.name);
  }
  if (Array.isArray(candidate.queryChunks)) {
    for (const chunk of candidate.queryChunks) collectPredicateColumns(chunk, found);
  }
  return found;
};

vi.mock('../../database/drizzle/clients/index', () => ({
  getControlDb: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          mocks.predicateColumnsByTable.set(table, collectPredicateColumns(condition));
          return { limit: async () => mocks.rowsByTable.get(table) ?? [] };
        },
      }),
    }),
  }),
}));

vi.mock('../../services/oauth_token_resolver', () => ({
  decryptOAuthSecret: (value: string) => mocks.decrypt(value),
}));

const { McpConnectionResolver, McpConnectionError } = await import(
  '../../services/mcp_connection_resolver'
);

const PROVIDER_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const AGENT_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '55555555-5555-4555-8555-555555555555';
const CATALOG_CONNECTION_ID = '66666666-6666-4666-8666-666666666666';

const request = (overrides: Record<string, string> = {}) => ({
  serverKey: 'github',
  projectId: PROJECT_ID,
  agentId: AGENT_ID,
  actorUserId: ACTOR_ID,
  ...overrides,
});

const serverRow = (overrides: Record<string, unknown> = {}) => ({
  url: 'https://api.githubcopilot.com/mcp/',
  providerId: PROVIDER_ID,
  credentialMode: 'caller_connection',
  authHeaderName: null,
  authScheme: null,
  catalogConnectionId: null,
  enabled: true,
  transportType: 'streamable-http',
  ...overrides,
});

const connectionRow = (overrides: Record<string, unknown> = {}) => ({
  accessTokenEncrypted: 'cipher',
  expiresAt: null,
  status: IntegrationConnectionStatus.ACTIVE,
  tokenVersion: 3,
  ...overrides,
});

const setRows = (rows: {
  server?: unknown[];
  project?: unknown[];
  member?: unknown[];
  binding?: unknown[];
  connection?: unknown[];
}) => {
  mocks.rowsByTable.clear();
  mocks.rowsByTable.set(mcpServers, rows.server ?? []);
  mocks.rowsByTable.set(projects, rows.project ?? [{ id: PROJECT_ID }]);
  mocks.rowsByTable.set(projectMembers, rows.member ?? []);
  mocks.rowsByTable.set(projectAgentIntegrationConnections, rows.binding ?? []);
  mocks.rowsByTable.set(integrationConnections, rows.connection ?? []);
};

const resolver = () => new McpConnectionResolver();

const expectCode = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toThrow(McpConnectionError);
  await promise.catch((error: unknown) => {
    expect((error as { code: string }).code).toBe(code);
  });
};

beforeEach(() => {
  mocks.decrypt.mockReset();
  mocks.decrypt.mockImplementation((value: string) => `plain(${value})`);
  mocks.predicateColumnsByTable.clear();
  setRows({});
});

describe('server lookup', () => {
  it('refuses an unknown server key', async () => {
    setRows({ server: [] });
    await expectCode(resolver().resolve(request()), 'server_not_found');
  });

  it('refuses a disabled server', async () => {
    setRows({ server: [serverRow({ enabled: false })] });
    await expectCode(resolver().resolve(request()), 'server_not_found');
  });

  it('refuses a server with no URL', async () => {
    setRows({ server: [serverRow({ url: null })] });
    await expectCode(resolver().resolve(request()), 'server_misconfigured');
  });

  it('refuses caller credentials on a stdio server, whose env is fixed at spawn', async () => {
    setRows({ server: [serverRow({ transportType: 'stdio' })] });
    await expectCode(resolver().resolve(request()), 'server_misconfigured');
  });

  it('refuses a credential-requiring server with no provider', async () => {
    setRows({ server: [serverRow({ providerId: null })] });
    await expectCode(resolver().resolve(request()), 'server_misconfigured');
  });
});

describe('credentialMode: none', () => {
  it('resolves a public server without touching any credential', async () => {
    setRows({ server: [serverRow({ credentialMode: 'none', providerId: null })] });

    const resolved = await resolver().resolve(request({ serverKey: 'cloudflare-docs' }));

    expect(resolved.credential).toBeUndefined();
    expect(resolved.credentialMode).toBe('none');
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it('gives every public session the same stable cache identity', async () => {
    setRows({ server: [serverRow({ credentialMode: 'none', providerId: null })] });

    const first = await resolver().resolve(request({ actorUserId: 'user-a' }));
    const second = await resolver().resolve(request({ actorUserId: 'user-b' }));

    expect(first.connectionId).toBe(second.connectionId);
  });
});

describe('credentialMode: caller_connection', () => {
  it('resolves the credential bound to the project and agent', async () => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow()],
    });

    const resolved = await resolver().resolve(request());

    expect(resolved.connectionId).toBe(CONNECTION_ID);
    expect(resolved.credential).toEqual({ accessToken: 'plain(cipher)', tokenVersion: 3 });
  });

  it('carries the token version so a refreshed token cannot reuse a cached session', async () => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow({ tokenVersion: 9 })],
    });

    const resolved = await resolver().resolve(request());

    expect(resolved.credential?.tokenVersion).toBe(9);
  });

  it('refuses an actor who cannot access the project', async () => {
    setRows({
      server: [serverRow()],
      project: [],
      member: [],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow()],
    });

    await expectCode(resolver().resolve(request()), 'forbidden');
  });

  it('never reads a credential for an actor who failed the project check', async () => {
    setRows({
      server: [serverRow()],
      project: [],
      member: [],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow()],
    });

    await resolver().resolve(request()).catch(() => undefined);

    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it('accepts a project member who is not the owner', async () => {
    setRows({
      server: [serverRow()],
      project: [],
      member: [{ id: 'membership' }],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow()],
    });

    await expect(resolver().resolve(request())).resolves.toMatchObject({
      connectionId: CONNECTION_ID,
    });
  });

  it('refuses execution when no binding exists', async () => {
    setRows({ server: [serverRow()], binding: [] });
    await expectCode(resolver().resolve(request()), 'no_integration_connection');
  });

  it('refuses execution when the binding is disabled', async () => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: false }],
      connection: [connectionRow()],
    });

    await expectCode(resolver().resolve(request()), 'no_integration_connection');
  });

  it('refuses execution when the linked connection has been deleted', async () => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [],
    });

    await expectCode(resolver().resolve(request()), 'no_integration_connection');
  });

  it.each([
    IntegrationConnectionStatus.REVOKED,
    IntegrationConnectionStatus.EXPIRED,
    IntegrationConnectionStatus.ERROR,
  ])('refuses a %s connection', async (status) => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow({ status })],
    });

    await expectCode(resolver().resolve(request()), 'connection_unusable');
  });

  it('refuses a connection whose token has already expired', async () => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow({ expiresAt: new Date(Date.now() - 1000) })],
    });

    await expectCode(resolver().resolve(request()), 'connection_unusable');
  });

  it('accepts a connection whose token is still valid', async () => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow({ expiresAt: new Date(Date.now() + 60_000) })],
    });

    await expect(resolver().resolve(request())).resolves.toMatchObject({
      connectionId: CONNECTION_ID,
    });
  });

  it('refuses a connection with no stored token', async () => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow({ accessTokenEncrypted: null })],
    });

    await expectCode(resolver().resolve(request()), 'connection_unusable');
  });

  it('reports an undecryptable token instead of sending a broken credential', async () => {
    mocks.decrypt.mockImplementation(() => {
      throw new Error('bad key');
    });
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow()],
    });

    await expectCode(resolver().resolve(request()), 'credential_unreadable');
  });

  it('never leaks the ciphertext or plaintext in the thrown error', async () => {
    mocks.decrypt.mockImplementation(() => {
      throw new Error('bad key');
    });
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow({ accessTokenEncrypted: 'SUPER_SECRET_CIPHER' })],
    });

    const error = await resolver()
      .resolve(request())
      .catch((thrown: unknown) => thrown as Error);

    expect(error.message).not.toContain('SUPER_SECRET_CIPHER');
  });
});

describe('credentialMode: catalog', () => {
  it('uses the configured catalog connection rather than a caller binding', async () => {
    setRows({
      server: [
        serverRow({ credentialMode: 'catalog', catalogConnectionId: CATALOG_CONNECTION_ID }),
      ],
      binding: [],
      connection: [connectionRow()],
    });

    const resolved = await resolver().resolve(request());

    expect(resolved.connectionId).toBe(CATALOG_CONNECTION_ID);
    expect(resolved.credential?.accessToken).toBe('plain(cipher)');
  });

  it('refuses when no catalog connection is configured', async () => {
    setRows({
      server: [serverRow({ credentialMode: 'catalog', catalogConnectionId: null })],
    });

    await expectCode(resolver().resolve(request()), 'server_misconfigured');
  });
});

describe('lookup predicates are scoped, not just filtered in memory', () => {
  it('scopes the credential lookup by provider as well as id', async () => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow()],
    });

    await resolver().resolve(request());

    const columns = mocks.predicateColumnsByTable.get(integrationConnections) ?? [];
    expect(columns).toContain('id');
    expect(columns, 'credential lookup must be scoped by provider_id').toContain('provider_id');
  });

  it('scopes the binding lookup by project, agent and provider', async () => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow()],
    });

    await resolver().resolve(request());

    const columns =
      mocks.predicateColumnsByTable.get(projectAgentIntegrationConnections) ?? [];
    expect(columns).toEqual(
      expect.arrayContaining(['project_id', 'agent_id', 'provider_id'])
    );
  });

  it('scopes the project ownership check by owner', async () => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow()],
    });

    await resolver().resolve(request());

    const columns = mocks.predicateColumnsByTable.get(projects) ?? [];
    expect(columns).toEqual(expect.arrayContaining(['id', 'owner_id']));
  });

  it('scopes the server lookup by server key', async () => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow()],
    });

    await resolver().resolve(request());

    expect(mocks.predicateColumnsByTable.get(mcpServers) ?? []).toContain('server_key');
  });
});

describe('credential selection cannot be influenced by the caller', () => {
  it('accepts no connection id in its request contract', () => {
    const keys = Object.keys(request());
    expect(keys).toEqual(['serverKey', 'projectId', 'agentId', 'actorUserId']);
    expect(keys).not.toContain('connectionId');
  });

  it('ignores an injected connectionId and still resolves from the stored binding', async () => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow()],
    });

    const injected = { ...request(), connectionId: 'attacker-supplied' } as unknown as Parameters<
      InstanceType<typeof McpConnectionResolver>['resolve']
    >[0];
    const resolved = await resolver().resolve(injected);

    expect(resolved.connectionId).toBe(CONNECTION_ID);
  });
});

describe('provider-specific auth shape', () => {
  it('passes a custom header name and scheme through to the transport', async () => {
    setRows({
      server: [serverRow({ authHeaderName: 'X-API-Key', authScheme: '' })],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow()],
    });

    const resolved = await resolver().resolve(request());

    expect(resolved.authHeaderName).toBe('X-API-Key');
    expect(resolved.authScheme).toBe('');
  });

  it('leaves header and scheme undefined when the provider uses the defaults', async () => {
    setRows({
      server: [serverRow()],
      binding: [{ connectionId: CONNECTION_ID, enabled: true }],
      connection: [connectionRow()],
    });

    const resolved = await resolver().resolve(request());

    expect(resolved.authHeaderName).toBeUndefined();
    expect(resolved.authScheme).toBeUndefined();
  });
});
