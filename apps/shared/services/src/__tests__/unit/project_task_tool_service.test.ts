import {
  ProjectTaskToolService,
  ProjectTaskToolError,
  isProjectTaskToolId,
  PROJECT_TASK_TOOL_IDS,
} from '../../services/project_task_tool_service';
import type { ProjectTaskRepository } from '../../database/repositories/project_task_repository';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const TASK_ID = '44444444-4444-4444-8444-444444444444';

const projectRow = (overrides: Record<string, unknown> = {}) => ({
  id: PROJECT_ID,
  name: 'Apollo',
  description: 'Launch work',
  status: 'active',
  type: null,
  ownerId: USER_ID,
  organizationId: null,
  settings: null,
  metadata: null,
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

const taskRow = (overrides: Record<string, unknown> = {}) => ({
  id: TASK_ID,
  projectId: PROJECT_ID,
  title: 'Fix login redirect',
  description: null,
  status: 'pending',
  priority: 'medium',
  assigneeId: null,
  dueAt: null,
  completedAt: null,
  metadata: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

interface RepoStub {
  findProjectById: ReturnType<typeof vi.fn>;
  findAccessibleProjects: ReturnType<typeof vi.fn>;
  userCanAccessProject: ReturnType<typeof vi.fn>;
  findTaskById: ReturnType<typeof vi.fn>;
  findTasksByProject: ReturnType<typeof vi.fn>;
  findTasksByProjectIds: ReturnType<typeof vi.fn>;
  createTask: ReturnType<typeof vi.fn>;
  updateTask: ReturnType<typeof vi.fn>;
  getTaskStatistics: ReturnType<typeof vi.fn>;
}

const makeService = (): { service: ProjectTaskToolService; repo: RepoStub } => {
  const repo: RepoStub = {
    findProjectById: vi.fn().mockResolvedValue(projectRow()),
    findAccessibleProjects: vi.fn().mockResolvedValue([projectRow()]),
    userCanAccessProject: vi.fn().mockResolvedValue(true),
    findTaskById: vi.fn().mockResolvedValue(taskRow()),
    findTasksByProject: vi.fn().mockResolvedValue([taskRow()]),
    findTasksByProjectIds: vi.fn().mockResolvedValue([taskRow()]),
    createTask: vi.fn().mockResolvedValue(taskRow()),
    updateTask: vi.fn().mockResolvedValue(taskRow()),
    getTaskStatistics: vi
      .fn()
      .mockResolvedValue({ total: 3, byStatus: { pending: 3 }, byPriority: { medium: 3 } }),
  };
  return {
    service: new ProjectTaskToolService(repo as unknown as ProjectTaskRepository),
    repo,
  };
};

describe('tool id registry', () => {
  it('recognises every registered tool id', () => {
    for (const id of PROJECT_TASK_TOOL_IDS) {
      expect(isProjectTaskToolId(id)).toBe(true);
    }
  });

  it('rejects an unrelated tool id', () => {
    expect(isProjectTaskToolId('shell-exec')).toBe(false);
  });
});

describe('caller identity', () => {
  it('refuses to run without a userId rather than querying unscoped', async () => {
    const { service, repo } = makeService();

    await expect(service.execute('project-list', '', {})).rejects.toThrow(ProjectTaskToolError);
    expect(repo.findAccessibleProjects).not.toHaveBeenCalled();
  });
});

describe('project-list', () => {
  it('returns only the projects the repository scopes to the caller', async () => {
    const { service, repo } = makeService();

    const result = await service.execute('project-list', USER_ID, { status: 'active' });

    expect(repo.findAccessibleProjects).toHaveBeenCalledWith(USER_ID, {
      status: 'active',
      limit: undefined,
    });
    expect(result).toMatchObject({ count: 1 });
  });
});

describe('project-get', () => {
  it('requires a projectId', async () => {
    const { service } = makeService();
    await expect(service.execute('project-get', USER_ID, {})).rejects.toThrow(
      /Parameter "projectId" is required/
    );
  });

  it('refuses a project the caller cannot access', async () => {
    const { service, repo } = makeService();
    repo.userCanAccessProject.mockResolvedValue(false);

    await expect(
      service.execute('project-get', OTHER_USER_ID, { projectId: PROJECT_ID })
    ).rejects.toThrow(/not accessible/);
    expect(repo.findProjectById).not.toHaveBeenCalled();
  });

  it('returns the project when access is granted', async () => {
    const { service } = makeService();
    const result = await service.execute('project-get', USER_ID, { projectId: PROJECT_ID });
    expect(result).toMatchObject({ id: PROJECT_ID, name: 'Apollo' });
  });
});

describe('task-list', () => {
  it('scopes to a single project when projectId is supplied', async () => {
    const { service, repo } = makeService();

    // 'pending' is a legacy spelling; the tool now normalises it to 'backlog'
    // rather than rejecting callers written against the old vocabulary.
    await service.execute('task-list', USER_ID, { projectId: PROJECT_ID, status: 'pending' });

    expect(repo.userCanAccessProject).toHaveBeenCalledWith(USER_ID, PROJECT_ID);
    expect(repo.findTasksByProject).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({ status: 'backlog' })
    );
    expect(repo.findTasksByProjectIds).not.toHaveBeenCalled();
  });

  it('falls back to every accessible project when projectId is omitted', async () => {
    const { service, repo } = makeService();

    await service.execute('task-list', USER_ID, {});

    expect(repo.findAccessibleProjects).toHaveBeenCalledWith(USER_ID);
    expect(repo.findTasksByProjectIds).toHaveBeenCalledWith([PROJECT_ID], expect.any(Object));
  });

  it('never queries tasks for a project the caller cannot access', async () => {
    const { service, repo } = makeService();
    repo.userCanAccessProject.mockResolvedValue(false);

    await expect(
      service.execute('task-list', OTHER_USER_ID, { projectId: PROJECT_ID })
    ).rejects.toThrow(/not accessible/);
    expect(repo.findTasksByProject).not.toHaveBeenCalled();
  });

  it('rejects an unsupported status value', async () => {
    const { service } = makeService();
    await expect(service.execute('task-list', USER_ID, { status: 'nonsense' })).rejects.toThrow(
      /must be one of/
    );
  });
});

describe('task-get', () => {
  it('404s for a task that does not exist', async () => {
    const { service, repo } = makeService();
    repo.findTaskById.mockResolvedValue(null);

    await expect(service.execute('task-get', USER_ID, { taskId: TASK_ID })).rejects.toThrow(
      /Task not found/
    );
  });

  it("refuses a task inside another user's project", async () => {
    const { service, repo } = makeService();
    repo.userCanAccessProject.mockResolvedValue(false);

    await expect(service.execute('task-get', OTHER_USER_ID, { taskId: TASK_ID })).rejects.toThrow(
      /not accessible/
    );
  });
});

describe('task-create', () => {
  it('creates a task in an accessible project', async () => {
    const { service, repo } = makeService();

    await service.execute('task-create', USER_ID, {
      projectId: PROJECT_ID,
      title: 'Fix login redirect',
      priority: 'high',
    });

    expect(repo.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        title: 'Fix login redirect',
        priority: 'high',
      })
    );
  });

  it('requires a title', async () => {
    const { service, repo } = makeService();

    await expect(
      service.execute('task-create', USER_ID, { projectId: PROJECT_ID })
    ).rejects.toThrow(/Parameter "title" is required/);
    expect(repo.createTask).not.toHaveBeenCalled();
  });

  it('never writes into a project the caller cannot access', async () => {
    const { service, repo } = makeService();
    repo.userCanAccessProject.mockResolvedValue(false);

    await expect(
      service.execute('task-create', OTHER_USER_ID, { projectId: PROJECT_ID, title: 'sneaky' })
    ).rejects.toThrow(/not accessible/);
    expect(repo.createTask).not.toHaveBeenCalled();
  });

  it('rejects a malformed dueAt', async () => {
    const { service } = makeService();

    await expect(
      service.execute('task-create', USER_ID, {
        projectId: PROJECT_ID,
        title: 'x',
        dueAt: 'next tuesday',
      })
    ).rejects.toThrow(/ISO 8601/);
  });
});

describe('task-update', () => {
  it('stamps completedAt when the status becomes done', async () => {
    const { service, repo } = makeService();

    // Legacy 'completed' normalises to canonical 'done'.
    await service.execute('task-update', USER_ID, { taskId: TASK_ID, status: 'completed' });

    const patch = repo.updateTask.mock.calls[0][1];
    expect(patch.status).toBe('done');
    expect(patch.completedAt).toBeInstanceOf(Date);
  });

  it('leaves completedAt untouched for other status changes', async () => {
    const { service, repo } = makeService();

    await service.execute('task-update', USER_ID, { taskId: TASK_ID, status: 'in_progress' });

    expect(repo.updateTask.mock.calls[0][1].completedAt).toBeUndefined();
  });

  it('never updates a task in an inaccessible project', async () => {
    const { service, repo } = makeService();
    repo.userCanAccessProject.mockResolvedValue(false);

    await expect(
      service.execute('task-update', OTHER_USER_ID, { taskId: TASK_ID, status: 'completed' })
    ).rejects.toThrow(/not accessible/);
    expect(repo.updateTask).not.toHaveBeenCalled();
  });
});

describe('task-stats', () => {
  it('returns grouped counts for an accessible project', async () => {
    const { service } = makeService();

    const result = await service.execute('task-stats', USER_ID, { projectId: PROJECT_ID });

    expect(result).toMatchObject({ total: 3, byStatus: { pending: 3 } });
  });

  it('refuses stats for an inaccessible project', async () => {
    const { service, repo } = makeService();
    repo.userCanAccessProject.mockResolvedValue(false);

    await expect(
      service.execute('task-stats', OTHER_USER_ID, { projectId: PROJECT_ID })
    ).rejects.toThrow(/not accessible/);
    expect(repo.getTaskStatistics).not.toHaveBeenCalled();
  });
});
