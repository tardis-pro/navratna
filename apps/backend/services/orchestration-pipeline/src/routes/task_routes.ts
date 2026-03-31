import { Elysia } from 'elysia';
import { TaskController } from '../controllers/task_controller.js';

export function registerTaskRoutes<T extends Elysia>(app: T, taskController: TaskController): T {
  app.get('/api/v1/projects/:projectId/tasks', (ctx) => taskController.getProjectTasks(ctx));
  app.post('/api/v1/projects/:projectId/tasks', (ctx) => taskController.createTask(ctx));
  app.get('/api/v1/projects/:projectId/tasks/statistics', (ctx) =>
    taskController.getTaskStatistics(ctx)
  );
  app.get('/api/v1/tasks/:taskId', (ctx) => taskController.getTask(ctx));
  app.put('/api/v1/tasks/:taskId', (ctx) => taskController.updateTask(ctx));
  app.delete('/api/v1/tasks/:taskId', (ctx) => taskController.deleteTask(ctx));
  app.post('/api/v1/tasks/:taskId/assign', (ctx) => taskController.assignTask(ctx));
  app.get('/api/v1/tasks/:taskId/assignment-suggestions', (ctx) =>
    taskController.getAssignmentSuggestions(ctx)
  );
  app.put('/api/v1/tasks/:taskId/progress', (ctx) => taskController.updateTaskProgress(ctx));
  app.get('/api/v1/users/:userId/tasks', (ctx) => taskController.getUserTasks(ctx));
  app.get('/api/v1/agents/:agentId/tasks', (ctx) => taskController.getAgentTasks(ctx));
  return app;
}
