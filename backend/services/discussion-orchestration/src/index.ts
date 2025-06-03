import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { logger } from '@uaip/utils';
import { DatabaseService, EventBusService } from '@uaip/shared-services';
import { authMiddleware, errorHandler, defaultRequestLogger } from '@uaip/middleware';

import { config } from '@/config';
import { DiscussionOrchestrationService } from '@/services/discussionOrchestrationService';
import { setupWebSocketHandlers } from '@/websocket/discussionSocket';

class DiscussionOrchestrationServer {
  private app: express.Application;
  private server: any;
  private io!: SocketIOServer;
  private orchestrationService: DiscussionOrchestrationService;
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    
    // Initialize services
    this.databaseService = new DatabaseService();
    this.eventBusService = new EventBusService(
      {
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
        serviceName: 'discussion-orchestration',
        maxReconnectAttempts: 10,
        reconnectDelay: 5000
      },
      logger
    );
    this.orchestrationService = new DiscussionOrchestrationService(
      this.databaseService as any, // DiscussionService would be injected here
      this.eventBusService
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

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

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
    this.app.use('*', (req, res) => {
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

    // Set up WebSocket handlers
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
      this.shutdown();
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, starting graceful shutdown');
      this.shutdown();
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize database tables
      await this.databaseService.initializeTables();
      logger.info('Database tables initialized');

      // Connect to event bus
      await this.eventBusService.connect();
      logger.info('Connected to event bus');

      // Start the server
      const port = config.discussionOrchestration.port;
      
      await new Promise<void>((resolve, reject) => {
        this.server.listen(port, (error?: Error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      logger.info(`Discussion Orchestration Service started successfully`, {
        port,
        environment: process.env.NODE_ENV || 'development',
        websocketEnabled: config.discussionOrchestration.websocket.enabled,
        pid: process.pid
      });

    } catch (error) {
      logger.error('Failed to start Discussion Orchestration Service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Starting graceful shutdown of Discussion Orchestration Service');

    try {
      // Close WebSocket server
      if (this.io) {
        this.io.close();
        logger.info('WebSocket server closed');
      }

      // Close HTTP server
      await new Promise<void>((resolve) => {
        this.server.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });

      // Close event bus connection
      await this.eventBusService.close();
      logger.info('Event bus connection closed');

      // Close database connection
      await this.databaseService.close();
      logger.info('Database connection closed');

      logger.info('Discussion Orchestration Service shutdown completed');

    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
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

// Handle startup
if (require.main === module) {
  server.start().catch((error) => {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  });
}

export { server as discussionOrchestrationServer };
export default server; 