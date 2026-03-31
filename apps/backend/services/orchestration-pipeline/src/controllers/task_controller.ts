import { Context } from 'elysia';
import { TaskService } from '@uaip/shared-services';
import type {
  CreateTaskRequest,
  TaskAssignmentRequest,
  TaskAssignmentSuggestion,
  TaskEntity,
  TaskFilters,
  UpdateTaskRequest,
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { z } from 'zod';

interface AuthenticatedContext extends Context {
  user?: {
    id: string;
    email?: string;
    role?: string;
    isAdmin?: boolean;
  };
}

type MutableStatusSet = {
  status?: number | string;
};

interface TaskSuccessResponse<T = TaskEntity> {
  success: true;
  data?: T;
  message?: string;
  total?: number;
}

interface TaskErrorResponse {
  success: false;
  error: string;
  details?: string | z.ZodIssue[];
  message?: string;
}

type TaskControllerResponse<T = TaskEntity> = TaskSuccessResponse<T> | TaskErrorResponse;

const taskTypeEnum = z
  .enum([
    'feature',
    'bug',
    'enhancement',
    'research',
    'documentation',
    'testing',
    'deployment',
    'maintenance',
  ])
  .optional();
const taskPriorityEnum = z.enum(['low', 'medium', 'high', 'urgent']).optional();
const taskAssigneeFields = {
  assigneeType: z.enum(['human', 'agent']).optional(),
  assignedToUserId: z.string().uuid().optional(),
  assignedToAgentId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  epic: z.string().optional(),
  sprint: z.string().optional(),
};

const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  projectId: z.string().uuid(),
  priority: taskPriorityEnum,
  type: taskTypeEnum,
  ...taskAssigneeFields,
  estimatedHours: z.number().min(0).optional(),
  customFields: z.record(z.any()).optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z
    .enum(['todo', 'in_progress', 'in_review', 'blocked', 'completed', 'cancelled'])
    .optional(),
  priority: taskPriorityEnum,
  type: taskTypeEnum,
  ...taskAssigneeFields,
  customFields: z.record(z.any()).optional(),
});

const assignTaskSchema = z
  .object({
    assigneeType: z.enum(['human', 'agent']),
    assignedToUserId: z.string().uuid().optional(),
    assignedToAgentId: z.string().uuid().optional(),
    reason: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.assigneeType === 'human' && !data.assignedToUserId) {
        return false;
      }
      if (data.assigneeType === 'agent' && !data.assignedToAgentId) {
        return false;
      }
      return true;
    },
    {
      message: 'Must provide assignedToUserId for human or assignedToAgentId for agent',
    }
  );

const progressUpdateSchema = z.object({
  completionPercentage: z.number().min(0).max(100),
  timeSpent: z.number().min(0).optional(),
});

type TaskSharedInput = {
  priority?: string;
  type?: string;
  assigneeType?: string;
  assignedToUserId?: string;
  assignedToAgentId?: string;
  dueDate?: string;
  tags?: string[];
  labels?: string[];
  epic?: string;
  sprint?: string;
};

function buildSharedTaskFields(v: TaskSharedInput) {
  return {
    priority: v.priority as CreateTaskRequest['priority'],
    type: v.type as CreateTaskRequest['type'],
    assigneeType: v.assigneeType as CreateTaskRequest['assigneeType'],
    assignedToUserId: v.assignedToUserId,
    assignedToAgentId: v.assignedToAgentId,
    dueDate: v.dueDate ? new Date(v.dueDate) : undefined,
    tags: v.tags,
    labels: v.labels,
    epic: v.epic,
    sprint: v.sprint,
  };
}

function requireAuth(
  userId: string | undefined,
  set: MutableStatusSet
): TaskErrorResponse | null {
  if (!userId) {
    set.status = 401;
    return { success: false, error: 'User not authenticated' };
  }
  return null;
}

