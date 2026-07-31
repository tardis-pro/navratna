import { getControlDb } from '../drizzle/clients/index';
import { projects, projectMembers, tasks } from '../drizzle/schemas/control_schema';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

export type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;

export interface ProjectListFilters {
  status?: string;
  limit?: number;
}

export interface TaskListFilters {
  status?: string;
  priority?: string;
  assigneeId?: string;
  limit?: number;
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  dueAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: string;
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

  async findTasksByProject(projectId: string, filters: TaskListFilters = {}): Promise<TaskRow[]> {
    const conditions = [eq(tasks.projectId, projectId)];
    if (filters.status) conditions.push(eq(tasks.status, filters.status));
    if (filters.priority) conditions.push(eq(tasks.priority, filters.priority));
    if (filters.assigneeId) conditions.push(eq(tasks.assigneeId, filters.assigneeId));

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

    const conditions = [inArray(tasks.projectId, projectIds)];
    if (filters.status) conditions.push(eq(tasks.status, filters.status));
    if (filters.priority) conditions.push(eq(tasks.priority, filters.priority));
    if (filters.assigneeId) conditions.push(eq(tasks.assigneeId, filters.assigneeId));

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
        status: input.status ?? 'pending',
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

  async getTaskStatistics(projectId: string): Promise<TaskStatistics> {
    const rows = await this.db
      .select({
        status: tasks.status,
        priority: tasks.priority,
        cnt: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .groupBy(tasks.status, tasks.priority);

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      const cnt = row.cnt ?? 0;
      total += cnt;
      byStatus[row.status] = (byStatus[row.status] ?? 0) + cnt;
      byPriority[row.priority] = (byPriority[row.priority] ?? 0) + cnt;
    }
    return { total, byStatus, byPriority };
  }
}
