import { Router } from 'express';
import { logger } from '@uaip/utils';

const router = Router();

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
    const healthData = {
      status: 'healthy',
      service: 'llm-service-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      environment: process.env.NODE_ENV || 'development'
    };

    res.json(healthData);
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(500).json({
      status: 'unhealthy',
      service: 'llm-service-api',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

export default router; 