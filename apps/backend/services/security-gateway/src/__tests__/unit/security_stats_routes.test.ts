/**
 * These tests exist because the route was originally written as
 * `withAdminGuard(new Elysia().get(...))` — the guard wrapped an instance whose
 * route was ALREADY registered, and Elysia's .guard() only applies to routes
 * added afterwards. The endpoint therefore served full security telemetry to any
 * authenticated user while looking guarded at the call site.
 *
 * The middleware mock below is a faithful stand-in for the real guard (403 for a
 * non-admin, 401 for an anonymous caller), so if the wrapping order regresses,
 * the non-admin case starts returning 200 and these fail.
 */

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

type TestRole = 'admin' | 'user' | 'anonymous';

const { currentRole, capturedSql, mockCreateAuditEvent } = vi.hoisted(() => ({
  currentRole: { value: 'admin' as TestRole },
  capturedSql: [] as string[],
  mockCreateAuditEvent: vi.fn(),
}));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  AuthenticationError: class AuthenticationError extends Error {},
}));

// Records the generated predicate so the LOGIN_FAILED matching rule is asserted
// on the real SQL rather than on a hand-written copy of it.
vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.raw.join('?');
    capturedSql.push(text);
    return { __sql: text, values };
  },
}));

vi.mock('@uaip/shared-services/drizzle/control', () => ({
  auditEvents: { eventType: 'event_type', outcome: 'outcome', resolved: 'resolved', createdAt: 'created_at' },
  refreshTokens: { revokedAt: 'revoked_at', expiresAt: 'expires_at' },
}));

vi.mock('@uaip/shared-services', () => ({
  getControlDb: () => ({
    select: () => ({
      from: () => ({
        where: async () => [{ value: 7 }],
      }),
    }),
  }),
  AuditService: {
    getInstance: () => ({
      getAuditRepository: () => ({ createAuditEvent: mockCreateAuditEvent }),
    }),
  },
}));

vi.mock('@uaip/middleware', async () => {
  const { t } = await import('elysia');

  // Mirrors requireAdmin(attachAuth(app)): attach identity, then guard on role.
  const withAdminGuard = (app: {
    derive: (fn: () => unknown) => { guard: (opts: unknown) => unknown };
  }) =>
    app
      .derive(() =>
        currentRole.value === 'anonymous'
          ? { user: null }
          : {
              user: {
                id: currentRole.value === 'admin' ? ADMIN_ID : USER_ID,
                email: 'test@example.com',
                role: currentRole.value,
                organizationId: '00000000-0000-0000-0000-000000000001',
              },
            }
      )
      .guard({
        beforeHandle(ctx: { user: { role?: string } | null; set: { status?: number } }) {
          if (!ctx.user) {
            ctx.set.status = 401;
            return { error: 'Authentication required', code: 'AUTH_REQUIRED' };
          }
          if (ctx.user.role !== 'admin') {
            ctx.set.status = 403;
            return { error: 'Admin access required', code: 'ADMIN_REQUIRED' };
          }
        },
      });

  return { t, withAdminGuard };
});

const { registerSecurityStatsRoutes } = await import('../../http/security_stats_elysia.ts');

const call = async (): Promise<{ status: number; body: unknown }> => {
  const app = registerSecurityStatsRoutes();
  const response = await app.handle(
    new Request('http://localhost/api/v1/security/stats', { method: 'GET' })
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

beforeEach(() => {
  currentRole.value = 'admin';
  capturedSql.length = 0;
  mockCreateAuditEvent.mockReset();
  mockCreateAuditEvent.mockResolvedValue(undefined);
});

describe('GET /api/v1/security/stats authorization', () => {
  it('serves an admin', async () => {
    const res = await call();

    expect(res.status).toBe(200);
  });

  it('refuses a non-admin — the admin guard must actually apply', async () => {
    currentRole.value = 'user';

    const res = await call();

    expect(res.status).toBe(403);
  });

  it('refuses an anonymous caller', async () => {
    currentRole.value = 'anonymous';

    const res = await call();

    expect(res.status).toBe(401);
  });

  it('does not write a SENSITIVE_DATA_ACCESSED audit row for a refused caller', async () => {
    currentRole.value = 'user';

    await call();

    expect(mockCreateAuditEvent).not.toHaveBeenCalled();
  });
});

describe('failed-login counting', () => {
  it('matches the stored event type case-insensitively', async () => {
    await call();

    // AuditEventType.LOGIN_FAILED is the lowercase 'login_failed'. An uppercase
    // LIKE '%LOGIN%FAIL%' matches zero rows in Postgres, which is what pinned
    // this counter — and therefore systemStatus — at a permanent healthy zero.
    const loginPredicates = capturedSql.filter((text) => /login/i.test(text));
    expect(loginPredicates.length).toBeGreaterThan(0);
    for (const predicate of loginPredicates) {
      expect(predicate).toMatch(/ILIKE/);
      expect(predicate).not.toMatch(/LIKE '%LOGIN%FAIL%'/);
    }
  });

  it('reports counts from the database rather than a constant', async () => {
    const res = await call();
    const body = res.body as { failedLoginsLastHour: number; activeSessions: number };

    expect(body.failedLoginsLastHour).toBe(7);
    // activeSessions was hardcoded 0; it now comes from a real query.
    expect(body.activeSessions).toBe(7);
  });
});
