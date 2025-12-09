import { ToolController } from '../controllers/toolController.js';
import { DatabaseService, EventBusService } from '@uaip/shared-services';

// Minimal, clean Elysia route group for tools
export function registerToolRoutes(
  app: any,
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
      const base = { execute: async () => ({ success: true, result: null }) } as any;
      const exec = new ToolExecutor(db, registry, base);
      return new ToolController(registry, exec);
    })();

  app.group('/api/v1/tools', (g: any) =>
    g
      // List tools
      .get('/', async ({ query, headers }: any) => {
        const req: any = { query, params: {}, body: {}, headers };
        const res: any = { json: (v: any) => v, status: () => res };
        return controller.getTools(req, res);
      })

      // Health
      .get('/health', async () => {
        const res: any = { json: (v: any) => v };
        return controller.healthCheck({} as any, res);
      })

      // Categories
      .get('/categories', async () => {
        const res: any = { json: (v: any) => v };
        return controller.getToolCategories({} as any, res);
      })

      // Recommendations
      .get('/recommendations', async ({ query }: any) => {
        const req: any = { query };
        const res: any = { json: (v: any) => v };
        return controller.getRecommendations(req, res);
      })

      // Validate tool definition
      .post('/validate', async ({ body }: any) => {
        const req: any = { body };
        const res: any = { json: (v: any) => v };
        return controller.validateTool(req, res);
      })

      // Executions listing
      .get('/executions', async ({ query }: any) => {
        const req: any = { query };
        const res: any = { json: (v: any) => v };
        return controller.getExecutions(req, res);
      })

      // Execution by id
      .get('/executions/:id', async ({ params }: any) => {
        const req: any = { params };
        const res: any = { json: (v: any) => v };
        return controller.getExecution(req, res);
      })

      // Approve execution
      .post('/executions/:id/approve', async ({ params, body, headers }: any) => {
        const req: any = {
          params,
          body,
          user: headers['x-user-id'] ? { id: headers['x-user-id'] } : undefined,
        };
        const res: any = { json: (v: any) => v, status: () => res };
        return controller.approveExecution(req, res);
      })

      // Cancel execution
      .post('/executions/:id/cancel', async ({ params }: any) => {
        const req: any = { params };
        const res: any = { json: (v: any) => v, status: () => res };
        return controller.cancelExecution(req, res);
      })

      // Analytics
      .get('/analytics/usage', async ({ query }: any) => {
        const req: any = { query };
        const res: any = { json: (v: any) => v };
        return controller.getUsageAnalytics(req, res);
      })
      .get('/analytics/popular', async ({ query }: any) => {
        const req: any = { query };
        const res: any = { json: (v: any) => v };
        return controller.getPopularTools(req, res);
      })
      .get('/analytics/agent/:agentId/preferences', async ({ params }: any) => {
        const req: any = { params };
        const res: any = { json: (v: any) => v };
        return controller.getAgentPreferences(req, res);
      })

      // Register tool
      .post('/', async ({ body }: any) => {
        const req: any = { body };
        const res: any = {
          json: (v: any) => v,
          status: (code: number) => {
            res.statusCode = code;
            return res;
          },
        };
        return controller.registerTool(req, res);
      })

      // Tool by id
      .get('/:id', async ({ params }: any) => {
        const req: any = { params };
        const res: any = { json: (v: any) => v };
        return controller.getTool(req, res);
      })

      // Related/similar/dependencies
      .get('/:id/related', async ({ params, query }: any) => {
        const req: any = { params, query };
        const res: any = { json: (v: any) => v };
        return controller.getRelatedTools(req, res);
      })
      .get('/:id/similar', async ({ params, query }: any) => {
        const req: any = { params, query };
        const res: any = { json: (v: any) => v };
        return controller.getSimilarTools(req, res);
      })
      .get('/:id/dependencies', async ({ params }: any) => {
        const req: any = { params };
        const res: any = { json: (v: any) => v };
        return controller.getToolDependencies(req, res);
      })

      // Update/unregister
      .put('/:id', async ({ params, body }: any) => {
        const req: any = { params, body };
        const res: any = { json: (v: any) => v };
        return controller.updateTool(req, res);
      })
      .delete('/:id', async ({ params }: any) => {
        const req: any = { params };
        const res: any = { json: (v: any) => v };
        return controller.unregisterTool(req, res);
      })

      // Relationships
      .post('/:id/relationships', async ({ params, body, headers }: any) => {
        const req: any = {
          params,
          body,
          user: headers['x-user-id'] ? { id: headers['x-user-id'] } : undefined,
        };
        const res: any = { json: (v: any) => v };
        return controller.addRelationship(req, res);
      })

      // Execute tool
      .post('/:id/execute', async ({ params, body, headers }: any) => {
        const userId = headers['x-user-id'];
        const req: any = { params, body, user: userId ? { id: userId } : undefined };
        const res: any = { json: (v: any) => v, status: () => res };
        return controller.executeTool(req, res);
      })
  );

  return app;
}
