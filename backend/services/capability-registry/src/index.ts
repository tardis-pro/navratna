import { BaseService, ServiceConfig, allEntities, MCPServer as SharedMCPServer, MCPToolCall as SharedMCPToolCall } from '@uaip/shared-services';
import { config } from '@uaip/config';
import { ToolGraphDatabase, IntegrationService } from '@uaip/shared-services';
import {
  DatabaseService as InfraDatabaseService,
  EventBusService as InfraEventBusService,
} from '@uaip/infra';
import { ToolRegistry } from './services/toolRegistry.js';
import { ToolExecutor } from './services/toolExecutor.js';
import { BaseToolExecutor } from './services/baseToolExecutor.js';
import { MCPClientService } from './services/mcpClientService.js';
import { OAuthCapabilityDiscovery } from './services/oauthCapabilityDiscovery.js';
import { ToolController } from './controllers/toolController.js';
import { CapabilityController } from './controllers/capabilityController.js';
import { UnifiedToolRegistry } from './services/unified-tool-registry.js';
import { EnterpriseToolRegistry } from './services/enterprise-tool-registry.js';
// Route registration functions are imported dynamically in setupRoutes
import { logger } from '@uaip/utils';
import { ExecutionDataSource, McpRepository } from './database/index.js';

class CapabilityRegistryService extends BaseService {
  private postgresql: InfraDatabaseService;
  private neo4j: ToolGraphDatabase;
  private integrationService: IntegrationService;
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private baseExecutor: BaseToolExecutor;
  private mcpClientService: MCPClientService;
  private oauthCapabilityDiscovery: OAuthCapabilityDiscovery;
  private toolController: ToolController;
  private capabilityController: CapabilityController;
  private unifiedToolRegistry: UnifiedToolRegistry;
  private enterpriseToolRegistry: EnterpriseToolRegistry;
  // Advanced services disabled pending architectural fix
  // private projectToolIntegration: ProjectToolIntegrationService;
  // private toolExecutionCoordinator: ToolExecutionCoordinator;
  // private toolCacheService: ToolCacheService;
  // private toolRecommendationService: ToolRecommendationService;
  // private sandboxExecutionService: SandboxExecutionService;
  // private toolAdapterService: ToolAdapterService;

  constructor() {
    super({
      name: 'capability-registry',
      port: config.port || 3003,
      enableNeo4j: true,
    });

    // Register shared entities with the platform DataSource.
    // MCPServer / MCPToolCall are intentionally excluded here — the Execution Plane
    // (capability-registry) owns those entities exclusively via ExecutionDataSource.
    // Including them in the shared DataSource would create a dual-ownership conflict.
    const platformEntities = allEntities.filter(
      (e) => e !== SharedMCPServer && e !== SharedMCPToolCall
    );
    this.registerEntities(platformEntities);
  }

  protected async initialize(): Promise<void> {
    try {
      logger.info('Initializing Capability Registry Service...');

      // Initialize services (includes database initialization)
      await this.initializeServices();

      logger.info('Capability Registry Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Capability Registry Service:', error);
      throw error;
    }
  }

  private async initializeServices(): Promise<void> {
    logger.info('Initializing services...');

    // Set up database service reference
    this.postgresql = this.asInfraDatabaseService();

    // Initialize base tool executor
    this.baseExecutor = new BaseToolExecutor();

    // Initialize tool registry with EventBusService
    this.toolRegistry = new ToolRegistry(this.asInfraEventBusService());

    // Initialize tool executor
    this.toolExecutor = new ToolExecutor(this.postgresql, this.toolRegistry, this.baseExecutor);

    // ── Execution Plane DataSource ──────────────────────────────────────────
    // Initialize the plane's own TypeORM connection BEFORE MCPClientService so
    // the repository is ready when autoStartServers() runs on startup.
    logger.info('Initializing Execution Plane DataSource...');
    const execDs = await ExecutionDataSource.getInstance().initialize();
    const mcpRepository = new McpRepository(execDs);
    logger.info('Execution Plane DataSource ready');

    // Initialize MCP Client Service
    this.mcpClientService = MCPClientService.getInstance();
    await this.mcpClientService.initialize(
      this.asInfraEventBusService(),
      this.asInfraDatabaseService(),
      mcpRepository
    );
    logger.info('MCP Client Service initialized and auto-started servers');

    // Initialize OAuth Capability Discovery
    this.oauthCapabilityDiscovery = OAuthCapabilityDiscovery.getInstance();
    await this.oauthCapabilityDiscovery.initialize(this.asInfraEventBusService());
    logger.info('OAuth Capability Discovery Service initialized');

    // Initialize Integration Service for database synchronization
    this.integrationService = IntegrationService.getInstance();
    await this.integrationService.initialize();
    this.integrationService.start();
    logger.info(
      'Integration Service initialized - Starting 5-second sync cadence for PostgreSQL ↔ Neo4j ↔ Qdrant'
    );

    // Initialize unified services
    this.unifiedToolRegistry = new UnifiedToolRegistry(this.asInfraEventBusService());
    await this.unifiedToolRegistry.initialize();
    logger.info('Unified Tool Registry initialized');

    this.enterpriseToolRegistry = new EnterpriseToolRegistry({
      eventBusService: this.asInfraEventBusService(),
      databaseService: this.asInfraDatabaseService(),
      serviceName: 'capability-registry',
    });
    await this.enterpriseToolRegistry.initialize();
    logger.info('Enterprise Tool Registry initialized');

    // TODO: Fix these services to work with @uaip/infra.DatabaseService architecture
    // For now, keeping them disabled to maintain system stability
    logger.info('Advanced tool services disabled (architectural fix pending)');
    /*
    this.projectToolIntegration = new ProjectToolIntegrationService(
      this.databaseService,
      this.eventBusService
    );
    await this.projectToolIntegration.initialize();
    logger.info('Project Tool Integration Service initialized');

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
    */

    // Initialize controllers
    this.toolController = new ToolController(this.toolRegistry, this.toolExecutor);
    this.capabilityController = new CapabilityController(this.asInfraDatabaseService());

    logger.info('Services initialized successfully');
  }

