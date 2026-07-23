import { DatabaseService } from './database_service';
import { EventBusService } from './event_bus_service';
import { logger } from '@uaip/utils';
import {
  ProjectEntity,
  ProjectStatus,
  ProjectVisibility,
  ProjectMemberEntity,
  ProjectRole,
  MemberStatus,
  ProjectType,
} from '@uaip/types';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | Date | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };
import type {
  CreateProjectData,
  ProjectAnalytics,
  ProjectMetrics,
} from '@uaip/types';
import type { Task } from './database/drizzle/schemas/control_schema';

interface IRepository<T = any> {
  findOne(opts: { where?: any }): Promise<T | null>;
  find(opts?: { where?: any; order?: any; take?: number; skip?: number }): Promise<T[]>;
  save(entity: any): Promise<T>;
  update(id: string, data: any): Promise<T | null>;
  count(opts?: { where?: any }): Promise<number>;
  createQueryBuilder(alias?: string): any;
}

// ---------------------------------------------------------------------------
// Slug generation — 8-char alphanumeric, e.g. "A3FX9K2B"
// ---------------------------------------------------------------------------
function generateSlug(length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

async function generateUniqueSlug(repo: IRepository<ProjectEntity>): Promise<string> {
  const tryGenerate = async (attempt: number): Promise<string> => {
    if (attempt >= 10) {
      return Date.now().toString(36).toUpperCase().slice(-8);
    }

    const slug = generateSlug();
    const existing = await repo.findOne({ where: { slug } });
    if (!existing) {
      return slug;
    }

    return tryGenerate(attempt + 1);
  };

  return tryGenerate(0);
}

function isRecord(value: object | null): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null;
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export type { CreateProjectData, ProjectAnalytics, ProjectMetrics };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProjectManagementService {
  private projectRepository: any;
  private memberRepository: any;
  private taskRepository: IRepository | null = null;

  constructor(
    private databaseService: DatabaseService,
    private eventBusService?: EventBusService
  ) {}

  async initialize(): Promise<void> {
    this.projectRepository = this.databaseService.getProjectRepository();
    this.memberRepository = this.databaseService.getProjectMemberRepository();
    this.taskRepository = this.databaseService.getTaskRepository();

    logger.info('Project Management Service initialized');
  }

  // -------------------------------------------------------------------------
  // Project CRUD
  // -------------------------------------------------------------------------

  async createProject(data: CreateProjectData): Promise<ProjectEntity> {
    try {
      const slug = await generateUniqueSlug(this.projectRepository);

      const project = this.projectRepository.create({
        name: data.name,
        description: data.description,
        ownerId: data.ownerId,
        type: data.type ?? ProjectType.GENERAL,
        status: ProjectStatus.ACTIVE,
        visibility: data.visibility ?? ProjectVisibility.PRIVATE,
        slug,
        tags: data.tags,
        settings: {
          allowedTools:
            isRecord(data.settings) && Array.isArray(data.settings.allowedTools)
              ? data.settings.allowedTools
              : [],
          ...(data.settings ?? {}),
        },
        metadata: {
          ...(data.metadata ?? {}),
          ...(data.category != null ? { category: data.category } : {}),
          ...(data.priority != null ? { priority: data.priority } : {}),
          ...(data.budget != null ? { budget: data.budget } : {}),
          ...(data.startDate != null ? { startDate: data.startDate } : {}),
          ...(data.endDate != null ? { endDate: data.endDate } : {}),
        },
        fileCount: 0,
        artifactCount: 0,
        totalSizeBytes: 0,
      });

      const savedProject = await this.projectRepository.save(project);

      // Add project owner as owner member
      await this.addProjectMember(savedProject.id, data.ownerId, ProjectRole.OWNER);

      // Emit project created event
      if (this.eventBusService) {
        await this.eventBusService.publish('project.created', {
          projectId: savedProject.id,
          ownerId: data.ownerId,
          name: data.name,
        });
      }

      logger.info('Project created', { projectId: savedProject.id, name: data.name });
      return savedProject;
    } catch (error) {
      logger.error('Failed to create project', { error, data });
      throw error;
    }
  }

  async getProject(id: string, _userId?: string): Promise<ProjectEntity | null> {
    try {
      return await this.projectRepository.findOne({ where: { id } });
    } catch (error) {
      logger.error('Failed to get project', { error, id });
      throw error;
    }
  }

  async getProjects(
    filters: {
      ownerId?: string;
      status?: ProjectStatus;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<ProjectEntity[]> {
    try {
      const { page = 1, limit = 20, ownerId, status } = filters;
      const skip = (page - 1) * limit;

      const qb = this.projectRepository.createQueryBuilder('project');

      if (ownerId) {
        qb.andWhere('project.ownerId = :ownerId', { ownerId });
      }
      if (status) {
        qb.andWhere('project.status = :status', { status });
      }

      return await qb.orderBy('project.createdAt', 'DESC').skip(skip).take(limit).getMany();
    } catch (error) {
      logger.error('Failed to get projects', { error, filters });
      throw error;
    }
  }

  async listProjects(
    filters: {
      ownerId?: string;
      status?: ProjectStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ projects: ProjectEntity[]; total: number }> {
    try {
      const qb = this.projectRepository.createQueryBuilder('project');

      if (filters.ownerId) {
        qb.andWhere('project.ownerId = :ownerId', { ownerId: filters.ownerId });
      }
      if (filters.status) {
        qb.andWhere('project.status = :status', { status: filters.status });
      }

      const total = await qb.getCount();

      // take/skip, not limit/offset — the repository is the Drizzle shim, which exposes
      // only the subset of the TypeORM builder used here. A default limit is always
      // supplied, so calling qb.limit() made every list request throw.
      if (filters.limit) qb.take(filters.limit);
      if (filters.offset) qb.skip(filters.offset);

      qb.orderBy('project.updatedAt', 'DESC');

      const projects = await qb.getMany();
      return { projects, total };
    } catch (error) {
      logger.error('Failed to list projects', { error, filters });
      throw error;
    }
  }

  async updateProject(id: string, updates: Partial<ProjectEntity>): Promise<ProjectEntity> {
    try {
      await this.projectRepository.update(id, updates);
      const updated = await this.getProject(id);

      if (!updated) {
        throw new Error(`Project ${id} not found`);
      }

      if (this.eventBusService) {
        await this.eventBusService.publish('project.updated', {
          projectId: id,
          updates: Object.keys(updates),
        });
      }

      return updated;
    } catch (error) {
      logger.error('Failed to update project', { error, id, updates });
      throw error;
    }
  }

  async deleteProject(id: string): Promise<void> {
    try {
      await this.projectRepository.update(id, {
        status: ProjectStatus.ARCHIVED,
        archivedAt: new Date(),
      });

      if (this.eventBusService) {
        await this.eventBusService.publish('project.deleted', { projectId: id });
      }

      logger.info('Project archived (soft-deleted)', { projectId: id });
    } catch (error) {
      logger.error('Failed to delete project', { error, id });
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Member management
  // -------------------------------------------------------------------------

  async addProjectMember(
    projectId: string,
    userId: string,
    role: ProjectRole = ProjectRole.MEMBER
  ): Promise<ProjectMemberEntity> {
    try {
      const existing = await this.memberRepository.findOne({
        where: { projectId, userId },
      });

      if (existing) {
        // Idempotent: return existing member rather than throwing
        return existing;
      }

      const member = this.memberRepository.create({
        projectId,
        userId,
        role,
        status: MemberStatus.ACTIVE,
        permissions: this.getDefaultPermissions(role),
        joinedAt: new Date(),
      });

      const saved = await this.memberRepository.save(member);

      if (this.eventBusService) {
        await this.eventBusService.publish('project.member.added', {
          projectId,
          userId,
          role,
        });
      }

      return saved;
    } catch (error) {
      logger.error('Failed to add project member', { error, projectId, userId, role });
      throw error;
    }
  }

  async getProjectMembers(projectId: string): Promise<ProjectMemberEntity[]> {
    return this.memberRepository.find({ where: { projectId }, order: { joinedAt: 'ASC' } });
  }

  async updateMemberRole(projectId: string, userId: string, role: ProjectRole): Promise<boolean> {
    const member = await this.memberRepository.findOne({ where: { projectId, userId } });
    if (!member) return false;
    await this.memberRepository.update(member.id, { role, permissions: this.getDefaultPermissions(role) });
    return true;
  }

  async removeProjectMember(projectId: string, userId: string): Promise<boolean> {
    const member = await this.memberRepository.findOne({ where: { projectId, userId } });
    if (!member) return false;
    await this.memberRepository.delete(member.id);
    return true;
  }

  async addProjectAgent(
    projectId: string,
    userId: string,
    _role: string = 'member'
  ): Promise<ProjectMemberEntity> {
    return this.addProjectMember(projectId, userId, ProjectRole.MEMBER);
  }

  // -------------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------------

  async getProjectTools(projectId: string): Promise<string[]> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const settings = isRecord(project.settings) ? project.settings : {};
    const allowedTools = settings.allowedTools;
    return Array.isArray(allowedTools)
      ? allowedTools.filter((toolId): toolId is string => typeof toolId === 'string')
      : [];
  }

  async assignProjectTools(projectId: string, toolIds: string[]): Promise<string[]> {
    const currentTools = await this.getProjectTools(projectId);
    const tools = Array.from(new Set([...currentTools, ...toolIds]));
    await this.updateProject(projectId, { settings: { allowedTools: tools } });
    return tools;
  }

  async removeProjectTools(projectId: string, toolIds: string[]): Promise<string[]> {
    const currentTools = await this.getProjectTools(projectId);
    const tools = currentTools.filter((toolId) => !toolIds.includes(toolId));
    await this.updateProject(projectId, { settings: { allowedTools: tools } });
    return tools;
  }

  async getProjectMetrics(projectId: string): Promise<ProjectMetrics> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    if (!this.taskRepository) throw new Error('Project Management Service is not initialized');
    const tasks: Task[] = await this.taskRepository.find({ where: { projectId } });
    const completedTasks = tasks.filter((task) => task.status === 'completed' || task.status === 'done');
    const taskCompletionRate = tasks.length === 0 ? 0 : completedTasks.length / tasks.length;
    const durations = completedTasks
      .map((task) => task.completedAt && task.createdAt
        ? task.completedAt.getTime() - task.createdAt.getTime()
        : null)
      .filter((duration): duration is number => typeof duration === 'number' && Number.isFinite(duration));
    const averageTaskDuration = durations.length === 0
      ? 0
      : durations.reduce((sum, duration) => sum + duration, 0) / durations.length;

    return {
      completionRate: project.status === ProjectStatus.COMPLETED ? 1 : taskCompletionRate,
      budgetUtilization: 0,
      taskCompletionRate,
      averageTaskDuration,
      toolUsageStats: [],
      agentPerformance: Array.from(
        tasks.reduce((agents, task) => {
          if (!task.assigneeId) return agents;
          const current = agents.get(task.assigneeId) ?? { tasksCompleted: 0, totalTasks: 0 };
          current.totalTasks += 1;
          if (task.status === 'completed' || task.status === 'done') current.tasksCompleted += 1;
          agents.set(task.assigneeId, current);
          return agents;
        }, new Map<string, { tasksCompleted: number; totalTasks: number }>())
      ).map(([agentId, stats]) => ({
        agentId,
        tasksCompleted: stats.tasksCompleted,
        successRate: stats.totalTasks === 0 ? 0 : stats.tasksCompleted / stats.totalTasks,
        averageTaskTime: 0,
        toolsUsed: 0,
      })),
    };
  }

  async getProjectAnalytics(filters: { ownerId?: string } = {}): Promise<ProjectAnalytics> {
    try {
      const qb = this.projectRepository.createQueryBuilder('project');
      if (filters.ownerId) {
        qb.andWhere('project.ownerId = :ownerId', { ownerId: filters.ownerId });
      }

      // The Drizzle shim has no getManyAndCount(); count first, then fetch.
      const totalProjects = await qb.getCount();
      const projects = await qb.getMany();

      const activeProjects = projects.filter((p: any) => p.status === ProjectStatus.ACTIVE).length;
      const completedProjects = projects.filter(
        (p: any) => p.status === ProjectStatus.COMPLETED
      ).length;

      return {
        totalProjects,
        activeProjects,
        completedProjects,
        totalBudget: 0,
        totalSpent: 0,
        averageCompletionTime: 0,
        topCategories: [],
        budgetUtilization: 0,
        overBudgetProjects: 0,
        overdueProjects: 0,
      };
    } catch (error) {
      logger.error('Failed to get project analytics', { error, filters });
      throw error;
    }
  }

  async recordToolUsage(data: {
    toolId: string;
    projectId: string;
    userId?: string;
    executionTimeMs?: number;
    success?: boolean;
    metadata?: JsonObject;
  }): Promise<void> {
    const metadata = isRecord(data.metadata ?? null) ? data.metadata : {};
    const metadataAgentId = metadata.agentId;
    const metadataError = metadata.errorMessage;

    await this.databaseService.getToolUsageRepository().recordToolUsage({
      toolId: data.toolId,
      agentId: typeof metadataAgentId === 'string' ? metadataAgentId : undefined,
      userId: data.userId,
      executionTimeMs: data.executionTimeMs,
      success: data.success,
      error: typeof metadataError === 'string' ? metadataError : undefined,
    });

    logger.info('Project tool usage recorded', {
      projectId: data.projectId,
      toolId: data.toolId,
      success: data.success,
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private getDefaultPermissions(role: ProjectRole): Record<string, boolean> {
    switch (role) {
      case ProjectRole.OWNER:
        return {
          canEditProject: true,
          canManageMembers: true,
          canUploadFiles: true,
          canDeleteFiles: true,
          canGenerateArtifacts: true,
          canDeleteArtifacts: true,
          canManageSettings: true,
        };
      case ProjectRole.ADMIN:
        return {
          canEditProject: true,
          canManageMembers: true,
          canUploadFiles: true,
          canDeleteFiles: true,
          canGenerateArtifacts: true,
          canDeleteArtifacts: false,
          canManageSettings: false,
        };
      case ProjectRole.MEMBER:
        return {
          canEditProject: false,
          canManageMembers: false,
          canUploadFiles: true,
          canDeleteFiles: false,
          canGenerateArtifacts: true,
          canDeleteArtifacts: false,
          canManageSettings: false,
        };
      default:
        return {
          canEditProject: false,
          canManageMembers: false,
          canUploadFiles: false,
          canDeleteFiles: false,
          canGenerateArtifacts: false,
          canDeleteArtifacts: false,
          canManageSettings: false,
        };
    }
  }
}
