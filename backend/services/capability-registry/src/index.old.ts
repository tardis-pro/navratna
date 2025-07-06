// Capability Registry Service - Main Entry Point
// Enhanced tools system with hybrid PostgreSQL + Neo4j architecture
// Part of UAIP backend monorepo

import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from '@uaip/config';
import { ToolGraphDatabase, DatabaseService, EventBusService, IntegrationService } from '@uaip/shared-services';
import { ToolRegistry } from './services/toolRegistry.js';
import { ToolExecutor } from './services/toolExecutor.js';
import { BaseToolExecutor } from './services/baseToolExecutor.js';
import { MCPClientService } from './services/mcpClientService.js';
import { OAuthCapabilityDiscovery } from './services/oauthCapabilityDiscovery.js';
import { ToolController } from './controllers/toolController.js';
import { CapabilityController } from './controllers/capabilityController.js';
import { UnifiedToolRegistry } from './services/unified-tool-registry.js';
import { ProjectToolIntegrationService } from './services/project-tool-integration.service.js';
import { EnterpriseToolRegistry } from './services/enterprise-tool-registry.js';
import { ToolExecutionCoordinator } from './services/tool-execution-coordinator.service.js';
import { ToolCacheService } from './services/tool-cache.service.js';
import { ToolRecommendationService } from './services/tool-recommendation.service.js';
import { SandboxExecutionService } from './services/sandbox-execution.service.js';
import { ToolAdapterService } from './services/tool-adapter.service.js';
import { createToolRoutes } from './routes/toolRoutes.js';
import { healthRoutes } from './routes/healthRoutes.js';
import { logger } from '@uaip/utils';
import { errorHandler, metricsMiddleware, metricsEndpoint, rateLimiter } from '@uaip/middleware';

class CapabilityRegistryService {
  private app: express.Application;
  private postgresql: DatabaseService;
  private neo4j: ToolGraphDatabase;

  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private integrationService: IntegrationService;
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private baseExecutor: BaseToolExecutor;
  private mcpClientService: MCPClientService;
  private oauthCapabilityDiscovery: OAuthCapabilityDiscovery;
  private toolController: ToolController;
  private capabilityController: CapabilityController;
  private unifiedToolRegistry: UnifiedToolRegistry;
  private projectToolIntegration: ProjectToolIntegrationService;
  private enterpriseToolRegistry: EnterpriseToolRegistry;
  private toolExecutionCoordinator: ToolExecutionCoordinator;
  private toolCacheService: ToolCacheService;
  private toolRecommendationService: ToolRecommendationService;
  private sandboxExecutionService: SandboxExecutionService;
  private toolAdapterService: ToolAdapterService;

  constructor() {
    this.app = express();

    this.databaseService = new DatabaseService();
    this.eventBusService = new EventBusService({
      url: process.env.RABBITMQ_URL || 'amqp://localhost',
      serviceName: 'capability-registry'
    }, logger as any);
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

    // CORS is handled by nginx API gateway - disable service-level CORS
    // this.app.use(cors({
    //   origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    //   credentials: true,
    //   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    //   allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    // }));

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

    // Rate limiting
    this.app.use(rateLimiter);

    // Metrics middleware
    this.app.use(metricsMiddleware);

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

      // Initialize TypeORM first

      logger.info('TypeORM service initialized');

      // Initialize DatabaseService
      await this.databaseService.initialize();
      logger.info('DatabaseService initialized successfully');

      // Test database connection using health check
      const healthCheck = await this.databaseService.healthCheck();
      if (healthCheck.status === 'healthy') {
        logger.info('Database connection verified');
      } else {
        throw new Error('Database health check failed');
      }

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
    this.postgresql = new DatabaseService();
    await this.postgresql.initialize();
    logger.info('PostgreSQL database initialized');

    // Initialize Neo4j with fallback
    this.neo4j = new ToolGraphDatabase(config.database.neo4j);
    try {
      await this.neo4j.verifyConnectivity();
      logger.info('Neo4j database initialized');
    } catch (error) {
      logger.warn('Neo4j initialization failed, continuing with degraded functionality:', error.message);
      logger.warn('Graph-based features (recommendations, relationships) will be unavailable');
      // Don't throw - allow service to start without Neo4j
    }
  }

