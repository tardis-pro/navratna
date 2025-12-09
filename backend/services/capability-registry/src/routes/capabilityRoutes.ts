import { logger } from '@uaip/utils';

export function registerCapabilityRoutes(app: any) {
  logger.info('Registering placeholder capability routes');
  return app.group('/api/v1/capabilities', (g: any) =>
    g.get('/', () => ({
      success: true,
      message: 'Capabilities are disabled pending schema migration',
    }))
  );
}
