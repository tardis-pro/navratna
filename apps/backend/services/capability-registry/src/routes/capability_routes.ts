import { Elysia } from 'elysia';
import { CapabilityController } from '../controllers/capability_controller.js';
import { EventBusService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { withNginxAuth } from '@uaip/middleware';

const CAPABILITY_INJECTED_EVENT = 'capability.injected';

const MCP_TOOL_REQUIRED_FIELDS = ['name', 'description', 'inputSchema'] as const;

function validateMcpToolSchema(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body must be an object';
  }

  const record = body as Record<string, unknown>;

  for (const field of MCP_TOOL_REQUIRED_FIELDS) {
    if (!record[field]) {
      return `Missing required field: ${field}`;
    }
  }

  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    return 'name must be a non-empty string';
  }

  if (typeof record.description !== 'string') {
    return 'description must be a string';
  }

  if (typeof record.inputSchema !== 'object' || record.inputSchema === null) {
    return 'inputSchema must be a JSON Schema object';
  }

  const schema = record.inputSchema as Record<string, unknown>;
  if (schema.type !== 'object') {
    return 'inputSchema.type must be "object"';
  }

  return null;
}

export function registerCapabilityRoutes<T extends Elysia>(app: T, controller?: CapabilityController): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia group generics are not statically expressible after withNginxAuth
  const routeApp = app as any;
  const capabilityController = controller ?? new CapabilityController();

  logger.info('Registering capability routes');

  routeApp.group('/api/v1/capabilities', (g) => withNginxAuth(g)
    .get('/search', (ctx) => capabilityController.searchCapabilities(ctx))
    .get('/categories', (ctx) => capabilityController.getCategories(ctx))
    .get('/recommendations', (ctx) => capabilityController.getRecommendations(ctx))
    .get('/', (ctx) => capabilityController.listCapabilities(ctx))
    .get('/:id', (ctx) => capabilityController.getCapability(ctx))
    .get('/:id/dependencies', (ctx) => capabilityController.getCapabilityDependencies(ctx))
    .post('/', (ctx) => capabilityController.registerCapability(ctx))
    .post('/inject', async (ctx) => {
      const validationError = validateMcpToolSchema(ctx.body);
      if (validationError) {
        ctx.set.status = 400;
        return { success: false, error: validationError };
      }
      
      try {
        const result = await capabilityController.registerCapability(ctx);
        const eventBus = EventBusService.getInstance();
        const body = ctx.body as Record<string, unknown>;
      
        await eventBus.publish(CAPABILITY_INJECTED_EVENT, {
          name: body.name,
          description: body.description,
          inputSchema: body.inputSchema,
          injectedAt: new Date().toISOString(),
        });
      
        logger.info('Capability hot-injected and broadcast to agents', {
          name: body.name,
        });
      
        return result;
      } catch (error) {
        logger.error('Capability hot-inject failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        ctx.set.status = 500;
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Hot-inject failed',
        };
      }
    })
    .post('/:id/execute', (ctx) => capabilityController.executeCapability(ctx))
    .post('/:id/validate', (ctx) => capabilityController.validateCapability(ctx))
    .put('/:id', (ctx) => capabilityController.updateCapability(ctx))
    .delete('/:id', (ctx) => capabilityController.deleteCapability(ctx))
  );

  return app;
}
