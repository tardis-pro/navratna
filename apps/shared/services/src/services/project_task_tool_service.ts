import { ProjectTaskRepository, type ProjectRow, type TaskRow } from '../database/repositories/project_task_repository';
import { STORY_STATUSES, toStoryStatus, type StoryStatus } from '@uaip/types';
import { logger } from '@uaip/utils';

export const PROJECT_TASK_TOOL_IDS = [
  'project-list',
  'project-get',
  'task-list',
  'task-get',
  'task-create',
  'task-update',
  'task-stats',
] as const;

export type ProjectTaskToolId = (typeof PROJECT_TASK_TOOL_IDS)[number];

export function isProjectTaskToolId(toolId: string): toolId is ProjectTaskToolId {
  return (PROJECT_TASK_TOOL_IDS as readonly string[]).includes(toolId);
}

export class ProjectTaskToolError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_PARAMS' | 'FORBIDDEN' | 'NOT_FOUND'
  ) {
    super(message);
    this.name = 'ProjectTaskToolError';
  }
}

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: string;
  type: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TaskSummary {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const toProjectSummary = (row: ProjectRow): ProjectSummary => ({
  id: row.id,
  name: row.name,
  description: row.description,
  status: row.status,
  type: row.type,
  ownerId: row.ownerId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toTaskSummary = (row: TaskRow): TaskSummary => ({
  id: row.id,
  projectId: row.projectId,
  title: row.title,
  description: row.description,
  status: row.status,
  priority: row.priority,
  assigneeId: row.assigneeId,
  dueAt: row.dueAt,
  completedAt: row.completedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * A THIRD status vocabulary used to live here — ['pending','in_progress',
 * 'blocked','completed','cancelled'] — exposed as the MCP tool surface, so every
 * agent calling task-create/task-update wrote values that matched neither
 * TaskService's nor InternalBoardAdapter's. All three now agree on StoryStatus.
 *
 * Callers still sending a legacy spelling are accepted and normalised by
 * optionalStoryStatus rather than rejected, so existing agent prompts keep
 * working.
 */
const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'];

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ProjectTaskToolError(`Parameter "${key}" is required`, 'INVALID_PARAMS');
  }
  return value;
}

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function optionalNumber(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Reads a status parameter, accepting either the canonical StoryStatus or any
 * legacy spelling, and returns the canonical value.
 */
function optionalStoryStatus(
  params: Record<string, unknown>,
  key: string
): StoryStatus | undefined {
  const value = optionalString(params, key);
  if (value === undefined) return undefined;
  const normalized = toStoryStatus(value);
  if (!normalized) {
    throw new ProjectTaskToolError(
      `Parameter "${key}" must be one of: ${STORY_STATUSES.join(', ')}`,
      'INVALID_PARAMS'
    );
  }
  return normalized;
}

function optionalEnum(
  params: Record<string, unknown>,
  key: string,
  allowed: string[]
): string | undefined {
  const value = optionalString(params, key);
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) {
    throw new ProjectTaskToolError(
      `Parameter "${key}" must be one of: ${allowed.join(', ')}`,
      'INVALID_PARAMS'
    );
  }
  return value;
}

function optionalDate(params: Record<string, unknown>, key: string): Date | undefined {
  const value = optionalString(params, key);
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ProjectTaskToolError(`Parameter "${key}" must be an ISO 8601 date`, 'INVALID_PARAMS');
  }
  return parsed;
}

export class ProjectTaskToolService {
  private static instance: ProjectTaskToolService;

  constructor(private readonly repository: ProjectTaskRepository = new ProjectTaskRepository()) {}

  static getInstance(): ProjectTaskToolService {
    if (!ProjectTaskToolService.instance) {
      ProjectTaskToolService.instance = new ProjectTaskToolService();
    }
    return ProjectTaskToolService.instance;
  }

  /**
   * Every tool resolves the caller's project membership before touching a row.
   * The agent supplies the project id, so without this check an agent could read
   * or mutate any tenant's tasks by guessing a uuid.
   */
  private async assertProjectAccess(userId: string, projectId: string): Promise<void> {
    const allowed = await this.repository.userCanAccessProject(userId, projectId);
    if (!allowed) {
      throw new ProjectTaskToolError('Project not found or not accessible', 'FORBIDDEN');
    }
  }

  private async assertTaskAccess(userId: string, taskId: string): Promise<TaskRow> {
    const task = await this.repository.findTaskById(taskId);
    if (!task) {
      throw new ProjectTaskToolError('Task not found', 'NOT_FOUND');
    }
    await this.assertProjectAccess(userId, task.projectId);
    return task;
  }

  async execute(
    toolId: ProjectTaskToolId,
    userId: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    if (!userId) {
      throw new ProjectTaskToolError('A userId is required to execute this tool', 'INVALID_PARAMS');
    }

    logger.info('Executing project/task tool', { toolId, userId });

    switch (toolId) {
      case 'project-list':
        return this.listProjects(userId, params);
      case 'project-get':
        return this.getProject(userId, params);
      case 'task-list':
        return this.listTasks(userId, params);
      case 'task-get':
        return this.getTask(userId, params);
      case 'task-create':
        return this.createTask(userId, params);
      case 'task-update':
        return this.updateTask(userId, params);
      case 'task-stats':
        return this.taskStats(userId, params);
    }
  }

  private async listProjects(userId: string, params: Record<string, unknown>) {
    const rows = await this.repository.findAccessibleProjects(userId, {
      status: optionalString(params, 'status'),
      limit: optionalNumber(params, 'limit'),
    });
    return { projects: rows.map(toProjectSummary), count: rows.length };
  }

  private async getProject(userId: string, params: Record<string, unknown>) {
    const projectId = requireString(params, 'projectId');
    await this.assertProjectAccess(userId, projectId);
    const row = await this.repository.findProjectById(projectId);
    if (!row) throw new ProjectTaskToolError('Project not found', 'NOT_FOUND');
    return toProjectSummary(row);
  }

  private async listTasks(userId: string, params: Record<string, unknown>) {
    const filters = {
      status: optionalStoryStatus(params, 'status'),
      priority: optionalEnum(params, 'priority', TASK_PRIORITIES),
      assigneeId: optionalString(params, 'assigneeId'),
      limit: optionalNumber(params, 'limit'),
    };

    const projectId = optionalString(params, 'projectId');
    if (projectId) {
      await this.assertProjectAccess(userId, projectId);
      const rows = await this.repository.findTasksByProject(projectId, filters);
      return { tasks: rows.map(toTaskSummary), count: rows.length };
    }

    const accessible = await this.repository.findAccessibleProjects(userId);
    const rows = await this.repository.findTasksByProjectIds(
      accessible.map((project) => project.id),
      filters
    );
    return { tasks: rows.map(toTaskSummary), count: rows.length };
  }

  private async getTask(userId: string, params: Record<string, unknown>) {
    const task = await this.assertTaskAccess(userId, requireString(params, 'taskId'));
    return toTaskSummary(task);
  }

  private async createTask(userId: string, params: Record<string, unknown>) {
    const projectId = requireString(params, 'projectId');
    await this.assertProjectAccess(userId, projectId);

    const row = await this.repository.createTask({
      projectId,
      title: requireString(params, 'title'),
      description: optionalString(params, 'description'),
      status: optionalStoryStatus(params, 'status'),
      priority: optionalEnum(params, 'priority', TASK_PRIORITIES),
      assigneeId: optionalString(params, 'assigneeId'),
      dueAt: optionalDate(params, 'dueAt'),
    });
    return toTaskSummary(row);
  }

  private async updateTask(userId: string, params: Record<string, unknown>) {
    const taskId = requireString(params, 'taskId');
    await this.assertTaskAccess(userId, taskId);

    const status = optionalStoryStatus(params, 'status');
    const row = await this.repository.updateTask(taskId, {
      title: optionalString(params, 'title'),
      description: optionalString(params, 'description'),
      status,
      priority: optionalEnum(params, 'priority', TASK_PRIORITIES),
      assigneeId: optionalString(params, 'assigneeId'),
      dueAt: optionalDate(params, 'dueAt'),
      completedAt: status === 'done' ? new Date() : undefined,
    });
    if (!row) throw new ProjectTaskToolError('Task not found', 'NOT_FOUND');
    return toTaskSummary(row);
  }

  private async taskStats(userId: string, params: Record<string, unknown>) {
    const projectId = requireString(params, 'projectId');
    await this.assertProjectAccess(userId, projectId);
    return this.repository.getTaskStatistics(projectId);
  }
}
