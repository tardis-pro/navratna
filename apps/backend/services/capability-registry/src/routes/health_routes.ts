import { Elysia } from 'elysia';
import { logger } from '@uaip/utils';

interface HealthRouteGroup {
  get: (path: string, handler: () => unknown) => HealthRouteGroup;
}

interface HealthRouteApp {
  group: (path: string, handler: (group: HealthRouteGroup) => HealthRouteGroup) => HealthRouteApp;
}

export function registerHealthRoutes<T extends Elysia>(app: T): T {
  const routeApp = app as HealthRouteApp;
  logger.info('Registering Capability Registry health routes');
  routeApp.group('/health/capability-registry', (g: HealthRouteGroup) =>
    g
      .get('/', () => ({ status: 'healthy', service: 'capability-registry' }))
      .get('/ready', () => ({ status: 'ready', service: 'capability-registry' }))
      .get('/live', () => ({ status: 'alive', service: 'capability-registry' }))
  );

  return app;
}
