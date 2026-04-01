import { Elysia } from 'elysia';
import { TaskController } from '../controllers/task_controller.js';

export function registerTaskRoutes(taskController: TaskController) {
  return new Elysia()
    .get('/api/v1/projects/:projectId/tasks', (ctx) => taskController.getProjectTasks(ctx))
    .post('/api/v1/projects/:projectId/tasks', (ctx) => taskController.createTask(ctx))
    .get('/api/v1/projects/:projectId/tasks/statistics', (ctx) =>
      taskController.getTaskStatistics(ctx)
    )
    .get('/api/v1/tasks/:taskId', (ctx) => taskController.getTask(ctx))
    .put('/api/v1/tasks/:taskId', (ctx) => taskController.updateTask(ctx))
    .delete('/api/v1/tasks/:taskId', (ctx) => taskController.deleteTask(ctx))
    .post('/api/v1/tasks/:taskId/assign', (ctx) => taskController.assignTask(ctx))
    .get('/api/v1/tasks/:taskId/assignment-suggestions', (ctx) =>
      taskController.getAssignmentSuggestions(ctx)
    )
    .put('/api/v1/tasks/:taskId/progress', (ctx) => taskController.updateTaskProgress(ctx))
    .get('/api/v1/users/:userId/tasks', (ctx) => taskController.getUserTasks(ctx))
    .get('/api/v1/agents/:agentId/tasks', (ctx) => taskController.getAgentTasks(ctx))
}
