import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { logger } from '@uaip/utils';
import { errorHandler, rateLimiter, metricsMiddleware, metricsEndpoint } from '@uaip/middleware';
import { DatabaseService } from './databaseService.js';
import { EventBusService } from './eventBusService.js';

// Extend Request interface to include id property
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export interface ServiceConfig {
  name: string;
  port: number;
  version?: string;
  enableWebSocket?: boolean;
  enableNeo4j?: boolean;
  enableEnterpriseEventBus?: boolean;
  rabbitMQUrl?: string;
  rateLimitConfig?: {
    windowMs?: number;
    max?: number;
    message?: string;
  };
  customMiddleware?: express.RequestHandler[];
}

export abstract class BaseService {
  protected app: Express;
  protected server: any;
  protected databaseService: DatabaseService;
  protected eventBusService: EventBusService;
  protected enterpriseEventBusService?: EventBusService;
  protected config: ServiceConfig;
  private shutdownHandlers: (() => Promise<void>)[] = [];
  private isShuttingDown: boolean = false;

  constructor(config: ServiceConfig) {
    this.config = config;
    this.app = express();
    this.databaseService = new DatabaseService();
    this.eventBusService = new EventBusService({
      url: config.rabbitMQUrl || process.env.RABBITMQ_URL || 'amqp://localhost',
      serviceName: config.name
    }, logger);

    // Initialize enterprise event bus if enabled
    if (config.enableEnterpriseEventBus) {
      this.enterpriseEventBusService = new EventBusService({
        url: config.rabbitMQUrl || process.env.RABBITMQ_URL || 'amqp://localhost',
        serviceName: config.name,
        exchangePrefix: 'uaip.enterprise',
        complianceMode: true
      }, logger);
    }
  }

