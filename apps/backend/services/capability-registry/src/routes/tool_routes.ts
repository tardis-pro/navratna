import { ToolController } from '../controllers/tool_controller.js';
import { ToolRegistry } from '../services/tool_registry.js';
import { ToolExecutor } from '../services/tool_executor.js';
import { BaseToolExecutor } from '../services/base_tool_executor.js';
import { DatabaseService } from '@uaip/infra/database';

interface RouteContext {
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, unknown>;
  set: { status: number };
}

interface RouteGroup {
  get: (path: string, handler: (ctx: RouteContext) => unknown) => RouteGroup;
  post: (path: string, handler: (ctx: RouteContext) => unknown) => RouteGroup;
  put: (path: string, handler: (ctx: RouteContext) => unknown) => RouteGroup;
  delete: (path: string, handler: (ctx: RouteContext) => unknown) => RouteGroup;
}

interface RouteApp {
  group: (path: string, handler: (group: RouteGroup) => RouteGroup) => RouteApp;
}

export function registerToolRoutes(app: unknown, toolController?: ToolController) {
  const routeApp = app as RouteApp;
  const controller =
    toolController ??
    (() => {
      const db = DatabaseService.getInstance();
      const registry = new ToolRegistry();
      const base = new BaseToolExecutor();
      const exec = new ToolExecutor(db, registry, base);
      return new ToolController(registry, exec);
    })();

  routeApp.group('/api/v1/tools', (g: RouteGroup) =>
    g
      .get('/', (ctx) => controller.getTools(ctx))
      .get('/health', (ctx) => controller.healthCheck(ctx))
      .get('/categories', (ctx) => controller.getToolCategories(ctx))
      .get('/recommendations', (ctx) => controller.getRecommendations(ctx))
      .post('/validate', (ctx) => controller.validateTool(ctx))
      .get('/executions', (ctx) => controller.getExecutions(ctx))
      .get('/executions/:id', (ctx) => controller.getExecution(ctx))
      .post('/executions/:id/approve', (ctx) => controller.approveExecution(ctx))
      .post('/executions/:id/cancel', (ctx) => controller.cancelExecution(ctx))
      .get('/analytics/usage', (ctx) => controller.getUsageAnalytics(ctx))
      .get('/analytics/popular', (ctx) => controller.getPopularTools(ctx))
      .get('/analytics/agent/:agentId/preferences', (ctx) => controller.getAgentPreferences(ctx))
      .post('/', (ctx) => controller.registerTool(ctx))
      .get('/:id', (ctx) => controller.getTool(ctx))
      .get('/:id/related', (ctx) => controller.getRelatedTools(ctx))
      .get('/:id/similar', (ctx) => controller.getSimilarTools(ctx))
      .get('/:id/dependencies', (ctx) => controller.getToolDependencies(ctx))
      .put('/:id', (ctx) => controller.updateTool(ctx))
      .delete('/:id', (ctx) => controller.unregisterTool(ctx))
      .post('/:id/relationships', (ctx) => controller.addRelationship(ctx))
      .post('/:id/execute', (ctx) => controller.executeTool(ctx))
  );

  return app;
}
