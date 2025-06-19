import { Router, Request, Response } from 'express';
import { ServiceStatus } from '@uaip/types';
import { metricsEndpoint } from '@uaip/middleware';

const router: Router = Router();

// Basic health check
router.get('/', async (req: Request, res: Response) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  const healthCheck = {
    status: ServiceStatus.HEALTHY,
    timestamp: new Date(),
    uptime: Math.floor(uptime),
    version: process.env.VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024)
    }
  };

  res.json({
    success: true,
    data: healthCheck,
    meta: {
      timestamp: new Date(),
      version: process.env.VERSION || '1.0.0'
    }
  });
});

// Detailed health check with dependencies
router.get('/detailed', async (req: Request, res: Response) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  // TODO: Add actual dependency checks
  const dependencies = {
    postgres: ServiceStatus.HEALTHY,
    neo4j: ServiceStatus.HEALTHY,
    redis: ServiceStatus.HEALTHY,
    qdrant: ServiceStatus.HEALTHY,
    rabbitmq: ServiceStatus.HEALTHY
  };

  const overallStatus = Object.values(dependencies).every(status => status === ServiceStatus.HEALTHY)
    ? ServiceStatus.HEALTHY
    : ServiceStatus.DEGRADED;

  const healthCheck = {
    status: overallStatus,
    timestamp: new Date(),
    uptime: Math.floor(uptime),
    version: process.env.VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    dependencies,
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
      rss: Math.round(memoryUsage.rss / 1024 / 1024)
    },
    cpu: {
      usage: process.cpuUsage()
    }
  };

  const statusCode = overallStatus === ServiceStatus.HEALTHY ? 200 : 503;
  
  res.status(statusCode).json({
    success: overallStatus === ServiceStatus.HEALTHY,
    data: healthCheck,
    meta: {
      timestamp: new Date(),
      version: process.env.VERSION || '1.0.0'
    }
  });
});

// Readiness probe
router.get('/ready', async (req: Request, res: Response) => {
  // TODO: Add actual readiness checks (database connections, etc.)
  const isReady = true;
  
  if (isReady) {
    res.json({
      success: true,
      data: { status: 'ready' },
      meta: { timestamp: new Date() }
    });
  } else {
    res.status(503).json({
      success: false,
      error: { code: 'NOT_READY', message: 'Service not ready' },
      meta: { timestamp: new Date() }
    });
      return;
  }
});

// Liveness probe
router.get('/live', async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: { status: 'alive' },
    meta: { timestamp: new Date() }
  });
});

// Metrics endpoint
router.get('/metrics', metricsEndpoint);

export { router as healthRoutes }; 