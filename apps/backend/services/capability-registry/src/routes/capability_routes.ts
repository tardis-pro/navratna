import { CapabilityController } from '../controllers/capability_controller.js';
import { logger } from '@uaip/utils';
import { withNginxAuth } from '@uaip/middleware';

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

export function registerCapabilityRoutes(app: unknown, controller?: CapabilityController) {
  const routeApp = app as RouteApp;
  const capabilityController = controller ?? new CapabilityController();

  logger.info('Registering capability routes');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- withNginxAuth type flows through Elysia group generics
  return routeApp.group('/api/v1/capabilities', (g: any) =>
    withNginxAuth(g)
      .get('/search', (ctx: RouteContext) => capabilityController.searchCapabilities(ctx))
      .get('/categories', (ctx: RouteContext) => capabilityController.getCategories(ctx))
      .get('/recommendations', (ctx: RouteContext) => capabilityController.getRecommendations(ctx))
      .get('/', (ctx: RouteContext) => capabilityController.listCapabilities(ctx))
      .get('/:id', (ctx: RouteContext) => capabilityController.getCapability(ctx))
      .get('/:id/dependencies', (ctx: RouteContext) => capabilityController.getCapabilityDependencies(ctx))
      .post('/', (ctx: RouteContext) => capabilityController.registerCapability(ctx))
      .post('/:id/execute', (ctx: RouteContext) => capabilityController.executeCapability(ctx))
      .post('/:id/validate', (ctx: RouteContext) => capabilityController.validateCapability(ctx))
      .put('/:id', (ctx: RouteContext) => capabilityController.updateCapability(ctx))
      .delete('/:id', (ctx: RouteContext) => capabilityController.deleteCapability(ctx))
  );
}
