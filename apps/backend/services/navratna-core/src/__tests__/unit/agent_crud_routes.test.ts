import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Elysia } from 'elysia';

vi.mock('@uaip/middleware', () => {
  const mockUser = { id: 'user-uuid-1234', email: 'test@example.com', role: 'admin' };
  const passthrough = (app: Elysia) => app.derive(() => ({ user: mockUser }));
  return {
    withRequiredAuth: passthrough,
    withOptionalAuth: passthrough,
    withAdminGuard: passthrough,
    attachAuth: passthrough,
    requireAuth: (app: Elysia) => app,
  };
});

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
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

vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  getIntelligenceDb: vi.fn(),
  eq: vi.fn((col, val) => ({ col, val, op: 'eq' })),
  ilike: vi.fn((col, val) => ({ col, val, op: 'ilike' })),
  and: vi.fn((...args) => ({ args, op: 'and' })),
  sql: vi.fn(),
  count: vi.fn(() => ({ name: 'count' })),
  asc: vi.fn((col) => col),
}));

vi.mock('@uaip/shared-services/drizzle/intelligence', () => ({
  agents: { id: 'id', name: 'name', isActive: 'isActive', createdAt: 'createdAt' },
}));

import { registerAgentCrudRoutes } from '@uaip/agent-intelligence-core';
import { getIntelligenceDb } from '@uaip/shared-services/drizzle/clients';

function buildApp(agentService: Record<string, unknown>) {
  return new Elysia().use(registerAgentCrudRoutes(agentService as never));
}

function authHeader() {
  return { Authorization: 'Bearer test-token' };
}

describe('Agent CRUD Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/agents', () => {
    it('returns paginated agent list', async () => {
      const agentRows = [
        { id: 'a1', name: 'Alpha', isActive: true, role: 'analyst' },
        { id: 'a2', name: 'Beta', isActive: true, role: 'researcher' },
      ];
      let callIdx = 0;
      vi.mocked(getIntelligenceDb).mockImplementation(() => {
        callIdx++;
        if (callIdx % 2 === 1) {
          return {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ total: 2 }]),
              }),
            }),
          } as never;
        }
        return {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue(agentRows),
                  }),
                }),
              }),
            }),
          }),
        } as never;
      });

      const app = buildApp({});
      const res = await app.handle(new Request('http://localhost/api/v1/agents', { headers: authHeader() }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.pagination.total).toBe(2);
      expect(body.data).toHaveLength(2);
    });

    it('returns 500 on database error', async () => {
      vi.mocked(getIntelligenceDb).mockImplementation(() => {
        throw new Error('DB unavailable');
      });

      const app = buildApp({});
      const res = await app.handle(new Request('http://localhost/api/v1/agents', { headers: authHeader() }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('POST /api/v1/agents', () => {
    it('creates an agent and returns 201', async () => {
      const created = { id: 'new-agent-id', name: 'Gamma', role: 'executor', isActive: true };
      const agentService = {
        createAgent: vi.fn().mockResolvedValue(created),
        getAgent: vi.fn(),
        updateAgent: vi.fn(),
        deleteAgent: vi.fn(),
      };

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Gamma', role: 'executor' }),
        })
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('new-agent-id');
      expect(agentService.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Gamma', createdBy: 'user-uuid-1234' })
      );
    });

    it('returns 400 when createAgent throws', async () => {
      const agentService = {
        createAgent: vi.fn().mockRejectedValue(new Error('Name is required')),
        getAgent: vi.fn(),
        updateAgent: vi.fn(),
        deleteAgent: vi.fn(),
      };

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'X' }),
        })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Name is required');
    });
  });

  describe('GET /api/v1/agents/:agentId', () => {
    it('returns agent when found', async () => {
      const agent = { id: 'a1', name: 'Alpha', isActive: true };
      const agentService = {
        getAgent: vi.fn().mockResolvedValue(agent),
        createAgent: vi.fn(),
        updateAgent: vi.fn(),
        deleteAgent: vi.fn(),
      };

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/a1', { headers: authHeader() })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('a1');
    });

    it('returns 404 when agent not found', async () => {
      const agentService = {
        getAgent: vi.fn().mockResolvedValue(null),
        createAgent: vi.fn(),
        updateAgent: vi.fn(),
        deleteAgent: vi.fn(),
      };

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/missing', { headers: authHeader() })
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Agent not found');
    });
  });

  describe('PUT /api/v1/agents/:agentId', () => {
    it('updates agent when owner calls it', async () => {
      const existing = { id: 'a1', name: 'Alpha', isActive: true, createdBy: 'user-uuid-1234' };
      const updated = { ...existing, name: 'Alpha Updated' };
      const agentService = {
        getAgent: vi.fn().mockResolvedValue(existing),
        updateAgent: vi.fn().mockResolvedValue(updated),
        createAgent: vi.fn(),
        deleteAgent: vi.fn(),
      };

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/a1', {
          method: 'PUT',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Alpha Updated' }),
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Alpha Updated');
    });

    it('returns 404 when target agent not found', async () => {
      const agentService = {
        getAgent: vi.fn().mockResolvedValue(null),
        updateAgent: vi.fn(),
        createAgent: vi.fn(),
        deleteAgent: vi.fn(),
      };

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/ghost', {
          method: 'PUT',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Ghost' }),
        })
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/agents/:agentId', () => {
    it('deletes agent when owner calls it', async () => {
      const existing = { id: 'a1', name: 'Alpha', createdBy: 'user-uuid-1234' };
      const agentService = {
        getAgent: vi.fn().mockResolvedValue(existing),
        deleteAgent: vi.fn().mockResolvedValue(undefined),
        createAgent: vi.fn(),
        updateAgent: vi.fn(),
      };

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/a1', {
          method: 'DELETE',
          headers: authHeader(),
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(agentService.deleteAgent).toHaveBeenCalledWith('a1');
    });

    it('returns 404 when agent not found on delete', async () => {
      const agentService = {
        getAgent: vi.fn().mockResolvedValue(null),
        deleteAgent: vi.fn(),
        createAgent: vi.fn(),
        updateAgent: vi.fn(),
      };

      const app = buildApp(agentService);
      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/ghost', {
          method: 'DELETE',
          headers: authHeader(),
        })
      );
      expect(res.status).toBe(404);
    });
  });
});
