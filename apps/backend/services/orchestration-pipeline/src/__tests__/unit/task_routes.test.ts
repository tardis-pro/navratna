/**
 * The task routes, exercised end to end through the REAL TaskController and the
 * REAL TaskService, with only the database repository stubbed.
 *
 * This file exists because the route test that already covered these paths
 * (navratna-gateway/src/__tests__/unit/task_audit_routes.test.ts) replaces
 * TaskController itself with a vi.fn that resolves `{ success: true, data: [] }`.
 * It therefore asserted that Elysia can route a URL, and nothing else — while
 * `GET /api/v1/projects/:projectId/tasks` returned 500 in production for every
 * request, because TaskService's repositories were null and the only thing that
 * could have filled them, `setRepositories()`, was never called from anywhere.
 *
 * The seam here is one layer lower on purpose: everything above the database is
 * the code that actually ships.
 */

import { describe, expect, it, vi } from 'vitest';
import { Elysia } from 'elysia';
import { TaskService } from '@uaip/shared-services';
import type { ProjectTaskRepository } from '@uaip/shared-services';
import { TaskController } from '../../controllers/task_controller.js';
import { registerTaskRoutes } from '../../routes/task_routes.js';

const PROJECT_ID = '87da881f-63eb-4e30-9cb9-79583fc65789';
const TASK_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '11111111-1111-4111-8111-111111111111';

/**
 * The router now carries `withRequiredAuth`, which attaches the user and guards.
 * Only the ATTACHMENT is stubbed here — the seam this file cares about is
 * everything above the database, and minting a JWT per request would test the
 * auth library rather than the task API.
 *
 * The refusal itself is not left untested by that choice: task_routes_auth.test.ts
 * runs the REAL middleware and asserts that an uncredentialed read is refused.
 * Stubbing it in both places is how a security change quietly becomes untested.
 */
vi.mock('@uaip/middleware', () => ({
  withRequiredAuth: (app: { derive: (fn: () => unknown) => unknown }) =>
    app.derive(() => ({ user: { id: USER_ID, email: 'dev@example.com', role: 'admin' } })),
}));

const taskRow = (overrides: Record<string, unknown> = {}) => ({
  id: TASK_ID,
  projectId: PROJECT_ID,
  title: 'Fix login redirect',
  description: null,
  status: 'backlog',
  priority: 'medium',
  assigneeId: null,
  dueAt: null,
  completedAt: null,
  metadata: { taskNumber: 'apollo-001', createdBy: USER_ID },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

function buildApp(repository: Partial<ProjectTaskRepository>) {
  const service = new TaskService({ repository: repository as ProjectTaskRepository });
  const controller = new TaskController(service);
  // `user` arrives from the router's own auth middleware (stubbed above), which
  // is where it comes from in production too. It used to be injected here by the
  // test, standing in for a gateway attachment that never actually happened —
  // which is why every mutation 401'd in production while these tests passed.
  return new Elysia().use(registerTaskRoutes(controller));
}

describe('task routes', () => {
  it('GET /api/v1/projects/:projectId/tasks returns the project’s tasks', async () => {
    const app = buildApp({
      findTasksByProject: vi.fn().mockResolvedValue([taskRow()]),
    });

    const res = await app.handle(
      new Request(`http://localhost/api/v1/projects/${PROJECT_ID}/tasks`)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.total).toBe(1);
    expect(body.data[0]).toMatchObject({ id: TASK_ID, taskNumber: 'apollo-001' });
  });

  it('POST /api/v1/projects/:projectId/tasks creates without projectId in the body', async () => {
    // The project is the path segment. Requiring it in the body as well made
    // every well-formed request fail validation.
    const repository = {
      findProjectById: vi.fn().mockResolvedValue({ id: PROJECT_ID, slug: 'apollo' }),
      countTasksByProject: vi.fn().mockResolvedValue(0),
      createTask: vi
        .fn()
        .mockImplementation(async (input) =>
          taskRow({ title: input.title, metadata: input.metadata })
        ),
    };
    const app = buildApp(repository);

    const res = await app.handle(
      new Request(`http://localhost/api/v1/projects/${PROJECT_ID}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Add rate limiting' }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, title: 'Add rate limiting' })
    );
  });

  it('GET /api/v1/tasks/:taskId answers 404 for an unknown id', async () => {
    const app = buildApp({ findTaskById: vi.fn().mockResolvedValue(null) });

    const res = await app.handle(new Request(`http://localhost/api/v1/tasks/${TASK_ID}`));

    expect(res.status).toBe(404);
    expect((await res.json()).success).toBe(false);
  });

  it('GET /api/v1/projects/:projectId/tasks/statistics returns the breakdown', async () => {
    const app = buildApp({
      getTaskStatistics: vi.fn().mockResolvedValue({
        total: 3,
        byStatus: { backlog: 3 },
        byPriority: { medium: 3 },
        byAssigneeType: { human: 1, agent: 0, unassigned: 2 },
      }),
    });

    const res = await app.handle(
      new Request(`http://localhost/api/v1/projects/${PROJECT_ID}/tasks/statistics`)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.total).toBe(3);
    expect(body.data.byAssigneeType.unassigned).toBe(2);
  });

  it('PUT /api/v1/tasks/:taskId/progress moves a finished task to done', async () => {
    const repository = {
      findTaskById: vi.fn().mockResolvedValue(taskRow()),
      updateTask: vi
        .fn()
        .mockImplementation(async (_id, patch) =>
          taskRow({ status: patch.status, metadata: patch.metadata })
        ),
    };
    const app = buildApp(repository);

    const res = await app.handle(
      new Request(`http://localhost/api/v1/tasks/${TASK_ID}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completionPercentage: 100 }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('done');
    expect(repository.updateTask).toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({ status: 'done' })
    );
  });

  it('POST /api/v1/tasks/:taskId/assign assigns a project member', async () => {
    const repository = {
      findTaskById: vi.fn().mockResolvedValue(taskRow()),
      findProjectMemberUsers: vi
        .fn()
        .mockResolvedValue([{ id: USER_ID, email: 'dev@example.com', name: 'Dev' }]),
      updateTask: vi
        .fn()
        .mockImplementation(async (_id, patch) =>
          taskRow({ assigneeId: patch.assigneeId, metadata: patch.metadata })
        ),
    };
    const app = buildApp(repository);

    const res = await app.handle(
      new Request(`http://localhost/api/v1/tasks/${TASK_ID}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeType: 'human', assignedToUserId: USER_ID }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.assignedToUserId).toBe(USER_ID);
    expect(body.data.assigneeDisplayName).toBe('Dev');
  });

  it('POST /api/v1/tasks/:taskId/assign answers 400, not 500, for a non-member', async () => {
    const app = buildApp({
      findTaskById: vi.fn().mockResolvedValue(taskRow()),
      findProjectMemberUsers: vi.fn().mockResolvedValue([]),
      updateTask: vi.fn(),
    });

    const res = await app.handle(
      new Request(`http://localhost/api/v1/tasks/${TASK_ID}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeType: 'human', assignedToUserId: USER_ID }),
      })
    );

    expect(res.status).toBe(400);
  });
});
