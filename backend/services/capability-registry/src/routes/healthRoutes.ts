import { logger } from '@uaip/utils';

export function registerHealthRoutes(app: unknown) {
  logger.info('Registering Capability Registry health routes');
  return app.group('/health', (g: unknown) =>
    g
      .get('/', () => ({ status: 'healthy', service: 'capability-registry' }))
      .get('/ready', () => ({ status: 'ready', service: 'capability-registry' }))
      .get('/live', () => ({ status: 'alive', service: 'capability-registry' }))
  );
}
