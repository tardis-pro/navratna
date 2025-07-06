import { Router } from 'express';
import { logger } from '@uaip/utils';
import { LLMService } from '@uaip/llm-service';

const router: Router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'llm-service-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

router.get('/detailed', async (req, res) => {
  try {
    const llmService = LLMService.getInstance();
    
    // Get LLM service health data
    const providerHealth = await llmService.checkProviderHealth();
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
        healthySummary: {
          total: providerHealth.length,
          healthy: providerHealth.filter(p => p.isHealthy).length,
          unhealthy: providerHealth.filter(p => !p.isHealthy).length
        }
      },
      eventSystem: {
        enabled: true,
        subscribedEvents: [
          'llm.user.request',
          'llm.global.request', 
          'llm.agent.generate.request'
        ],
        publishedEvents: [
          'llm.agent.generate.response'
        ]
      }
    };

    // Determine overall health status
    const hasHealthyProvider = providerHealth.some(p => p.isHealthy);
    if (!hasHealthyProvider) {
      healthData.status = 'degraded';
    }

    res.json(healthData);
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(500).json({
      status: 'unhealthy',
      service: 'llm-service-api',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
      return;
  }
});

export default router; 