function handleError(
  error: unknown,
  set: MutableStatusSet,
  operation: string
): TaskErrorResponse {
  if (error instanceof z.ZodError) {
    set.status = 400;
    return { success: false, error: 'Validation failed', details: error.errors };
  }
  set.status = 500;
  return {
    success: false,
    error: `Failed to ${operation}`,
    details: error instanceof Error ? error.message : 'Unknown error',
  };
}

export class TaskController {
  private taskService: TaskService;

  constructor(taskService: TaskService) {
    this.taskService = taskService;
  }

  async getProjectTasks({
    params,
    query,
    set,
  }: AuthenticatedContext): Promise<TaskControllerResponse<TaskEntity[]>> {
    try {
      const { projectId } = params as { projectId: string };
      const filters: TaskFilters = { ...query, projectId };

      if (query.status && typeof query.status === 'string') {
        filters.status = query.status.split(',') as TaskFilters['status'];
      }
      if (query.priority && typeof query.priority === 'string') {
        filters.priority = query.priority.split(',') as TaskFilters['priority'];
      }
      if (query.tags && typeof query.tags === 'string') {
        filters.tags = query.tags.split(',');
      }
      if (query.isOverdue === 'true') filters.isOverdue = true;
      if (query.isBlocked === 'true') filters.isBlocked = true;
      if (query.dueDateBefore) {
        filters.dueDateBefore = new Date(query.dueDateBefore as string);
      }
      if (query.dueDateAfter) {
        filters.dueDateAfter = new Date(query.dueDateAfter as string);
      }

      const tasks = await this.taskService.getTasksByProject(projectId, filters);
      return { success: true, data: tasks, total: tasks.length };
    } catch (error) {
      logger.error('Error getting project tasks:', error);
      return handleError(error, set, 'retrieve tasks');
    }
  }

  async getTask({ params, set }: AuthenticatedContext): Promise<TaskControllerResponse> {
    try {
      const { taskId } = params as { taskId: string };
      const task = await this.taskService.getTaskById(taskId);
      if (!task) {
        set.status = 404;
        return { success: false, error: 'Task not found' };
      }
      return { success: true, data: task };
    } catch (error) {
      logger.error('Error getting task:', error);
      return handleError(error, set, 'retrieve task');
    }
  }

  async createTask({
    params,
    body,
    user,
    set,
  }: AuthenticatedContext): Promise<TaskControllerResponse> {
    try {
      const { projectId } = params as { projectId: string };
      const authError = requireAuth(user?.id, set);
      if (authError) return authError;
      const userId = user!.id;

      const validatedData = createTaskSchema.parse(body);
      const createRequest: CreateTaskRequest = {
        title: validatedData.title,
        description: validatedData.description,
        projectId,
        ...buildSharedTaskFields(validatedData),
        createdBy: userId,
      };

      const task = await this.taskService.createTask(createRequest);
      set.status = 201;
      return { success: true, data: task, message: `Task created: ${task.taskNumber}` };
    } catch (error) {
      logger.error('Error creating task:', error);
      return handleError(error, set, 'create task');
    }
  }

  async updateTask({
    params,
    body,
    user,
    set,
  }: AuthenticatedContext): Promise<TaskControllerResponse> {
    try {
      const { taskId } = params as { taskId: string };
      const authError = requireAuth(user?.id, set);
      if (authError) return authError;
      const userId = user!.id;

      const validatedData = updateTaskSchema.parse(body);
      const updateRequest: UpdateTaskRequest = {
        title: validatedData.title,
        description: validatedData.description,
        status: validatedData.status as UpdateTaskRequest['status'],
        ...buildSharedTaskFields(validatedData),
        customFields: validatedData.customFields,
        updatedBy: userId,
      };

      const task = await this.taskService.updateTask(taskId, updateRequest);
      return { success: true, data: task, message: `Task updated: ${task.taskNumber}` };
    } catch (error) {
      logger.error('Error updating task:', error);
      return handleError(error, set, 'update task');
    }
  }

