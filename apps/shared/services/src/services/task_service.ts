import {
  TaskEntity,
  TaskType,
  AssigneeType,
  TaskActivityEntry,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskFilters,
  TaskAssignmentRequest,
  TaskAssignmentSuggestion,
} from '@uaip/types';
import {
  STORY_STATUSES,
  STORY_STATUS_TRANSITIONS,
  canTransitionStoryStatus,
  toStoryStatus,
  type StoryStatus,
} from '@uaip/types';
import { ProjectEntity } from '../entities/project_entity';
import { UserEntity } from '../entities/user_entity';
import { Agent } from '../entities/agent_entity';
import { v4 as uuidv4 } from 'uuid';

type AssignmentContext = {
  workload: number;
  capabilities?: string[];
  skills?: Array<{ name: string; description?: string; enabled?: boolean }>;
};

// Local interface compatible with DrizzleRepository
interface IRepository<T = any> {
  findOne(opts: { where?: any }): Promise<T | null>;
  find(opts?: { where?: any; order?: any; take?: number; skip?: number }): Promise<T[]>;
  save(entity: any): Promise<T>;
  create(entity: any): Promise<T>;
  update(id: string, data: any): Promise<T | null>;
  count(opts?: { where?: any }): Promise<number>;
  createQueryBuilder(alias?: string): IQueryBuilder<T>;
}

interface IQueryBuilder<T = any> {
  leftJoinAndSelect(relation: string, alias: string): this;
  innerJoin(table: string, alias: string, condition: string): this;
  where(condition: string, params?: any): this;
  andWhere(condition: string, params?: any): this;
  orderBy(column: string, direction: 'ASC' | 'DESC'): this;
  addOrderBy(column: string, direction: 'ASC' | 'DESC'): this;
  skip(n: number): this;
  take(n: number): this;
  select(cols: string[]): this;
  addSelect(expr: string, alias?: string): this;
  groupBy(expr: string): this;
  getMany(): Promise<T[]>;
  getRawMany(): Promise<any[]>;
}

// Simple logger fallback
const logger = {
  info: (_msg: string, _data?: unknown) => {},
  error: (msg: string, data?: unknown) => console.error('[ERROR]', msg, data),
  warn: (msg: string, data?: unknown) => console.warn('[WARN]', msg, data),
  debug: (_msg: string, _data?: unknown) => {},
};

export class TaskService {
  private static instance: TaskService;

  // Repositories - will be injected/initialized when needed
  private taskRepository: IRepository<TaskEntity> | null = null;
  private projectRepository: IRepository<ProjectEntity> | null = null;
  private userRepository: IRepository<UserEntity> | null = null;
  private agentRepository: IRepository<Agent> | null = null;
  private eventBusService: {
    publish: (event: string, data: Record<string, unknown>) => void;
  } | null = null;

  protected constructor() {
    // Domain service - no direct database dependencies
  }

  public static getInstance(): TaskService {
    if (!TaskService.instance) {
      TaskService.instance = new TaskService();
    }
    return TaskService.instance;
  }

  // Repository setters for dependency injection
  public setRepositories(repositories: {
    taskRepository: IRepository<TaskEntity>;
    projectRepository: IRepository<ProjectEntity>;
    userRepository: IRepository<UserEntity>;
    agentRepository: IRepository<Agent>;
    eventBusService?: { publish: (event: string, data: Record<string, unknown>) => void };
  }) {
    this.taskRepository = repositories.taskRepository;
    this.projectRepository = repositories.projectRepository;
    this.userRepository = repositories.userRepository;
    this.agentRepository = repositories.agentRepository;
    this.eventBusService = repositories.eventBusService ?? null;
  }

  private async requireUser(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new Error('Assigned user not found');
  }

  private async requireAgent(agentId: string): Promise<void> {
    const agent = await this.agentRepository.findOne({ where: { id: agentId } });
    if (!agent) throw new Error('Assigned agent not found');
  }

