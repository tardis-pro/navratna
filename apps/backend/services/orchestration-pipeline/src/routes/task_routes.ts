import { Elysia, t } from 'elysia';
import { withRequiredAuth } from '@uaip/middleware';
import { TaskController } from '../controllers/task_controller.js';

const TaskQuerySchema = t.Object({
  status: t.Optional(t.String()),
  priority: t.Optional(t.String()),
  tags: t.Optional(t.String()),
  isOverdue: t.Optional(t.String()),
  isBlocked: t.Optional(t.String()),
  dueDateBefore: t.Optional(t.String()),
  dueDateAfter: t.Optional(t.String()),
})

/**
 * AUTHENTICATION IS MOUNTED HERE, ON THE WHOLE ROUTER.
 *
 * This file attached no middleware at all, which had two consequences that look
 * opposite and share one cause: nothing populated `user`. Reads were therefore
 * open to anyone who could reach the port, and mutations — which call
 * `requireAuth(user?.id)` in the controller — refused EVERYONE, including
 * legitimate signed-in callers, because the id they check was never attached.
 *
 * The board is where the nightly triage writes its evidence: finding titles,
 * suspect releases, correlated log lines. An unauthenticated read of it is a
 * read of the project's diagnostic surface.
 *
 * `withRequiredAuth` is `requireAuth(attachAuth(app))` — it attaches the user
 * and then guards, so it closes the read hole and makes the mutations' existing
 * check reachable in the same line. Mounted on the router rather than added per
 * handler so that a route added later inherits it instead of being forgotten;
 * the controller's own `requireAuth` calls stay as defence in depth.
 */
export function registerTaskRoutes(taskController: TaskController) {
  return withRequiredAuth(new Elysia())
    .get(
      '/api/v1/projects/:projectId/tasks',
      (ctx) => taskController.getProjectTasks(ctx),
      { query: TaskQuerySchema }
    )
    .post(
      '/api/v1/projects/:projectId/tasks',
      (ctx) => taskController.createTask(ctx),
      {
        body: t.Object({
          title: t.String(),
          description: t.Optional(t.String()),
          projectId: t.Optional(t.String()),
          priority: t.Optional(t.String()),
          type: t.Optional(t.String()),
          assigneeType: t.Optional(t.String()),
          assignedToUserId: t.Optional(t.String()),
          assignedToAgentId: t.Optional(t.String()),
          dueDate: t.Optional(t.String()),
          tags: t.Optional(t.Array(t.String())),
          labels: t.Optional(t.Array(t.String())),
          epic: t.Optional(t.String()),
          sprint: t.Optional(t.String()),
          estimatedHours: t.Optional(t.Number()),
          customFields: t.Optional(t.Any()),
        }),
      }
    )
    .get('/api/v1/projects/:projectId/tasks/statistics', (ctx) => taskController.getTaskStatistics(ctx))
    .get('/api/v1/tasks/:taskId', (ctx) => taskController.getTask(ctx))
    .put(
      '/api/v1/tasks/:taskId',
      (ctx) => taskController.updateTask(ctx),
      {
        body: t.Object({
          title: t.Optional(t.String()),
          description: t.Optional(t.String()),
          status: t.Optional(t.String()),
          priority: t.Optional(t.String()),
          type: t.Optional(t.String()),
          assigneeType: t.Optional(t.String()),
          assignedToUserId: t.Optional(t.String()),
          assignedToAgentId: t.Optional(t.String()),
          dueDate: t.Optional(t.String()),
          tags: t.Optional(t.Array(t.String())),
          labels: t.Optional(t.Array(t.String())),
          epic: t.Optional(t.String()),
          sprint: t.Optional(t.String()),
          customFields: t.Optional(t.Any()),
        }),
      }
    )
    .delete('/api/v1/tasks/:taskId', (ctx) => taskController.deleteTask(ctx))
    .post(
      '/api/v1/tasks/:taskId/assign',
      (ctx) => taskController.assignTask(ctx),
      {
        body: t.Object({
          assigneeType: t.Union([t.Literal('human'), t.Literal('agent')]),
          assignedToUserId: t.Optional(t.String()),
          assignedToAgentId: t.Optional(t.String()),
          reason: t.Optional(t.String()),
        }),
      }
    )
    .get('/api/v1/tasks/:taskId/assignment-suggestions', (ctx) => taskController.getAssignmentSuggestions(ctx))
    .put(
      '/api/v1/tasks/:taskId/progress',
      (ctx) => taskController.updateTaskProgress(ctx),
      {
        body: t.Object({
          completionPercentage: t.Number(),
          timeSpent: t.Optional(t.Number()),
        }),
      }
    )
    .get(
      '/api/v1/users/:userId/tasks',
      (ctx) => taskController.getUserTasks(ctx),
      { query: TaskQuerySchema }
    )
    .get(
      '/api/v1/agents/:agentId/tasks',
      (ctx) => taskController.getAgentTasks(ctx),
      { query: TaskQuerySchema }
    )
}