  protected setupBaseMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    }));

    // Compression
    this.app.use(compression());

    // Body parsing with size limits
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging with morgan
    this.app.use(morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) }
    }));

    // Rate limiting
    this.app.use(rateLimiter);

    // Prometheus metrics
    this.app.use(metricsMiddleware);

    // Custom middleware
    if (this.config.customMiddleware) {
      this.config.customMiddleware.forEach(middleware => {
        this.app.use(middleware);
      });
    }

    // Request ID middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      req.id = req.headers['x-request-id'] as string || `${Date.now()}-${Math.random()}`;
      res.setHeader('X-Request-ID', req.id);
      next();
    });
  }

  protected setupBaseRoutes(): void {
    // Health check
    this.app.get('/health', async (req: Request, res: Response) => {
      try {
        const dbHealthy = await this.checkDatabaseHealth();
        const eventBusHealthy = await this.checkEventBusHealth();
        const serviceHealthy = await this.checkServiceHealth();

        const isHealthy = dbHealthy && eventBusHealthy && serviceHealthy;

        res.status(isHealthy ? 200 : 503).json({
          status: isHealthy ? 'healthy' : 'unhealthy',
          service: this.config.name,
          version: this.config.version || '1.0.0',
          timestamp: new Date().toISOString(),
          checks: {
            database: dbHealthy ? 'connected' : 'disconnected',
            eventBus: eventBusHealthy ? 'connected' : 'disconnected',
            service: serviceHealthy ? 'healthy' : 'unhealthy'
          }
        });
      } catch (error) {
        logger.error(`Health check failed for ${this.config.name}:`, error);
        res.status(503).json({
          status: 'error',
          service: this.config.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Service info
    this.app.get('/info', (req: Request, res: Response) => {
      res.json({
        service: this.config.name,
        version: this.config.version || '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
        node: process.version
      });
    });

    // Metrics endpoint for Prometheus
    this.app.get('/metrics', metricsEndpoint);
  }

  protected setup404Handler(): void {
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`,
        service: this.config.name
      });
    });
  }

  protected setupErrorHandler(): void {
    this.app.use(errorHandler);
  }

  protected async initializeDatabase(): Promise<void> {
    try {
      await this.databaseService.initialize();
      logger.info(`${this.config.name}: Database initialized`);
    } catch (error) {
      logger.error(`${this.config.name}: Database initialization failed:`, error);
      throw error;
    }
  }

  protected async initializeEventBus(): Promise<void> {
    try {
      await this.eventBusService.connect();
      logger.info(`${this.config.name}: Event bus connected successfully`);

      if (this.enterpriseEventBusService) {
        await this.enterpriseEventBusService.connect();
        logger.info(`${this.config.name}: Enterprise event bus connected successfully`);
      }

      // Setup event subscriptions
      await this.setupEventSubscriptions();
      logger.info(`${this.config.name}: Event subscriptions configured`);
    } catch (error) {
      logger.warn(`${this.config.name}: Event bus connection failed, continuing without event publishing:`, error);
      // Service can still function without event bus for basic operations
    }
  }

  protected async checkDatabaseHealth(): Promise<boolean> {
    try {
      const healthCheck = await this.databaseService.healthCheck();
      return healthCheck.status === 'healthy';
    } catch {
      return false;
    }
  }

  protected async checkEventBusHealth(): Promise<boolean> {
    try {
      // Check if eventBusService has isConnected property
      return this.eventBusService.isConnected || false;
    } catch {
      return false;
    }
  }

  protected setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logger.debug(`Shutdown already in progress for ${signal}, skipping`);
        return;
      }

      this.isShuttingDown = true;
      logger.info(`${this.config.name}: Received ${signal}, starting graceful shutdown...`);

      // Stop accepting new connections
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server.close(() => {
            logger.info(`${this.config.name}: HTTP server closed`);
            resolve();
          });
        });
      }

      // Run custom shutdown handlers
      for (const handler of this.shutdownHandlers) {
        try {
          await handler();
        } catch (error) {
          logger.error(`${this.config.name}: Shutdown handler error:`, error);
        }
      }

      // Let child classes cleanup their resources
      await this.cleanup();

      // Disconnect from databases
      try {
        await this.databaseService.close();
        logger.info(`${this.config.name}: Database disconnected`);
      } catch (error) {
        logger.error(`${this.config.name}: Database disconnect error:`, error);
      }

      // Disconnect from event bus
      try {
        await this.eventBusService.close();
        logger.info(`${this.config.name}: Event bus disconnected`);
      } catch (error) {
        logger.error(`${this.config.name}: Event bus disconnect error:`, error);
      }

      if (this.enterpriseEventBusService) {
        try {
          await this.enterpriseEventBusService.close();
          logger.info(`${this.config.name}: Enterprise event bus disconnected`);
        } catch (error) {
          logger.error(`${this.config.name}: Enterprise event bus disconnect error:`, error);
        }
      }

      // Force exit after timeout
      setTimeout(() => {
        logger.error(`${this.config.name}: Graceful shutdown timeout, forcing exit`);
        process.exit(1);
      }, 10000);

      logger.info('Graceful shutdown completed');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.error(`${this.config.name}: Uncaught exception:`, error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error(`${this.config.name}: Unhandled rejection at:`, promise, 'reason:', reason);
    });
  }

  protected addShutdownHandler(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  public async start(): Promise<void> {
    try {
      // Initialize base components
      await this.initializeDatabase();
      await this.initializeEventBus();

      // Setup middleware and routes
      this.setupBaseMiddleware();
      this.setupBaseRoutes();

      // Service-specific initialization
      await this.initialize();

      // Service-specific routes
      await this.setupRoutes();

      // Error handling
      this.setup404Handler();
      this.setupErrorHandler();

      // Start server
      this.server = this.app.listen(this.config.port, () => {
        logger.info(`${this.config.name} started on port ${this.config.port}`);
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      // Log startup info
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Version: ${this.config.version || process.env.VERSION || '1.0.0'}`);
    } catch (error) {
      logger.error(`${this.config.name}: Failed to start:`, error);
      process.exit(1);
    }
  }

  /**
   * Stop the service gracefully
   */
  public async stop(): Promise<void> {
    await this.setupGracefulShutdown();
  }

  // Abstract methods for service-specific implementation
  protected abstract initialize(): Promise<void>;
  protected abstract setupRoutes(): Promise<void>;
  protected abstract checkServiceHealth(): Promise<boolean>;

  /**
   * Override this method to setup event subscriptions
   */
  protected async setupEventSubscriptions(): Promise<void> {
    // Default: no event subscriptions
  }

  /**
   * Override this method to cleanup service-specific resources
   */
  protected async cleanup(): Promise<void> {
    // Default: no cleanup needed
  }
}

// Utility function for creating service instances
export function createService<T extends BaseService>(
  ServiceClass: new (config: ServiceConfig) => T,
  config: ServiceConfig
): T {
  return new ServiceClass(config);
}