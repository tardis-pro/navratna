import { getControlDb } from '../drizzle/clients/index';
import { projects, projectMembers, tasks, users } from '../drizzle/schemas/control_schema';
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { StoryStatus } from '@uaip/types';

export type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;

/**
 * A project member who is a person, flattened for assignment scoring.
 *
 * `project_members` rows can carry a userId OR an agentId (agents are
 * cross-plane, in the intelligence database, with no FK), so the join has to
 * drop the agent rows rather than assume every member resolves to a user.
 */
export interface ProjectMemberUser {
  id: string;
  email: string;
  name: string;
}

export interface ProjectListFilters {
  // A PROJECT status (ProjectStatus), not a task's StoryStatus — different
  // vocabulary on a different column.
  status?: string;
  limit?: number;
}

export interface TaskListFilters {
  /**
   * A single status or a set of them. The HTTP task list accepts
   * `?status=a,b,c`; the MCP task tools pass one. Both end up here rather than
   * in two divergent query builders.
   */
  status?: StoryStatus | StoryStatus[];
  priority?: string | string[];
  /**
   * Statuses to exclude. Needed by the "overdue" filter, which means
   * `due_at < now AND status <> 'done'` — expressing that by fetching and then
   * discarding in the service would drop rows against the LIMIT instead.
   */
  excludeStatus?: StoryStatus[];
  assigneeId?: string;
  /** Agent assignment, which lives in `metadata` — see countTasksByAgentAssignee. */
  agentAssigneeId?: string;
  dueBefore?: Date;
  dueAfter?: Date;
  /** Case-insensitive substring over title and description. */
  search?: string;
  limit?: number;
}

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  status?: StoryStatus;
  priority?: string;
  assigneeId?: string;
  dueAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: StoryStatus;
  priority?: string;
  assigneeId?: string | null;
  dueAt?: Date | null;
  completedAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface TaskStatistics {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  /**
   * 'human' | 'agent' | 'unassigned'. Read out of `metadata` because there is no
   * assignee_type column; the key is always present so a caller can tell "no
   * agent work" from "the breakdown was not computed".
   */
  byAssigneeType: Record<string, number>;
}

export class ProjectTaskRepository {
  private get db() {
    return getControlDb();
  }

  async findProjectById(projectId: string): Promise<ProjectRow | null> {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Projects the user owns or is a member of. Membership is the authorisation
   * boundary for every agent-callable project/task tool, so this must stay the
   * single source of visibility.
   */
  async findAccessibleProjects(
    userId: string,
    filters: ProjectListFilters = {}
  ): Promise<ProjectRow[]> {
    const memberProjectIds = this.db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));

    const conditions = [
      sql`(${projects.ownerId} = ${userId} OR ${projects.id} IN ${memberProjectIds})`,
      isNull(projects.archivedAt),
    ];
    if (filters.status) conditions.push(eq(projects.status, filters.status));

