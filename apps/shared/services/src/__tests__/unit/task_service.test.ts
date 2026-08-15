/**
 * Regression cover for the defect that made every HTTP task route answer 500.
 *
 * TaskService held `taskRepository: IRepository | null = null` and filled it in
 * from a `setRepositories()` seam that no caller in the repository ever invoked.
 * `feature.ts` built the service and handed it straight to the controller, so
 * `GET /api/v1/projects/:projectId/tasks` died on the first property access with
 * `null is not an object (evaluating 'this.taskRepository.createQueryBuilder')`.
 *
 * The test that would have caught it is the first one below, and its shape is
 * the point: it constructs `new TaskService()` with NO arguments — exactly how
 * production constructs it — and lets the real default ProjectTaskRepository run
 * against a stubbed database client. A service that is only usable after someone
 * remembers to call an initialiser fails here, at the same line and with the
 * same error the live gateway produced.
 *
 * The pre-existing route test (navratna-gateway task_audit_routes.test.ts)
 * replaces TaskController wholesale with a vi.fn stub that resolves
 * `{ success: true, data: [] }`, which is why a completely dead endpoint passed
 * CI for as long as it did. Stubbing at the database edge instead of at the
 * class under test is what makes this file able to fail.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const controlDb = {
  rows: [] as unknown[],
};

vi.mock('../../database/drizzle/clients/index', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  Object.assign(chain, {
    select: passthrough,
    from: passthrough,
    where: passthrough,
    orderBy: passthrough,
    groupBy: passthrough,
    innerJoin: passthrough,
    limit: () => Promise.resolve(controlDb.rows),
    then: (resolve: (value: unknown) => unknown) => resolve(controlDb.rows),
  });
  return {
    ...actual,
    getControlDb: () => chain,
    getIntelligenceDb: () => chain,
  };
});

import { TaskService } from '../../services/task_service';
import type { ProjectTaskRepository } from '../../database/repositories/project_task_repository';

const PROJECT_ID = '87da881f-63eb-4e30-9cb9-79583fc65789';
const TASK_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const taskRow = (overrides: Record<string, unknown> = {}) => ({
  id: TASK_ID,
  projectId: PROJECT_ID,
  title: 'Fix login redirect',
  description: 'The callback drops the return path',
  status: 'in-progress',
  priority: 'high',
  assigneeId: USER_ID,
  dueAt: null,
  completedAt: null,
  metadata: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

describe('TaskService', () => {
  beforeEach(() => {
    controlDb.rows = [];
  });

  describe('constructed the way production constructs it', () => {
    it('lists a project’s tasks without any initialisation call', async () => {
      controlDb.rows = [taskRow()];

      // No arguments, no initialize(), no setRepositories() — this is the exact
      // construction that used to produce a service with four null fields.
      const service = new TaskService();
      const tasks = await service.getTasksByProject(PROJECT_ID);

      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        id: TASK_ID,
        projectId: PROJECT_ID,
        title: 'Fix login redirect',
        status: 'in-progress',
        priority: 'high',
        assignedToUserId: USER_ID,
      });
    });

    it('reports an empty project as empty rather than failing', async () => {
      controlDb.rows = [];
      await expect(new TaskService().getTasksByProject(PROJECT_ID)).resolves.toEqual([]);
    });
  });

  describe('row to entity mapping', () => {
    it('reads the fields that have no column out of metadata', async () => {
      controlDb.rows = [
        taskRow({
          assigneeId: null,
          metadata: {
            taskNumber: 'APOLLO-007',
            type: 'research',
            assigneeType: 'agent',
            assignedToAgentId: 'agent-1',
            assigneeDisplayName: 'Scout',
            tags: ['auth'],
            epic: 'Login',
            metrics: { completionPercentage: 40 },
          },
        }),
      ];

      const [task] = await new TaskService().getTasksByProject(PROJECT_ID);

      expect(task.taskNumber).toBe('APOLLO-007');
      expect(task.type).toBe('research');
      expect(task.assigneeType).toBe('agent');
      expect(task.assignedToAgentId).toBe('agent-1');
      expect(task.assigneeDisplayName).toBe('Scout');
      expect(task.tags).toEqual(['auth']);
      expect(task.epic).toBe('Login');
      // Defaults fill the metrics the row does not carry, so consumers never see
      // a half-populated object.
      expect(task.metrics).toEqual({
        timeSpent: 0,
        estimatedTime: 0,
        completionPercentage: 40,
        reopenCount: 0,
        commentCount: 0,
        attachmentCount: 0,
      });
    });

    it('normalises a status written before the StoryStatus migration', async () => {
      controlDb.rows = [taskRow({ status: 'in_progress' })];
      const [task] = await new TaskService().getTasksByProject(PROJECT_ID);
      expect(task.status).toBe('in-progress');
    });
  });

  describe('filters', () => {
    it('passes a comma-separated status list through as a set', async () => {
      const repository = {
        findTasksByProject: vi.fn().mockResolvedValue([]),
      } as unknown as ProjectTaskRepository;

      await new TaskService({ repository }).getTasksByProject(PROJECT_ID, {
        status: ['todo', 'in_progress'],
      });

      expect(repository.findTasksByProject).toHaveBeenCalledWith(PROJECT_ID, {
        status: ['backlog', 'in-progress'],
      });
    });

    it('turns isOverdue into a due-date bound plus a status exclusion', async () => {
      const repository = {
        findTasksByProject: vi.fn().mockResolvedValue([]),
      } as unknown as ProjectTaskRepository;

      await new TaskService({ repository }).getTasksByProject(PROJECT_ID, { isOverdue: true });

      const [, filters] = vi.mocked(repository.findTasksByProject).mock.calls[0];
      expect(filters?.excludeStatus).toEqual(['done']);
      expect(filters?.dueBefore).toBeInstanceOf(Date);
    });
  });

  describe('writes', () => {
    it('refuses an illegal status transition instead of writing it', async () => {
      const repository = {
        findTaskById: vi.fn().mockResolvedValue(taskRow({ status: 'done' })),
        updateTask: vi.fn(),
      } as unknown as ProjectTaskRepository;

      await expect(
        new TaskService({ repository }).updateTask(TASK_ID, {
          status: 'backlog',
          updatedBy: USER_ID,
        })
      ).rejects.toMatchObject({ status: 409 });

      expect(repository.updateTask).not.toHaveBeenCalled();
    });

    it('404s on a task that does not exist rather than reporting success', async () => {
      const repository = {
        findTaskById: vi.fn().mockResolvedValue(null),
        deleteTask: vi.fn(),
      } as unknown as ProjectTaskRepository;

      await expect(
        new TaskService({ repository }).deleteTask(TASK_ID, USER_ID)
      ).rejects.toMatchObject({ status: 404 });

      expect(repository.deleteTask).not.toHaveBeenCalled();
    });

    it('numbers a new task from the project slug and the existing count', async () => {
      const repository = {
        findProjectById: vi.fn().mockResolvedValue({ id: PROJECT_ID, slug: 'apollo' }),
        countTasksByProject: vi.fn().mockResolvedValue(6),
        createTask: vi.fn().mockImplementation(async (input) =>
          taskRow({ title: input.title, metadata: input.metadata })
        ),
      } as unknown as ProjectTaskRepository;

      const task = await new TaskService({ repository }).createTask({
        projectId: PROJECT_ID,
        title: 'Add rate limiting',
        createdBy: USER_ID,
      });

      expect(task.taskNumber).toBe('apollo-007');
      expect(vi.mocked(repository.createTask).mock.calls[0][0].metadata).toMatchObject({
        taskNumber: 'apollo-007',
        createdBy: USER_ID,
      });
    });

    it('rejects a human assignee who is not a member of the project', async () => {
      const repository = {
        findTaskById: vi.fn().mockResolvedValue(taskRow()),
        findProjectMemberUsers: vi.fn().mockResolvedValue([]),
        updateTask: vi.fn(),
      } as unknown as ProjectTaskRepository;

      await expect(
        new TaskService({ repository }).assignTask({
          taskId: TASK_ID,
          assigneeType: 'human',
          assignedToUserId: USER_ID,
          assignedBy: USER_ID,
        })
      ).rejects.toMatchObject({ status: 400 });

      expect(repository.updateTask).not.toHaveBeenCalled();
    });
  });
});