  async createTask(request: CreateTaskRequest): Promise<TaskEntity> {
    if (
      !this.taskRepository ||
      !this.projectRepository ||
      !this.userRepository ||
      !this.agentRepository
    ) {
      throw new Error('TaskService not properly initialized. Call setRepositories() first.');
    }

    try {
      // Validate project exists
      const project = await this.projectRepository.findOne({
        where: { id: request.projectId },
      });
      if (!project) {
        throw new Error('Project not found');
      }

      if (request.assigneeType && request.assignedToUserId) {
        await this.requireUser(request.assignedToUserId);
      }
      if (request.assigneeType && request.assignedToAgentId) {
        await this.requireAgent(request.assignedToAgentId);
      }

      // Generate task number
      const taskCount = await this.taskRepository.count({
        where: { projectId: request.projectId },
      });
      const taskNumber = `${project.slug}-${(taskCount + 1).toString().padStart(3, '0')}`;

      // Create task
      const task = this.taskRepository.create({
        ...request,
        taskNumber,
        assignedAt: request.assigneeType ? new Date() : undefined,
        lastActivityAt: new Date(),
        settings: {
          timeTracking: true,
          notifyOnStatusChange: true,
          notifyOnComments: true,
          estimatedHours: request.estimatedHours || 0,
          ...request.settings,
        },
        metrics: {
          timeSpent: 0,
          estimatedTime: request.estimatedHours ? request.estimatedHours * 60 : 0,
          completionPercentage: 0,
          reopenCount: 0,
          commentCount: 0,
          attachmentCount: 0,
        },
        activityLog: [
          {
            id: uuidv4(),
            timestamp: new Date(),
            action: 'created',
            userId: request.createdBy,
            userName: 'System', // Will be populated by activity logging
            details: { taskNumber, title: request.title },
          },
        ],
      });

      const savedTask = await this.taskRepository.save(task);

      // Log activity
      if (request.assigneeType) {
        await this.logActivity(savedTask.id, 'assigned', request.createdBy, {
          assigneeType: request.assigneeType,
          assignedToUserId: request.assignedToUserId,
          assignedToAgentId: request.assignedToAgentId,
        });
      }

      // Emit task created event
      this.eventBusService?.publish('task.created', {
        taskId: savedTask.id,
        projectId: savedTask.projectId,
        task: savedTask,
        actor: {
          id: request.createdBy,
          name: 'User', // Would be populated from user lookup
          type: 'user',
        },
      });

      logger.info(`Task created: ${savedTask.taskNumber} - ${savedTask.title}`);
      return savedTask;
    } catch (error) {
      logger.error('Error creating task:', error);
      throw error;
    }
  }

