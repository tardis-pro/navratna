import { ToolController } from '../controllers/toolController.js';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/eventBus';

function createResponseObject() {
  const res: unknown = {
    json: (v: unknown) => v,
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

  app.group('/api/v1/tools', (g: unknown) =>
    g
      // List tools
      .get('/', async ({ query, headers }: unknown) => {
        const req: unknown = { query, params: {}, body: {}, headers };
        const res: unknown = { json: (v: unknown) => v, status: () => res };
        return controller.getTools(req, res);
      })

      // Health
      .get('/health', async () => {
        const res: unknown = createResponseObject();
        return controller.healthCheck({} as unknown, res);
      })

      // Categories
      .get('/categories', async () => {
        const res: unknown = createResponseObject();
        return controller.getToolCategories({} as unknown, res);
      })

      // Recommendations
      .get('/recommendations', async ({ query }: unknown) => {
        const req: unknown = { query };
        const res: unknown = createResponseObject();
        return controller.getRecommendations(req, res);
      })

      // Validate tool definition
      .post('/validate', async ({ body }: unknown) => {
        const req: unknown = { body };
        const res: unknown = createResponseObject();
        return controller.validateTool(req, res);
      })

      // Executions listing
      .get('/executions', async ({ query }: unknown) => {
        const req: unknown = { query };
        const res: unknown = createResponseObject();
        return controller.getExecutions(req, res);
      })

      // Execution by id
      .get('/executions/:id', async ({ params }: unknown) => {
        const req: unknown = { params };
        const res: unknown = createResponseObject();
        return controller.getExecution(req, res);
      })

      // Approve execution
      .post('/executions/:id/approve', async ({ params, body, headers }: unknown) => {
        const req: unknown = {
          params,
          body,
          user: headers['x-user-id'] ? { id: headers['x-user-id'] } : undefined,
        };
        const res: unknown = createResponseObject();
        return controller.approveExecution(req, res);
      })

      // Cancel execution
      .post('/executions/:id/cancel', async ({ params }: unknown) => {
        const req: unknown = { params };
        const res: unknown = createResponseObject();
        return controller.cancelExecution(req, res);
      })

      // Analytics
      .get('/analytics/usage', async ({ query }: unknown) => {
        const req: unknown = { query };
        const res: unknown = createResponseObject();
        return controller.getUsageAnalytics(req, res);
      })
      .get('/analytics/popular', async ({ query }: unknown) => {
        const req: unknown = { query };
        const res: unknown = createResponseObject();
        return controller.getPopularTools(req, res);
      })
      .get('/analytics/agent/:agentId/preferences', async ({ params }: unknown) => {
        const req: unknown = { params };
        const res: unknown = createResponseObject();
        return controller.getAgentPreferences(req, res);
      })

      // Register tool
      .post('/', async ({ body }: unknown) => {
        const req: unknown = { body };
        const res: unknown = createResponseObject();
        return controller.registerTool(req, res);
      })

      // Tool by id
      .get('/:id', async ({ params }: unknown) => {
        const req: unknown = { params };
        const res: unknown = createResponseObject();
        return controller.getTool(req, res);
      })

      // Related/similar/dependencies
      .get('/:id/related', async ({ params, query }: unknown) => {
        const req: unknown = { params, query };
        const res: unknown = createResponseObject();
        return controller.getRelatedTools(req, res);
      })
      .get('/:id/similar', async ({ params, query }: unknown) => {
        const req: unknown = { params, query };
        const res: unknown = createResponseObject();
        return controller.getSimilarTools(req, res);
      })
      .get('/:id/dependencies', async ({ params }: unknown) => {
        const req: unknown = { params };
        const res: unknown = createResponseObject();
        return controller.getToolDependencies(req, res);
      })

      // Update/unregister
      .put('/:id', async ({ params, body }: unknown) => {
        const req: unknown = { params, body };
        const res: unknown = createResponseObject();
        return controller.updateTool(req, res);
      })
      .delete('/:id', async ({ params }: unknown) => {
        const req: unknown = { params };
        const res: unknown = createResponseObject();
        return controller.unregisterTool(req, res);
      })

      // Relationships
      .post('/:id/relationships', async ({ params, body, headers }: unknown) => {
        const req: unknown = {
          params,
          body,
          user: headers['x-user-id'] ? { id: headers['x-user-id'] } : undefined,
        };
        const res: unknown = createResponseObject();
        return controller.addRelationship(req, res);
      })

      // Execute tool
      .post('/:id/execute', async ({ params, body, headers }: unknown) => {
        const userId = headers['x-user-id'];
        const req: unknown = { params, body, user: userId ? { id: userId } : undefined };
        const res: unknown = createResponseObject();
        res.result = undefined as unknown;
        return controller.executeTool(req, res);
      })
  );

  return app;
}
