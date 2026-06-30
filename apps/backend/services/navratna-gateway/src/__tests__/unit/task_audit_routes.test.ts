import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Elysia } from 'elysia';

const { mockAuditRepository } = vi.hoisted(() => ({
  mockAuditRepository: {
    searchAuditLogs: vi.fn().mockResolvedValue({ logs: [], total: 0 }),
    getAuditLogById: vi.fn().mockResolvedValue(null),
    getEventTypes: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({}),
    getUserActivityAuditTrail: vi.fn().mockResolvedValue({ logs: [], total: 0 }),
  },
}));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  ApiError: class ApiError extends Error {
    constructor(public statusCode: number, msg: string, public code?: string) { super(msg); }
  },
}));

vi.mock('@uaip/config', () => ({
  config: { jwt: { secret: 'test-secret-32-chars-long-enough', accessTokenExpiry: '15m' } },
}));

vi.mock('@uaip/middleware', () => {
  const mockUser = { id: 'user-uuid-1234', email: 'admin@example.com', role: 'admin' };
  const passthrough = (app: Elysia) => app.derive(() => ({ user: mockUser }));
  return {
    withRequiredAuth: passthrough,
    withOptionalAuth: passthrough,
    withAdminGuard: passthrough,
    attachAuth: passthrough,
    requireAuth: (app: Elysia) => app,
  };
});

vi.mock('@uaip/shared-services', () => ({
  TaskService: vi.fn().mockImplementation(() => ({})),
  AuditService: {
    getInstance: vi.fn().mockReturnValue({
      getAuditRepository: vi.fn().mockReturnValue(mockAuditRepository),
    }),
  },
  getControlDb: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    }),
  }),
}));

vi.mock('@uaip/shared-services/drizzle/control', () => ({
  auditEvents: { id: 'id', resolved: 'resolved', resolvedBy: 'resolvedBy', resolvedAt: 'resolvedAt', updatedAt: 'updatedAt' },
}));

vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  sql: vi.fn((str, ...args) => ({ str, args })),
}));

vi.mock('@uaip/types', () => ({
  AuditEventType: {
    LOGIN_SUCCESS: 'LOGIN_SUCCESS', LOGIN_FAILED: 'LOGIN_FAILED',
    LOGOUT: 'LOGOUT', AUDIT_EXPORT: 'AUDIT_EXPORT',
    AUDIT_CLEANUP: 'AUDIT_CLEANUP', COMPLIANCE_REPORT_GENERATED: 'COMPLIANCE_REPORT_GENERATED',
  },
}));

vi.mock('../../../../security-gateway/src/services/audit_service.js', () => ({
  AuditService: vi.fn(function AuditServiceMock() {
    return {
      logSecurityEvent: vi.fn().mockResolvedValue({}),
      logEvent: vi.fn().mockResolvedValue({}),
      exportLogs: vi.fn().mockResolvedValue(JSON.stringify({ recordCount: 0, data: [] })),
      generateComplianceReport: vi.fn().mockResolvedValue({ report: 'ok' }),
      cleanupOldLogs: vi.fn().mockResolvedValue({ deleted: 5, archived: 0 }),
    };
  }),
}));

vi.mock('../../../../security-gateway/src/http/context_helpers.js', () => ({
  getAuthUser: vi.fn().mockReturnValue({ id: 'user-uuid-1234', email: 'admin@example.com', role: 'admin' }),
}));

vi.mock('../../../../orchestration-pipeline/src/controllers/task_controller.ts', () => ({
  TaskController: vi.fn(function TaskControllerMock() {
    return {
      getProjectTasks: vi.fn().mockResolvedValue({ success: true, data: [], total: 0 }),
      createTask: vi.fn().mockResolvedValue({ success: true, data: { id: 'task-1', title: 'New Task' } }),
      getTask: vi.fn().mockResolvedValue({ success: true, data: { id: 'task-1' } }),
      updateTask: vi.fn().mockResolvedValue({ success: true, data: { id: 'task-1' } }),
      deleteTask: vi.fn().mockResolvedValue({ success: true }),
      assignTask: vi.fn().mockResolvedValue({ success: true }),
      getAssignmentSuggestions: vi.fn().mockResolvedValue({ success: true, data: [] }),
      updateTaskProgress: vi.fn().mockResolvedValue({ success: true }),
      getUserTasks: vi.fn().mockResolvedValue({ success: true, data: [], total: 0 }),
      getAgentTasks: vi.fn().mockResolvedValue({ success: true, data: [], total: 0 }),
      getTaskStatistics: vi.fn().mockResolvedValue({ success: true, data: {} }),
    };
  }),
}));

import { registerTaskRoutes } from '../../../../orchestration-pipeline/src/routes/task_routes.ts';
import { registerAuditRoutes } from '../../../../security-gateway/src/http/audit_elysia.ts';
import { TaskController } from '../../../../orchestration-pipeline/src/controllers/task_controller.ts';

function buildTaskApp() {
  const controller = new TaskController({} as never, {} as never);
  return new Elysia().use(registerTaskRoutes(controller));
}

function buildAuditApp() {
  return new Elysia().use(registerAuditRoutes());
}

function authHeader() {
  return { Authorization: 'Bearer test-token' };
}

describe('Task Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditRepository.searchAuditLogs.mockResolvedValue({ logs: [], total: 0 });
    mockAuditRepository.getAuditLogById.mockResolvedValue(null);
    mockAuditRepository.getEventTypes.mockResolvedValue([]);
    mockAuditRepository.getStats.mockResolvedValue({});
    mockAuditRepository.getUserActivityAuditTrail.mockResolvedValue({ logs: [], total: 0 });
  });

  describe('GET /api/v1/projects/:projectId/tasks', () => {
    it('returns task list for project', async () => {
      const app = buildTaskApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/projects/proj-1/tasks', { headers: authHeader() })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('POST /api/v1/projects/:projectId/tasks', () => {
    it('creates a task in project', async () => {
      const app = buildTaskApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/projects/proj-1/tasks', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'New Task', projectId: 'proj-1' }),
        })
      );
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/tasks/:taskId', () => {
    it('returns individual task', async () => {
      const app = buildTaskApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/tasks/task-1', { headers: authHeader() })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('DELETE /api/v1/tasks/:taskId', () => {
    it('deletes task', async () => {
      const app = buildTaskApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/tasks/task-1', {
          method: 'DELETE',
          headers: authHeader(),
        })
      );
      expect(res.status).toBe(200);
    });
  });
});

describe('Audit Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/audit/logs', () => {
    it('returns paginated audit logs', async () => {
      const app = buildAuditApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/audit/logs', { headers: authHeader() })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.logs).toEqual([]);
      expect(body.pagination).toBeDefined();
    });
  });

  describe('GET /api/v1/audit/logs/:logId', () => {
    it('returns 404 when audit log not found', async () => {
      const app = buildAuditApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/audit/logs/missing-id', { headers: authHeader() })
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Log Not Found');
    });
  });

  describe('GET /api/v1/audit/events/types', () => {
    it('returns event types list', async () => {
      const app = buildAuditApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/audit/events/types', { headers: authHeader() })
      );
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/audit/stats', () => {
    it('returns audit stats for default timeframe', async () => {
      const app = buildAuditApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/audit/stats', { headers: authHeader() })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.timeframe).toBe('24h');
    });
  });

  describe('GET /api/v1/audit/user-activity/:userId', () => {
    it('returns user activity for userId', async () => {
      const app = buildAuditApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/audit/user-activity/u1', { headers: authHeader() })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe('u1');
    });
  });
});