  async updateTask(taskId: string, request: UpdateTaskRequest): Promise<TaskEntity> {
    try {
      const task = await this.getTaskById(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      // Track changes for activity log
      const changes: Record<string, { old: unknown; new: unknown }> = {};

      // Handle status changes
      //
      // GUARDED. Status is otherwise a free PUT: any value could replace any
      // other, so a task could go 'backlog' → 'done' having never been worked, or
      // a completed task could be silently reopened. Both the stored value and
      // the requested one are normalised first, because rows written before the
      // StoryStatus migration still carry the TaskService vocabulary
      // (todo/in_progress/...) or the old 'pending' default.
      if (request.status && request.status !== task.status) {
        const from = toStoryStatus(task.status);
        const to = toStoryStatus(request.status);

        if (!to) {
          throw new Error(
            `Unknown task status '${String(request.status)}'. Valid statuses: ${STORY_STATUSES.join(', ')}`
          );
        }
        // An unrecognised stored value cannot constrain anything, so it is
        // treated as unblocked rather than trapping the task permanently.
        if (from && !canTransitionStoryStatus(from, to)) {
          throw new Error(
            `Illegal task status transition '${from}' → '${to}'. Allowed from '${from}': ` +
              `${STORY_STATUS_TRANSITIONS[from].join(', ')}`
          );
        }

        changes.status = { old: task.status, new: to };
        request.status = to;

        // Update timing fields based on status
        if (to === 'in-progress' && !task.startedAt) {
          task.startedAt = new Date();
        }
        if (to === 'done' && !task.completedAt) {
          task.completedAt = new Date();
        }
      }

      // Handle assignment changes
      if (request.assigneeType !== undefined) {
        if (request.assigneeType !== task.assigneeType) {
          changes.assigneeType = { old: task.assigneeType, new: request.assigneeType };
        }

        // Clear previous assignment
        task.assignedToUserId = undefined;
        task.assignedToAgentId = undefined;

        // Set new assignment
        if (request.assigneeType === AssigneeType.HUMAN && request.assignedToUserId) {
          task.assignedToUserId = request.assignedToUserId;
        }
        if (request.assigneeType === AssigneeType.AGENT && request.assignedToAgentId) {
          task.assignedToAgentId = request.assignedToAgentId;
        }

        task.assignedAt = new Date();
      }

      // Update other fields
      Object.assign(task, request);
      task.lastActivityAt = new Date();

      const savedTask = await this.taskRepository.save(task);

      // Log activity for changes
      for (const [field, change] of Object.entries(changes)) {
        // eslint-disable-next-line no-await-in-loop
        await this.logActivity(taskId, `${field}_changed`, request.updatedBy, {
          field,
          oldValue: change.old,
          newValue: change.new,
        });
      }

      // Emit task updated event
      this.eventBusService?.publish('task.updated', {
        taskId: savedTask.id,
        projectId: savedTask.projectId,
        task: savedTask,
        changes,
        actor: {
          id: request.updatedBy,
          name: 'User', // Would be populated from user lookup
          type: 'user',
        },
      });

      // Emit specific status change event if status changed
      if (changes.status) {
        this.eventBusService?.publish('task.status_changed', {
          taskId: savedTask.id,
          projectId: savedTask.projectId,
          task: savedTask,
          changes: { status: changes.status },
          actor: {
            id: request.updatedBy,
            name: 'User',
            type: 'user',
          },
        });

        // Emit completion event if task was completed
        if (changes.status.new === 'completed') {
          this.eventBusService?.publish('task.completed', {
            taskId: savedTask.id,
            projectId: savedTask.projectId,
            task: savedTask,
            actor: {
              id: request.updatedBy,
              name: 'User',
              type: 'user',
            },
          });
        }
      }

      logger.info(`Task updated: ${savedTask.taskNumber} - ${savedTask.title}`);
      return savedTask;
    } catch (error) {
      logger.error('Error updating task:', error);
      throw error;
    }
  }

  async assignTask(request: TaskAssignmentRequest): Promise<TaskEntity> {
    try {
      const task = await this.getTaskById(request.taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      if (request.assigneeType === AssigneeType.HUMAN && request.assignedToUserId) {
        await this.requireUser(request.assignedToUserId);
      }
      if (request.assigneeType === AssigneeType.AGENT && request.assignedToAgentId) {
        await this.requireAgent(request.assignedToAgentId);
      }

      // Clear previous assignment
      task.assignedToUserId = undefined;
      task.assignedToAgentId = undefined;

      // Set new assignment
      task.assigneeType = request.assigneeType;
      if (request.assigneeType === AssigneeType.HUMAN) {
        task.assignedToUserId = request.assignedToUserId;
      } else {
        task.assignedToAgentId = request.assignedToAgentId;
      }

      task.assignedById = request.assignedBy;
      task.assignedAt = new Date();
      task.lastActivityAt = new Date();

      const savedTask = await this.taskRepository.save(task);

      // Log activity
      await this.logActivity(request.taskId, 'assigned', request.assignedBy, {
        assigneeType: request.assigneeType,
        assignedToUserId: request.assignedToUserId,
        assignedToAgentId: request.assignedToAgentId,
        reason: request.reason,
      });

      // Emit task assigned event
      this.eventBusService?.publish('task.assigned', {
        taskId: savedTask.id,
        projectId: savedTask.projectId,
        task: savedTask,
        actor: {
          id: request.assignedBy,
          name: 'User',
          type: 'user',
        },
      });

      logger.info(`Task assigned: ${savedTask.taskNumber} to ${savedTask.assigneeDisplayName}`);
      return savedTask;
    } catch (error) {
      logger.error('Error assigning task:', error);
      throw error;
    }
  }

  async getTaskById(taskId: string): Promise<TaskEntity | null> {
    return await this.taskRepository.findOne({
      where: { id: taskId },
    });
  }

  async getTasksByProject(projectId: string, filters?: TaskFilters): Promise<TaskEntity[]> {
    const queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('task.assignedToUser', 'assignedToUser')
      .leftJoinAndSelect('task.assignedToAgent', 'assignedToAgent')
      .leftJoinAndSelect('task.creator', 'creator')
      .where('task.projectId = :projectId', { projectId })
      .andWhere('task.deletedAt IS NULL');

    // Apply filters
    if (filters) {
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          queryBuilder.andWhere('task.status IN (:...statuses)', { statuses: filters.status });
        } else {
          queryBuilder.andWhere('task.status = :status', { status: filters.status });
        }
      }

      if (filters.priority) {
        if (Array.isArray(filters.priority)) {
          queryBuilder.andWhere('task.priority IN (:...priorities)', {
            priorities: filters.priority,
          });
        } else {
          queryBuilder.andWhere('task.priority = :priority', { priority: filters.priority });
        }
      }

      if (filters.assigneeType) {
        queryBuilder.andWhere('task.assigneeType = :assigneeType', {
          assigneeType: filters.assigneeType,
        });
      }

      if (filters.assignedToUserId) {
        queryBuilder.andWhere('task.assignedToUserId = :assignedToUserId', {
          assignedToUserId: filters.assignedToUserId,
        });
      }

      if (filters.assignedToAgentId) {
        queryBuilder.andWhere('task.assignedToAgentId = :assignedToAgentId', {
          assignedToAgentId: filters.assignedToAgentId,
        });
      }

      if (filters.search) {
        queryBuilder.andWhere('(task.title ILIKE :search OR task.description ILIKE :search)', {
          search: `%${filters.search}%`,
        });
      }

      if (filters.dueDateBefore) {
        queryBuilder.andWhere('task.dueDate <= :dueDateBefore', {
          dueDateBefore: filters.dueDateBefore,
        });
      }

      if (filters.dueDateAfter) {
        queryBuilder.andWhere('task.dueDate >= :dueDateAfter', {
          dueDateAfter: filters.dueDateAfter,
        });
      }

      if (filters.isOverdue) {
        queryBuilder.andWhere('task.dueDate < :now AND task.status != :completedStatus', {
          now: new Date(),
          completedStatus: 'done' satisfies StoryStatus,
        });
      }

      if (filters.isBlocked) {
        queryBuilder.andWhere('(task.status = :blockedStatus OR task.blockedBy IS NOT NULL)', {
          blockedStatus: 'blocked' satisfies StoryStatus,
        });
      }
    }

    return await queryBuilder
      .orderBy('task.priority', 'DESC')
      .addOrderBy('task.createdAt', 'DESC')
      .getMany();
  }

