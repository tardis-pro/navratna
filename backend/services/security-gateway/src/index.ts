import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';
import { errorHandler } from '@uaip/middleware';
import { rateLimiter } from '@uaip/middleware';
import { DatabaseService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/shared-services';

// Import routes
import authRoutes from './routes/authRoutes.js';
import securityRoutes from './routes/securityRoutes.js';
import approvalRoutes from './routes/approvalRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import userRoutes from './routes/userRoutes.js';

// Import services
import { SecurityGatewayService } from './services/securityGatewayService.js';
import { ApprovalWorkflowService } from './services/approvalWorkflowService.js';
import { AuditService } from './services/auditService.js';
import { NotificationService } from './services/notificationService.js';

class SecurityGatewayServer {
  private app: express.Application;
  private port: number;
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private securityGatewayService: SecurityGatewayService;
  private approvalWorkflowService: ApprovalWorkflowService;
  private auditService: AuditService;
  private notificationService: NotificationService;
  private isShuttingDown: boolean = false;

  constructor() {
    this.app = express();
    this.port = config.services.securityGateway.port || 3004;
    
    // Initialize services
    this.databaseService = new DatabaseService();
    this.eventBusService = new EventBusService(
      {
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
        serviceName: 'security-gateway'
      },
      logger
    );
    this.auditService = new AuditService(this.databaseService);
    this.notificationService = new NotificationService();
    this.approvalWorkflowService = new ApprovalWorkflowService(
      this.databaseService,
      this.eventBusService,
      this.notificationService,
      this.auditService
    );
    this.securityGatewayService = new SecurityGatewayService(
      this.databaseService,
      this.approvalWorkflowService,
      this.auditService
    );

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.cors.allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    this.app.use(rateLimiter);

    // Request logging
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      // @ts-ignore
      req.startTime = startTime;
      
      logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info('Request completed', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          ip: req.ip
        });
      });

      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'security-gateway',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API routes
    this.app.use('/api/v1/auth', authRoutes);
    this.app.use('/api/v1/security', securityRoutes);
    this.app.use('/api/v1/approvals', approvalRoutes);
    this.app.use('/api/v1/audit', auditRoutes);
    this.app.use('/api/v1/users', userRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Initialize database connection - DatabaseService doesn't have connect method
      // await this.databaseService.connect();
      logger.info('Database service initialized successfully');

      // Initialize event bus
      await this.eventBusService.connect();
      logger.info('Event bus connected successfully');

      // Start the server
      this.app.listen(this.port, () => {
        logger.info(`Security Gateway service started on port ${this.port}`, {
          port: this.port,
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString()
        });
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start Security Gateway service', { error });
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logger.debug(`Shutdown already in progress for ${signal}, skipping`);
        return;
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}, starting graceful shutdown`);

      // Close database connections
      try {
        await this.databaseService.close();
        logger.info('Database disconnected');
      } catch (error) {
        logger.error('Error closing database connection', { error });
      }

      // Close event bus connections
      try {
        await this.eventBusService.close();
        logger.info('Event bus disconnected');
      } catch (error) {
        logger.error('Error closing event bus connection', { error });
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

// Start the server
const server = new SecurityGatewayServer();
server.start().catch((error) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});

export default SecurityGatewayServer; 