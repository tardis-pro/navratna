import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

import { logger } from '@uaip/utils';
import { errorHandler, rateLimiter, metricsMiddleware, authMiddleware, metricsEndpoint } from '@uaip/middleware';
import { 
  DatabaseService, 
  EventBusService, 
  StateManagerService, 
  ResourceManagerService, 
  StepExecutorService, 
  CompensationService,
  TypeOrmService
} from '@uaip/shared-services';
import { OrchestrationEngine } from './orchestrationEngine.js';
// import { orchestrationRoutes } from './routes/orchestrationRoutes.js';
// import { healthRoutes } from './routes/healthRoutes.js';

class OrchestrationPipelineService {
  private app: express.Application;
  private databaseService!: DatabaseService;
  private eventBusService!: EventBusService;
  private stateManagerService!: StateManagerService;
  private resourceManagerService!: ResourceManagerService;
  private stepExecutorService!: StepExecutorService;
  private compensationService!: CompensationService;
  private typeormService!: TypeOrmService;
  private orchestrationEngine!: OrchestrationEngine; // Using definite assignment assertion

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private async initializeServices(): Promise<void> {
    // Initialize core services first
    this.databaseService = new DatabaseService();
    await this.databaseService.initialize();
    logger.info('DatabaseService initialized successfully');
    
    this.typeormService = TypeOrmService.getInstance();
    await this.typeormService.initialize();
    
    this.eventBusService = new EventBusService({
      url: process.env.RABBITMQ_URL || 'amqp://localhost',
      serviceName: 'orchestration-pipeline'
    }, logger as any);
    
    // Initialize services that depend on core services
    this.stateManagerService = new StateManagerService(this.databaseService);
    this.resourceManagerService = new ResourceManagerService();
    this.stepExecutorService = new StepExecutorService();
    this.compensationService = new CompensationService(this.databaseService, this.eventBusService);
    
    // Initialize orchestration engine with all dependencies
    this.orchestrationEngine = new OrchestrationEngine(
      this.databaseService,
      this.eventBusService,
      this.stateManagerService,
      this.resourceManagerService,
      this.stepExecutorService,
      this.compensationService,
      this.typeormService
    );
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    // CORS is handled by nginx API gateway - disable service-level CORS
    // this.app.use(cors({
    //   origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    //   credentials: true
    // }));

    // Performance middleware
    this.app.use(compression());
    this.app.use(rateLimiter);

    // Logging middleware - simple console logging instead of morgan
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });

    // Request parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Metrics middleware
    this.app.use(metricsMiddleware);
  }

  private setupRoutes(): void {
    // Metrics endpoint for Prometheus
    this.app.get('/metrics', metricsEndpoint);
    
    // Health check routes (no auth required)
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        data: {
          status: 'healthy',
          service: 'orchestration-pipeline',
          timestamp: new Date(),
          version: process.env.VERSION || '1.0.0'
        }
      });
    });
    
    // Apply auth middleware to all API routes
    this.app.use('/api/v1', authMiddleware);

    // API routes
    // this.app.use('/api/v1/orchestration', orchestrationRoutes);

    // Basic orchestration endpoints
    this.app.post('/api/v1/operations', async (req, res) => {
      try {
        const operation = req.body;
        const workflowInstanceId = await this.orchestrationEngine.executeOperation(operation);
        res.json({
          success: true,
          data: { workflowInstanceId }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            code: 'EXECUTION_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    });

    this.app.get('/api/v1/operations/:operationId/status', async (req, res) => {
      try {
        const { operationId } = req.params;
        const status = await this.orchestrationEngine.getOperationStatus(operationId);
        res.json({
          success: true,
          data: status
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            code: 'STATUS_FETCH_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    });

    this.app.post('/api/v1/operations/:operationId/pause', async (req, res) => {
      try {
        const { operationId } = req.params;
        const { reason } = req.body;
        await this.orchestrationEngine.pauseOperation(operationId, reason);
        res.json({
          success: true,
          data: { message: 'Operation paused successfully' }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            code: 'PAUSE_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    });

    this.app.post('/api/v1/operations/:operationId/resume', async (req, res) => {
      try {
        const { operationId } = req.params;
        const { checkpointId } = req.body;
        await this.orchestrationEngine.resumeOperation(operationId, checkpointId);
        res.json({
          success: true,
          data: { message: 'Operation resumed successfully' }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            code: 'RESUME_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    });

    this.app.post('/api/v1/operations/:operationId/cancel', async (req, res) => {
      try {
        const { operationId } = req.params;
        const { reason, compensate = true, force = false } = req.body;
        await this.orchestrationEngine.cancelOperation(operationId, reason, compensate, force);
        res.json({
          success: true,
          data: { message: 'Operation cancelled successfully' }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            code: 'CANCEL_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found'
        },
        meta: {
          timestamp: new Date(),
          version: process.env.VERSION || '1.0.0'
        }
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
    
    // Global error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred'
        }
      });
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize services first
      await this.initializeServices();
      logger.info('Services initialized successfully');

      // Test TypeORM connection instead of deprecated query method
      const healthCheck = await this.typeormService.healthCheck();
      if (healthCheck.status === 'healthy') {
        logger.info('TypeORM connection verified');
      } else {
        logger.warn('TypeORM connection unhealthy, but continuing startup');
      }

      // Test database service health check instead of direct query
      try {
        const dbHealthCheck = await this.databaseService.healthCheck();
        if (dbHealthCheck.status === 'healthy') {
          logger.info('Database service connection verified');
        } else {
          logger.warn('Database service connection issues, but continuing startup');
        }
      } catch (error) {
        logger.warn('Database service health check failed, but continuing startup:', error instanceof Error ? error.message : 'Unknown error');
      }

      // Event bus will connect automatically when needed
      logger.info('Event bus ready');

      // Start HTTP server
      const port = parseInt(process.env.PORT || '3002', 10);
      this.app.listen(port, () => {
        logger.info(`Orchestration Pipeline Service started on port ${port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`Version: ${process.env.VERSION || '1.0.0'}`);
      });

    } catch (error) {
      logger.error('Failed to start Orchestration Pipeline Service:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      // Note: gracefulShutdown is private in OrchestrationEngine, so we'll handle shutdown differently
      // The OrchestrationEngine has its own signal handlers for graceful shutdown
      
      // Close TypeORM connection
      if (this.typeormService) {
        await this.typeormService.close();
      }
      
      // Close connections if methods exist
      if (this.eventBusService && typeof this.eventBusService.close === 'function') {
        await this.eventBusService.close();
      }
      if (this.databaseService && typeof this.databaseService.close === 'function') {
        await this.databaseService.close();
      }
      logger.info('Orchestration Pipeline Service stopped gracefully');
    } catch (error) {
      logger.error('Error during service shutdown:', error);
    }
  }
}

// Initialize and start the service
const service = new OrchestrationPipelineService();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await service.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await service.stop();
  process.exit(0);
});

// Start the service
service.start().catch((error) => {
  logger.error('Failed to start service:', error);
  process.exit(1);
}); 