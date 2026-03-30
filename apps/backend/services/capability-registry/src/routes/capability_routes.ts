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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia group generics are not statically expressible after withNginxAuth
  const routeApp = app as any;
  const capabilityController = controller ?? new CapabilityController();

  logger.info('Registering capability routes');

  return routeApp.group('/api/v1/capabilities', (g: any) =>
    withNginxAuth(g)
      .get('/search', (ctx: any) => capabilityController.searchCapabilities(ctx))
      .get('/categories', (ctx: any) => capabilityController.getCategories(ctx))
      .get('/recommendations', (ctx: any) => capabilityController.getRecommendations(ctx))
      .get('/', (ctx: any) => capabilityController.listCapabilities(ctx))
      .get('/:id', (ctx: any) => capabilityController.getCapability(ctx))
      .get('/:id/dependencies', (ctx: any) => capabilityController.getCapabilityDependencies(ctx))
      .post('/', (ctx: any) => capabilityController.registerCapability(ctx))
      .post('/:id/execute', (ctx: any) => capabilityController.executeCapability(ctx))
      .post('/:id/validate', (ctx: any) => capabilityController.validateCapability(ctx))
      .put('/:id', (ctx: any) => capabilityController.updateCapability(ctx))
      .delete('/:id', (ctx: any) => capabilityController.deleteCapability(ctx))
  );
}