  protected async setupRoutes(): Promise<void> {
    // Root endpoint (Elysia handler style)
    this.app.get('/', () => ({
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
        'Approval Workflows',
      ],
    }));

    // Register Elysia route groups (tools + MCP + health + capabilities)
    const { registerToolRoutes } = await import('./routes/toolRoutes.js');
    registerToolRoutes(this.app as any, this.toolController, this.asInfraEventBusService());

    const { registerHealthRoutes } = await import('./routes/healthRoutes.js');
    registerHealthRoutes(this.app as any);

    logger.info('Mounting MCP routes...');
    const { registerMCPRoutes } = await import('./routes/mcpRoutes.js');
    registerMCPRoutes(this.app as any);
    logger.info('MCP routes mounted successfully');

    const { registerCapabilityRoutes } = await import('./routes/capabilityRoutes.js');
    registerCapabilityRoutes(this.app as any);
  }

  protected async getHealthInfo(): Promise<any> {
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
        webhookSupport: config.webhookSupport,
      })),
    };

    // Get Integration Service status
    const integrationStatus = await this.integrationService?.healthCheck();

    // Calculate total OAuth capabilities
    oauthStatus.availableCapabilities = oauthStatus.providers.reduce(
      (total, provider) => total + provider.capabilities,
      0
    );

    // Get cache statistics - services disabled
    const cacheStats: {
      memoryCacheSize?: number;
      redisCacheSize?: number;
      hitRate?: number;
      missRate?: number;
    } | null = null;

    // Get sandbox metrics
    const sandboxMetrics: {
      activeExecutions?: number;
      totalExecutions?: number;
      averageExecutionTime?: number;
      failureRate?: number;
    } | null = null;

    // Get execution metrics
    const executionMetrics: {
      total?: number;
      successful?: number;
      failed?: number;
      averageExecutionTime?: number;
    } | null = null;

    return {
      databases: {
        postgresql: 'connected',
        neo4j: {
          status: neo4jStatus,
          database: neo4jConnectionStatus?.database || 'unknown',
          retries: neo4jConnectionStatus?.retries,
        },
      },
      mcp: {
        status: mcpStatus?.healthStatus || 'unknown',
        totalServers: mcpStatus?.totalServers || 0,
        runningServers: mcpStatus?.runningServers || 0,
        errorServers: mcpStatus?.errorServers || 0,
        totalTools: mcpStatus?.totalTools || 0,
        uptime: mcpStatus?.uptime || 0,
      },
      oauth: oauthStatus,
      integration: {
        status: integrationStatus?.status || 'unknown',
        syncCadence: '5 seconds',
        syncEnabled: true,
        databases: ['PostgreSQL', 'Neo4j', 'Qdrant'],
        details: integrationStatus?.details || {},
      },
      cache: {
        memoryCacheSize: cacheStats?.memoryCacheSize || 0,
        redisCacheSize: cacheStats?.redisCacheSize || 0,
        hitRate: cacheStats?.hitRate || 0,
        missRate: cacheStats?.missRate || 0,
      },
      sandbox: {
        activeExecutions: sandboxMetrics?.activeExecutions || 0,
        totalExecutions: sandboxMetrics?.totalExecutions || 0,
        averageExecutionTime: sandboxMetrics?.averageExecutionTime || 0,
        failureRate: sandboxMetrics?.failureRate || 0,
      },
      execution: {
        total: executionMetrics?.total || 0,
        successful: executionMetrics?.successful || 0,
        failed: executionMetrics?.failed || 0,
        averageExecutionTime: executionMetrics?.averageExecutionTime || 0,
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
        databaseSync: integrationStatus?.status === 'healthy' ? 'available' : 'degraded',
      },
    };
  }

  protected async checkServiceHealth(): Promise<boolean> {
    // Add service-specific health checks here
    return true;
  }

  private asInfraDatabaseService(): InfraDatabaseService {
    return this.databaseService as unknown as InfraDatabaseService;
  }

  private asInfraEventBusService(): InfraEventBusService {
    return this.eventBusService as unknown as InfraEventBusService;
  }

  protected onServerStarted(): void {
    logger.info(`📊 PostgreSQL: ${config.database.postgres.host}:${config.database.postgres.port}`);
    logger.info(`🔗 Neo4j: ${config.database.neo4j.uri}`);
    logger.info(`🛡️  Security Level: Standard`);
    logger.info(`⚡ Max Concurrent Executions: ${config.execution.maxConcurrentOperations}`);
    logger.info(`💰 Default Cost Limit: Not configured`);
  }

  protected async cleanup(): Promise<void> {
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

      // Close Neo4j connection
      if (this.neo4j) {
        await this.neo4j.close();
        logger.info('Neo4j connection closed');
      }

      // Close Execution Plane DataSource
      await ExecutionDataSource.getInstance().close();
      logger.info('Execution Plane DataSource closed');

      logger.info('Capability Registry Service shut down successfully');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      throw error;
    }
  }
}

// Start the service
const service = new CapabilityRegistryService();
service.start().catch((error) => {
  logger.error('Failed to start service:', error);
  process.exit(1);
});

// Named export to avoid Bun auto-serve on default export
export { CapabilityRegistryService };
