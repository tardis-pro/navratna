import { Elysia } from 'elysia';
import { logger } from '@uaip/utils';
import { LLMService } from '@uaip/llm-service';

export function registerHealthRoutes() {
  return new Elysia()
    .get('/health', () => {
      return {
        status: 'healthy',
        service: 'llm-service-api',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    })

    .get('/health/detailed', async ({ set }) => {
      try {
        const llmService = LLMService.getInstance();

        // Get LLM service health data
        const providerHealth = await llmService.getProviderHealth();
        const configuredProviders = await llmService.getConfiguredProviders();

        const healthData = {
          status: 'healthy',
          service: 'llm-service-api',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.version,
          environment: process.env.NODE_ENV || 'development',
          llmService: {
            providers: configuredProviders,
            health: providerHealth,
            // 'unknown' is counted separately: a provider nothing has called yet
            // is not failing, and lumping it into `unhealthy` would make every
            // fresh boot look broken.
            healthySummary: {
              total: Object.keys(providerHealth).length,
              healthy: Object.values(providerHealth).filter((status) => status === 'healthy').length,
              unhealthy: Object.values(providerHealth).filter(
                (status) => status === 'degraded' || status === 'unavailable'
              ).length,
              unknown: Object.values(providerHealth).filter((status) => status === 'unknown').length,
            },
          },
          eventSystem: {
            enabled: true,
            subscribedEvents: [
              'llm.user.request',
              'llm.global.request',
              'llm.agent.generate.request',
            ],
            publishedEvents: ['llm.agent.generate.response'],
          },
        };

        // Determine overall health status
        const hasHealthyProvider = Object.values(providerHealth).some(
          (status) => status === 'healthy'
        );
        if (!hasHealthyProvider) {
          healthData.status = 'degraded';
        }

        return healthData;
      } catch (error) {
        logger.error('Health check failed', { error });
        set.status = 500;
        return {
          status: 'unhealthy',
          service: 'llm-service-api',
          timestamp: new Date().toISOString(),
          error: 'Health check failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });
}
