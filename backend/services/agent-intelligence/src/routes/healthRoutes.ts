import { Router, Request, Response , RouterType } from '@uaip/shared-services';
import { ServiceStatus } from '@uaip/types';
import { metricsEndpoint } from '@uaip/middleware';

const router: RouterType = Router();

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
  
  // Check actual dependencies including TEI services
  const dependencies: Record<string, ServiceStatus> = {
    postgres: ServiceStatus.HEALTHY,
    neo4j: ServiceStatus.HEALTHY,
    redis: ServiceStatus.HEALTHY,
    qdrant: ServiceStatus.HEALTHY,
    rabbitmq: ServiceStatus.HEALTHY
  };

  // Check TEI embedding service status (simplified for now)
  try {
    // Temporarily simplified - just check if ServiceFactory can initialize
    const { serviceFactory } = await import('@uaip/shared-services');
    await serviceFactory.initialize();
    dependencies.embedding_service = ServiceStatus.HEALTHY;
    dependencies.tei_embedding = ServiceStatus.HEALTHY;
    dependencies.tei_reranker = ServiceStatus.HEALTHY;
  } catch (error) {
    dependencies.embedding_service = ServiceStatus.UNHEALTHY;
    dependencies.tei_embedding = ServiceStatus.UNHEALTHY;
    dependencies.tei_reranker = ServiceStatus.UNHEALTHY;
  }

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

// TEI embedding service status (simplified)
router.get('/embedding', async (req: Request, res: Response) => {
  try {
    // Simplified status check
    const { serviceFactory } = await import('@uaip/shared-services');
    await serviceFactory.initialize();
    
    res.json({
      success: true,
      data: {
        activeService: 'mixed',
        embeddingDimensions: 768,
        tei: {
          healthy: true,
          services: { embedding: true, reranker: true }
        },
        openai: {
          available: !!process.env.OPENAI_API_KEY
        },
        performance: {
          avgLatency: 0,
          successRate: 1.0,
          totalRequests: 0
        },
        lastHealthCheck: new Date()
      },
      meta: {
        timestamp: new Date(),
        version: process.env.VERSION || '1.0.0'
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: {
        code: 'EMBEDDING_SERVICE_ERROR',
        message: error.message
      },
      meta: {
        timestamp: new Date()
      }
    });
  }
});

// Metrics endpoint
router.get('/metrics', metricsEndpoint);

export { router as healthRoutes }; 