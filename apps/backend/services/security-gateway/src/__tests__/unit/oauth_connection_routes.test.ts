const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const AGENT_ID = '33333333-3333-4333-8333-333333333333';
const PROVIDER_ID = '44444444-4444-4444-8444-444444444444';
const CONNECTION_ID = '55555555-5555-4555-8555-555555555555';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    findAgentOAuthConnections: vi.fn(),
    findOAuthConnectionById: vi.fn(),
    deactivateOAuthConnection: vi.fn(),
    generateAuthorizationUrl: vi.fn(),
    getAgentAccessToken: vi.fn(),
    getAvailableProviders: vi.fn(),
    agentOwnerRows: vi.fn(),
  },
}));

vi.mock('@uaip/shared-services', () => ({
  UserService: { getInstance: vi.fn() },
  OAuthService: {
    getInstance: () => ({
      findAgentOAuthConnections: mocks.findAgentOAuthConnections,
      findOAuthConnectionById: mocks.findOAuthConnectionById,
      deactivateOAuthConnection: mocks.deactivateOAuthConnection,
    }),
  },
  getIntelligenceDb: () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: () => mocks.agentOwnerRows() }) }),
    }),
  }),
  agents: { id: 'id', createdBy: 'created_by' },
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock('../../services/oauth_provider_service.js', () => ({
  OAuthProviderService: class {
    generateAuthorizationUrl = mocks.generateAuthorizationUrl;
    getAgentAccessToken = mocks.getAgentAccessToken;
    getAvailableProviders = mocks.getAvailableProviders;
  },
}));

vi.mock('../../services/enhanced_auth_service.js', () => ({
  EnhancedAuthService: class {
    connectOAuthProvider = vi.fn();
  },
}));

vi.mock('../../services/audit_service.js', () => ({
  AuditService: class {
    logEvent = vi.fn();
  },
}));

vi.mock('../../http/auth_elysia.js', () => ({ setAuthCookies: vi.fn() }));

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/utils')>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

vi.mock('@uaip/middleware', async () => {
  const attach = (app: unknown) =>
    (app as { derive: (fn: () => unknown) => unknown }).derive(() => ({
      user: { id: TEST_USER_ID, email: 'test@example.com', role: 'user' },
    }));
  return { withOptionalAuth: attach, withRequiredAuth: attach };
});

const { registerOAuthRoutes } = await import('../../http/oauth_elysia.ts');

const app = registerOAuthRoutes();

const call = async (path: string, init?: { method?: string; body?: unknown }) => {
  const hasBody = init?.body !== undefined;
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: init?.method ?? 'GET',
      ...(hasBody
        ? { body: JSON.stringify(init?.body), headers: { 'content-type': 'application/json' } }
        : {}),
    })
  );
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: response.status, body };
};

const connectionRow = (overrides: Record<string, unknown> = {}) => ({
  id: CONNECTION_ID,
  agentId: TEST_USER_ID,
  providerId: PROVIDER_ID,
  scopes: ['repo'],
  expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  metadata: {},
  ...overrides,
});

beforeEach(() => {
  mocks.findAgentOAuthConnections.mockResolvedValue([connectionRow()]);
  mocks.findOAuthConnectionById.mockResolvedValue(connectionRow());
  mocks.deactivateOAuthConnection.mockResolvedValue(true);
  mocks.generateAuthorizationUrl.mockResolvedValue({ url: 'https://provider/auth', state: 's' });
  mocks.getAgentAccessToken.mockResolvedValue('fresh-token');
  mocks.agentOwnerRows.mockResolvedValue([]);
});

