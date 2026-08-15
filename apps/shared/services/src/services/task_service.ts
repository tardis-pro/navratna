/**
 * Task reads and writes for the HTTP task API (`/api/v1/projects/:projectId/tasks`
 * and friends, registered by orchestration-pipeline).
 *
 * ── The failure this file exists to not repeat ──────────────────────────────
 *
 * Every one of those routes returned HTTP 500 with
 * `"null is not an object (evaluating 'this.taskRepository...')"`.
 *
 * The service held its repositories as `IRepository | null = null` and exposed a
 * `setRepositories()` seam to fill them in. Nothing in the repository ever
 * called it. `feature.ts` did `TaskService.getInstance()` and handed the result
 * straight to the controller, so the singleton every request went through had
 * four null fields, and the first property access on one of them threw. Only
 * `createTask()` guarded; every read path dereferenced blind.
 *
 * So the seam is gone. The repository is a constructor parameter with a real
 * default, which is the shape ProjectTaskToolService already uses successfully
 * against these same rows. There is no longer a state in which a constructed
 * TaskService is unusable, which means there is no longer an initialisation step
 * a caller can forget.
 *
 * ── Why wiring the old code up would not have been enough ───────────────────
 *
 * Passing `DatabaseService.getTaskRepository()` into the old `setRepositories()`
 * would have moved the crash one line down, not fixed it. The old queries were
 * TypeORM-shaped — `createQueryBuilder().leftJoinAndSelect('task.project', ...)`,
 * `repository.create(...)` — and `DrizzleRepository`/`DrizzleQueryBuilder`
 * implement neither join nor `create`. Worse, they filtered and grouped on
 * columns the `tasks` table does not have: `task_number`, `assignee_type`,
 * `assigned_to_user_id`, `assigned_to_agent_id`, `tags`, `deleted_at`,
 * `activity_log`. The real table (control_schema.ts, `tasks`) is
 * id/project_id/title/description/status/priority/assignee_id/due_at/
 * completed_at/metadata plus timestamps — nothing else.
 *
 * The extended task model therefore lives in the `metadata` jsonb column, and
 * this file is the single place that packs and unpacks it. That is a real
 * storage decision, written down, rather than a query against columns that were
 * never going to exist:
 *
 *   column        entity field
 *   assignee_id → assignedToUserId   (FK to control.users — humans only)
 *   due_at      → dueDate
 *   metadata    → taskNumber, type, assigneeType, assignedToAgentId,
 *                 assignedById/At, startedAt, tags, labels, epic, sprint,
 *                 blockedBy, settings, metrics, activityLog, createdBy,
 *                 lastActivityAt, customFields
 *
 * Agent assignment cannot use `assignee_id`: agents are rows in the intelligence
 * database and that column is a foreign key into control.users. It is carried in
 * metadata and queried through the jsonb — see
 * ProjectTaskRepository.countTasksByAgentAssignee.
 *
 * ── Soft delete ─────────────────────────────────────────────────────────────
 *
 * There is no `deleted_at` column, so `deleteTask` deletes. The previous code
 * set `task.deletedAt` and saved, and every read filtered `deletedAt IS NULL` —
 * against a column that does not exist, so a "deleted" task would have come
 * straight back on the next list.
 */

