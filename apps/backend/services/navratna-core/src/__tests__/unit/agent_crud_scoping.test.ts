import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Elysia } from 'elysia';

/**
 * Per-user agent visibility scoping tests.
 *
 * THE ASSIGNMENT ROW IS THE GRANT: non-privileged callers may only see agents
 * for which a user_agent_assignments row exists. Privileged roles ('admin',
 * 'system') keep the unscoped roster. Unassigned agents must be
 * indistinguishable from missing ones (404, never 403) so existence does not
 * leak.
 *
 * The mock user is MUTABLE (hoisted state object captured by the vi.mock
 * factory closures) so individual tests can flip role/id — unlike
 * agent_crud_routes.test.ts whose module-level mock hardcodes role 'admin'.
 *
 * Mocking approach for @uaip/shared-services: importOriginal + targeted
 * overrides. Only the ASYNC repository/guard functions are mocked
 * (findAgentIdsForUser / hasAssignment / canAccessAgent).
 * `isPrivilegedRole` is pure, so the REAL implementation is kept via
 * importOriginal — mocking it would let the tests pass even if the route
 * consulted the wrong role literals.
 */

const authState = vi.hoisted(() => ({
  user: {
    id: 'user-uuid-1234',
    email: 'member@example.com',
    role: 'user',
    organizationId: 'org-uuid-1234',
  },
}));

const accessMocks = vi.hoisted(() => ({
  findAgentIdsForUser: vi.fn(),
  hasAssignment: vi.fn(),
  canAccessAgent: vi.fn(),
  assignMany: vi.fn(),
}));

vi.mock('@uaip/middleware', () => {
  const passthrough = (app: Elysia) => app.derive(() => ({ user: authState.user }));
  return {
    withRequiredAuth: passthrough,
    withOptionalAuth: passthrough,
    withAdminGuard: passthrough,
    withNginxAuth: passthrough,
    attachAuth: passthrough,
    getNginxUser: () => authState.user,
    requireAuth: (app: Elysia) => app,
  };
});

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  isRecord: (val: unknown) => typeof val === 'object' && val !== null && !Array.isArray(val),
  NotFoundError: class NotFoundError extends Error {
    constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
  },
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) { super(msg); this.name = 'ValidationError'; }
  },
  ApiError: class ApiError extends Error {
    constructor(public statusCode: number, msg: string, public code?: string) { super(msg); }
  },
}));

vi.mock('@uaip/shared-services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/shared-services')>();
  class MockUserAgentAssignmentRepository {
    findAgentIdsForUser = accessMocks.findAgentIdsForUser;
    hasAssignment = accessMocks.hasAssignment;
    assignMany = accessMocks.assignMany;
  }
  return {
    ...actual,
    canAccessAgent: accessMocks.canAccessAgent,
    UserAgentAssignmentRepository: MockUserAgentAssignmentRepository,
  };
});

vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  getIntelligenceDb: vi.fn(),
  eq: vi.fn((col, val) => ({ col, val, op: 'eq' })),
  ne: vi.fn((col, val) => ({ col, val, op: 'ne' })),
  or: vi.fn((...args) => ({ args, op: 'or' })),
  ilike: vi.fn((col, val) => ({ col, val, op: 'ilike' })),
  and: vi.fn((...args) => ({ args, op: 'and' })),
  inArray: vi.fn((col, vals) => ({ col, vals, op: 'inArray' })),
  sql: vi.fn(),
  count: vi.fn(() => ({ name: 'count' })),
  asc: vi.fn((col) => col),
}));

vi.mock('@uaip/shared-services/drizzle/intelligence', () => ({
  agents: {
    id: 'id',
    name: 'name',
    isActive: 'isActive',
    createdAt: 'createdAt',
    organizationId: 'organizationId',
    assignedMCPTools: 'assignedMCPTools',
    mcpToolSettings: 'mcpToolSettings',
  },
}));

import { registerAgentCrudRoutes } from '@uaip/agent-intelligence-core';
import { ADMIN_ORG_ID, ONBOARDING_GUIDE_AGENT_ID } from '@uaip/shared-services';
import { getIntelligenceDb, ilike, inArray, ne } from '@uaip/shared-services/drizzle/clients';

function buildApp(agentService: Record<string, unknown>) {
  return new Elysia().use(registerAgentCrudRoutes(agentService as never));
}

function authHeader() {
  return { Authorization: 'Bearer test-token' };
}

function resetCallerToUnprivilegedUser() {
  authState.user = {
    id: 'user-uuid-1234',
    email: 'member@example.com',
    role: 'user',
    organizationId: 'org-uuid-1234',
  };
}

