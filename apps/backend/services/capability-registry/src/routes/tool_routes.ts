import { Elysia, t } from 'elysia';
import { ToolController } from '../controllers/tool_controller.js';
import { ToolRegistry } from '../services/tool_registry.js';
import { ToolExecutor } from '../services/tool_executor.js';
import { BaseToolExecutor } from '../services/base_tool_executor.js';
import { DatabaseService } from '@uaip/infra/database';

const ToolAnyResponse = t.Any()
const ToolQuerySchema = t.Object({
  toolId: t.Optional(t.String()),
  agentId: t.Optional(t.String()),
  status: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  category: t.Optional(t.String()),
  enabled: t.Optional(t.String()),
})

export function registerToolRoutes(toolController?: ToolController){
  const controller =
    toolController ??
    (() => {
      const db = DatabaseService.getInstance();
      const registry = new ToolRegistry();
      const base = new BaseToolExecutor();
      const exec = new ToolExecutor(db, registry, base);
      return new ToolController(registry, exec);
    })();

  return new Elysia().group('/api/v1/tools', (g) =>
    g
      .get('/', (ctx) => controller.getTools(ctx), {
        query: ToolQuerySchema,
        response: { 200: ToolAnyResponse },
      })
      .get('/health', (ctx) => controller.healthCheck(ctx), {
        response: { 200: ToolAnyResponse },
      })
      .get('/categories', (ctx) => controller.getToolCategories(ctx), {
        response: { 200: ToolAnyResponse },
      })
      .get('/recommendations', (ctx) => controller.getRecommendations(ctx), {
        query: t.Object({ agentId: t.Optional(t.String()), context: t.Optional(t.String()), limit: t.Optional(t.String()) }),
        response: { 200: ToolAnyResponse },
      })
      .post('/validate', (ctx) => controller.validateTool(ctx), {
        body: t.Any(),
        response: { 200: ToolAnyResponse },
      })
      .get('/executions', (ctx) => controller.getExecutions(ctx), {
        query: t.Object({
          toolId: t.Optional(t.String()),
          agentId: t.Optional(t.String()),
          status: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        response: { 200: ToolAnyResponse },
      })
      .get('/executions/:id', (ctx) => controller.getExecution(ctx), {
        response: { 200: ToolAnyResponse },
      })
      .post('/executions/:id/approve', (ctx) => controller.approveExecution(ctx), {
        body: t.Any(),
        response: { 200: ToolAnyResponse },
      })
      .post('/executions/:id/cancel', (ctx) => controller.cancelExecution(ctx), {
        response: { 200: ToolAnyResponse },
      })
      .get('/analytics/usage', (ctx) => controller.getUsageAnalytics(ctx), {
        query: t.Object({ toolId: t.Optional(t.String()), agentId: t.Optional(t.String()), days: t.Optional(t.String()) }),
        response: { 200: ToolAnyResponse },
      })
      .get('/analytics/popular', (ctx) => controller.getPopularTools(ctx), {
        query: t.Object({ category: t.Optional(t.String()), limit: t.Optional(t.String()) }),
        response: { 200: ToolAnyResponse },
      })
      .get('/analytics/agent/:agentId/preferences', (ctx) => controller.getAgentPreferences(ctx), {
        response: { 200: ToolAnyResponse },
      })
      .post('/', (ctx) => controller.registerTool(ctx), {
        body: t.Any(),
        response: { 200: ToolAnyResponse, 201: ToolAnyResponse },
      })
      .get('/:id', (ctx) => controller.getTool(ctx), {
        response: { 200: ToolAnyResponse, 404: ToolAnyResponse },
      })
      .get('/:id/related', (ctx) => controller.getRelatedTools(ctx), {
        query: t.Object({ relationshipTypes: t.Optional(t.String()), minStrength: t.Optional(t.String()), limit: t.Optional(t.String()) }),
        response: { 200: ToolAnyResponse },
      })
      .get('/:id/similar', (ctx) => controller.getSimilarTools(ctx), {
        query: t.Object({ minSimilarity: t.Optional(t.String()), limit: t.Optional(t.String()) }),
        response: { 200: ToolAnyResponse },
      })
      .get('/:id/dependencies', (ctx) => controller.getToolDependencies(ctx), {
        response: { 200: ToolAnyResponse },
      })
      .put('/:id', (ctx) => controller.updateTool(ctx), {
        body: t.Any(),
        response: { 200: ToolAnyResponse },
      })
      .delete('/:id', (ctx) => controller.unregisterTool(ctx), {
        response: { 200: ToolAnyResponse },
      })
      .post('/:id/relationships', (ctx) => controller.addRelationship(ctx), {
        body: t.Any(),
        response: { 200: ToolAnyResponse, 201: ToolAnyResponse },
      })
      .post('/:id/execute', (ctx) => controller.executeTool(ctx), {
        body: t.Any(),
        response: { 200: ToolAnyResponse, 202: ToolAnyResponse },
      })
  );
}
