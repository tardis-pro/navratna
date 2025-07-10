import { Router } from 'express';
import { TaskController } from '../controllers/taskController.js';
import { authMiddleware } from '@uaip/middleware';
import { createRateLimiter } from '@uaip/middleware';

export function createTaskRoutes(taskController: TaskController): Router {
  const router = Router();

  // Apply authentication middleware to all routes
  router.use(authMiddleware);

  // Apply rate limiting
  router.use(createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many task requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
  }));

  // Project-based task routes
  router.get(
    '/projects/:projectId/tasks',
    taskController.getProjectTasks.bind(taskController)
  );

  router.post(
    '/projects/:projectId/tasks',
    taskController.createTask.bind(taskController)
  );

  router.get(
    '/projects/:projectId/tasks/statistics',
    taskController.getTaskStatistics.bind(taskController)
  );

  // Individual task routes
  router.get(
    '/tasks/:taskId',
    taskController.getTask.bind(taskController)
  );

  router.put(
    '/tasks/:taskId',
    taskController.updateTask.bind(taskController)
  );

  router.delete(
    '/tasks/:taskId',
    taskController.deleteTask.bind(taskController)
  );

  // Task assignment routes
  router.post(
    '/tasks/:taskId/assign',
    taskController.assignTask.bind(taskController)
  );

  router.get(
    '/tasks/:taskId/assignment-suggestions',
    taskController.getAssignmentSuggestions.bind(taskController)
  );

  // Task progress routes
  router.put(
    '/tasks/:taskId/progress',
    taskController.updateTaskProgress.bind(taskController)
  );

  // User and agent task routes
  router.get(
    '/users/:userId/tasks',
    taskController.getUserTasks.bind(taskController)
  );

  router.get(
    '/agents/:agentId/tasks',
    taskController.getAgentTasks.bind(taskController)
  );

  return router;
}

// Export route patterns for API documentation
export const taskRoutePatterns = {
  // Project tasks
  getProjectTasks: 'GET /api/v1/projects/:projectId/tasks',
  createTask: 'POST /api/v1/projects/:projectId/tasks',
  getTaskStatistics: 'GET /api/v1/projects/:projectId/tasks/statistics',

  // Individual tasks
  getTask: 'GET /api/v1/tasks/:taskId',
  updateTask: 'PUT /api/v1/tasks/:taskId',
  deleteTask: 'DELETE /api/v1/tasks/:taskId',

  // Task assignment
  assignTask: 'POST /api/v1/tasks/:taskId/assign',
  getAssignmentSuggestions: 'GET /api/v1/tasks/:taskId/assignment-suggestions',

  // Task progress
  updateTaskProgress: 'PUT /api/v1/tasks/:taskId/progress',

  // User and agent tasks
  getUserTasks: 'GET /api/v1/users/:userId/tasks',
  getAgentTasks: 'GET /api/v1/agents/:agentId/tasks'
};

export const taskApiDocumentation = {
  '/projects/{projectId}/tasks': {
    get: {
      summary: 'Get all tasks for a project',
      description: 'Retrieve tasks for a specific project with optional filtering',
      parameters: [
        {
          name: 'projectId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Project ID'
        },
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string' },
          description: 'Filter by status (comma-separated for multiple)'
        },
        {
          name: 'priority',
          in: 'query',
          schema: { type: 'string' },
          description: 'Filter by priority (comma-separated for multiple)'
        },
        {
          name: 'assigneeType',
          in: 'query',
          schema: { type: 'string', enum: ['human', 'agent'] },
          description: 'Filter by assignee type'
        },
        {
          name: 'search',
          in: 'query',
          schema: { type: 'string' },
          description: 'Search in title and description'
        },
        {
          name: 'isOverdue',
          in: 'query',
          schema: { type: 'boolean' },
          description: 'Filter overdue tasks'
        },
        {
          name: 'isBlocked',
          in: 'query',
          schema: { type: 'boolean' },
          description: 'Filter blocked tasks'
        }
      ],
      responses: {
        200: {
          description: 'Tasks retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Task' }
                  },
                  total: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    post: {
      summary: 'Create a new task',
      description: 'Create a new task in the specified project',
      parameters: [
        {
          name: 'projectId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Project ID'
        }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateTaskRequest' }
          }
        }
      },
      responses: {
        201: {
          description: 'Task created successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: { $ref: '#/components/schemas/Task' },
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  },
  '/tasks/{taskId}': {
    get: {
      summary: 'Get a specific task',
      description: 'Retrieve a task by its ID',
      parameters: [
        {
          name: 'taskId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Task ID'
        }
      ],
      responses: {
        200: {
          description: 'Task retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: { $ref: '#/components/schemas/Task' }
                }
              }
            }
          }
        },
        404: {
          description: 'Task not found'
        }
      }
    },
    put: {
      summary: 'Update a task',
      description: 'Update an existing task',
      parameters: [
        {
          name: 'taskId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Task ID'
        }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateTaskRequest' }
          }
        }
      },
      responses: {
        200: {
          description: 'Task updated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: { $ref: '#/components/schemas/Task' },
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    delete: {
      summary: 'Delete a task',
      description: 'Soft delete a task',
      parameters: [
        {
          name: 'taskId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Task ID'
        }
      ],
      responses: {
        200: {
          description: 'Task deleted successfully'
        }
      }
    }
  },
  '/tasks/{taskId}/assign': {
    post: {
      summary: 'Assign a task',
      description: 'Assign a task to a human user or agent',
      parameters: [
        {
          name: 'taskId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Task ID'
        }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/TaskAssignmentRequest' }
          }
        }
      },
      responses: {
        200: {
          description: 'Task assigned successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: { $ref: '#/components/schemas/Task' },
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  },
  '/tasks/{taskId}/assignment-suggestions': {
    get: {
      summary: 'Get assignment suggestions',
      description: 'Get intelligent suggestions for task assignment',
      parameters: [
        {
          name: 'taskId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Task ID'
        }
      ],
      responses: {
        200: {
          description: 'Assignment suggestions retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/TaskAssignmentSuggestion' }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  '/tasks/{taskId}/progress': {
    put: {
      summary: 'Update task progress',
      description: 'Update task completion percentage and time spent',
      parameters: [
        {
          name: 'taskId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Task ID'
        }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                completionPercentage: {
                  type: 'number',
                  minimum: 0,
                  maximum: 100,
                  description: 'Task completion percentage'
                },
                timeSpent: {
                  type: 'number',
                  minimum: 0,
                  description: 'Additional time spent in minutes'
                }
              },
              required: ['completionPercentage']
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Task progress updated successfully'
        }
      }
    }
  }
};