    return this.db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.updatedAt))
      .limit(filters.limit ?? 50);
  }

  async userCanAccessProject(userId: string, projectId: string): Promise<boolean> {
    const [owned] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);
    if (owned) return true;

    const [member] = await this.db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1);
    return Boolean(member);
  }

  async findTaskById(taskId: string): Promise<TaskRow | null> {
    const [row] = await this.db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    return row ?? null;
  }

  /**
   * Filter clauses shared by both list queries, so a filter added for the HTTP
   * task list cannot silently not exist for the cross-project one.
   */
  private buildTaskFilterConditions(filters: TaskListFilters): SQL[] {
    const conditions: SQL[] = [];

    const statuses = asArray(filters.status);
    if (statuses.length === 1) conditions.push(eq(tasks.status, statuses[0]));
    else if (statuses.length > 1) conditions.push(inArray(tasks.status, statuses));

    const priorities = asArray(filters.priority);
    if (priorities.length === 1) conditions.push(eq(tasks.priority, priorities[0]));
    else if (priorities.length > 1) conditions.push(inArray(tasks.priority, priorities));

    if (filters.excludeStatus?.length) {
      conditions.push(notInArray(tasks.status, filters.excludeStatus));
    }

    if (filters.assigneeId) conditions.push(eq(tasks.assigneeId, filters.assigneeId));
    if (filters.agentAssigneeId) {
      conditions.push(sql`${tasks.metadata}->>'assignedToAgentId' = ${filters.agentAssigneeId}`);
    }
    if (filters.dueBefore) conditions.push(lte(tasks.dueAt, filters.dueBefore));
    if (filters.dueAfter) conditions.push(gte(tasks.dueAt, filters.dueAfter));
    if (filters.search) {
      const pattern = `%${filters.search}%`;
      const match = or(ilike(tasks.title, pattern), ilike(tasks.description, pattern));
      if (match) conditions.push(match);
    }

    return conditions;
  }

  async findTasksByProject(projectId: string, filters: TaskListFilters = {}): Promise<TaskRow[]> {
    const conditions = [eq(tasks.projectId, projectId), ...this.buildTaskFilterConditions(filters)];

    return this.db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.updatedAt))
      .limit(filters.limit ?? 100);
  }

  async findTasksByProjectIds(
    projectIds: string[],
    filters: TaskListFilters = {}
  ): Promise<TaskRow[]> {
    if (projectIds.length === 0) return [];

    const conditions = [
      inArray(tasks.projectId, projectIds),
      ...this.buildTaskFilterConditions(filters),
    ];

    return this.db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.updatedAt))
      .limit(filters.limit ?? 100);
  }

  async createTask(input: CreateTaskInput): Promise<TaskRow> {
    const [row] = await this.db
      .insert(tasks)
      .values({
        projectId: input.projectId,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? 'backlog',
        priority: input.priority ?? 'medium',
        assigneeId: input.assigneeId ?? null,
        dueAt: input.dueAt ?? null,
        metadata: input.metadata ?? null,
      })
      .returning();
    return row;
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<TaskRow | null> {
    const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.status !== undefined) patch.status = input.status;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;
    if (input.dueAt !== undefined) patch.dueAt = input.dueAt;
    if (input.completedAt !== undefined) patch.completedAt = input.completedAt;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const [row] = await this.db
      .update(tasks)
      .set(patch)
      .where(eq(tasks.id, taskId))
      .returning();
    return row ?? null;
  }

  async countTasksByProject(projectId: string): Promise<number> {
    const [row] = await this.db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.projectId, projectId));
    return row?.cnt ?? 0;
  }

  /**
   * Hard delete. The `tasks` table has no `deleted_at` column, so there is no
   * soft delete to perform — a service that set one would be writing a field
   * that is silently dropped and then reading it back as "not deleted" on the
   * next request. Returns whether a row actually went away so the caller can
   * answer 404 instead of reporting success for an id that never existed.
   */
  async deleteTask(taskId: string): Promise<boolean> {
    const rows = await this.db.delete(tasks).where(eq(tasks.id, taskId)).returning({ id: tasks.id });
    return rows.length > 0;
  }

  /**
   * Members of a project that resolve to real users.
   *
   * `project_members` has no `status` column — an earlier query filtered on
   * `pm.status = 'active'` and would have matched nothing had it ever run.
   * Membership itself is the only signal the table carries.
   */
  async findProjectMemberUsers(projectId: string): Promise<ProjectMemberUser[]> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(and(eq(projectMembers.projectId, projectId), eq(users.isActive, true)));

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || row.email,
    }));
  }

  /** How many tasks a person is actively carrying, used to score assignment suggestions. */
  async countTasksByAssignee(userId: string, status: StoryStatus): Promise<number> {
    const [row] = await this.db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.assigneeId, userId), eq(tasks.status, status)));
    return row?.cnt ?? 0;
  }

  /**
   * The same count for an agent. Agent assignment cannot live in `assignee_id`
   * — that column is an FK to control.users and agents are rows in a different
   * database — so it is carried in `metadata.assignedToAgentId` and has to be
   * counted through the jsonb.
   */
  async countTasksByAgentAssignee(agentId: string, status: StoryStatus): Promise<number> {
    const [row] = await this.db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(sql`${tasks.metadata}->>'assignedToAgentId' = ${agentId}`, eq(tasks.status, status))
      );
    return row?.cnt ?? 0;
  }

  async getTaskStatistics(projectId: string): Promise<TaskStatistics> {
    const assigneeType = sql<string | null>`${tasks.metadata}->>'assigneeType'`;
    const rows = await this.db
      .select({
        status: tasks.status,
        priority: tasks.priority,
        assigneeType,
        cnt: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .groupBy(tasks.status, tasks.priority, assigneeType);

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byAssigneeType: Record<string, number> = { human: 0, agent: 0, unassigned: 0 };
    let total = 0;
    for (const row of rows) {
      const cnt = row.cnt ?? 0;
      total += cnt;
      byStatus[row.status] = (byStatus[row.status] ?? 0) + cnt;
      byPriority[row.priority] = (byPriority[row.priority] ?? 0) + cnt;
      const bucket = row.assigneeType ?? 'unassigned';
      byAssigneeType[bucket] = (byAssigneeType[bucket] ?? 0) + cnt;
    }
    return { total, byStatus, byPriority, byAssigneeType };
  }
}
