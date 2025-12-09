import { Repository } from 'typeorm';
import { DatabaseService } from './databaseService.js';
import { EventBusService } from './eventBusService.js';
import { logger } from '@uaip/utils';
import {
  Project,
  ProjectTask,
  ProjectToolUsage,
  ProjectAgent,
  ProjectWorkflow,
  TaskExecution,
} from './entities/Project.js';
import { ProjectStatus, ProjectPriority, ProjectVisibility } from '@uaip/types';

export interface CreateProjectData {
  name: string;
  description?: string;
  ownerId: string;
  organizationId?: string;
  category?: string;
  tags?: string[];
  priority?: ProjectPriority;
  visibility?: ProjectVisibility;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  settings?: any;
  metadata?: any;
}

export interface CreateTaskData {
  projectId: string;
  title: string;
  description?: string;
  priority?: ProjectPriority;
  assignedAgentId?: string;
  assignedUserId?: string;
  requirements?: any;
  tools?: string[];
  estimatedCost?: number;
  estimatedDuration?: number;
  dueDate?: Date;
}

export interface ProjectAnalytics {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalBudget: number;
  totalSpent: number;
  averageCompletionTime: number;
  topCategories: Array<{ category: string; count: number }>;
  budgetUtilization: number;
  overBudgetProjects: number;
  overdueProjects: number;
}

export interface ProjectMetrics {
  completionRate: number;
  budgetUtilization: number;
  taskCompletionRate: number;
  averageTaskDuration: number;
  toolUsageStats: Array<{
    toolId: string;
    toolName: string;
    usageCount: number;
    successRate: number;
    averageCost: number;
  }>;
  agentPerformance: Array<{
    agentId: string;
    tasksCompleted: number;
    successRate: number;
    averageTaskTime: number;
    toolsUsed: number;
  }>;
}

export class ProjectManagementService {
  private projectRepository: Repository<Project>;
  private taskRepository: Repository<ProjectTask>;
  private toolUsageRepository: Repository<ProjectToolUsage>;
  private agentRepository: Repository<ProjectAgent>;
  private workflowRepository: Repository<ProjectWorkflow>;
  private executionRepository: Repository<TaskExecution>;

  constructor(
    private databaseService: DatabaseService,
    private eventBusService?: EventBusService
  ) {}

  async initialize(): Promise<void> {
    const dataSource = await this.databaseService.getDataSource();
    this.projectRepository = dataSource.getRepository(Project);
    this.taskRepository = dataSource.getRepository(ProjectTask);
    this.toolUsageRepository = dataSource.getRepository(ProjectToolUsage);
    this.agentRepository = dataSource.getRepository(ProjectAgent);
    this.workflowRepository = dataSource.getRepository(ProjectWorkflow);
    this.executionRepository = dataSource.getRepository(TaskExecution);

    logger.info('Project Management Service initialized');
  }

  // Project Management
  async createProject(data: CreateProjectData): Promise<Project> {
    try {
      const project = this.projectRepository.create({
        ...data,
        status: ProjectStatus.ACTIVE,
        priority: data.priority || ProjectPriority.MEDIUM,
        visibility: data.visibility || ProjectVisibility.PRIVATE,
        budget: data.budget || 0,
        spent: 0,
        taskCount: 0,
        completedTaskCount: 0,
        toolUsageCount: 0,
      });

      const savedProject = await this.projectRepository.save(project);

      // Add project owner as admin
      await this.addProjectAgent(savedProject.id, data.ownerId, 'owner');

      // Emit project created event
      if (this.eventBusService) {
        await this.eventBusService.publish('project.created', {
          projectId: savedProject.id,
          ownerId: data.ownerId,
          name: data.name,
          category: data.category,
        });
      }

      logger.info('Project created', { projectId: savedProject.id, name: data.name });
      return savedProject;
    } catch (error) {
      logger.error('Failed to create project', { error, data });
      throw error;
    }
  }

  async getProject(id: string, userId?: string): Promise<Project | null> {
    try {
      const queryBuilder = this.projectRepository
        .createQueryBuilder('project')
        .leftJoinAndSelect('project.agents', 'agents')
        .leftJoinAndSelect('project.tasks', 'tasks')
        .where('project.id = :id', { id });

      // Add access control if userId provided
      if (userId) {
        queryBuilder.andWhere(
          '(project.ownerId = :userId OR project.visibility = :public OR agents.agentId = :userId)',
          { userId, public: ProjectVisibility.PUBLIC }
        );
      }

      return await queryBuilder.getOne();
    } catch (error) {
      logger.error('Failed to get project', { error, id, userId });
      throw error;
    }
  }

