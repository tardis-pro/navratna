import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import WebSocket from 'ws';

import { logger } from '@uaip/utils';
import { DatabaseService, EventBusService, DiscussionService, PersonaService } from '@uaip/shared-services';
import { authMiddleware, errorHandler, defaultRequestLogger } from '@uaip/middleware';
import { SERVICE_ACCESS_MATRIX, validateServiceAccess, getDatabaseConnectionString, AccessLevel } from '@uaip/shared-services';

import { config } from './config/index.js';
import { DiscussionOrchestrationService } from './services/discussionOrchestrationService.js';
import { EnterpriseWebSocketHandler } from './websocket/enterpriseWebSocketHandler.js';

class DiscussionOrchestrationServer {
  private app: express.Application;
  private server: any;
  private wss!: WebSocket.Server;
  private io: any; // WebSocket server instance
  private orchestrationService: DiscussionOrchestrationService;
  private databaseService: DatabaseService;

  private eventBusService: EventBusService;
  private discussionService: DiscussionService;
  private personaService: PersonaService;
  private webSocketHandler: EnterpriseWebSocketHandler;
  private isShuttingDown: boolean = false;
  private serviceName = 'discussion-orchestration';

  constructor() {
    this.app = express();
    this.server = createServer(this.app);

    // Validate enterprise database access
    if (!validateServiceAccess(this.serviceName, 'postgresql', 'postgres-application', AccessLevel.WRITE)) {
      throw new Error('Service lacks required database permissions');
    }

    // Initialize services with enterprise database connections
    this.databaseService = DatabaseService.getInstance();

    this.eventBusService = new EventBusService(
      {
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
        serviceName: this.serviceName,
        maxReconnectAttempts: 10,
        reconnectDelay: 5000,
        exchangePrefix: 'uaip.enterprise',
        complianceMode: true
      },
      logger
    );

    // Initialize persona service with enterprise configuration
    this.personaService = new PersonaService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      cacheConfig: {
        redis: getDatabaseConnectionString(this.serviceName, 'redis', 'redis-application'),
        ttl: 300, // 5 minutes
        securityLevel: 3
      }
    });

    // Initialize discussion service with enterprise configuration
    this.discussionService = new DiscussionService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      personaService: this.personaService,
      enableRealTimeEvents: true,
      enableAnalytics: false, // Analytics go through separate analytics-service
      auditMode: 'comprehensive'
    });

    // Initialize enterprise WebSocket handler first
    this.webSocketHandler = new EnterpriseWebSocketHandler(
      this.server,
      this.eventBusService,
      this.serviceName
    );

    this.orchestrationService = new DiscussionOrchestrationService(
      this.discussionService,
      this.eventBusService
    );

    // Set up WebSocket handler after creation since types don't match exactly
    // TODO: Create adapter or update interfaces to match

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.auditServiceStartup();
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
      crossOriginEmbedderPolicy: false
    }));

    // Zero Trust architecture - no CORS needed, all traffic through Security Gateway

    // Compression
    if (config.discussionOrchestration.performance.enableCompression) {
      this.app.use(compression());
    }

    // Rate limiting
    if (config.discussionOrchestration.security.enableRateLimiting) {
      const limiter = rateLimit({
        windowMs: config.discussionOrchestration.security.rateLimitWindow,
        max: config.discussionOrchestration.security.rateLimitMax,
        message: {
          error: 'Too many requests from this IP, please try again later.',
          retryAfter: Math.ceil(config.discussionOrchestration.security.rateLimitWindow / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false,
      });
      this.app.use('/api/', limiter);
    }

    // Body parsing
    this.app.use(express.json({
      limit: '10mb',
      verify: (req, res, buf) => {
        if (config.discussionOrchestration.security.enableInputSanitization) {
          // Basic input sanitization would go here
        }
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(defaultRequestLogger);

    // Authentication middleware for protected routes
    this.app.use('/api/', authMiddleware);
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const status = this.orchestrationService.getStatus();
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'discussion-orchestration',
        version: process.env.npm_package_version || '1.0.0',
        ...status
      });
    });

    // Service info endpoint
    this.app.get('/api/v1/info', (req, res) => {
      res.json({
        service: 'discussion-orchestration',
        version: process.env.npm_package_version || '1.0.0',
        description: 'UAIP Discussion Orchestration Service - Manages discussion lifecycle, turn strategies, and real-time coordination',
        features: [
          'Discussion lifecycle management',
          'Multiple turn strategies (Round Robin, Moderated, Context Aware)',
          'Real-time WebSocket communication',
          'Event-driven architecture',
          'Comprehensive turn management'
        ],
        endpoints: {
          websocket: '/socket.io',
          health: '/health',
          info: '/api/v1/info'
        },
        note: 'This service provides orchestration capabilities. Discussion CRUD operations are handled by the agent-intelligence service.'
      });
    });

    // No traditional API routes - all operations through event bus
    logger.info('Event-driven routes configured', {
      service: this.serviceName,
      apiEndpoints: ['/health', '/api/v1/info', '/api/v1/orchestration/*'],
      primaryCommunication: 'RabbitMQ Event Bus'
    });
  }

  private async publishOrchestrationEvent(eventType: string, discussionId: string, user: any): Promise<void> {
    const event = {
      type: eventType,
      discussionId,
      userId: user.id,
      timestamp: new Date().toISOString(),
      source: this.serviceName,
      securityLevel: user.securityLevel || 3
    };

    await this.eventBusService.publish('orchestration.control', event);

    // Audit log for compliance
    logger.info('AUDIT: Orchestration control event', {
      ...event,
      auditEvent: 'ORCHESTRATION_CONTROL',
      compliance: true
    });
  }

  private auditServiceStartup(): void {
    // Comprehensive startup audit for compliance
    const startupAudit = {
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      securityLevel: SERVICE_ACCESS_MATRIX[this.serviceName].securityLevel,
      complianceFlags: SERVICE_ACCESS_MATRIX[this.serviceName].complianceFlags,
      databases: SERVICE_ACCESS_MATRIX[this.serviceName].databases.map(db => ({
        type: db.type,
        tier: db.tier,
        instance: db.instance,
        encryption: db.encryption,
        auditLevel: db.auditLevel
      })),
      networkSegments: SERVICE_ACCESS_MATRIX[this.serviceName].networkSegments,
      eventBusEnabled: true,
      webSocketEnabled: true,
      apiSurface: 'minimal'
    };

    logger.info('AUDIT: Service startup', {
      ...startupAudit,
      auditEvent: 'SERVICE_STARTUP',
      compliance: true
    });

    // Register with service registry via event bus
    this.eventBusService.publish('service.registry.register', {
      service: this.serviceName,
      capabilities: ['discussion_orchestration', 'websocket_realtime', 'turn_management'],
      status: 'active',
      ...startupAudit
    }).catch(error => {
      logger.error('Failed to register with service registry', { error });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use(errorHandler);

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', {
        promise,
        reason: reason instanceof Error ? reason.message : reason
      });
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', {
        error: error.message,
        stack: error.stack
      });

      // Graceful shutdown on uncaught exception
      this.shutdown().then(() => {
        process.exit(1);
      });
    });

    // Graceful shutdown signals
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, starting graceful shutdown');
      this.shutdown().then(() => {
        process.exit(0);
      }).catch((error) => {
        logger.error('Error during SIGTERM shutdown', { error: error instanceof Error ? error.message : 'Unknown error' });
        process.exit(1);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, starting graceful shutdown');
      this.shutdown().then(() => {
        process.exit(0);
      }).catch((error) => {
        logger.error('Error during SIGINT shutdown', { error: error instanceof Error ? error.message : 'Unknown error' });
        process.exit(1);
      });
    });
  }

  public async start(): Promise<void> {
    try {
      logger.info('Starting Discussion Orchestration Service...');

      // Initialize database service first
      await this.databaseService.initialize();
      logger.info('DatabaseService initialized successfully');

      // Initialize TypeORM first

      logger.info('TypeORM service initialized successfully');

      // Initialize event bus
      await this.eventBusService.connect();
      logger.info('Event bus connected successfully');

      // Start the server
      const port = config.discussionOrchestration.port || 3005;
      this.server.listen(port, () => {
        logger.info(`Discussion Orchestration Service started on port ${port}`, {
          port,
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString(),
          websocketEnabled: config.discussionOrchestration.websocket.enabled
        });
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start Discussion Orchestration Service', { error });
      process.exit(1);
    }
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      logger.debug('Shutdown already in progress, skipping');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Shutting down Discussion Orchestration Service...');

    try {
      // Deregister from service registry
      await this.eventBusService.publish('service.registry.deregister', {
        service: this.serviceName,
        timestamp: new Date().toISOString()
      });

      // Shutdown Enterprise WebSocket handler
      if (this.webSocketHandler) {
        await this.webSocketHandler.shutdown();
        logger.info('Enterprise WebSocket handler shut down');
      }

      // Close HTTP server
      if (this.server) {
        await new Promise<void>((resolve, reject) => {
          this.server.close((err: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
        logger.info('HTTP server closed');
      }

      // Cleanup orchestration service
      if (this.orchestrationService) {
        await this.orchestrationService.cleanup();
        logger.info('Orchestration service cleaned up');
      }

      // Close event bus
      if (this.eventBusService) {
        await this.eventBusService.close();
        logger.info('Event bus disconnected');
      }



      logger.info('Discussion Orchestration Service shut down successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    // Graceful shutdown signals
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, starting graceful shutdown');
      this.shutdown().then(() => {
        process.exit(0);
      }).catch((error) => {
        logger.error('Error during SIGTERM shutdown', { error: error instanceof Error ? error.message : 'Unknown error' });
        process.exit(1);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, starting graceful shutdown');
      this.shutdown().then(() => {
        process.exit(0);
      }).catch((error) => {
        logger.error('Error during SIGINT shutdown', { error: error instanceof Error ? error.message : 'Unknown error' });
        process.exit(1);
      });
    });
  }

  public getStatus(): any {
    return {
      service: 'discussion-orchestration',
      status: 'running',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      websocket: {
        enabled: config.discussionOrchestration.websocket.enabled,
        connected: this.io ? true : false
      },
      database: {
        connected: true // We could add a health check here
      },
      eventBus: {
        connected: this.eventBusService ? true : false
      }
    };
  }
}

// Create and start the server
const server = new DiscussionOrchestrationServer();

// Handle startup - Start the server immediately
server.start().catch((error) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.message : 'Unknown error'
  });
  process.exit(1);
});

export { server as discussionOrchestrationServer };
export default server; 