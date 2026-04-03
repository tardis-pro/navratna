import { Elysia, t } from 'elysia';
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

const CapabilitySchema = t.Any()
const CapabilityErrorSchema = t.Object({ success: t.Boolean(), error: t.String() })
const MetaSchema = t.Object({ timestamp: t.Any(), service: t.String() })

export function registerCapabilityRoutes(controller?: CapabilityController){
  const capabilityController = controller ?? new CapabilityController();

  logger.info('Registering capability routes');

  return new Elysia().group('/api/v1/capabilities', (g) => withNginxAuth(g)
    .get('/search', (ctx) => capabilityController.searchCapabilities(ctx), {
      query: t.Object({
        query: t.Optional(t.String()),
        type: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
      response: { 200: t.Any(), 400: CapabilityErrorSchema, 500: CapabilityErrorSchema },
    })
    .get('/categories', (ctx) => capabilityController.getCategories(ctx), {
      response: {
        200: t.Object({ success: t.Boolean(), data: t.Object({ categories: t.Array(t.String()) }), meta: MetaSchema }),
      },
    })
    .get('/recommendations', (ctx) => capabilityController.getRecommendations(ctx), {
      query: t.Object({ agentId: t.Optional(t.String()), context: t.Optional(t.String()), limit: t.Optional(t.String()) }),
      response: {
        200: t.Object({ success: t.Boolean(), data: t.Object({ recommendations: t.Array(t.Any()) }), meta: MetaSchema }),
      },
    })
    .get('/', (ctx) => capabilityController.listCapabilities(ctx), {
      query: t.Object({
        type: t.Optional(t.String()),
        status: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({ success: t.Boolean(), data: t.Object({ capabilities: t.Array(CapabilitySchema), totalCount: t.Number() }), meta: MetaSchema }),
      },
    })
    .get('/:id', (ctx) => capabilityController.getCapability(ctx))
    .get('/:id/dependencies', (ctx) => capabilityController.getCapabilityDependencies(ctx))
    .post('/', (ctx) => capabilityController.registerCapability(ctx), {
      body: t.Any(),
    })
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
    }, {
      body: t.Object({
        name: t.String(),
        description: t.String(),
        inputSchema: t.Any(),
      }),
      response: { 200: t.Any(), 400: CapabilityErrorSchema, 500: CapabilityErrorSchema },
    })
    .post('/:id/execute', (ctx) => capabilityController.executeCapability(ctx), {
      body: t.Any(),
      response: {
        200: t.Object({ success: t.Boolean(), data: t.Object({ execution: t.Any() }), meta: MetaSchema }),
        400: CapabilityErrorSchema,
        500: CapabilityErrorSchema,
      },
    })
    .post('/:id/validate', (ctx) => capabilityController.validateCapability(ctx), {
      body: t.Any(),
      response: {
        200: t.Object({
          success: t.Boolean(),
          data: t.Object({ validationResult: t.Object({ valid: t.Boolean(), issues: t.Array(t.String()), recommendations: t.Array(t.String()) }) }),
          meta: MetaSchema,
        }),
        400: CapabilityErrorSchema,
        500: CapabilityErrorSchema,
      },
    })
    .put('/:id', (ctx) => capabilityController.updateCapability(ctx), {
      body: t.Any(),
      response: {
        200: t.Object({ success: t.Boolean(), data: t.Object({ capability: t.Object({ id: t.String() }) }), meta: MetaSchema }),
        400: CapabilityErrorSchema,
        500: CapabilityErrorSchema,
      },
    })
    .delete('/:id', (ctx) => capabilityController.deleteCapability(ctx), {
      response: { 200: CapabilityErrorSchema, 400: CapabilityErrorSchema, 500: CapabilityErrorSchema },
    })
  );
}