function actAsAdmin() {
  authState.user = { ...authState.user, role: 'admin' };
}

/** Mocks the two-query agent list flow: count() then paged select. */
function mockAgentListDb(rows: Record<string, unknown>[], total: number) {
  vi.mocked(getIntelligenceDb).mockReturnValue({
    select: vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total }]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(rows),
              }),
            }),
          }),
        }),
      }),
  } as never);
}

/** Mocks the scoped (non-privileged) mcp-tools select: select().from().where(). */
function mockMcpToolsDb(rows: Record<string, unknown>[]) {
  vi.mocked(getIntelligenceDb).mockReturnValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
    }),
  } as never);
}

function stubAgentService(overrides: Record<string, unknown> = {}) {
  return {
    getAgent: vi.fn(),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
    ...overrides,
  };
}

describe('Agent CRUD assignment scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallerToUnprivilegedUser();
  });

  describe('GET /api/v1/agents', () => {
    it('returns only agents assigned to the caller', async () => {
      accessMocks.findAgentIdsForUser.mockResolvedValue(['a1', 'a3']);
      const rows = [
        { id: 'a1', name: 'Alpha', isActive: true },
        { id: 'a3', name: 'Gamma', isActive: true },
      ];
      mockAgentListDb(rows, 2);

      const app = buildApp(stubAgentService());
      const res = await app.handle(new Request('http://localhost/api/v1/agents', { headers: authHeader() }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.map((agent: { id: string }) => agent.id)).toEqual(['a1', 'a3']);
      expect(accessMocks.findAgentIdsForUser).toHaveBeenCalledWith('user-uuid-1234', 'org-uuid-1234');
      expect(inArray).toHaveBeenCalledWith('id', ['a1', 'a3']);
    });

    it('returns an empty list without querying agents when the caller has no assignments', async () => {
      accessMocks.findAgentIdsForUser.mockResolvedValue([]);

      const app = buildApp(stubAgentService());
      const res = await app.handle(new Request('http://localhost/api/v1/agents', { headers: authHeader() }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
      expect(getIntelligenceDb).not.toHaveBeenCalled();
    });

    it('returns the full roster for an admin', async () => {
      actAsAdmin();
      const rows = [
        { id: 'a1', name: 'Alpha', isActive: true },
        { id: 'a2', name: 'Beta', isActive: true },
        { id: 'a3', name: 'Gamma', isActive: true },
      ];
      mockAgentListDb(rows, 3);

      const app = buildApp(stubAgentService());
      const res = await app.handle(new Request('http://localhost/api/v1/agents', { headers: authHeader() }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(3);
      expect(accessMocks.findAgentIdsForUser).not.toHaveBeenCalled();
      expect(inArray).not.toHaveBeenCalled();
    });

    it.each([
      ['an admin', actAsAdmin],
      ['a member', resetCallerToUnprivilegedUser],
    ])('excludes the onboarding guide from the listing for %s', async (_label, becomeCaller) => {
      becomeCaller();
      accessMocks.findAgentIdsForUser.mockResolvedValue(['a1']);
      mockAgentListDb([{ id: 'a1', name: 'Alpha', isActive: true }], 1);

      const app = buildApp(stubAgentService());
      await app.handle(new Request('http://localhost/api/v1/agents', { headers: authHeader() }));

      // AgentSchema returns systemPrompt, which holds the interview protocol
      // and its anti-injection instructions — privileged callers included.
      expect(ne).toHaveBeenCalledWith('id', ONBOARDING_GUIDE_AGENT_ID);
    });

    it('preserves the search filter alongside the assignment filter', async () => {
      accessMocks.findAgentIdsForUser.mockResolvedValue(['a1']);
      mockAgentListDb([{ id: 'a1', name: 'Alpha', isActive: true }], 1);

      const app = buildApp(stubAgentService());
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents?search=Alpha', { headers: authHeader() })
      );

      expect(res.status).toBe(200);
      expect(ilike).toHaveBeenCalledWith('name', '%Alpha%');
      expect(inArray).toHaveBeenCalledWith('id', ['a1']);
    });
  });

  describe('GET /api/v1/agents/catalog', () => {
    it('returns 403 for a non-privileged caller', async () => {
      const agentService = stubAgentService({ getAgent: vi.fn().mockResolvedValue(null) });

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/catalog', { headers: authHeader() })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      // AgentErrorSchema declares only error/message, so Elysia's response
      // normalization strips `success` from error bodies — assert error only,
      // matching agent_crud_routes.test.ts convention.
      expect(body.error).toBe('Forbidden');
    });

    it('returns the full roster for an admin', async () => {
      actAsAdmin();
      const rows = [
        { id: 'a1', name: 'Alpha', isActive: true },
        { id: 'a2', name: 'Beta', isActive: true },
      ];
      mockAgentListDb(rows, 2);

      const app = buildApp(stubAgentService());
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/catalog', { headers: authHeader() })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });

    it('is matched as a static route, not as /:agentId', async () => {
      actAsAdmin();
      mockAgentListDb([], 0);
      const agentService = stubAgentService();

      const app = buildApp(agentService);
      await app.handle(
        new Request('http://localhost/api/v1/agents/catalog', { headers: authHeader() })
      );

      expect(agentService.getAgent).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/agents/:agentId', () => {
    it('returns 404 when the caller has no assignment', async () => {
      accessMocks.canAccessAgent.mockResolvedValue(false);
      const agentService = stubAgentService({
        getAgent: vi.fn().mockResolvedValue({ id: 'a9', name: 'Hidden', isActive: true }),
      });

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/a9', { headers: authHeader() })
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Agent not found');
    });

    it('returns the agent when assigned', async () => {
      accessMocks.canAccessAgent.mockResolvedValue(true);
      const agentService = stubAgentService({
        getAgent: vi.fn().mockResolvedValue({ id: 'a1', name: 'Alpha', isActive: true }),
      });

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/a1', { headers: authHeader() })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe('a1');
      expect(accessMocks.canAccessAgent).toHaveBeenCalledWith(
        { userId: 'user-uuid-1234', organizationId: 'org-uuid-1234', role: 'user' },
        'a1'
      );
    });
  });

  describe('POST /api/v1/agents', () => {
    it('grants the creator an assignment so the agent is visible to its own creator', async () => {
      const created = { id: 'new-agent-1', name: 'Mine', isActive: true };
      const agentService = stubAgentService({
        createAgent: vi.fn().mockResolvedValue(created),
      });

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents', {
          method: 'POST',
          headers: { ...authHeader(), 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Mine' }),
        })
      );

      expect(res.status).toBe(201);
      expect(accessMocks.assignMany).toHaveBeenCalledWith({
        userId: 'user-uuid-1234',
        organizationId: 'org-uuid-1234',
        agentIds: ['new-agent-1'],
        assignedBy: 'user-uuid-1234',
        source: 'creator',
      });
    });

    it('does not report success for an agent its creator could never reach', async () => {
      accessMocks.assignMany.mockRejectedValue(new Error('control plane down'));
      const deleteAgent = vi.fn().mockResolvedValue(undefined);
      const agentService = stubAgentService({
        createAgent: vi.fn().mockResolvedValue({ id: 'new-agent-2', name: 'Mine2' }),
        deleteAgent,
      });

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents', {
          method: 'POST',
          headers: { ...authHeader(), 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Mine2' }),
        })
      );

      // Without the grant row the agent is an unreachable orphan: GET / filters
      // it out and DELETE /:id checks access BEFORE ownership, so it answers
      // 404 to the very user who created it. Reporting 201 strands it forever.
      expect(res.status).toBe(500);
      expect(deleteAgent).toHaveBeenCalledWith('new-agent-2');
    });

    it('reports the failure even when the compensating delete also fails', async () => {
      accessMocks.assignMany.mockRejectedValue(new Error('control plane down'));
      const agentService = stubAgentService({
        createAgent: vi.fn().mockResolvedValue({ id: 'new-agent-3', name: 'Mine3' }),
        deleteAgent: vi.fn().mockRejectedValue(new Error('intelligence plane down')),
      });

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents', {
          method: 'POST',
          headers: { ...authHeader(), 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Mine3' }),
        })
      );

      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/v1/agents/:agentId', () => {
    it('returns 404 for an unassigned agent', async () => {
      accessMocks.canAccessAgent.mockResolvedValue(false);
      const agentService = stubAgentService({
        getAgent: vi.fn().mockResolvedValue({ id: 'a9', name: 'Hidden', createdBy: 'user-uuid-1234' }),
      });

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/a9', {
          method: 'PUT',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Renamed' }),
        })
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Agent not found');
      expect(agentService.updateAgent).not.toHaveBeenCalled();
    });

    it('still returns 403 when the caller is assigned but is not the owner', async () => {
      accessMocks.canAccessAgent.mockResolvedValue(true);
      const agentService = stubAgentService({
        getAgent: vi.fn().mockResolvedValue({ id: 'a1', name: 'Alpha', createdBy: 'someone-else' }),
      });

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/a1', {
          method: 'PUT',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Renamed' }),
        })
      );

      expect(res.status).toBe(403);
      expect(agentService.updateAgent).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/v1/agents/:agentId', () => {
    it('returns 404 for an unassigned agent', async () => {
      accessMocks.canAccessAgent.mockResolvedValue(false);
      const agentService = stubAgentService({
        getAgent: vi.fn().mockResolvedValue({ id: 'a9', name: 'Hidden', createdBy: 'user-uuid-1234' }),
      });

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/a9', {
          method: 'DELETE',
          headers: authHeader(),
        })
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Agent not found');
      expect(agentService.deleteAgent).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/agents/mcp-tools', () => {
    it('returns only tools from assigned agents', async () => {
      accessMocks.findAgentIdsForUser.mockResolvedValue(['a1']);
      mockMcpToolsDb([
        { assigned: [{ toolId: 't1', toolName: 'Tool One', serverName: 'srv' }] },
      ]);

      const app = buildApp(stubAgentService());
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/mcp-tools', { headers: authHeader() })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.tools).toEqual([{ toolId: 't1', toolName: 'Tool One', serverName: 'srv' }]);
      expect(inArray).toHaveBeenCalledWith('id', ['a1']);
    });

    it('returns an empty list when the caller has no assignments', async () => {
      accessMocks.findAgentIdsForUser.mockResolvedValue([]);

      const app = buildApp(stubAgentService());
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/mcp-tools', { headers: authHeader() })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tools).toEqual([]);
      expect(getIntelligenceDb).not.toHaveBeenCalled();
    });
  });

  describe('per-agent MCP tool routes', () => {
    const AGENT = 'aaaaaaa1-0000-4000-8000-000000000005';

    const cases: [string, string, unknown][] = [
      ['GET', `/api/v1/agents/${AGENT}/mcp-tools`, undefined],
      ['POST', `/api/v1/agents/${AGENT}/mcp-tools`, { toolsToAssign: [] }],
      ['PUT', `/api/v1/agents/${AGENT}/mcp-tools/t1`, { enabled: false }],
      ['DELETE', `/api/v1/agents/${AGENT}/mcp-tools/t1`, undefined],
    ];

    for (const [method, path, body] of cases) {
      it(`${method} is denied by the grant, not by org equality`, async () => {
        accessMocks.canAccessAgent.mockResolvedValue(false);
        mockMcpToolsDb([{ assigned: [], settings: {} }]);

        const app = buildApp(stubAgentService());
        const res = await app.handle(
          new Request(`http://localhost${path}`, {
            method,
            headers: { ...authHeader(), 'content-type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
          })
        );

        expect(res.status).toBe(404);
        expect(accessMocks.canAccessAgent).toHaveBeenCalledWith(
          { userId: 'user-uuid-1234', organizationId: 'org-uuid-1234', role: 'user' },
          AGENT
        );
        expect(getIntelligenceDb).not.toHaveBeenCalled();
      });
    }

    it('does not exclude a granted platform agent by org equality', async () => {
      accessMocks.canAccessAgent.mockResolvedValue(true);
      const where = vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ assigned: [], settings: {} }]),
      });
      vi.mocked(getIntelligenceDb).mockReturnValue({
        select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where }) }),
      } as never);

      const app = buildApp(stubAgentService());
      await app.handle(
        new Request(`http://localhost/api/v1/agents/${AGENT}/mcp-tools`, {
          headers: authHeader(),
        })
      );

      // Every seeded agent lives in ADMIN_ORG_ID and is offerable to every
      // tenant, so a plain org-equality predicate 404s an agent the caller was
      // legitimately granted. The grant already authorized this call.
      const predicate = JSON.stringify(where.mock.calls[0]?.[0] ?? {});
      expect(predicate).toContain(ADMIN_ORG_ID);
    });

    it('allows the read once a grant exists', async () => {
      accessMocks.canAccessAgent.mockResolvedValue(true);
      // Single-agent read ends in .limit(1), unlike the aggregate mcp-tools query.
      vi.mocked(getIntelligenceDb).mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ assigned: [{ toolId: 't1' }], settings: {} }]),
            }),
          }),
        }),
      } as never);

      const app = buildApp(stubAgentService());
      const res = await app.handle(
        new Request(`http://localhost/api/v1/agents/${AGENT}/mcp-tools`, {
          headers: authHeader(),
        })
      );

      expect(res.status).toBe(200);
      const parsed = await res.json();
      expect(parsed.assignedMCPTools).toEqual([{ toolId: 't1' }]);
    });
  });
});
