import { IntegrationConnectionStatus } from '@uaip/types';
import {
  integrationConnections,
  integrationProviders,
  projects,
  projectMembers,
} from '../../database/drizzle/schemas/control_schema';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    rowsByTable: new Map<unknown, unknown[]>(),
    joinRows: [] as unknown[],
    inserted: [] as Record<string, unknown>[],
    insertReturns: [] as unknown[],
    conflictTargets: [] as unknown[],
    updates: [] as Record<string, unknown>[],
    deleteReturns: [] as unknown[],
    deletePredicateColumns: [] as string[],
    encrypt: vi.fn(),
  },
}));

/**
 * Drizzle nests the referenced columns inside a condition's `queryChunks`; walking
 * them lets a test assert the predicate itself. A mock that ignores the WHERE
 * would let a dropped ownership condition pass unnoticed.
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
      // `from(table)` is itself awaited when a query has no WHERE (listProviders),
      // so the builder must be thenable as well as chainable.
      from: (table: unknown) => ({
        where: () => ({ limit: async () => mocks.rowsByTable.get(table) ?? [] }),
        limit: async () => mocks.rowsByTable.get(table) ?? [],
        innerJoin: () => ({
          where: () => ({
            limit: async () => mocks.joinRows,
            then: (resolve: (rows: unknown[]) => unknown) => resolve(mocks.joinRows),
          }),
        }),
        then: (resolve: (rows: unknown[]) => unknown) =>
          resolve(mocks.rowsByTable.get(table) ?? []),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        mocks.inserted.push(values);
        return {
          returning: async () => mocks.insertReturns,
          onConflictDoUpdate: (config: { target: unknown; set: Record<string, unknown> }) => {
            mocks.conflictTargets.push(config.target);
            return { returning: async () => mocks.insertReturns };
          },
        };
      },
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          mocks.updates.push(patch);
        },
      }),
    }),
    delete: () => ({
      where: (condition: unknown) => {
        mocks.deletePredicateColumns = collectPredicateColumns(condition);
        return { returning: async () => mocks.deleteReturns };
      },
    }),
  }),
}));

vi.mock('../../services/oauth_token_resolver', () => ({
  encryptOAuthSecret: (value: string) => mocks.encrypt(value),
}));

const { IntegrationConnectionService, IntegrationError } = await import(
  '../../services/integration_connection_service'
);

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999';
const PROVIDER_ID = '22222222-2222-4222-8222-222222222222';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';
const PROJECT_ID = '44444444-4444-4444-8444-444444444444';
const AGENT_ID = '55555555-5555-4555-8555-555555555555';

const service = () => new IntegrationConnectionService();

const enc = (value: string) => `enc:${Buffer.from(value).toString('base64')}`;

const expectCode = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toThrow(IntegrationError);
  await promise.catch((error: unknown) => {
    expect((error as { code: string }).code).toBe(code);
  });
};

const timestamps = { createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') };

const grantProjectAccess = () => {
  mocks.rowsByTable.set(projects, [{ id: PROJECT_ID }]);
};

const denyProjectAccess = () => {
  mocks.rowsByTable.set(projects, []);
  mocks.rowsByTable.set(projectMembers, []);
};

beforeEach(() => {
  mocks.rowsByTable.clear();
  mocks.joinRows = [];
  mocks.inserted.length = 0;
  mocks.insertReturns = [];
  mocks.conflictTargets.length = 0;
  mocks.updates.length = 0;
  mocks.deleteReturns = [];
  mocks.deletePredicateColumns = [];
  // Must not echo the plaintext: an echoing stub would make the "token never
  // reaches the row" assertion unfalsifiable and hide a real leak.
  mocks.encrypt
    .mockReset()
    .mockImplementation((value: string) => `enc:${Buffer.from(value).toString('base64')}`);
  grantProjectAccess();
});

describe('listProviders', () => {
  it('marks a provider without OAuth credentials as unconfigured rather than hiding it', async () => {
    mocks.rowsByTable.set(integrationProviders, [
      {
        id: PROVIDER_ID,
        key: 'github',
        displayName: 'GitHub',
        enabled: true,
        oauthProviderId: 'oauth-1',
        metadata: { description: 'GitHub repos' },
      },
      {
        id: 'p2',
        key: 'notion',
        displayName: 'Notion',
        enabled: true,
        oauthProviderId: null,
        metadata: null,
      },
    ]);

    const providers = await service().listProviders();

    expect(providers).toHaveLength(2);
    expect(providers[0]).toMatchObject({ key: 'github', configured: true });
    expect(providers[1]).toMatchObject({ key: 'notion', configured: false });
  });
});

describe('createConnection', () => {
  beforeEach(() => {
    mocks.rowsByTable.set(integrationProviders, [{ id: PROVIDER_ID, key: 'github' }]);
    mocks.insertReturns = [
      {
        id: CONNECTION_ID,
        providerId: PROVIDER_ID,
        ownerUserId: OWNER_ID,
        authKind: 'oauth2',
        scopes: ['repo'],
        status: IntegrationConnectionStatus.ACTIVE,
        expiresAt: null,
        ...timestamps,
      },
    ];
  });

  it('encrypts the access token rather than storing it in the clear', async () => {
    await service().createConnection({
      providerId: PROVIDER_ID,
      ownerUserId: OWNER_ID,
      accessToken: 'super-secret',
    });

    const row = mocks.inserted[0];
    expect(row.accessTokenEncrypted).toBe(enc('super-secret'));
    expect(JSON.stringify(row)).not.toContain('super-secret');
  });

  it('encrypts the refresh token when one is supplied', async () => {
    await service().createConnection({
      providerId: PROVIDER_ID,
      ownerUserId: OWNER_ID,
      accessToken: 'a',
      refreshToken: 'r',
    });

    expect(mocks.inserted[0].refreshTokenEncrypted).toBe(enc('r'));
  });

  it('stores no refresh token when none is supplied', async () => {
    await service().createConnection({
      providerId: PROVIDER_ID,
      ownerUserId: OWNER_ID,
      accessToken: 'a',
    });

    expect(mocks.inserted[0].refreshTokenEncrypted).toBeNull();
  });

  it('owns the connection to the calling user', async () => {
    await service().createConnection({
      providerId: PROVIDER_ID,
      ownerUserId: OWNER_ID,
      accessToken: 'a',
    });

    expect(mocks.inserted[0].ownerUserId).toBe(OWNER_ID);
  });

  it('starts active', async () => {
    await service().createConnection({
      providerId: PROVIDER_ID,
      ownerUserId: OWNER_ID,
      accessToken: 'a',
    });

    expect(mocks.inserted[0].status).toBe(IntegrationConnectionStatus.ACTIVE);
  });

  it('refuses an unknown provider', async () => {
    mocks.rowsByTable.set(integrationProviders, []);

    await expectCode(
      service().createConnection({
        providerId: PROVIDER_ID,
        ownerUserId: OWNER_ID,
        accessToken: 'a',
      }),
      'provider_not_found'
    );
  });

  it('never returns the stored token in the summary', async () => {
    const connection = await service().createConnection({
      providerId: PROVIDER_ID,
      ownerUserId: OWNER_ID,
      accessToken: 'super-secret',
    });

    expect(JSON.stringify(connection)).not.toContain('super-secret');
    expect(JSON.stringify(connection)).not.toContain(enc('super-secret'));
  });
});

describe('rotateConnectionToken', () => {
  it('bumps the token version so cached sessions holding the old token are invalidated', async () => {
    mocks.rowsByTable.set(integrationConnections, [{ id: CONNECTION_ID, tokenVersion: 4 }]);

    await service().rotateConnectionToken(CONNECTION_ID, OWNER_ID, 'new-token');

    expect(mocks.updates[0].tokenVersion).toBe(5);
    expect(mocks.updates[0].accessTokenEncrypted).toBe(enc('new-token'));
  });

  it('reactivates a connection that had expired', async () => {
    mocks.rowsByTable.set(integrationConnections, [{ id: CONNECTION_ID, tokenVersion: 1 }]);

    await service().rotateConnectionToken(CONNECTION_ID, OWNER_ID, 'new-token');

    expect(mocks.updates[0].status).toBe(IntegrationConnectionStatus.ACTIVE);
  });

  it("refuses to rotate another user's connection", async () => {
    mocks.rowsByTable.set(integrationConnections, []);

    await expectCode(
      service().rotateConnectionToken(CONNECTION_ID, OTHER_USER_ID, 'new-token'),
      'connection_not_found'
    );
    expect(mocks.updates).toHaveLength(0);
  });
});

describe('revokeConnection', () => {
  it('clears both stored tokens so a revoked connection cannot be used', async () => {
    mocks.rowsByTable.set(integrationConnections, [{ id: CONNECTION_ID }]);

    await service().revokeConnection(CONNECTION_ID, OWNER_ID);

    expect(mocks.updates[0]).toMatchObject({
      status: IntegrationConnectionStatus.REVOKED,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
    });
  });

  it("refuses to revoke another user's connection", async () => {
    mocks.rowsByTable.set(integrationConnections, []);

    await expectCode(
      service().revokeConnection(CONNECTION_ID, OTHER_USER_ID),
      'connection_not_found'
    );
    expect(mocks.updates).toHaveLength(0);
  });
});

describe('linkConnection', () => {
  const connectionRow = (overrides: Record<string, unknown> = {}) => ({
    id: CONNECTION_ID,
    providerId: PROVIDER_ID,
    providerKey: 'github',
    ownerUserId: OWNER_ID,
    ...overrides,
  });

  const bindingRow = {
    projectId: PROJECT_ID,
    agentId: AGENT_ID,
    providerId: PROVIDER_ID,
    connectionId: CONNECTION_ID,
    enabled: true,
    createdByUserId: OWNER_ID,
    ...timestamps,
  };

  it('binds the connection to the project and agent', async () => {
    mocks.joinRows = [connectionRow()];
    mocks.insertReturns = [bindingRow];

    const binding = await service().linkConnection({
      projectId: PROJECT_ID,
      agentId: AGENT_ID,
      connectionId: CONNECTION_ID,
      actorUserId: OWNER_ID,
    });

    expect(binding).toMatchObject({
      projectId: PROJECT_ID,
      agentId: AGENT_ID,
      connectionId: CONNECTION_ID,
      providerKey: 'github',
    });
  });

  it('derives the provider from the connection rather than trusting the caller', async () => {
    mocks.joinRows = [connectionRow({ providerId: 'provider-from-connection' })];
    mocks.insertReturns = [bindingRow];

    await service().linkConnection({
      projectId: PROJECT_ID,
      agentId: AGENT_ID,
      connectionId: CONNECTION_ID,
      actorUserId: OWNER_ID,
    });

    expect(mocks.inserted[0].providerId).toBe('provider-from-connection');
  });

  it("refuses to link another user's credential", async () => {
    mocks.joinRows = [connectionRow({ ownerUserId: OTHER_USER_ID })];

    await expectCode(
      service().linkConnection({
        projectId: PROJECT_ID,
        agentId: AGENT_ID,
        connectionId: CONNECTION_ID,
        actorUserId: OWNER_ID,
      }),
      'connection_not_found'
    );
    expect(mocks.inserted).toHaveLength(0);
  });

  it('refuses an actor who cannot access the project', async () => {
    denyProjectAccess();
    mocks.joinRows = [connectionRow()];

    await expectCode(
      service().linkConnection({
        projectId: PROJECT_ID,
        agentId: AGENT_ID,
        connectionId: CONNECTION_ID,
        actorUserId: OWNER_ID,
      }),
      'forbidden'
    );
    expect(mocks.inserted).toHaveLength(0);
  });

  it('accepts a project member who is not the owner', async () => {
    mocks.rowsByTable.set(projects, []);
    mocks.rowsByTable.set(projectMembers, [{ id: 'membership' }]);
    mocks.joinRows = [connectionRow()];
    mocks.insertReturns = [bindingRow];

    await expect(
      service().linkConnection({
        projectId: PROJECT_ID,
        agentId: AGENT_ID,
        connectionId: CONNECTION_ID,
        actorUserId: OWNER_ID,
      })
    ).resolves.toMatchObject({ connectionId: CONNECTION_ID });
  });

  it('replaces an existing binding instead of duplicating it', async () => {
    mocks.joinRows = [connectionRow()];
    mocks.insertReturns = [bindingRow];

    await service().linkConnection({
      projectId: PROJECT_ID,
      agentId: AGENT_ID,
      connectionId: CONNECTION_ID,
      actorUserId: OWNER_ID,
    });

    expect(mocks.conflictTargets).toHaveLength(1);
    const target = mocks.conflictTargets[0] as { name: string }[];
    expect(target.map((column) => column.name)).toEqual([
      'project_id',
      'agent_id',
      'provider_id',
    ]);
  });

  it('records who created the binding', async () => {
    mocks.joinRows = [connectionRow()];
    mocks.insertReturns = [bindingRow];

    await service().linkConnection({
      projectId: PROJECT_ID,
      agentId: AGENT_ID,
      connectionId: CONNECTION_ID,
      actorUserId: OWNER_ID,
    });

    expect(mocks.inserted[0].createdByUserId).toBe(OWNER_ID);
  });

  it('can create a binding in a disabled state', async () => {
    mocks.joinRows = [connectionRow()];
    mocks.insertReturns = [{ ...bindingRow, enabled: false }];

    await service().linkConnection({
      projectId: PROJECT_ID,
      agentId: AGENT_ID,
      connectionId: CONNECTION_ID,
      actorUserId: OWNER_ID,
      enabled: false,
    });

    expect(mocks.inserted[0].enabled).toBe(false);
  });

  it('refuses a connection that does not exist', async () => {
    mocks.joinRows = [];

    await expectCode(
      service().linkConnection({
        projectId: PROJECT_ID,
        agentId: AGENT_ID,
        connectionId: CONNECTION_ID,
        actorUserId: OWNER_ID,
      }),
      'connection_not_found'
    );
  });
});

describe('unlinkConnection', () => {
  it('removes the binding for exactly that project, agent and provider', async () => {
    mocks.deleteReturns = [{ connectionId: CONNECTION_ID }];

    await service().unlinkConnection(PROJECT_ID, AGENT_ID, PROVIDER_ID, OWNER_ID);

    expect(mocks.deletePredicateColumns).toEqual(
      expect.arrayContaining(['project_id', 'agent_id', 'provider_id'])
    );
  });

  it('refuses an actor who cannot access the project', async () => {
    denyProjectAccess();

    await expectCode(
      service().unlinkConnection(PROJECT_ID, AGENT_ID, PROVIDER_ID, OWNER_ID),
      'forbidden'
    );
    expect(mocks.deleteReturns).toHaveLength(0);
  });

  it('reports a missing binding rather than silently succeeding', async () => {
    mocks.deleteReturns = [];

    await expectCode(
      service().unlinkConnection(PROJECT_ID, AGENT_ID, PROVIDER_ID, OWNER_ID),
      'binding_not_found'
    );
  });
});

describe('listBindings', () => {
  it('refuses an actor who cannot access the project', async () => {
    denyProjectAccess();

    await expectCode(service().listBindings(PROJECT_ID, OWNER_ID), 'forbidden');
  });

  it('returns the project bindings for a permitted actor', async () => {
    mocks.joinRows = [
      {
        projectId: PROJECT_ID,
        agentId: AGENT_ID,
        providerId: PROVIDER_ID,
        providerKey: 'github',
        connectionId: CONNECTION_ID,
        enabled: true,
        createdByUserId: OWNER_ID,
        ...timestamps,
      },
    ];

    const bindings = await service().listBindings(PROJECT_ID, OWNER_ID);

    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({ providerKey: 'github', enabled: true });
  });
});
