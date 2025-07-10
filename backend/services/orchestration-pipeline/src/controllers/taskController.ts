import { Request, Response } from 'express';
import { TaskService, CreateTaskRequest, UpdateTaskRequest, TaskAssignmentRequest, TaskFilters } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { z } from 'zod';

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
  async getProjectTasks(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const filters: TaskFilters = {
        ...req.query,
        projectId
      };

      // Parse array parameters
      if (req.query.status && typeof req.query.status === 'string') {
        filters.status = req.query.status.split(',') as any;
      }
      if (req.query.priority && typeof req.query.priority === 'string') {
        filters.priority = req.query.priority.split(',') as any;
      }
      if (req.query.tags && typeof req.query.tags === 'string') {
        filters.tags = req.query.tags.split(',');
      }

      // Parse boolean parameters
      if (req.query.isOverdue === 'true') filters.isOverdue = true;
      if (req.query.isBlocked === 'true') filters.isBlocked = true;

      // Parse date parameters
      if (req.query.dueDateBefore) {
        filters.dueDateBefore = new Date(req.query.dueDateBefore as string);
      }
      if (req.query.dueDateAfter) {
        filters.dueDateAfter = new Date(req.query.dueDateAfter as string);
      }

      const tasks = await this.taskService.getTasksByProject(projectId, filters);

      res.json({
        success: true,
        data: tasks,
        total: tasks.length
      });

    } catch (error) {
      logger.error('Error getting project tasks:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tasks',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // GET /api/v1/tasks/:taskId
  async getTask(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const task = await this.taskService.getTaskById(taskId);

      if (!task) {
        res.status(404).json({
          success: false,
          error: 'Task not found'
        });
        return;
      }

      res.json({
        success: true,
        data: task
      });

    } catch (error) {
      logger.error('Error getting task:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve task',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // POST /api/v1/projects/:projectId/tasks
  async createTask(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }

      // Validate request body
      const validatedData = createTaskSchema.parse(req.body);

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

      res.status(201).json({
        success: true,
        data: task,
        message: `Task created: ${task.taskNumber}`
      });

    } catch (error) {
      logger.error('Error creating task:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create task',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // PUT /api/v1/tasks/:taskId
  async updateTask(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }

      // Validate request body
      const validatedData = updateTaskSchema.parse(req.body);

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

      res.json({
        success: true,
        data: task,
        message: `Task updated: ${task.taskNumber}`
      });

    } catch (error) {
      logger.error('Error updating task:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update task',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // POST /api/v1/tasks/:taskId/assign
  async assignTask(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }

      // Validate request body
      const validatedData = assignTaskSchema.parse(req.body);

      const assignRequest: TaskAssignmentRequest = {
        taskId,
        assignedBy: userId,
        assigneeType: validatedData.assigneeType as any,
        assignedToUserId: validatedData.assignedToUserId,
        assignedToAgentId: validatedData.assignedToAgentId,
        reason: validatedData.reason
      };

      const task = await this.taskService.assignTask(assignRequest);

      res.json({
        success: true,
        data: task,
        message: `Task assigned to ${task.assigneeDisplayName}`
      });

    } catch (error) {
      logger.error('Error assigning task:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to assign task',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // GET /api/v1/tasks/:taskId/assignment-suggestions
  async getAssignmentSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const suggestions = await this.taskService.getTaskAssignmentSuggestions(taskId);

      res.json({
        success: true,
        data: suggestions
      });

    } catch (error) {
      logger.error('Error getting assignment suggestions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get assignment suggestions',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // PUT /api/v1/tasks/:taskId/progress
  async updateTaskProgress(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;

      // Validate request body
      const validatedData = progressUpdateSchema.parse(req.body);

      const task = await this.taskService.updateTaskProgress(
        taskId,
        validatedData.completionPercentage,
        validatedData.timeSpent
      );

      res.json({
        success: true,
        data: task,
        message: `Task progress updated: ${validatedData.completionPercentage}%`
      });

    } catch (error) {
      logger.error('Error updating task progress:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update task progress',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // DELETE /api/v1/tasks/:taskId
  async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }

      await this.taskService.deleteTask(taskId, userId);

      res.json({
        success: true,
        message: 'Task deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting task:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete task',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // GET /api/v1/projects/:projectId/tasks/statistics
  async getTaskStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const statistics = await this.taskService.getTaskStatistics(projectId);

      res.json({
        success: true,
        data: statistics
      });

    } catch (error) {
      logger.error('Error getting task statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get task statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // GET /api/v1/users/:userId/tasks
  async getUserTasks(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.id;

      // Users can only see their own tasks unless they're admin
      if (userId !== currentUserId && !req.user?.isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Forbidden: Can only view your own tasks'
        });
        return;
      }

      const filters: TaskFilters = {
        assignedToUserId: userId,
        ...req.query
      };

      // Get tasks from all projects the user is assigned to
      // This would need a more complex query to get tasks across projects
      // For now, we'll need the projectId to be specified or implement a cross-project query

      res.json({
        success: true,
        data: [],
        message: 'User task query needs project context or cross-project implementation'
      });

    } catch (error) {
      logger.error('Error getting user tasks:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user tasks',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // GET /api/v1/agents/:agentId/tasks
  async getAgentTasks(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;

      const filters: TaskFilters = {
        assignedToAgentId: agentId,
        ...req.query
      };

      // Similar to user tasks, this would need cross-project implementation
      // or require project context

      res.json({
        success: true,
        data: [],
        message: 'Agent task query needs project context or cross-project implementation'
      });

    } catch (error) {
      logger.error('Error getting agent tasks:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get agent tasks',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}