  async getProjects(
    filters: {
      ownerId?: string;
      organizationId?: string;
      status?: ProjectStatus;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<Project[]> {
    try {
      const { page = 1, limit = 20, ownerId, organizationId, status } = filters;
      const skip = (page - 1) * limit;

      const queryBuilder = this.projectRepository.createQueryBuilder('project');

      if (ownerId) {
        queryBuilder.andWhere('project.ownerId = :ownerId', { ownerId });
      }

      if (organizationId) {
        queryBuilder.andWhere('project.organizationId = :organizationId', { organizationId });
      }

      if (status) {
        queryBuilder.andWhere('project.status = :status', { status });
      }

      return await queryBuilder
        .orderBy('project.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .getMany();
    } catch (error) {
      logger.error('Failed to get projects', { error, filters });
      throw error;
    }
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    try {
      await this.projectRepository.update(id, updates);
      const updated = await this.getProject(id);

      if (!updated) {
        throw new Error(`Project ${id} not found`);
      }

      // Emit update event
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
      // Soft delete by updating status
      await this.projectRepository.update(id, {
        status: ProjectStatus.ARCHIVED,
        updatedAt: new Date(),
      });

      // Emit deletion event
      if (this.eventBusService) {
        await this.eventBusService.publish('project.deleted', { projectId: id });
      }

      logger.info('Project deleted', { projectId: id });
    } catch (error) {
      logger.error('Failed to delete project', { error, id });
      throw error;
    }
  }

  async listProjects(
    filters: {
      ownerId?: string;
      organizationId?: string;
      status?: ProjectStatus;
      category?: string;
      tags?: string[];
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ projects: Project[]; total: number }> {
    try {
      const queryBuilder = this.projectRepository
        .createQueryBuilder('project')
        .leftJoinAndSelect('project.agents', 'agents');

      if (filters.ownerId) {
        queryBuilder.andWhere('project.ownerId = :ownerId', { ownerId: filters.ownerId });
      }

      if (filters.organizationId) {
        queryBuilder.andWhere('project.organizationId = :organizationId', {
          organizationId: filters.organizationId,
        });
      }

      if (filters.status) {
        queryBuilder.andWhere('project.status = :status', { status: filters.status });
      }

      if (filters.category) {
        queryBuilder.andWhere('project.category = :category', { category: filters.category });
      }

      if (filters.tags?.length) {
        queryBuilder.andWhere('project.tags && :tags', { tags: filters.tags });
      }

      const total = await queryBuilder.getCount();

      if (filters.limit) {
        queryBuilder.limit(filters.limit);
      }

      if (filters.offset) {
        queryBuilder.offset(filters.offset);
      }

      queryBuilder.orderBy('project.updatedAt', 'DESC');

      const projects = await queryBuilder.getMany();

      return { projects, total };
    } catch (error) {
      logger.error('Failed to list projects', { error, filters });
      throw error;
    }
  }

  // Task Management
  async createTask(data: CreateTaskData): Promise<ProjectTask> {
    try {
      const task = this.taskRepository.create({
        ...data,
        status: 'pending',
        priority: data.priority || ProjectPriority.MEDIUM,
        estimatedCost: data.estimatedCost || 0,
        actualCost: 0,
        estimatedDuration: data.estimatedDuration || 0,
        actualDuration: 0,
      });

      const savedTask = await this.taskRepository.save(task);

      // Update project task count
      await this.projectRepository.increment({ id: data.projectId }, 'taskCount', 1);

      // Emit task created event
      if (this.eventBusService) {
        await this.eventBusService.publish('task.created', {
          taskId: savedTask.id,
          projectId: data.projectId,
          assignedAgentId: data.assignedAgentId,
        });
      }

      logger.info('Task created', { taskId: savedTask.id, projectId: data.projectId });
      return savedTask;
    } catch (error) {
      logger.error('Failed to create task', { error, data });
      throw error;
    }
  }

  async updateTask(id: string, updates: Partial<ProjectTask>): Promise<ProjectTask> {
    try {
      const task = await this.taskRepository.findOne({ where: { id } });
      if (!task) {
        throw new Error(`Task ${id} not found`);
      }

      // Check if status changed to completed
      const wasCompleted = task.status === 'completed';
      const isCompleted = updates.status === 'completed';

      await this.taskRepository.update(id, updates);

      // Update project completion count if task status changed
      if (!wasCompleted && isCompleted) {
        await this.projectRepository.increment({ id: task.projectId }, 'completedTaskCount', 1);
        updates.completedAt = new Date();
      } else if (wasCompleted && updates.status && updates.status !== 'completed') {
        await this.projectRepository.decrement({ id: task.projectId }, 'completedTaskCount', 1);
      }

      const updatedTask = await this.taskRepository.findOne({ where: { id } });

      // Emit update event
      if (this.eventBusService) {
        await this.eventBusService.publish('task.updated', {
          taskId: id,
          projectId: task.projectId,
          statusChanged: task.status !== updates.status,
        });
      }

      return updatedTask!;
    } catch (error) {
      logger.error('Failed to update task', { error, id, updates });
      throw error;
    }
  }

  // Tool Usage Tracking
  async recordToolUsage(data: {
    projectId: string;
    taskId?: string;
    toolId: string;
    toolName: string;
    agentId?: string;
    userId?: string;
    operation?: string;
    success: boolean;
    executionTime: number;
    cost?: number;
    input?: any;
    output?: any;
    errorMessage?: string;
    metadata?: any;
  }): Promise<ProjectToolUsage> {
    try {
      const usage = this.toolUsageRepository.create({
        ...data,
        cost: data.cost || 0,
      });

      const savedUsage = await this.toolUsageRepository.save(usage);

      // Update project tool usage count and spent amount
      await this.projectRepository.increment({ id: data.projectId }, 'toolUsageCount', 1);
      if (data.cost) {
        await this.projectRepository.increment({ id: data.projectId }, 'spent', data.cost);
      }

      // Update task actual cost if task provided
      if (data.taskId && data.cost) {
        await this.taskRepository.increment({ id: data.taskId }, 'actualCost', data.cost);
      }

      // Emit usage event
      if (this.eventBusService) {
        await this.eventBusService.publish('tool.usage.recorded', {
          projectId: data.projectId,
          toolId: data.toolId,
          success: data.success,
          cost: data.cost,
        });
      }

      return savedUsage;
    } catch (error) {
      logger.error('Failed to record tool usage', { error, data });
      throw error;
    }
  }

  // Agent Management
  async addProjectAgent(
    projectId: string,
    agentId: string,
    role: string = 'member'
  ): Promise<ProjectAgent> {
    try {
      const existingAgent = await this.agentRepository.findOne({
        where: { projectId, agentId },
      });

      if (existingAgent) {
        throw new Error(`Agent ${agentId} already exists in project ${projectId}`);
      }

      const agent = this.agentRepository.create({
        projectId,
        agentId,
        role,
        permissions: this.getDefaultPermissions(role),
        budgetAllocation: 0,
        budgetUsed: 0,
        isActive: true,
      });

      const savedAgent = await this.agentRepository.save(agent);

      // Emit agent added event
      if (this.eventBusService) {
        await this.eventBusService.publish('project.agent.added', {
          projectId,
          agentId,
          role,
        });
      }

      return savedAgent;
    } catch (error) {
      logger.error('Failed to add project agent', { error, projectId, agentId, role });
      throw error;
    }
  }

  // Analytics and Metrics
  async getProjectMetrics(projectId: string): Promise<ProjectMetrics> {
    try {
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Tool usage stats
      const toolUsageStats = await this.toolUsageRepository
        .createQueryBuilder('usage')
        .select('usage.toolId', 'toolId')
        .addSelect('usage.toolName', 'toolName')
        .addSelect('COUNT(*)', 'usageCount')
        .addSelect('AVG(CASE WHEN usage.success THEN 1 ELSE 0 END)', 'successRate')
        .addSelect('AVG(usage.cost)', 'averageCost')
        .where('usage.projectId = :projectId', { projectId })
        .groupBy('usage.toolId')
        .addGroupBy('usage.toolName')
        .orderBy('usageCount', 'DESC')
        .getRawMany();

      // Agent performance
      const agentPerformance = await this.taskRepository
        .createQueryBuilder('task')
        .select('task.assignedAgentId', 'agentId')
        .addSelect('COUNT(CASE WHEN task.status = :completed THEN 1 END)', 'tasksCompleted')
        .addSelect('AVG(CASE WHEN task.status = :completed THEN 1 ELSE 0 END)', 'successRate')
        .addSelect('AVG(task.actualDuration)', 'averageTaskTime')
        .addSelect('COUNT(DISTINCT usage.toolId)', 'toolsUsed')
        .leftJoin('task.executions', 'execution')
        .leftJoin(ProjectToolUsage, 'usage', 'usage.taskId = task.id')
        .where('task.projectId = :projectId', { projectId })
        .andWhere('task.assignedAgentId IS NOT NULL')
        .setParameter('completed', 'completed')
        .groupBy('task.assignedAgentId')
        .getRawMany();

      // Task completion stats
      const taskStats = await this.taskRepository
        .createQueryBuilder('task')
        .select('AVG(task.actualDuration)', 'averageTaskDuration')
        .where('task.projectId = :projectId', { projectId })
        .andWhere('task.status = :completed', { completed: 'completed' })
        .getRawOne();

      return {
        completionRate: project.completionPercentage,
        budgetUtilization: project.budgetUtilization,
        taskCompletionRate:
          project.taskCount > 0 ? (project.completedTaskCount / project.taskCount) * 100 : 0,
        averageTaskDuration: parseFloat(taskStats?.averageTaskDuration) || 0,
        toolUsageStats: toolUsageStats.map((stat) => ({
          toolId: stat.toolId,
          toolName: stat.toolName,
          usageCount: parseInt(stat.usageCount),
          successRate: parseFloat(stat.successRate) || 0,
          averageCost: parseFloat(stat.averageCost) || 0,
        })),
        agentPerformance: agentPerformance.map((perf) => ({
          agentId: perf.agentId,
          tasksCompleted: parseInt(perf.tasksCompleted),
          successRate: parseFloat(perf.successRate) || 0,
          averageTaskTime: parseFloat(perf.averageTaskTime) || 0,
          toolsUsed: parseInt(perf.toolsUsed) || 0,
        })),
      };
    } catch (error) {
      logger.error('Failed to get project metrics', { error, projectId });
      throw error;
    }
  }

  async getProjectAnalytics(
    filters: {
      ownerId?: string;
      organizationId?: string;
      dateFrom?: Date;
      dateTo?: Date;
    } = {}
  ): Promise<ProjectAnalytics> {
    try {
      const queryBuilder = this.projectRepository.createQueryBuilder('project');

      if (filters.ownerId) {
        queryBuilder.andWhere('project.ownerId = :ownerId', { ownerId: filters.ownerId });
      }

      if (filters.organizationId) {
        queryBuilder.andWhere('project.organizationId = :organizationId', {
          organizationId: filters.organizationId,
        });
      }

      if (filters.dateFrom) {
        queryBuilder.andWhere('project.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
      }

      if (filters.dateTo) {
        queryBuilder.andWhere('project.createdAt <= :dateTo', { dateTo: filters.dateTo });
      }

      const [projects, totalProjects] = await queryBuilder.getManyAndCount();

      const activeProjects = projects.filter((p) => p.status === ProjectStatus.ACTIVE).length;
      const completedProjects = projects.filter((p) => p.status === ProjectStatus.COMPLETED).length;
      const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0);
      const totalSpent = projects.reduce((sum, p) => sum + p.spent, 0);
      const overBudgetProjects = projects.filter((p) => p.isOverBudget).length;
      const overdueProjects = projects.filter((p) => p.isOverdue).length;

      // Category analysis
      const categoryCount = new Map<string, number>();
      projects.forEach((p) => {
        if (p.category) {
          categoryCount.set(p.category, (categoryCount.get(p.category) || 0) + 1);
        }
      });

      const topCategories = Array.from(categoryCount.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Average completion time for completed projects
      const completedProjectsWithDates = projects.filter(
        (p) => p.status === ProjectStatus.COMPLETED && p.startDate && p.updatedAt
      );

      const averageCompletionTime =
        completedProjectsWithDates.length > 0
          ? completedProjectsWithDates.reduce((sum, p) => {
              const duration = p.updatedAt.getTime() - p.startDate!.getTime();
              return sum + duration;
            }, 0) / completedProjectsWithDates.length
          : 0;

      return {
        totalProjects,
        activeProjects,
        completedProjects,
        totalBudget,
        totalSpent,
        averageCompletionTime,
        topCategories,
        budgetUtilization: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
        overBudgetProjects,
        overdueProjects,
      };
    } catch (error) {
      logger.error('Failed to get project analytics', { error, filters });
      throw error;
    }
  }

  // Utility methods
  private getDefaultPermissions(role: string): string[] {
    const permissionSets: Record<string, string[]> = {
      owner: ['read', 'write', 'delete', 'admin', 'invite', 'manage_agents', 'manage_budget'],
      admin: ['read', 'write', 'invite', 'manage_agents'],
      member: ['read', 'write'],
      viewer: ['read'],
    };

    const permissions = permissionSets[role];
    return permissions ?? permissionSets.viewer;
  }
}