describe('GET /api/v1/oauth/connections', () => {
  it('defaults the scope to the calling user', async () => {
    const res = await call('/api/v1/oauth/connections');

    expect(res.status).toBe(200);
    expect(mocks.findAgentOAuthConnections).toHaveBeenCalledWith(TEST_USER_ID);
    expect((res.body as { connections: unknown[] }).connections).toHaveLength(1);
  });

  it('serialises the connection and derives isExpired', async () => {
    mocks.findAgentOAuthConnections.mockResolvedValue([
      connectionRow({ expiresAt: new Date('2000-01-01T00:00:00.000Z') }),
    ]);

    const res = await call('/api/v1/oauth/connections');

    const [connection] = (res.body as { connections: Record<string, unknown>[] }).connections;
    expect(connection).toMatchObject({ id: CONNECTION_ID, isExpired: true });
    expect(connection.scopes).toEqual(['repo']);
  });

  it('never leaks encrypted tokens in the response', async () => {
    mocks.findAgentOAuthConnections.mockResolvedValue([
      connectionRow({
        accessTokenEncrypted: 'SECRET_ACCESS',
        refreshTokenEncrypted: 'SECRET_REFRESH',
      }),
    ]);

    const res = await call('/api/v1/oauth/connections');

    expect(JSON.stringify(res.body)).not.toContain('SECRET_ACCESS');
    expect(JSON.stringify(res.body)).not.toContain('SECRET_REFRESH');
  });

  it('rejects an agentId the caller does not own', async () => {
    mocks.agentOwnerRows.mockResolvedValue([]);

    const res = await call(`/api/v1/oauth/connections?agentId=${AGENT_ID}`);

    expect(res.status).toBe(403);
    expect(mocks.findAgentOAuthConnections).not.toHaveBeenCalled();
  });

  it('allows an agentId the caller owns', async () => {
    mocks.agentOwnerRows.mockResolvedValue([{ id: AGENT_ID }]);

    const res = await call(`/api/v1/oauth/connections?agentId=${AGENT_ID}`);

    expect(res.status).toBe(200);
    expect(mocks.findAgentOAuthConnections).toHaveBeenCalledWith(AGENT_ID);
  });
});

describe('POST /api/v1/oauth/connections/authorize', () => {
  it('returns the provider authorization url', async () => {
    const res = await call('/api/v1/oauth/connections/authorize', {
      method: 'POST',
      body: { providerId: PROVIDER_ID },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ authorizationUrl: 'https://provider/auth' });
  });

  it('requires a providerId', async () => {
    const res = await call('/api/v1/oauth/connections/authorize', { method: 'POST', body: {} });

    expect(res.status).toBe(400);
    expect(mocks.generateAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('refuses to authorize for an agent the caller does not own', async () => {
    mocks.agentOwnerRows.mockResolvedValue([]);

    const res = await call('/api/v1/oauth/connections/authorize', {
      method: 'POST',
      body: { providerId: PROVIDER_ID, agentId: AGENT_ID },
    });

    expect(res.status).toBe(403);
    expect(mocks.generateAuthorizationUrl).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/oauth/connections/:connectionId', () => {
  it('deletes a connection the caller owns', async () => {
    const res = await call(`/api/v1/oauth/connections/${CONNECTION_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(mocks.deactivateOAuthConnection).toHaveBeenCalledWith(CONNECTION_ID);
  });

  it('404s for a connection that does not exist', async () => {
    mocks.findOAuthConnectionById.mockResolvedValue(null);

    const res = await call(`/api/v1/oauth/connections/${CONNECTION_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(mocks.deactivateOAuthConnection).not.toHaveBeenCalled();
  });

  it("refuses to delete another user's connection", async () => {
    mocks.findOAuthConnectionById.mockResolvedValue(connectionRow({ agentId: OTHER_USER_ID }));
    mocks.agentOwnerRows.mockResolvedValue([]);

    const res = await call(`/api/v1/oauth/connections/${CONNECTION_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(mocks.deactivateOAuthConnection).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid connectionId', async () => {
    const res = await call('/api/v1/oauth/connections/not-a-uuid', { method: 'DELETE' });

    expect(res.status).toBe(400);
    expect(mocks.deactivateOAuthConnection).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/oauth/connections/:connectionId/refresh', () => {
  it('refreshes a connection the caller owns', async () => {
    const res = await call(`/api/v1/oauth/connections/${CONNECTION_ID}/refresh`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(mocks.getAgentAccessToken).toHaveBeenCalledWith(TEST_USER_ID, PROVIDER_ID);
  });

  it('reports a provider failure instead of claiming success', async () => {
    mocks.getAgentAccessToken.mockResolvedValue(null);

    const res = await call(`/api/v1/oauth/connections/${CONNECTION_ID}/refresh`, {
      method: 'POST',
    });

    expect(res.status).toBe(502);
    expect((res.body as { success: boolean }).success).toBe(false);
  });

  it("refuses to refresh another user's connection", async () => {
    mocks.findOAuthConnectionById.mockResolvedValue(connectionRow({ agentId: OTHER_USER_ID }));
    mocks.agentOwnerRows.mockResolvedValue([]);

    const res = await call(`/api/v1/oauth/connections/${CONNECTION_ID}/refresh`, {
      method: 'POST',
    });

    expect(res.status).toBe(404);
    expect(mocks.getAgentAccessToken).not.toHaveBeenCalled();
  });
});
