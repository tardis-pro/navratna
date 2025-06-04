// Capability Registry Service - Main Entry Point
// Enhanced tools system with hybrid PostgreSQL + Neo4j architecture
// Part of UAIP backend monorepo

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config/config.js';
import { ToolDatabase, ToolGraphDatabase } from '@uaip/shared-services';
import { ToolRegistry } from './services/toolRegistry.js';
import { ToolExecutor } from './services/toolExecutor.js';
import { BaseToolExecutor } from './services/baseToolExecutor.js';
import { ToolController } from './controllers/toolController.js';
import { createToolRoutes } from './routes/toolRoutes.js';
import { logger } from '@uaip/utils';
import { errorHandler } from '@uaip/middleware';

class CapabilityRegistryService {
  private app: express.Application;
  private postgresql: ToolDatabase;
  private neo4j: ToolGraphDatabase;
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private baseExecutor: BaseToolExecutor;
  private toolController: ToolController;

  constructor() {
    this.app = express();
    this.setupMiddleware();
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
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    this.app.use(morgan('combined', {
      stream: {
        write: (message: string) => logger.info(message.trim())
      }
    }));

    // Request ID middleware
    this.app.use((req, res, next) => {
      const requestId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      (req as any).id = requestId;
      res.setHeader('X-Request-ID', requestId);
      next();
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Capability Registry Service...');

      // Initialize databases
      await this.initializeDatabases();

      // Initialize services
      await this.initializeServices();

      // Setup routes
      this.setupRoutes();

      // Setup error handling
      this.setupErrorHandling();

      logger.info('Capability Registry Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Capability Registry Service:', error);
      throw error;
    }
  }

  private async initializeDatabases(): Promise<void> {
    logger.info('Initializing databases...');

    // Initialize PostgreSQL
    this.postgresql = new ToolDatabase(config.postgresql);
    logger.info('PostgreSQL database initialized');

    // Initialize Neo4j
    this.neo4j = new ToolGraphDatabase(config.neo4j);
    await this.neo4j.verifyConnectivity();
    logger.info('Neo4j database initialized');
  }

  private async initializeServices(): Promise<void> {
    logger.info('Initializing services...');

    // Initialize base tool executor
    this.baseExecutor = new BaseToolExecutor();

    // Initialize tool registry
    this.toolRegistry = new ToolRegistry(this.postgresql, this.neo4j);

    // Initialize tool executor
    this.toolExecutor = new ToolExecutor(
      this.postgresql,
      this.neo4j,
      this.toolRegistry,
      this.baseExecutor
    );

    // Initialize controller
    this.toolController = new ToolController(this.toolRegistry, this.toolExecutor);

    logger.info('Services initialized successfully');
  }

  private setupRoutes(): void {
    logger.info('Setting up routes...');

    // Health check endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Capability Registry',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        features: [
          'Tool Registration & Management',
          'Tool Execution with Tracking',
          'Graph-based Relationships',
          'Smart Recommendations',
          'Usage Analytics',
          'Approval Workflows'
        ]
      });
    });

    // API routes
    const toolRoutes = createToolRoutes(this.toolController);
    this.app.use('/api/v1', toolRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        availableEndpoints: [
          'GET /api/v1/tools',
          'POST /api/v1/tools',
          'GET /api/v1/tools/:id',
          'POST /api/v1/tools/:id/execute',
          'GET /api/v1/tools/recommendations',
          'GET /api/v1/health'
        ]
      });
    });

    logger.info('Routes configured successfully');
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use(errorHandler);

    // Unhandled promise rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't exit the process, just log the error
    });

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      // Graceful shutdown
      this.shutdown();
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      this.shutdown();
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      this.shutdown();
    });
  }

  async start(): Promise<void> {
    try {
      await this.initialize();

      const server = this.app.listen(config.port, () => {
        logger.info(`🚀 Capability Registry Service running on port ${config.port}`);
        logger.info(`📊 PostgreSQL: ${config.postgresql.host}:${config.postgresql.port}`);
        logger.info(`🔗 Neo4j: ${config.neo4j.uri}`);
        logger.info(`🛡️  Security Level: ${config.tools.enableApprovalWorkflow ? 'High (Approval Required)' : 'Standard'}`);
        logger.info(`⚡ Max Concurrent Executions: ${config.tools.maxConcurrentExecutions}`);
        logger.info(`💰 Default Cost Limit: $${config.tools.defaultCostLimit}`);
      });

      // Handle server errors
      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${config.port} is already in use`);
        } else {
          logger.error('Server error:', error);
        }
        process.exit(1);
      });

    } catch (error) {
      logger.error('Failed to start Capability Registry Service:', error);
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    logger.info('Shutting down Capability Registry Service...');

    try {
      // Close database connections
      if (this.postgresql) {
        await this.postgresql.close();
        logger.info('PostgreSQL connection closed');
      }

      if (this.neo4j) {
        await this.neo4j.close();
        logger.info('Neo4j connection closed');
      }

      logger.info('Capability Registry Service shut down successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the service
const service = new CapabilityRegistryService();
service.start().catch((error) => {
  logger.error('Failed to start service:', error);
  process.exit(1);
});

export default CapabilityRegistryService; 