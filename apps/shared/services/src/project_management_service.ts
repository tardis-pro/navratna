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
import type { NewTask, Task } from './database/drizzle/schemas/control_schema';
import type {
  CreateProjectData,
  CreateTaskData,
  ProjectAnalytics,
  ProjectMetrics,
} from '@uaip/types';

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

function isRecord(value: object | null): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export type { CreateProjectData, CreateTaskData, ProjectAnalytics, ProjectMetrics };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProjectManagementService {
  private projectRepository: any;
  private memberRepository: any;

  constructor(
    private databaseService: DatabaseService,
    private eventBusService?: EventBusService
  ) {}

  async initialize(): Promise<void> {
    this.projectRepository = this.databaseService.getProjectRepository();
    this.memberRepository = this.databaseService.getProjectMemberRepository();

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

      if (filters.limit) qb.limit(filters.limit);
      if (filters.offset) qb.offset(filters.offset);

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

  // Keep old name as alias so unknown other callers don't break
  async addProjectAgent(
    projectId: string,
    userId: string,
    _role: string = 'member'
  ): Promise<ProjectMemberEntity> {
    return this.addProjectMember(projectId, userId, ProjectRole.MEMBER);
  }

  // -------------------------------------------------------------------------
  // Analytics (stub — new entity has no budget/taskCount fields)
  // -------------------------------------------------------------------------

  async getProjectMetrics(projectId: string): Promise<ProjectMetrics> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    return {
      completionRate: 0,
      budgetUtilization: 0,
      taskCompletionRate: 0,
      averageTaskDuration: 0,
      toolUsageStats: [],
      agentPerformance: [],
    };
  }

  async getProjectAnalytics(filters: { ownerId?: string } = {}): Promise<ProjectAnalytics> {
    try {
      const qb = this.projectRepository.createQueryBuilder('project');
      if (filters.ownerId) {
        qb.andWhere('project.ownerId = :ownerId', { ownerId: filters.ownerId });
      }

      const [projects, totalProjects] = await qb.getManyAndCount();

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

  // -------------------------------------------------------------------------
  // Task management — stub (TaskEntity exists but routes forward to here)
  // -------------------------------------------------------------------------

  async createTask(
    data: CreateTaskData
  ): Promise<{ id: string; projectId: string; title: string }> {
    logger.warn('createTask called but TaskEntity integration not yet implemented', { data });
    return { id: `task-${Date.now()}`, projectId: data.projectId, title: data.title };
  }

  async updateTask(id: string, updates: Partial<NewTask>): Promise<Task> {
    logger.warn('updateTask called but TaskEntity integration not yet implemented', { id });
    return {
      id,
      projectId: String(updates.projectId ?? ''),
      title: String(updates.title ?? ''),
      description: typeof updates.description === 'string' ? updates.description : null,
      status: String(updates.status ?? 'pending'),
      priority: String(updates.priority ?? 'medium'),
      assigneeId: updates.assigneeId ?? null,
      dueAt: updates.dueAt ?? null,
      completedAt: updates.completedAt ?? null,
      metadata: (updates.metadata as Record<string, unknown> | null) ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async recordToolUsage(data: {
    toolId: string;
    projectId: string;
    userId?: string;
    executionTimeMs?: number;
    success?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    logger.warn('recordToolUsage called but tool usage tracking not yet implemented', { data });
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