  private async initializeServices(): Promise<void> {
    logger.info('Initializing services...');

    // Initialize base tool executor
    this.baseExecutor = new BaseToolExecutor();

    // Initialize tool registry with EventBusService only
    this.toolRegistry = new ToolRegistry(this.eventBusService);

    // Initialize tool executor
    this.toolExecutor = new ToolExecutor(
      this.postgresql,
      this.toolRegistry,
      this.baseExecutor
    );

    // Initialize MCP Client Service
    this.mcpClientService = MCPClientService.getInstance();
    await this.mcpClientService.initialize(this.eventBusService, this.databaseService);
    logger.info('MCP Client Service initialized and auto-started servers');

    // Initialize OAuth Capability Discovery
    this.oauthCapabilityDiscovery = OAuthCapabilityDiscovery.getInstance();
    await this.oauthCapabilityDiscovery.initialize(this.eventBusService);
    logger.info('OAuth Capability Discovery Service initialized');

    // Initialize Integration Service for database synchronization
    this.integrationService = IntegrationService.getInstance();
    await this.integrationService.initialize();
    this.integrationService.start();
    logger.info('Integration Service initialized - Starting 5-second sync cadence for PostgreSQL ↔ Neo4j ↔ Qdrant');

    // Initialize unified services
    this.unifiedToolRegistry = new UnifiedToolRegistry();
    await this.unifiedToolRegistry.initialize();
    logger.info('Unified Tool Registry initialized');

    this.enterpriseToolRegistry = new EnterpriseToolRegistry({
      eventBusService: this.eventBusService,
      databaseService: this.databaseService,
      serviceName: 'capability-registry'
    });
    await this.enterpriseToolRegistry.initialize();
    logger.info('Enterprise Tool Registry initialized');

    this.projectToolIntegration = new ProjectToolIntegrationService(
      this.databaseService,
      this.eventBusService
    );
    await this.projectToolIntegration.initialize();
    logger.info('Project Tool Integration Service initialized');

    // Initialize new tool services
    this.toolExecutionCoordinator = ToolExecutionCoordinator.getInstance();
    await this.toolExecutionCoordinator.initialize();
    logger.info('Tool Execution Coordinator initialized');

    this.toolCacheService = ToolCacheService.getInstance();
    await this.toolCacheService.warmupCache();
    logger.info('Tool Cache Service initialized and warmed up');

    this.toolRecommendationService = ToolRecommendationService.getInstance();
    logger.info('Tool Recommendation Service initialized');

    this.sandboxExecutionService = SandboxExecutionService.getInstance();
    await this.sandboxExecutionService.initialize();
    logger.info('Sandbox Execution Service initialized');

    this.toolAdapterService = new ToolAdapterService(config);
    logger.info('Tool Adapter Service initialized (GitHub, Jira, Confluence, Slack)');

    // Initialize controllers
    this.toolController = new ToolController(this.toolRegistry, this.toolExecutor);
    this.capabilityController = new CapabilityController(this.databaseService);

    logger.info('Services initialized successfully');
  }