import {
  AssigneeType,
  STORY_STATUSES,
  STORY_STATUS_TRANSITIONS,
  TaskType,
  canTransitionStoryStatus,
  toStoryStatus,
  type CreateTaskRequest,
  type StoryStatus,
  type TaskActivityEntry,
  type TaskAssignmentRequest,
  type TaskAssignmentSuggestion,
  type TaskEntity,
  type TaskFilters,
  type TaskMetrics,
  type TaskPriority,
  type TaskSettings,
  type UpdateTaskRequest,
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';
import { AgentRepository } from '../database/repositories/agent_repository';
import {
  ProjectTaskRepository,
  type ProjectMemberUser,
  type TaskListFilters,
  type TaskRow,
} from '../database/repositories/project_task_repository';

/**
 * The half of TaskEntity that has no column. Stored verbatim in `tasks.metadata`
 * and read back through `readMetadata`, which is deliberately tolerant: rows
 * written by the MCP task tools or by InternalBoardAdapter have a metadata blob
 * that carries none of these keys, and those tasks must still list.
 */
interface TaskMetadata {
  taskNumber?: string;
  type?: string;
  assigneeType?: AssigneeType;
  assignedToAgentId?: string;
  assignedById?: string;
  /** ISO strings — jsonb has no Date, so these round-trip as text. */
  assignedAt?: string;
  startedAt?: string;
  lastActivityAt?: string;
  tags?: string[];
  labels?: string[];
  epic?: string;
  sprint?: string;
  blockedBy?: string[];
  settings?: TaskSettings;
  metrics?: TaskMetrics;
  activityLog?: TaskActivityEntry[];
  createdBy?: string;
  assigneeDisplayName?: string;
  customFields?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TaskEventPublisher {
  publish(channel: string, payload: Record<string, unknown>): void | Promise<void>;
}

export interface TaskServiceDeps {
  repository?: ProjectTaskRepository;
  agentRepository?: AgentRepository;
  /**
   * Optional by design: a deployment that has no event bus still gets working
   * task routes. It is passed explicitly at the composition root rather than
   * assigned later, so it can never be half-configured.
   */
  eventPublisher?: TaskEventPublisher;
}

/**
 * A type alias, not an interface: the controller hands this straight back as
 * `Record<string, unknown>`, and an interface has no implicit index signature.
 */
export type TaskStatisticsResult = {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byAssigneeType: Record<string, number>;
};

const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const TASK_TYPES: readonly TaskType[] = Object.values(TaskType);

const DEFAULT_METRICS: TaskMetrics = {
  timeSpent: 0,
  estimatedTime: 0,
  completionPercentage: 0,
  reopenCount: 0,
  commentCount: 0,
  attachmentCount: 0,
};

/**
 * `tasks.priority` is a free varchar and three writers fill it. The MCP task
 * tools accept 'critical', which TaskPriority spells 'urgent'; anything else
 * unrecognised falls back to the column default rather than being cast into a
 * union it does not belong to.
 */
function toTaskPriority(value: unknown): TaskPriority {
  if (typeof value !== 'string') return 'medium';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'critical') return 'urgent';
  return (TASK_PRIORITIES as readonly string[]).includes(normalized)
    ? (normalized as TaskPriority)
    : 'medium';
}

function toTaskType(value: unknown): TaskType {
  if (typeof value !== 'string') return TaskType.FEATURE;
  const normalized = value.trim().toLowerCase();
  return (TASK_TYPES as readonly string[]).includes(normalized)
    ? (normalized as TaskType)
    : TaskType.FEATURE;
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function readMetadata(row: TaskRow): TaskMetadata {
  const raw = row.metadata;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as TaskMetadata) : {};
}

export class TaskService {
  private static instance: TaskService;

  private readonly repository: ProjectTaskRepository;
  private readonly agentRepository: AgentRepository;
  private readonly eventPublisher: TaskEventPublisher | null;

  constructor(deps: TaskServiceDeps = {}) {
    this.repository = deps.repository ?? new ProjectTaskRepository();
    this.agentRepository = deps.agentRepository ?? new AgentRepository();
    this.eventPublisher = deps.eventPublisher ?? null;
  }

  public static getInstance(): TaskService {
    if (!TaskService.instance) {
      TaskService.instance = new TaskService();
    }
    return TaskService.instance;
  }

  // ---------------------------------------------------------------------------
  // Row <-> entity
  // ---------------------------------------------------------------------------

  private toEntity(row: TaskRow): TaskEntity {
    const meta = readMetadata(row);
    // Rows written before the StoryStatus migration still carry a legacy
    // spelling; an unrecognisable one is reported as 'backlog' rather than being
    // passed through as a status no consumer can switch on.
    const status = toStoryStatus(row.status) ?? 'backlog';

    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      taskNumber: meta.taskNumber ?? row.id.slice(0, 8),
      projectId: row.projectId,
      status,
      priority: toTaskPriority(row.priority),
      type: toTaskType(meta.type),
      assigneeType: meta.assigneeType,
      assignedToUserId: row.assigneeId ?? undefined,
      assignedToAgentId: meta.assignedToAgentId,
      assignedById: meta.assignedById,
      assignedAt: toDate(meta.assignedAt),
      startedAt: toDate(meta.startedAt),
      completedAt: row.completedAt ?? undefined,
      dueDate: row.dueAt ?? undefined,
      tags: meta.tags,
      labels: meta.labels,
      epic: meta.epic,
      sprint: meta.sprint,
      settings: meta.settings ?? {},
      metrics: { ...DEFAULT_METRICS, ...(meta.metrics ?? {}) },
      activityLog: meta.activityLog ?? [],
      blockedBy: meta.blockedBy,
      lastActivityAt: toDate(meta.lastActivityAt) ?? row.updatedAt,
      createdBy: meta.createdBy ?? '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      assigneeDisplayName: meta.assigneeDisplayName,
    };
  }

  /**
   * Translates the API's TaskFilters onto what the `tasks` table can actually
   * answer. Filters with no column and no metadata key are dropped here, in one
   * visible place, instead of being silently ignored inside a query builder.
   */
  private toListFilters(filters?: TaskFilters): TaskListFilters {
    if (!filters) return {};

    const listFilters: TaskListFilters = {};

    const statuses = (Array.isArray(filters.status) ? filters.status : [filters.status])
      .filter((value): value is string => typeof value === 'string')
      .map((value) => toStoryStatus(value))
      .filter((value): value is StoryStatus => value !== null);
    if (statuses.length > 0) listFilters.status = statuses;

    const priorities = (Array.isArray(filters.priority) ? filters.priority : [filters.priority])
      .filter((value): value is string => typeof value === 'string');
    if (priorities.length > 0) listFilters.priority = priorities;

    if (filters.assignedToUserId) listFilters.assigneeId = filters.assignedToUserId;
    if (filters.assignedToAgentId) listFilters.agentAssigneeId = filters.assignedToAgentId;
    if (filters.dueDateBefore) listFilters.dueBefore = filters.dueDateBefore;
    if (filters.dueDateAfter) listFilters.dueAfter = filters.dueDateAfter;
    if (filters.search) listFilters.search = filters.search;

    // Overdue means "past due and not finished", so the exclusion has to reach
    // the query — filtering afterwards would discard rows against the LIMIT.
    if (filters.isOverdue) {
      listFilters.dueBefore = new Date();
      listFilters.excludeStatus = ['done'];
    }
    if (filters.isBlocked) listFilters.status = ['blocked'];

    return listFilters;
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /**
   * Capped by the repository's default LIMIT (100) unless the caller asks for
   * more. The cap is real and the count returned to the client is the number of
   * rows actually read, so a truncated page is never reported as a total.
   */
  async getTasksByProject(projectId: string, filters?: TaskFilters): Promise<TaskEntity[]> {
    const rows = await this.repository.findTasksByProject(projectId, this.toListFilters(filters));
    return rows.map((row) => this.toEntity(row));
  }

  async getTaskById(taskId: string): Promise<TaskEntity | null> {
    const row = await this.repository.findTaskById(taskId);
    return row ? this.toEntity(row) : null;
  }

  async getTaskStatistics(projectId: string): Promise<TaskStatisticsResult> {
    return this.repository.getTaskStatistics(projectId);
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async createTask(request: CreateTaskRequest): Promise<TaskEntity> {
    const project = await this.repository.findProjectById(request.projectId);
    if (!project) {
      throw Object.assign(new Error('Project not found'), { status: 404 });
    }

    const assignment = await this.resolveAssignment(request.projectId, {
      assigneeType: request.assigneeType,
      assignedToUserId: request.assignedToUserId,
      assignedToAgentId: request.assignedToAgentId,
    });

    const existingCount = await this.repository.countTasksByProject(request.projectId);
    const taskNumber = `${project.slug}-${(existingCount + 1).toString().padStart(3, '0')}`;
    const now = new Date();

    const metadata: TaskMetadata = {
      taskNumber,
      type: request.type,
      createdBy: request.createdBy,
      lastActivityAt: now.toISOString(),
      tags: request.tags,
      labels: request.labels,
      epic: request.epic,
      sprint: request.sprint,
      customFields: request.customFields,
      settings: {
        timeTracking: true,
        notifyOnStatusChange: true,
        notifyOnComments: true,
        estimatedHours: request.estimatedHours ?? 0,
        ...(request.settings ?? {}),
      },
      metrics: {
        ...DEFAULT_METRICS,
        estimatedTime: request.estimatedHours ? request.estimatedHours * 60 : 0,
      },
      activityLog: [
        {
          id: uuidv4(),
          timestamp: now,
          action: 'created',
          userId: request.createdBy,
          userName: 'system',
          details: { taskNumber, title: request.title },
        },
      ],
      ...assignment.metadata,
    };

    const row = await this.repository.createTask({
      projectId: request.projectId,
      title: request.title,
      description: request.description,
      priority: request.priority,
      assigneeId: assignment.assigneeId,
      dueAt: request.dueDate,
      metadata: this.pruneMetadata(metadata),
    });

    const task = this.toEntity(row);
    await this.publish('task.created', task, request.createdBy);
    logger.info('Task created', { taskId: task.id, taskNumber, projectId: task.projectId });
    return task;
  }

  async updateTask(taskId: string, request: UpdateTaskRequest): Promise<TaskEntity> {
    const row = await this.repository.findTaskById(taskId);
    if (!row) {
      throw Object.assign(new Error('Task not found'), { status: 404 });
    }

    const current = this.toEntity(row);
    const metadata = readMetadata(row);
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    const now = new Date();

    const patch: Parameters<ProjectTaskRepository['updateTask']>[1] = {};

    if (request.title !== undefined) patch.title = request.title;
    if (request.description !== undefined) patch.description = request.description;
    if (request.priority !== undefined) patch.priority = request.priority;
    if (request.dueDate !== undefined) patch.dueAt = request.dueDate;

    // Status is otherwise a free PUT: any value could replace any other, so a
    // task could go 'backlog' → 'done' having never been worked, or a completed
    // task could be silently reopened. Both sides are normalised first because
    // rows written before the StoryStatus migration carry legacy spellings.
    if (request.status !== undefined) {
      const to = toStoryStatus(request.status);
      if (!to) {
        throw Object.assign(
          new Error(
            `Unknown task status '${String(request.status)}'. Valid statuses: ${STORY_STATUSES.join(', ')}`
          ),
          { status: 400 }
        );
      }
      if (to !== current.status) {
        // An unrecognised stored value cannot constrain anything, so it is
        // treated as unblocked rather than trapping the task permanently.
        const from = toStoryStatus(row.status);
        if (from && !canTransitionStoryStatus(from, to)) {
          throw Object.assign(
            new Error(
              `Illegal task status transition '${from}' → '${to}'. Allowed from '${from}': ` +
                `${STORY_STATUS_TRANSITIONS[from].join(', ')}`
            ),
            { status: 409 }
          );
        }
        changes.status = { old: current.status, new: to };
        patch.status = to;
        if (to === 'in-progress' && !metadata.startedAt) metadata.startedAt = now.toISOString();
        if (to === 'done' && !row.completedAt) patch.completedAt = now;
      }
    }

    if (request.assigneeType !== undefined) {
      const assignment = await this.resolveAssignment(row.projectId, {
        assigneeType: request.assigneeType,
        assignedToUserId: request.assignedToUserId,
        assignedToAgentId: request.assignedToAgentId,
      });
      changes.assigneeType = { old: current.assigneeType, new: request.assigneeType };
      patch.assigneeId = assignment.assigneeId ?? null;
      // Written rather than merged: the previous holder of the other kind of
      // assignment must be cleared, or a task reassigned human → agent keeps
      // both and every consumer picks a different one.
      metadata.assigneeType = assignment.metadata.assigneeType;
      metadata.assignedToAgentId = assignment.metadata.assignedToAgentId;
      metadata.assigneeDisplayName = assignment.metadata.assigneeDisplayName;
      metadata.assignedById = request.updatedBy;
      metadata.assignedAt = now.toISOString();
    }

    if (request.type !== undefined) metadata.type = request.type;
    if (request.tags !== undefined) metadata.tags = request.tags;
    if (request.labels !== undefined) metadata.labels = request.labels;
    if (request.epic !== undefined) metadata.epic = request.epic;
    if (request.sprint !== undefined) metadata.sprint = request.sprint;
    if (request.settings !== undefined) {
      metadata.settings = { ...(metadata.settings ?? {}), ...request.settings };
    }
    if (request.customFields !== undefined) {
      metadata.customFields = { ...(metadata.customFields ?? {}), ...request.customFields };
    }

    metadata.lastActivityAt = now.toISOString();
    metadata.activityLog = [
      ...(metadata.activityLog ?? []),
      ...Object.entries(changes).map(([field, change]) => ({
        id: uuidv4(),
        timestamp: now,
        action: `${field}_changed`,
        userId: request.updatedBy,
        userName: 'system',
        details: { field, oldValue: change.old, newValue: change.new },
      })),
    ];
    patch.metadata = this.pruneMetadata(metadata);

    const updated = await this.repository.updateTask(taskId, patch);
    if (!updated) {
      throw Object.assign(new Error('Task not found'), { status: 404 });
    }

    const task = this.toEntity(updated);
    await this.publish('task.updated', task, request.updatedBy, { changes });
    if (changes.status) {
      await this.publish('task.status_changed', task, request.updatedBy, { changes });
      if (task.status === 'done') {
        await this.publish('task.completed', task, request.updatedBy);
      }
    }
    return task;
  }

  async assignTask(request: TaskAssignmentRequest): Promise<TaskEntity> {
    const row = await this.repository.findTaskById(request.taskId);
    if (!row) {
      throw Object.assign(new Error('Task not found'), { status: 404 });
    }

    const assignment = await this.resolveAssignment(row.projectId, {
      assigneeType: request.assigneeType,
      assignedToUserId: request.assignedToUserId,
      assignedToAgentId: request.assignedToAgentId,
    });

    const now = new Date();
    const metadata = readMetadata(row);
    metadata.assigneeType = assignment.metadata.assigneeType;
    metadata.assignedToAgentId = assignment.metadata.assignedToAgentId;
    metadata.assigneeDisplayName = assignment.metadata.assigneeDisplayName;
    metadata.assignedById = request.assignedBy;
    metadata.assignedAt = now.toISOString();
    metadata.lastActivityAt = now.toISOString();
    metadata.activityLog = [
      ...(metadata.activityLog ?? []),
      {
        id: uuidv4(),
        timestamp: now,
        action: 'assigned',
        userId: request.assignedBy,
        userName: 'system',
        details: {
          assigneeType: request.assigneeType,
          assignedToUserId: request.assignedToUserId,
          assignedToAgentId: request.assignedToAgentId,
          reason: request.reason,
        },
      },
    ];

    const updated = await this.repository.updateTask(request.taskId, {
      assigneeId: assignment.assigneeId ?? null,
      metadata: this.pruneMetadata(metadata),
    });
    if (!updated) {
      throw Object.assign(new Error('Task not found'), { status: 404 });
    }

    const task = this.toEntity(updated);
    await this.publish('task.assigned', task, request.assignedBy);
    logger.info('Task assigned', {
      taskId: task.id,
      assigneeType: task.assigneeType,
      assignee: task.assigneeDisplayName,
    });
    return task;
  }

  async updateTaskProgress(
    taskId: string,
    completionPercentage: number,
    timeSpent?: number
  ): Promise<TaskEntity> {
    const row = await this.repository.findTaskById(taskId);
    if (!row) {
      throw Object.assign(new Error('Task not found'), { status: 404 });
    }

    const now = new Date();
    const metadata = readMetadata(row);
    const metrics = { ...DEFAULT_METRICS, ...(metadata.metrics ?? {}) };
    metrics.completionPercentage = Math.max(0, Math.min(100, completionPercentage));
    if (timeSpent !== undefined) metrics.timeSpent = timeSpent;
    metadata.metrics = metrics;
    metadata.lastActivityAt = now.toISOString();

    const patch: Parameters<ProjectTaskRepository['updateTask']>[1] = {};

    // Compared through toStoryStatus so a row still holding a legacy value is
    // judged on what it means, not on its spelling.
    const currentStatus = toStoryStatus(row.status) ?? 'backlog';
    if (metrics.completionPercentage >= 100 && currentStatus !== 'done') {
      patch.status = 'done';
      patch.completedAt = now;
    } else if (metrics.completionPercentage > 0 && currentStatus === 'backlog') {
      patch.status = 'in-progress';
      metadata.startedAt = metadata.startedAt ?? now.toISOString();
    }
    patch.metadata = this.pruneMetadata(metadata);

    const updated = await this.repository.updateTask(taskId, patch);
    if (!updated) {
      throw Object.assign(new Error('Task not found'), { status: 404 });
    }
    return this.toEntity(updated);
  }

  /**
   * Hard delete — the table has no `deleted_at`. Throws 404 rather than
   * reporting success for an id that was never there, so a client that deletes
   * the wrong id finds out.
   */
  async deleteTask(taskId: string, deletedBy: string): Promise<void> {
    const row = await this.repository.findTaskById(taskId);
    if (!row) {
      throw Object.assign(new Error('Task not found'), { status: 404 });
    }
    const deleted = await this.repository.deleteTask(taskId);
    if (!deleted) {
      throw Object.assign(new Error('Task not found'), { status: 404 });
    }
    logger.info('Task deleted', { taskId, projectId: row.projectId, deletedBy });
  }

  // ---------------------------------------------------------------------------
  // Assignment suggestions
  // ---------------------------------------------------------------------------

  async getTaskAssignmentSuggestions(taskId: string): Promise<TaskAssignmentSuggestion[]> {
    const task = await this.getTaskById(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { status: 404 });
    }

    const [members, agents] = await Promise.all([
      this.repository.findProjectMemberUsers(task.projectId),
      this.agentRepository.findMany({ isActive: true, status: 'idle' }),
    ]);

    const humanWorkloads = await Promise.all(
      members.map((member) => this.repository.countTasksByAssignee(member.id, 'in-progress'))
    );
    const agentWorkloads = await Promise.all(
      agents.map((agent) => this.repository.countTasksByAgentAssignee(agent.id, 'in-progress'))
    );

    const suggestions: TaskAssignmentSuggestion[] = [];

    members.forEach((member, index) => {
      const workload = humanWorkloads[index] ?? 0;
      suggestions.push({
        type: AssigneeType.HUMAN,
        userId: member.id,
        name: member.name,
        score: this.scoreAssignment(task, 'human', workload),
        reason: this.assignmentReason(task, 'human', workload, []),
        availability: workload > 10 ? 'busy' : 'available',
        // Human expertise has no store today; an empty list is the honest
        // answer, not a placeholder for one that was computed.
        expertise: [],
        workload,
      });
    });

    agents.forEach((agent, index) => {
      const workload = agentWorkloads[index] ?? 0;
      const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];
      suggestions.push({
        type: AssigneeType.AGENT,
        agentId: agent.id,
        name: agent.name,
        score: this.scoreAssignment(task, 'agent', workload, capabilities),
        reason: this.assignmentReason(task, 'agent', workload, capabilities),
        availability: workload > 5 ? 'busy' : 'available',
        expertise: capabilities,
        workload,
      });
    });

    return suggestions.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  private scoreAssignment(
    task: TaskEntity,
    assigneeType: 'human' | 'agent',
    workload: number,
    capabilities: string[] = []
  ): number {
    let score = 50;

    if (workload === 0) score += 20;
    else if (workload < 5) score += 10;
    else if (workload > 10) score -= 20;

    if (assigneeType === 'agent') {
      if (task.type === TaskType.RESEARCH) score += 15;
      if (task.type === TaskType.DOCUMENTATION) score += 10;
      if (task.type === TaskType.TESTING) score += 10;
      const haystack = `${task.title} ${task.description ?? ''}`.toLowerCase();
      score += capabilities.filter((cap) => haystack.includes(cap.toLowerCase())).length * 5;
    } else {
      if (task.type === TaskType.FEATURE) score += 15;
      if (task.type === TaskType.BUG) score += 10;
      if (task.type === TaskType.ENHANCEMENT) score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private assignmentReason(
    task: TaskEntity,
    assigneeType: 'human' | 'agent',
    workload: number,
    capabilities: string[]
  ): string {
    const reasons: string[] = [];

    if (workload === 0) reasons.push('Currently available');
    else if (workload < 5) reasons.push('Light workload');
    else if (workload > 10) reasons.push('Heavy workload');

    if (assigneeType === 'agent') {
      if (task.type === TaskType.RESEARCH) reasons.push('Good for research tasks');
      if (task.type === TaskType.DOCUMENTATION) reasons.push('Excellent for documentation');
      if (capabilities.length > 0) reasons.push('Has relevant capabilities');
    } else {
      if (task.type === TaskType.FEATURE) reasons.push('Great for feature development');
      if (task.type === TaskType.BUG) reasons.push('Good for bug fixes');
    }

    return reasons.join(', ') || 'Available for assignment';
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves an assignment request into the column value plus the metadata that
   * carries what the column cannot.
   *
   * A human assignee is required to be an active member of the project. That is
   * not decoration: `assignee_id` is a foreign key into control.users, so a
   * non-member id either fails the constraint at write time (a 500 the caller
   * cannot act on) or, worse, succeeds and puts someone with no access on the
   * task. An agent is required to exist for the same reason in reverse — its id
   * lives only in metadata, where nothing can check it later.
   */
  private async resolveAssignment(
    projectId: string,
    request: {
      assigneeType?: AssigneeType;
      assignedToUserId?: string;
      assignedToAgentId?: string;
    }
  ): Promise<{ assigneeId?: string; metadata: TaskMetadata }> {
    if (!request.assigneeType) return { assigneeId: undefined, metadata: {} };

    if (request.assigneeType === AssigneeType.HUMAN) {
      if (!request.assignedToUserId) {
        throw Object.assign(new Error('assignedToUserId is required for a human assignee'), {
          status: 400,
        });
      }
      const members = await this.repository.findProjectMemberUsers(projectId);
      const member = members.find((candidate) => candidate.id === request.assignedToUserId);
      if (!member) {
        throw Object.assign(new Error('Assigned user is not a member of this project'), {
          status: 400,
        });
      }
      return {
        assigneeId: member.id,
        metadata: {
          assigneeType: AssigneeType.HUMAN,
          assignedToAgentId: undefined,
          assigneeDisplayName: this.displayName(member),
        },
      };
    }

    if (!request.assignedToAgentId) {
      throw Object.assign(new Error('assignedToAgentId is required for an agent assignee'), {
        status: 400,
      });
    }
    const agent = await this.agentRepository.findById(request.assignedToAgentId);
    if (!agent) {
      throw Object.assign(new Error('Assigned agent not found'), { status: 400 });
    }
    return {
      assigneeId: undefined,
      metadata: {
        assigneeType: AssigneeType.AGENT,
        assignedToAgentId: agent.id,
        assigneeDisplayName: agent.name,
      },
    };
  }

  private displayName(member: ProjectMemberUser): string {
    return member.name || member.email;
  }

  /**
   * Drops undefined keys before the object reaches jsonb. `JSON.stringify` would
   * drop them anyway; doing it here means the value written and the value read
   * back are the same shape, so a diff of two metadata blobs is meaningful.
   */
  private pruneMetadata(metadata: TaskMetadata): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined)
    ) as Record<string, unknown>;
  }

  private async publish(
    channel: string,
    task: TaskEntity,
    actorId: string,
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    if (!this.eventPublisher) return;
    try {
      await this.eventPublisher.publish(channel, {
        taskId: task.id,
        projectId: task.projectId,
        task,
        actor: { id: actorId, type: 'user' },
        ...extra,
      });
    } catch (error) {
      // A task that was written must not be reported as failed because the
      // notification about it could not be sent.
      logger.warn('Failed to publish task event', {
        channel,
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
