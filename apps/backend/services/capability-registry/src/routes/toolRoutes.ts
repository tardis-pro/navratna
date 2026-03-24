import { ToolController } from '../controllers/toolController.js';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/eventBus';

interface ControllerRequest {
  query: Record<string, unknown>;
  params: Record<string, unknown>;
  body: unknown;
  headers: Record<string, unknown>;
  url?: string;
  method?: string;
  path?: string;
}

interface ControllerResponse {
  statusCode?: number;
  result?: unknown;
  json: (v: unknown) => unknown;
  status: (code: number) => ControllerResponse;
  send: (v?: unknown) => unknown;
}

interface RouteContext {
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, unknown>;
}

interface RouteGroup {
  get: (path: string, handler: (ctx: RouteContext) => Promise<unknown>) => RouteGroup;
  post: (path: string, handler: (ctx: RouteContext) => Promise<unknown>) => RouteGroup;
  put: (path: string, handler: (ctx: RouteContext) => Promise<unknown>) => RouteGroup;
  delete: (path: string, handler: (ctx: RouteContext) => Promise<unknown>) => RouteGroup;
}

interface RouteApp {
  group: (path: string, handler: (group: RouteGroup) => RouteGroup) => RouteApp;
}

function createResponseObject() {
  const res: ControllerResponse = {
    json: (v: unknown) => v,
    send: (v?: unknown) => v,
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
  };
  return res;
}

// Minimal, clean Elysia route group for tools
export function registerToolRoutes(
  app: unknown,
  toolController?: ToolController,
  eventBusService?: EventBusService
) {
  const routeApp = app as RouteApp;
  const controller =
    toolController ??
    (() => {
      // Fall back to a lightweight controller if not provided
      const db = DatabaseService.getInstance();
      const { ToolRegistry } = require('../services/toolRegistry.js');
      const { ToolExecutor } = require('../services/toolExecutor.js');
      const registry = new ToolRegistry(eventBusService);
      const base = { execute: async () => ({ success: true, result: null as unknown }) } as unknown;
      const exec = new ToolExecutor(db, registry, base);
      return new ToolController(registry, exec);
    })();

  routeApp.group('/api/v1/tools', (g: RouteGroup) =>
    g
      // List tools
      .get('/', async ({ query, headers }) => {
        const req: ControllerRequest = {
          query: query ?? {},
          params: {},
          body: {},
          headers: headers ?? {},
        };
        const res: ControllerResponse = createResponseObject();
        return controller.getTools(req, res);
      })

      // Health
      .get('/health', async () => {
        const res = createResponseObject();
        return controller.healthCheck({ query: {}, params: {}, body: {}, headers: {} }, res);
      })

      // Categories
      .get('/categories', async () => {
        const res = createResponseObject();
        return controller.getToolCategories({ query: {}, params: {}, body: {}, headers: {} }, res);
      })

      // Recommendations
      .get('/recommendations', async ({ query }) => {
        const req: ControllerRequest = { query: query ?? {}, params: {}, body: {}, headers: {} };
        const res = createResponseObject();
        return controller.getRecommendations(req, res);
      })

      // Validate tool definition
      .post('/validate', async ({ body }) => {
        const req: ControllerRequest = { query: {}, params: {}, body, headers: {} };
        const res = createResponseObject();
        return controller.validateTool(req, res);
      })

      // Executions listing
      .get('/executions', async ({ query }) => {
        const req: ControllerRequest = { query: query ?? {}, params: {}, body: {}, headers: {} };
        const res = createResponseObject();
        return controller.getExecutions(req, res);
      })

      // Execution by id
      .get('/executions/:id', async ({ params }) => {
        const req: ControllerRequest = { query: {}, params: params ?? {}, body: {}, headers: {} };
        const res = createResponseObject();
        return controller.getExecution(req, res);
      })

      // Approve execution
      .post('/executions/:id/approve', async ({ params, body, headers }) => {
        const req: ControllerRequest = {
          query: {},
          params: params ?? {},
          body,
          headers: headers ?? {},
        };
        const res = createResponseObject();
        return controller.approveExecution(req, res);
      })

      // Cancel execution
      .post('/executions/:id/cancel', async ({ params }) => {
        const req: ControllerRequest = { query: {}, params: params ?? {}, body: {}, headers: {} };
        const res = createResponseObject();
        return controller.cancelExecution(req, res);
      })

      // Analytics
      .get('/analytics/usage', async ({ query }) => {
        const req: ControllerRequest = { query: query ?? {}, params: {}, body: {}, headers: {} };
        const res = createResponseObject();
        return controller.getUsageAnalytics(req, res);
      })
      .get('/analytics/popular', async ({ query }) => {
        const req: ControllerRequest = { query: query ?? {}, params: {}, body: {}, headers: {} };
        const res = createResponseObject();
        return controller.getPopularTools(req, res);
      })
      .get('/analytics/agent/:agentId/preferences', async ({ params }) => {
        const req: ControllerRequest = { query: {}, params: params ?? {}, body: {}, headers: {} };
        const res = createResponseObject();
        return controller.getAgentPreferences(req, res);
      })

      // Register tool
      .post('/', async ({ body }) => {
        const req: ControllerRequest = { query: {}, params: {}, body, headers: {} };
        const res = createResponseObject();
        return controller.registerTool(req, res);
      })

      // Tool by id
      .get('/:id', async ({ params }) => {
        const req: ControllerRequest = { query: {}, params: params ?? {}, body: {}, headers: {} };
        const res = createResponseObject();
        return controller.getTool(req, res);
      })

      // Related/similar/dependencies
      .get('/:id/related', async ({ params, query }) => {
        const req: ControllerRequest = {
          query: query ?? {},
          params: params ?? {},
          body: {},
          headers: {},
        };
        const res = createResponseObject();
        return controller.getRelatedTools(req, res);
      })
      .get('/:id/similar', async ({ params, query }) => {
        const req: ControllerRequest = {
          query: query ?? {},
          params: params ?? {},
          body: {},
          headers: {},
        };
        const res = createResponseObject();
        return controller.getSimilarTools(req, res);
      })
      .get('/:id/dependencies', async ({ params }) => {
        const req: ControllerRequest = { query: {}, params: params ?? {}, body: {}, headers: {} };
        const res = createResponseObject();
        return controller.getToolDependencies(req, res);
      })

      // Update/unregister
      .put('/:id', async ({ params, body }) => {
        const req: ControllerRequest = { query: {}, params: params ?? {}, body, headers: {} };
        const res = createResponseObject();
        return controller.updateTool(req, res);
      })
      .delete('/:id', async ({ params }) => {
        const req: ControllerRequest = { query: {}, params: params ?? {}, body: {}, headers: {} };
        const res = createResponseObject();
        return controller.unregisterTool(req, res);
      })

      // Relationships
      .post('/:id/relationships', async ({ params, body, headers }) => {
        const req: ControllerRequest = {
          query: {},
          params: params ?? {},
          body,
          headers: headers ?? {},
        };
        const res = createResponseObject();
        return controller.addRelationship(req, res);
      })

      // Execute tool
      .post('/:id/execute', async ({ params, body, headers }) => {
        const req: ControllerRequest = {
          query: {},
          params: params ?? {},
          body,
          headers: headers ?? {},
        };
        const res = createResponseObject();
        res.result = undefined as unknown;
        return controller.executeTool(req, res);
      })
  );

  return app;
}