  private setupRoutes(): void {
    logger.info('Setting up routes...');

    // Metrics endpoint for Prometheus
    this.app.get('/metrics', metricsEndpoint);

    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      const neo4jConnectionStatus = this.neo4j?.getConnectionStatus();
      const neo4jStatus = neo4jConnectionStatus?.isConnected ? 'connected' : 'disconnected';

      // Get MCP system status
      const mcpStatus = await this.mcpClientService?.getSystemStatus();

      // Get OAuth provider status
      const connectedProviders = this.oauthCapabilityDiscovery?.getConnectedProviders();
      const oauthStatus = {
        connectedProviders: connectedProviders?.size || 0,
        availableCapabilities: 0,
        providers: Array.from(connectedProviders?.entries() || []).map(([id, config]) => ({
          id,
          name: config.name,
          capabilities: config.capabilities.length,
          webhookSupport: config.webhookSupport
        }))
      };

      // Get Integration Service status
      const integrationStatus = await this.integrationService?.healthCheck();
      
      // Calculate total OAuth capabilities
      oauthStatus.availableCapabilities = oauthStatus.providers.reduce(
        (total, provider) => total + provider.capabilities, 0
      );

      // Get cache statistics
      const cacheStats = await this.toolCacheService?.getCacheStats();

      // Get sandbox metrics
      const sandboxMetrics = await this.sandboxExecutionService?.getMetrics();

      // Get execution metrics
      const executionMetrics = await this.toolExecutionCoordinator?.getExecutionMetrics(60);

      res.json({
        status: 'healthy',
        service: 'capability-registry',
        timestamp: new Date().toISOString(),
        version: process.env.VERSION || '1.0.0',
        databases: {
          postgresql: 'connected', // Assuming PostgreSQL is working if we got this far
          neo4j: {
            status: neo4jStatus,
            database: neo4jConnectionStatus?.database || 'unknown',
            retries: neo4jConnectionStatus?.retries
          }
        },
        mcp: {
          status: mcpStatus?.healthStatus || 'unknown',
          totalServers: mcpStatus?.totalServers || 0,
          runningServers: mcpStatus?.runningServers || 0,
          errorServers: mcpStatus?.errorServers || 0,
          totalTools: mcpStatus?.totalTools || 0,
          uptime: mcpStatus?.uptime || 0
        },
        oauth: oauthStatus,
        integration: {
          status: integrationStatus?.status || 'unknown',
          syncCadence: '5 seconds',
          syncEnabled: true,
          databases: ['PostgreSQL', 'Neo4j', 'Qdrant'],
          details: integrationStatus?.details || {}
        },
        cache: {
          memoryCacheSize: cacheStats?.memoryCacheSize || 0,
          redisCacheSize: cacheStats?.redisCacheSize || 0,
          hitRate: cacheStats?.hitRate || 0,
          missRate: cacheStats?.missRate || 0
        },
        sandbox: {
          activeExecutions: sandboxMetrics?.activeExecutions || 0,
          totalExecutions: sandboxMetrics?.totalExecutions || 0,
          averageExecutionTime: sandboxMetrics?.averageExecutionTime || 0,
          failureRate: sandboxMetrics?.failureRate || 0
        },
        execution: {
          total: executionMetrics?.total || 0,
          successful: executionMetrics?.successful || 0,
          failed: executionMetrics?.failed || 0,
          averageExecutionTime: executionMetrics?.averageExecutionTime || 0
        },
        features: {
          toolManagement: 'available',
          toolExecution: 'available',
          toolCaching: 'available',
          sandboxExecution: 'available',
          toolRecommendations: neo4jStatus === 'connected' ? 'available' : 'degraded',
          mcpProtocol: mcpStatus?.runningServers > 0 ? 'available' : 'degraded',
          oauthIntegration: oauthStatus.connectedProviders > 0 ? 'available' : 'ready',
          graphRelationships: neo4jStatus === 'connected' ? 'available' : 'degraded',
          recommendations: neo4jStatus === 'connected' ? 'available' : 'degraded',
          databaseSync: integrationStatus?.status === 'healthy' ? 'available' : 'degraded'
        }
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Capability Registry',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        features: [
          'Tool Registration & Management',
          'Tool Execution with Tracking',
          'MCP Protocol Integration',
          'Graph-based Relationships',
          'Smart Recommendations',
          'Usage Analytics',
          'Approval Workflows'
        ]
      });
    });

    // API routes
    const toolRoutes = createToolRoutes(this.toolController);
    this.app.use('/api/v1/tools', toolRoutes);

    // Capability routes
    // const capabilityRoutes = createCapabilityRoutes(this.capabilityController);
    // this.app.use('/api/v1/capabilities', capabilityRoutes);

    // Health routes
    this.app.use('/api/v1/health', healthRoutes);

    // 404 handler
    this.app.use((req, res) => {
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
        logger.info(`📊 PostgreSQL: ${config.database.postgres.host}:${config.database.postgres.port}`);
        logger.info(`🔗 Neo4j: ${config.database.neo4j.uri}`);
        logger.info(`🛡️  Security Level: Standard`);
        logger.info(`⚡ Max Concurrent Executions: ${config.execution.maxConcurrentOperations}`);
        logger.info(`💰 Default Cost Limit: Not configured`);
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
      // Shutdown Integration Service first to stop sync workers
      if (this.integrationService) {
        await this.integrationService.stop();
        logger.info('Integration Service stopped - Database sync halted');
      }

      // Shutdown MCP Client Service
      if (this.mcpClientService) {
        await this.mcpClientService.shutdown();
        logger.info('MCP Client Service shut down');
      }

      // Close database connections
      if (this.postgresql) {
        await this.postgresql.close();
        logger.info('PostgreSQL connection closed');
      }

      if (this.neo4j) {
        await this.neo4j.close();
        logger.info('Neo4j connection closed');
      }

      // Close DatabaseService
      if (this.databaseService) {
        await this.databaseService.close();
        logger.info('DatabaseService connection closed');
      }

      // Close EventBusService
      if (this.eventBusService) {
        await this.eventBusService.close();
        logger.info('EventBusService connection closed');
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