  async assignTask({
    params,
    body,
    user,
    set,
  }: AuthenticatedContext): Promise<TaskControllerResponse> {
    try {
      const { taskId } = params as { taskId: string };
      const authError = requireAuth(user?.id, set);
      if (authError) return authError;
      const userId = user!.id;

      const validatedData = assignTaskSchema.parse(body);
      const assignRequest: TaskAssignmentRequest = {
        taskId,
        assignedBy: userId,
        assigneeType: validatedData.assigneeType as TaskAssignmentRequest['assigneeType'],
        assignedToUserId: validatedData.assignedToUserId,
        assignedToAgentId: validatedData.assignedToAgentId,
        reason: validatedData.reason,
      };

      const task = await this.taskService.assignTask(assignRequest);
      return {
        success: true,
        data: task,
        message: `Task assigned to ${task.assigneeDisplayName}`,
      };
    } catch (error) {
      logger.error('Error assigning task:', error);
      return handleError(error, set, 'assign task');
    }
  }

  async getAssignmentSuggestions({
    params,
    set,
  }: AuthenticatedContext): Promise<TaskControllerResponse<TaskAssignmentSuggestion[]>> {
    try {
      const { taskId } = params as { taskId: string };
      const suggestions = await this.taskService.getTaskAssignmentSuggestions(taskId);
      return { success: true, data: suggestions };
    } catch (error) {
      logger.error('Error getting assignment suggestions:', error);
      return handleError(error, set, 'get assignment suggestions');
    }
  }

  async updateTaskProgress({
    params,
    body,
    set,
  }: AuthenticatedContext): Promise<TaskControllerResponse> {
    try {
      const { taskId } = params as { taskId: string };
      const validatedData = progressUpdateSchema.parse(body);
      const task = await this.taskService.updateTaskProgress(
        taskId,
        validatedData.completionPercentage,
        validatedData.timeSpent
      );
      return {
        success: true,
        data: task,
        message: `Task progress updated: ${validatedData.completionPercentage}%`,
      };
    } catch (error) {
      logger.error('Error updating task progress:', error);
      return handleError(error, set, 'update task progress');
    }
  }

  async deleteTask({ params, user, set }: AuthenticatedContext): Promise<TaskControllerResponse> {
    try {
      const { taskId } = params as { taskId: string };
      const authError = requireAuth(user?.id, set);
      if (authError) return authError;

      await this.taskService.deleteTask(taskId, user!.id);
      return { success: true, message: 'Task deleted successfully' };
    } catch (error) {
      logger.error('Error deleting task:', error);
      return handleError(error, set, 'delete task');
    }
  }

  async getTaskStatistics({
    params,
    set,
  }: AuthenticatedContext): Promise<TaskControllerResponse<Record<string, unknown>>> {
    try {
      const { projectId } = params as { projectId: string };
      const statistics = await this.taskService.getTaskStatistics(projectId);
      return { success: true, data: statistics };
    } catch (error) {
      logger.error('Error getting task statistics:', error);
      return handleError(error, set, 'get task statistics');
    }
  }

  async getUserTasks({
    params,
    query,
    user,
    set,
  }: AuthenticatedContext): Promise<TaskControllerResponse<TaskEntity[]>> {
    try {
      const { userId } = params as { userId: string };
      const currentUserId = user?.id;

      if (userId !== currentUserId && !user?.isAdmin) {
        set.status = 403;
        return { success: false, error: 'Forbidden: Can only view your own tasks' };
      }

      const _filters: TaskFilters = { assignedToUserId: userId, ...query };

      return {
        success: true,
        data: [],
        message: 'User task query needs project context or cross-project implementation',
      };
    } catch (error) {
      logger.error('Error getting user tasks:', error);
      return handleError(error, set, 'get user tasks');
    }
  }

  async getAgentTasks({
    params,
    query,
    set,
  }: AuthenticatedContext): Promise<TaskControllerResponse<TaskEntity[]>> {
    try {
      const { agentId } = params as { agentId: string };
      const _filters: TaskFilters = { assignedToAgentId: agentId, ...query };

      return {
        success: true,
        data: [],
        message: 'Agent task query needs project context or cross-project implementation',
      };
    } catch (error) {
      logger.error('Error getting agent tasks:', error);
      return handleError(error, set, 'get agent tasks');
    }
  }
}
