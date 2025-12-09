import { Context } from 'elysia';
import { TaskService, CreateTaskRequest, UpdateTaskRequest, TaskAssignmentRequest, TaskFilters } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { z } from 'zod';

// Extended context type with user from auth middleware
interface AuthenticatedContext extends Context {
  user?: {
    id: string;
    email?: string;
    role?: string;
    isAdmin?: boolean;
  };
}

// Validation schemas
const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  projectId: z.string().uuid(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  type: z.enum(['feature', 'bug', 'enhancement', 'research', 'documentation', 'testing', 'deployment', 'maintenance']).optional(),
  assigneeType: z.enum(['human', 'agent']).optional(),
  assignedToUserId: z.string().uuid().optional(),
  assignedToAgentId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  epic: z.string().optional(),
  sprint: z.string().optional(),
  estimatedHours: z.number().min(0).optional(),
  customFields: z.record(z.any()).optional()
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'in_review', 'blocked', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  type: z.enum(['feature', 'bug', 'enhancement', 'research', 'documentation', 'testing', 'deployment', 'maintenance']).optional(),
  assigneeType: z.enum(['human', 'agent']).optional(),
  assignedToUserId: z.string().uuid().optional(),
  assignedToAgentId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  epic: z.string().optional(),
  sprint: z.string().optional(),
  customFields: z.record(z.any()).optional()
});

const assignTaskSchema = z.object({
  assigneeType: z.enum(['human', 'agent']),
  assignedToUserId: z.string().uuid().optional(),
  assignedToAgentId: z.string().uuid().optional(),
  reason: z.string().optional()
}).refine(data => {
  if (data.assigneeType === 'human' && !data.assignedToUserId) {
    return false;
  }
  if (data.assigneeType === 'agent' && !data.assignedToAgentId) {
    return false;
  }
  return true;
}, {
  message: "Must provide assignedToUserId for human or assignedToAgentId for agent"
});

const progressUpdateSchema = z.object({
  completionPercentage: z.number().min(0).max(100),
  timeSpent: z.number().min(0).optional()
});

export class TaskController {
  private taskService: TaskService;

  constructor(taskService: TaskService) {
    this.taskService = taskService;
  }

