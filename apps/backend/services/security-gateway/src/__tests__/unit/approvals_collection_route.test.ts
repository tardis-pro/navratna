import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * What this guards: `GET /api/v1/approvals` answered 404 on the live gateway, and
 * the obvious reading of that was "the approvals module is not mounted". It was
 * mounted the whole time. The group declared only sub-paths — `/workflows`,
 * `/pending`, `/stats`, `/:workflowId`, `/:workflowId/decisions`,
 * `/:workflowId/cancel` — so the bare collection matched no route at all, and
 * `/:workflowId` did not catch it either because an empty segment is not a
 * parameter.
 *
 * Every client addresses the collection: the frontend's `approvalsAPI.list()` is
 * `approvals.get()`, and the platform's merge gate polls the same path. A route
 * table that is only reachable at a name nobody uses is the failure mode here,
 * so the collection root is asserted directly, alongside the alias it shares an
 * implementation with.
 */

const APPROVER_ID = '11111111-1111-4111-8111-111111111111';

const { getUserWorkflows, currentUser } = vi.hoisted(() => ({
  getUserWorkflows: vi.fn(async () => [
    {
      id: 'wf-0123456789',
      status: 'pending',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      metadata: { operationType: 'merge', securityLevel: 'high' },
    },
  ]),
  currentUser: {
    value: { id: '11111111-1111-4111-8111-111111111111', role: 'user' } as {
      id: string;
      role: string;
    },
  },
}));

vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
  process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt';
});

vi.mock('../../services/approval_event_bridge.js', () => ({
  getSharedApprovalWorkflowService: async () => ({
    getUserWorkflows,
    getWorkflowStatus: async () => ({ workflow: {}, pendingApprovers: [] }),
    processApprovalDecision: vi.fn(),
  }),
}));

vi.mock('@uaip/shared-services', () => ({
  SecurityService: {
    getInstance: () => ({
      getApprovalWorkflowRepository: () => ({ claimApprovalCode: vi.fn() }),
    }),
  },
}));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  AuthenticationError: class AuthenticationError extends Error {},
}));

vi.mock('@uaip/middleware', () => ({
  withRequiredAuth: (app: { derive: (fn: () => unknown) => unknown }) =>
    app.derive(() => ({
      user: {
        id: currentUser.value.id,
        email: 'approver@example.com',
        role: currentUser.value.role,
        permissions: [],
        sessionId: 'session-1',
      },
    })),
  withOperatorGuard: (app: unknown) => app,
}));

vi.mock('../../services/audit_service.js', () => ({
  AuditService: class AuditService {
    logEvent = vi.fn(async () => undefined);
  },
}));

const { registerApprovalRoutes } = await import('../../http/approval_elysia.ts');

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const response = await registerApprovalRoutes().handle(
    new Request(`http://localhost${path}`)
  );
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: response.status, body };
}

describe('GET /api/v1/approvals — the collection root', () => {
  beforeEach(() => {
    getUserWorkflows.mockClear();
    currentUser.value = { id: APPROVER_ID, role: 'user' };
  });

  it('answers instead of 404ing', async () => {
    const { status, body } = await get('/api/v1/approvals');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: { pagination: { total: 1, offset: 0 } },
    });
  });

  it('scopes a non-admin to their own workflows', async () => {
    await get('/api/v1/approvals');
    expect(getUserWorkflows).toHaveBeenCalledWith(APPROVER_ID, undefined);
  });

  it('lists pending approvals when asked for them', async () => {
    await get('/api/v1/approvals?status=pending');
    expect(getUserWorkflows).toHaveBeenCalledWith(APPROVER_ID, 'pending');
  });

  it('lets an admin see every workflow', async () => {
    currentUser.value = { id: APPROVER_ID, role: 'admin' };
    await get('/api/v1/approvals');
    expect(getUserWorkflows).toHaveBeenCalledWith('', undefined);
  });

  it('rejects an unparseable query with 400, not a 500', async () => {
    const { status } = await get('/api/v1/approvals?limit=nonsense');
    expect(status).toBe(400);
  });

  it('serves /workflows from the same implementation, so the two cannot drift', async () => {
    const root = await get('/api/v1/approvals');
    const alias = await get('/api/v1/approvals/workflows');
    expect(alias.status).toBe(root.status);
    expect(alias.body).toEqual(root.body);
  });

  it('still exposes the decision endpoint that approves or rejects one', async () => {
    // Deciding is NOT re-implemented on the collection: it lives at
    // POST /:workflowId/decisions, which authorises first and then takes the
    // atomic claim. Asserted here so a future "quick approve" shortcut on the
    // collection is a visible change rather than a silent second mechanism.
    const routes = registerApprovalRoutes().routes.map((r) => `${r.method} ${r.path}`);
    expect(routes).toContain('POST /api/v1/approvals/:workflowId/decisions');
    // Elysia stores the collection root with its trailing slash and matches the
    // bare path onto it; accept either spelling so this asserts reachability
    // rather than a router implementation detail.
    expect(
      routes.some((r) => r === 'GET /api/v1/approvals' || r === 'GET /api/v1/approvals/')
    ).toBe(true);
  });
});
