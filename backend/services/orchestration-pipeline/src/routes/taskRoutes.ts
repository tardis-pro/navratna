import { Elysia } from 'elysia';
import { TaskController } from '../controllers/taskController.js';

export function registerTaskRoutes(app: Elysia, taskController: TaskController): void {
  // Helper to create Express-compatible req/res objects for controller
  const wrapController = (method: Function) => {
    return async (context: any) => {
      const { params, query, body, headers, set } = context;
      const req = {
        params,
        query,
        body,
        user: { id: headers['x-user-id'] }
      };

      let responseData: any;
      let statusCode = 200;

      const res = {
        json: (data: any) => { responseData = data; return res; },
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        send: (data: any) => { responseData = data; return res; }
      };

      await method.call(taskController, req, res);

      if (statusCode !== 200) {
        set.status = statusCode;
      }

      return responseData || '';
    };
  };

  // Project tasks
  app.get('/api/v1/projects/:projectId/tasks',
    wrapController(taskController.getProjectTasks));

  app.post('/api/v1/projects/:projectId/tasks',
    wrapController(taskController.createTask));

  app.get('/api/v1/projects/:projectId/tasks/statistics',
    wrapController(taskController.getTaskStatistics));

  // Individual tasks
  app.get('/api/v1/tasks/:taskId',
    wrapController(taskController.getTask));

  app.put('/api/v1/tasks/:taskId',
    wrapController(taskController.updateTask));

  app.delete('/api/v1/tasks/:taskId',
    wrapController(taskController.deleteTask));

  // Task assignment
  app.post('/api/v1/tasks/:taskId/assign',
    wrapController(taskController.assignTask));

  app.get('/api/v1/tasks/:taskId/assignment-suggestions',
    wrapController(taskController.getAssignmentSuggestions));

  // Task progress
  app.put('/api/v1/tasks/:taskId/progress',
    wrapController(taskController.updateTaskProgress));

  // User and agent tasks
  app.get('/api/v1/users/:userId/tasks',
    wrapController(taskController.getUserTasks));

  app.get('/api/v1/agents/:agentId/tasks',
    wrapController(taskController.getAgentTasks));
}