import { CapabilityController } from '../controllers/capabilityController.js';
import { logger } from '@uaip/utils';

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

  return routeApp.group('/api/v1/capabilities', (g: RouteGroup) =>
    g
      .get('/search', (ctx) => capabilityController.searchCapabilities(ctx))
      .get('/categories', (ctx) => capabilityController.getCategories(ctx))
      .get('/recommendations', (ctx) => capabilityController.getRecommendations(ctx))
      .get('/', (ctx) => capabilityController.listCapabilities(ctx))
      .get('/:id', (ctx) => capabilityController.getCapability(ctx))
      .get('/:id/dependencies', (ctx) => capabilityController.getCapabilityDependencies(ctx))
      .post('/', (ctx) => capabilityController.registerCapability(ctx))
      .post('/:id/execute', (ctx) => capabilityController.executeCapability(ctx))
      .post('/:id/validate', (ctx) => capabilityController.validateCapability(ctx))
      .put('/:id', (ctx) => capabilityController.updateCapability(ctx))
      .delete('/:id', (ctx) => capabilityController.deleteCapability(ctx))
  );
}
