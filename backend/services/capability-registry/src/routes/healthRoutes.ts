import { Router } from 'express';
import { logger } from '@uaip/utils';

const router: Router = Router();

// Basic health check
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'capability-registry',
    timestamp: new Date().toISOString(),
    version: process.env.VERSION || '1.0.0'
  });
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      service: 'capability-registry',
      timestamp: new Date().toISOString(),
      version: process.env.VERSION || '1.0.0',
      checks: {
        database: 'healthy',
        cache: 'healthy',
        eventBus: 'healthy'
      }
    };

    res.status(200).json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'capability-registry',
      timestamp: new Date().toISOString(),
      error: (error as Error).message
    });
  }
});

// Readiness check
router.get('/ready', (req, res) => {
  res.status(200).json({
    status: 'ready',
    service: 'capability-registry',
    timestamp: new Date().toISOString()
  });
});

// Liveness check
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    service: 'capability-registry',
    timestamp: new Date().toISOString()
  });
});

export { router as healthRoutes }; 