  // GET /api/v1/projects/:projectId/tasks
  async getProjectTasks({ params, query, set }: AuthenticatedContext): Promise<any> {
    try {
      const { projectId } = params as { projectId: string };
      const filters: TaskFilters = {
        ...query,
        projectId
      };

      // Parse array parameters
      if (query.status && typeof query.status === 'string') {
        filters.status = query.status.split(',') as any;
      }
      if (query.priority && typeof query.priority === 'string') {
        filters.priority = query.priority.split(',') as any;
      }
      if (query.tags && typeof query.tags === 'string') {
        filters.tags = query.tags.split(',');
      }

      // Parse boolean parameters
      if (query.isOverdue === 'true') filters.isOverdue = true;
      if (query.isBlocked === 'true') filters.isBlocked = true;

      // Parse date parameters
      if (query.dueDateBefore) {
        filters.dueDateBefore = new Date(query.dueDateBefore as string);
      }
      if (query.dueDateAfter) {
        filters.dueDateAfter = new Date(query.dueDateAfter as string);
      }

      const tasks = await this.taskService.getTasksByProject(projectId, filters);

      return {
        success: true,
        data: tasks,
        total: tasks.length
      };

    } catch (error) {
      logger.error('Error getting project tasks:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve tasks',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // GET /api/v1/tasks/:taskId
  async getTask({ params, set }: AuthenticatedContext): Promise<any> {
    try {
      const { taskId } = params as { taskId: string };
      const task = await this.taskService.getTaskById(taskId);

      if (!task) {
        set.status = 404;
        return {
          success: false,
          error: 'Task not found'
        };
      }

      return {
        success: true,
        data: task
      };

    } catch (error) {
      logger.error('Error getting task:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve task',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // POST /api/v1/projects/:projectId/tasks
  async createTask({ params, body, user, set }: AuthenticatedContext): Promise<any> {
    try {
      const { projectId } = params as { projectId: string };
      const userId = user?.id;

      if (!userId) {
        set.status = 401;
        return {
          success: false,
          error: 'User not authenticated'
        };
      }

      // Validate request body
      const validatedData = createTaskSchema.parse(body);

      // Ensure projectId matches route parameter
      const createRequest: CreateTaskRequest = {
        title: validatedData.title,
        description: validatedData.description,
        projectId,
        priority: validatedData.priority as any,
        type: validatedData.type as any,
        assigneeType: validatedData.assigneeType as any,
        assignedToUserId: validatedData.assignedToUserId,
        assignedToAgentId: validatedData.assignedToAgentId,
        dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : undefined,
        tags: validatedData.tags,
        labels: validatedData.labels,
        epic: validatedData.epic,
        sprint: validatedData.sprint,
        createdBy: userId
      };

      const task = await this.taskService.createTask(createRequest);

      set.status = 201;
      return {
        success: true,
        data: task,
        message: `Task created: ${task.taskNumber}`
      };

    } catch (error) {
      logger.error('Error creating task:', error);
      
      if (error instanceof z.ZodError) {
        set.status = 400;
        return {
          success: false,
          error: 'Validation failed',
          details: error.errors
        };
      }

      set.status = 500;
      return {
        success: false,
        error: 'Failed to create task',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // PUT /api/v1/tasks/:taskId
  async updateTask({ params, body, user, set }: AuthenticatedContext): Promise<any> {
    try {
      const { taskId } = params as { taskId: string };
      const userId = user?.id;

      if (!userId) {
        set.status = 401;
        return {
          success: false,
          error: 'User not authenticated'
        };
      }

      // Validate request body
      const validatedData = updateTaskSchema.parse(body);

      const updateRequest: UpdateTaskRequest = {
        title: validatedData.title,
        description: validatedData.description,
        status: validatedData.status as any,
        priority: validatedData.priority as any,
        type: validatedData.type as any,
        assigneeType: validatedData.assigneeType as any,
        assignedToUserId: validatedData.assignedToUserId,
        assignedToAgentId: validatedData.assignedToAgentId,
        dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : undefined,
        tags: validatedData.tags,
        labels: validatedData.labels,
        epic: validatedData.epic,
        sprint: validatedData.sprint,
        customFields: validatedData.customFields,
        updatedBy: userId
      };

      const task = await this.taskService.updateTask(taskId, updateRequest);

      return {
        success: true,
        data: task,
        message: `Task updated: ${task.taskNumber}`
      };

    } catch (error) {
      logger.error('Error updating task:', error);
      
      if (error instanceof z.ZodError) {
        set.status = 400;
        return {
          success: false,
          error: 'Validation failed',
          details: error.errors
        };
      }

      set.status = 500;
      return {
        success: false,
        error: 'Failed to update task',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // POST /api/v1/tasks/:taskId/assign
  async assignTask({ params, body, user, set }: AuthenticatedContext): Promise<any> {
    try {
      const { taskId } = params as { taskId: string };
      const userId = user?.id;

      if (!userId) {
        set.status = 401;
        return {
          success: false,
          error: 'User not authenticated'
        };
      }

      // Validate request body
      const validatedData = assignTaskSchema.parse(body);

      const assignRequest: TaskAssignmentRequest = {
        taskId,
        assignedBy: userId,
        assigneeType: validatedData.assigneeType as any,
        assignedToUserId: validatedData.assignedToUserId,
        assignedToAgentId: validatedData.assignedToAgentId,
        reason: validatedData.reason
      };

      const task = await this.taskService.assignTask(assignRequest);

      return {
        success: true,
        data: task,
        message: `Task assigned to ${task.assigneeDisplayName}`
      };

    } catch (error) {
      logger.error('Error assigning task:', error);
      
      if (error instanceof z.ZodError) {
        set.status = 400;
        return {
          success: false,
          error: 'Validation failed',
          details: error.errors
        };
      }

      set.status = 500;
      return {
        success: false,
        error: 'Failed to assign task',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // GET /api/v1/tasks/:taskId/assignment-suggestions
  async getAssignmentSuggestions({ params, set }: AuthenticatedContext): Promise<any> {
    try {
      const { taskId } = params as { taskId: string };
      const suggestions = await this.taskService.getTaskAssignmentSuggestions(taskId);

      return {
        success: true,
        data: suggestions
      };

    } catch (error) {
      logger.error('Error getting assignment suggestions:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to get assignment suggestions',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // PUT /api/v1/tasks/:taskId/progress
  async updateTaskProgress({ params, body, set }: AuthenticatedContext): Promise<any> {
    try {
      const { taskId } = params as { taskId: string };

      // Validate request body
      const validatedData = progressUpdateSchema.parse(body);

      const task = await this.taskService.updateTaskProgress(
        taskId,
        validatedData.completionPercentage,
        validatedData.timeSpent
      );

      return {
        success: true,
        data: task,
        message: `Task progress updated: ${validatedData.completionPercentage}%`
      };

    } catch (error) {
      logger.error('Error updating task progress:', error);
      
      if (error instanceof z.ZodError) {
        set.status = 400;
        return {
          success: false,
          error: 'Validation failed',
          details: error.errors
        };
      }

      set.status = 500;
      return {
        success: false,
        error: 'Failed to update task progress',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // DELETE /api/v1/tasks/:taskId
  async deleteTask({ params, user, set }: AuthenticatedContext): Promise<any> {
    try {
      const { taskId } = params as { taskId: string };
      const userId = user?.id;

      if (!userId) {
        set.status = 401;
        return {
          success: false,
          error: 'User not authenticated'
        };
      }

      await this.taskService.deleteTask(taskId, userId);

      return {
        success: true,
        message: 'Task deleted successfully'
      };

    } catch (error) {
      logger.error('Error deleting task:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to delete task',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // GET /api/v1/projects/:projectId/tasks/statistics
  async getTaskStatistics({ params, set }: AuthenticatedContext): Promise<any> {
    try {
      const { projectId } = params as { projectId: string };
      const statistics = await this.taskService.getTaskStatistics(projectId);

      return {
        success: true,
        data: statistics
      };

    } catch (error) {
      logger.error('Error getting task statistics:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to get task statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // GET /api/v1/users/:userId/tasks
  async getUserTasks({ params, query, user, set }: AuthenticatedContext): Promise<any> {
    try {
      const { userId } = params as { userId: string };
      const currentUserId = user?.id;

      // Users can only see their own tasks unless they're admin
      if (userId !== currentUserId && !(user as any)?.isAdmin) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden: Can only view your own tasks'
        };
      }

      const filters: TaskFilters = {
        assignedToUserId: userId,
        ...query
      };

      // Get tasks from all projects the user is assigned to
      // This would need a more complex query to get tasks across projects
      // For now, we'll need the projectId to be specified or implement a cross-project query

      return {
        success: true,
        data: [],
        message: 'User task query needs project context or cross-project implementation'
      };

    } catch (error) {
      logger.error('Error getting user tasks:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to get user tasks',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // GET /api/v1/agents/:agentId/tasks
  async getAgentTasks({ params, query, set }: AuthenticatedContext): Promise<any> {
    try {
      const { agentId } = params as { agentId: string };

      const filters: TaskFilters = {
        assignedToAgentId: agentId,
        ...query
      };

      // Similar to user tasks, this would need cross-project implementation
      // or require project context

      return {
        success: true,
        data: [],
        message: 'Agent task query needs project context or cross-project implementation'
      };

    } catch (error) {
      logger.error('Error getting agent tasks:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to get agent tasks',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}