  async getTaskAssignmentSuggestions(taskId: string): Promise<TaskAssignmentSuggestion[]> {
    const task = await this.getTaskById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const suggestions: TaskAssignmentSuggestion[] = [];

    // Get project members (humans)
    const projectMembers = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('project_members', 'pm', 'pm.userId = user.id')
      .where('pm.projectId = :projectId', { projectId: task.projectId })
      .andWhere('pm.status = :status', { status: 'active' })
      .getMany();

    // Get available agents
    const agents = await this.agentRepository.find({
      where: { isActive: true, status: 'idle' },
    });

    // Score humans based on availability and expertise
    for (const member of projectMembers) {
      // eslint-disable-next-line no-await-in-loop
      const workload = await this.getUserWorkload(member.id);
      const score = this.calculateAssignmentScore(task, 'human', { workload });

      suggestions.push({
        type: AssigneeType.HUMAN,
        userId: member.id,
        name: member.name || member.email,
        score,
        reason: this.getAssignmentReason(task, 'human', { workload }),
        availability: workload > 10 ? 'busy' : 'available',
        expertise: [], // Would need to be populated from user profile
        workload,
      });
    }

    // Score agents based on capabilities and availability
    for (const agent of agents) {
      // eslint-disable-next-line no-await-in-loop
      const workload = await this.getAgentWorkload(agent.id);
      const normalizedSkills = this.normalizeAgentSkills(agent.skills);
      const score = this.calculateAssignmentScore(task, 'agent', {
        workload,
        capabilities: agent.capabilities,
        skills: normalizedSkills,
      });

      suggestions.push({
        type: AssigneeType.AGENT,
        agentId: agent.id,
        name: agent.name,
        score,
        reason: this.getAssignmentReason(task, 'agent', {
          workload,
          capabilities: agent.capabilities,
          skills: normalizedSkills,
        }),
        availability: workload > 5 ? 'busy' : 'available',
        expertise: agent.capabilities || [],
        workload,
      });
    }

    // Sort by score and return top suggestions
    return suggestions.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  private normalizeAgentSkills(
    skills: Agent['skills'] | null | undefined
  ): Array<{ name: string; description?: string; enabled?: boolean }> {
    if (!Array.isArray(skills)) {
      return [];
    }

    return skills
      .filter((skill): skill is NonNullable<Agent['skills']>[number] & { name: string } => {
        return typeof skill?.name === 'string' && skill.name.length > 0;
      })
      .map((skill) => ({
        name: skill.name,
        description: skill.description,
        enabled: skill.enabled,
      }));
  }

  private calculateAssignmentScore(
    task: TaskEntity,
    assigneeType: 'human' | 'agent',
    context: AssignmentContext
  ): number {
    let score = 50; // Base score

    // Adjust based on workload
    if (context.workload === 0) score += 20;
    else if (context.workload < 5) score += 10;
    else if (context.workload > 10) score -= 20;

    // Adjust based on task type and assignee type
    if (assigneeType === 'agent') {
      if (task.type === TaskType.RESEARCH) score += 15;
      if (task.type === TaskType.DOCUMENTATION) score += 10;
      if (task.type === TaskType.TESTING) score += 10;
    } else {
      if (task.type === TaskType.FEATURE) score += 15;
      if (task.type === TaskType.BUG) score += 10;
      if (task.type === TaskType.ENHANCEMENT) score += 10;
    }

    // Adjust based on capabilities (for agents)
    if (assigneeType === 'agent' && context.capabilities) {
      const relevantCapabilities = context.capabilities.filter(
        (cap: string) =>
          task.title.toLowerCase().includes(cap.toLowerCase()) ||
          task.description?.toLowerCase().includes(cap.toLowerCase())
      );
      score += relevantCapabilities.length * 5;
    }

    // Adjust based on skills (for agents) - skills match on name + description keywords
    if (assigneeType === 'agent' && context.skills) {
      const enabledSkills = context.skills.filter((s) => s.enabled !== false);
      const relevantSkills = enabledSkills.filter((skill) => {
        const taskText = (task.title + ' ' + (task.description || '')).toLowerCase();
        return (
          taskText.includes(skill.name.toLowerCase()) ||
          (skill.description &&
            skill.description
              .toLowerCase()
              .split(' ')
              .some((word: string) => word.length > 4 && taskText.includes(word)))
        );
      });
      score += relevantSkills.length * 8;
    }

    return Math.max(0, Math.min(100, score));
  }

  private getAssignmentReason(
    task: TaskEntity,
    assigneeType: 'human' | 'agent',
    context: AssignmentContext
  ): string {
    const reasons: string[] = [];

    if (context.workload === 0) {
      reasons.push('Currently available');
    } else if (context.workload < 5) {
      reasons.push('Light workload');
    } else if (context.workload > 10) {
      reasons.push('Heavy workload');
    }

    if (assigneeType === 'agent') {
      if (task.type === TaskType.RESEARCH) reasons.push('Good for research tasks');
      if (task.type === TaskType.DOCUMENTATION) reasons.push('Excellent for documentation');
      if (context.capabilities && context.capabilities.length > 0)
        reasons.push('Has relevant capabilities');
      if (context.skills?.filter((s) => s.enabled !== false).length)
        reasons.push('Has specialized skills');
    } else {
      if (task.type === TaskType.FEATURE) reasons.push('Great for feature development');
      if (task.type === TaskType.BUG) reasons.push('Good for bug fixes');
    }

    return reasons.join(', ') || 'Available for assignment';
  }

  private async getUserWorkload(userId: string): Promise<number> {
    return await this.taskRepository.count({
      where: {
        assignedToUserId: userId,
        status: 'in-progress' satisfies StoryStatus,
      },
    });
  }

  private async getAgentWorkload(agentId: string): Promise<number> {
    return await this.taskRepository.count({
      where: {
        assignedToAgentId: agentId,
        status: 'in-progress' satisfies StoryStatus,
      },
    });
  }

  private async logActivity(
    taskId: string,
    action: string,
    userId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) return;

    const activityEntry: TaskActivityEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      action,
      userId,
      userName: 'System', // Would be populated from user lookup
      details,
    };

