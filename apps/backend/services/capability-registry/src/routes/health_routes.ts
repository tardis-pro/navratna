import { Elysia } from 'elysia';
import { logger } from '@uaip/utils';

export function registerHealthRoutes() {
  logger.info('Registering Capability Registry health routes');
  return new Elysia().group('/health/capability-registry', (g) =>
    g
      .get('/', () => ({ status: 'healthy', service: 'capability-registry' }))
      .get('/ready', () => ({ status: 'ready', service: 'capability-registry' }))
      .get('/live', () => ({ status: 'alive', service: 'capability-registry' }))
  );
}
