import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { logger } from '@uaip/utils';
import { DatabaseService, EventBusService, TypeOrmService, DiscussionService, PersonaService } from '@uaip/shared-services';
import { authMiddleware, errorHandler, defaultRequestLogger } from '@uaip/middleware';

import { config } from './config/index.js';
import { DiscussionOrchestrationService } from './services/discussionOrchestrationService.js';
import { setupWebSocketHandlers } from './websocket/discussionSocket.js';
import { DiscussionWebSocketHandler } from './websocket/discussionWebSocketHandler.js';

class DiscussionOrchestrationServer {
  private app: express.Application;
  private server: any;
  private io!: SocketIOServer;
  private orchestrationService: DiscussionOrchestrationService;
  private databaseService: DatabaseService;
  private typeormService: TypeOrmService;
  private eventBusService: EventBusService;
  private discussionService: DiscussionService;
  private personaService: PersonaService;
  private webSocketHandler?: DiscussionWebSocketHandler;
  private isShuttingDown: boolean = false;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    
    // Initialize services
    this.databaseService = new DatabaseService();
    this.typeormService = TypeOrmService.getInstance();
    this.eventBusService = new EventBusService(
      {
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
        serviceName: 'discussion-orchestration',
        maxReconnectAttempts: 10,
        reconnectDelay: 5000
      },
      logger
    );
    
    // Initialize persona service
    this.personaService = new PersonaService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService
    });
    
    // Initialize discussion service
    this.discussionService = new DiscussionService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      personaService: this.personaService,
      enableRealTimeEvents: true,
      enableAnalytics: true
    });
    
    this.orchestrationService = new DiscussionOrchestrationService(
      this.discussionService,
      this.eventBusService,
      undefined // webSocketHandler will be set later
    );

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
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
      crossOriginEmbedderPolicy: false
    }));

    // CORS is handled by nginx API gateway - disable service-level CORS
    // this.app.use(cors({
    //   origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    //   credentials: true,
    //   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    //   allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    // }));

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

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        service: 'discussion-orchestration',
        note: 'This service provides orchestration capabilities. For discussion CRUD operations, use the agent-intelligence service.'
      });
    });
  }

  private setupWebSocket(): void {
    if (!config.discussionOrchestration.websocket.enabled) {
      logger.info('WebSocket disabled in configuration');
      return;
    }

    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: config.discussionOrchestration.websocket.cors.origin,
        credentials: config.discussionOrchestration.websocket.cors.credentials
      },
      pingTimeout: config.discussionOrchestration.websocket.pingTimeout,
      pingInterval: config.discussionOrchestration.websocket.pingInterval,
      maxHttpBufferSize: 1e6, // 1MB
      transports: ['websocket', 'polling']
    });

    // Create WebSocket handler and connect it to orchestration service
    this.webSocketHandler = new DiscussionWebSocketHandler(this.orchestrationService);
    this.orchestrationService.setWebSocketHandler(this.webSocketHandler);

    // Set up Socket.IO handlers
    setupWebSocketHandlers(this.io, this.orchestrationService);

    logger.info('WebSocket server configured', {
      cors: config.discussionOrchestration.websocket.cors,
      pingTimeout: config.discussionOrchestration.websocket.pingTimeout,
      pingInterval: config.discussionOrchestration.websocket.pingInterval
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
      await this.typeormService.initialize();
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
      // Close WebSocket connections
      if (this.io) {
        this.io.close();
        logger.info('WebSocket server closed');
      }

      // Cleanup WebSocket handler
      if (this.webSocketHandler) {
        this.webSocketHandler.cleanup();
        logger.info('WebSocket handler cleaned up');
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

      // Close TypeORM connection
      if (this.typeormService) {
        await this.typeormService.close();
        logger.info('TypeORM connection closed');
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