    task.activityLog = [...(task.activityLog || []), activityEntry];
    await this.taskRepository.save(task);
  }

  async deleteTask(taskId: string, deletedBy: string): Promise<void> {
    const task = await this.getTaskById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    task.deletedAt = new Date();
    task.deletedById = deletedBy;
    await this.taskRepository.save(task);

    await this.logActivity(taskId, 'deleted', deletedBy, {});
    logger.info(`Task deleted: ${task.taskNumber} - ${task.title}`);
  }

  async updateTaskProgress(
    taskId: string,
    completionPercentage: number,
    timeSpent?: number
  ): Promise<TaskEntity> {
    const task = await this.getTaskById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    task.metrics = {
      ...task.metrics,
      completionPercentage: Math.max(0, Math.min(100, completionPercentage)),
      timeSpent: timeSpent || task.metrics.timeSpent,
    };

    // Auto-update status based on completion
    // Compared through toStoryStatus so a row still holding a legacy value
    // ('completed', 'todo', or the old 'pending' default) is judged on what it
    // means, not on its spelling.
    const currentStatus = toStoryStatus(task.status);
    if (completionPercentage >= 100 && currentStatus !== 'done') {
      task.status = 'done';
      task.completedAt = new Date();
    } else if (completionPercentage > 0 && currentStatus === 'backlog') {
      task.status = 'in-progress';
      task.startedAt = new Date();
    }

    task.lastActivityAt = new Date();
    return await this.taskRepository.save(task);
  }

  async getTaskStatistics(projectId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byAssigneeType: Record<string, number>;
  }> {
    const stats = await this.taskRepository
      .createQueryBuilder('task')
      .select([
        'task.status as status',
        'task.priority as priority',
        'task.assigneeType as assigneeType',
        'COUNT(*) as count',
      ])
      .where('task.projectId = :projectId', { projectId })
      .andWhere('task.deletedAt IS NULL')
      .groupBy('task.status, task.priority, task.assigneeType')
      .getRawMany();

    return {
      total: stats.reduce((sum, stat) => sum + parseInt(stat.count), 0),
      byStatus: this.groupBy(stats, 'status'),
      byPriority: this.groupBy(stats, 'priority'),
      byAssigneeType: this.groupBy(stats, 'assigneeType'),
    };
  }

  private groupBy(items: Record<string, string>[], key: string): Record<string, number> {
    return items.reduce((acc: Record<string, number>, item) => {
      const value = item[key] || 'unassigned';
      acc[value] = (acc[value] || 0) + parseInt(item.count);
      return acc;
    }, {});
  }
}
