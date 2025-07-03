import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { logger } from '@uaip/utils';
import { errorHandler, rateLimiter, metricsMiddleware } from '@uaip/middleware';
import { DatabaseService, EventBusService } from '@uaip/shared-services';
import { config } from './config/index.js';
// import { capabilityRoutes } from './routes/capabilityRoutes.js'; // Removed - using tool routes instead
import { toolRoutes } from './routes/toolRoutes.js';
import { healthRoutes } from './routes/healthRoutes.js';
import { mcpRoutes } from './routes/mcpRoutes.js';

export class CapabilityRegistryApp {
  private app: express.Application;
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private server?: any;

  constructor() {
    this.app = express();
    this.databaseService = new DatabaseService();
    this.eventBusService = new EventBusService({
      url: process.env.RABBITMQ_URL || 'amqp://localhost',
      serviceName: 'capability-registry'
    }, logger as any);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
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

    // Logging middleware
    this.app.use(morgan('combined', {
      stream: { write: (message: string) => logger.info(message.trim()) }
    }));

    // Request parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Metrics middleware
    this.app.use(metricsMiddleware);
  }

  private setupRoutes(): void {
    // Add debugging middleware
    this.app.use((req, res, next) => {
      logger.info(`Incoming request: ${req.method} ${req.url} - Path: ${req.path}`);
      next();
    });

    // Health check routes
    this.app.use('/health', healthRoutes);
    
    // API routes - capability routes removed, using tool routes instead
    // this.app.use('/api/v1/capabilities', capabilityRoutes);
    
    // Mount tool routes with explicit debugging
    this.app.use('/api/v1/tools', (req, res, next) => {
      logger.info(`Before tool routes: ${req.method} ${req.originalUrl} - Path: ${req.path}, BaseUrl: ${req.baseUrl}`);
      next();
    });
    
    this.app.use('/api/v1/tools', toolRoutes);

    // MCP configuration routes
    this.app.use('/api/v1/mcp', mcpRoutes);

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
          service: config.service.name,
          version: process.env.VERSION || '1.0.0'
        }
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async initialize(): Promise<void> {
    try {
      // Initialize database service first
      await this.databaseService.initialize();
      logger.info('DatabaseService initialized successfully');

      // Test database connection using health check
      const healthCheck = await this.databaseService.healthCheck();
      if (healthCheck.status === 'healthy') {
        logger.info('Database connection verified');
      } else {
        throw new Error('Database health check failed');
      }

      // Event bus will connect automatically when needed
      logger.info('Event bus ready');

      logger.info('Capability Registry service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize Capability Registry service:', error);
      throw error;
    }
  }

  public listen(): any {
    const port = config.service.port;
    this.server = this.app.listen(port, () => {
      logger.info(`Capability Registry service started on port ${port}`);
      logger.info(`Environment: ${config.service.env}`);
      logger.info(`Version: ${process.env.VERSION || '1.0.0'}`);
    });
    
    return this.server;
  }

  public async shutdown(): Promise<void> {
    try {
      // Close connections if methods exist
      if (this.eventBusService && typeof this.eventBusService.close === 'function') {
        await this.eventBusService.close();
      }
      if (this.databaseService && typeof this.databaseService.close === 'function') {
        await this.databaseService.close();
      }
      logger.info('Capability Registry service stopped gracefully');
    } catch (error) {
      logger.error('Error during service shutdown:', error);
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}