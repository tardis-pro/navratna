import { createAppServer, type AppServer } from './http-app.js';
import { logger } from '@uaip/utils';
// Express middlewares are not compatible with Elysia; implement minimal handlers inline
import { DatabaseService } from './databaseService.js';
import { EventBusService } from './eventBusService.js';
import {
  UnifiedModelSelectionFacade,
  UnifiedModelSelection,
  UnifiedSelectionRequest,
} from './services/UnifiedModelSelectionFacade.js';
import { LLMTaskType } from '@uaip/types';
import { Agent } from './entities/agent.entity.js';
import { UserLLMPreference } from './entities/userLLMPreference.entity.js';
import { AgentLLMPreference } from './entities/agentLLMPreference.entity.js';
import { LLMProvider } from './entities/llmProvider.entity.js';

// HyperExpress types are already available

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
  customMiddleware?: any[];
}

export abstract class BaseService {
  protected app: AppServer;
  protected server: AppServer | undefined;
  protected databaseService: DatabaseService;
  protected eventBusService: EventBusService;
  protected enterpriseEventBusService?: EventBusService;
  protected modelSelectionFacade: UnifiedModelSelectionFacade | null = null;
  protected config: ServiceConfig;
  private shutdownHandlers: (() => Promise<void>)[] = [];
  private isShuttingDown: boolean = false;

  constructor(config: ServiceConfig) {
    this.config = config;
    this.app = createAppServer();
    this.databaseService = new DatabaseService();

    // Initialize EventBusService singleton for first time
    this.eventBusService = EventBusService.getInstance(
      {
        url: config.rabbitMQUrl || process.env.RABBITMQ_URL || 'amqp://localhost',
        serviceName: config.name,
      },
      logger
    );

    // Initialize enterprise event bus if enabled
    if (config.enableEnterpriseEventBus) {
      this.enterpriseEventBusService = new EventBusService(
        {
          url: config.rabbitMQUrl || process.env.RABBITMQ_URL || 'amqp://localhost',
          serviceName: config.name,
          exchangePrefix: 'uaip.enterprise',
          complianceMode: true,
        },
        logger
      );
    }
  }

  protected setupBaseMiddleware(): void {
    // Basic request logging and request id
    this.app.onRequest(({ request, set }) => {
      const id = request.headers.get('x-request-id') || `${Date.now()}-${Math.random()}`;
      set.headers['X-Request-ID'] = id;
      const ip = request.headers.get('x-forwarded-for') || '' || 'unknown';
      logger.info('Incoming request', {
        method: request.method,
        path: new URL(request.url).pathname,
        userAgent: request.headers.get('user-agent'),
        ip,
        timestamp: new Date().toISOString(),
      });
    });

    // Global error handler
    this.app.onError(({ code, error }) => {
      logger.error(`${this.config.name}: onError`, { code, error: (error as any)?.message });
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    });

    // 404 handled by Elysia default response
  }

  protected setupBaseRoutes(): void {
    // Health check
    this.app.get('/health', async ({ set }) => {
      try {
        const dbHealthy = await this.checkDatabaseHealth();
        const eventBusHealthy = await this.checkEventBusHealth();
        const serviceHealthy = await this.checkServiceHealth();
        const isHealthy = dbHealthy && eventBusHealthy && serviceHealthy;
        set.status = isHealthy ? 200 : 503;
        return {
          status: isHealthy ? 'healthy' : 'unhealthy',
          service: this.config.name,
          version: this.config.version || '1.0.0',
          timestamp: new Date().toISOString(),
          checks: {
            database: dbHealthy ? 'connected' : 'disconnected',
            eventBus: eventBusHealthy ? 'connected' : 'disconnected',
            service: serviceHealthy ? 'healthy' : 'unhealthy',
          },
        };
      } catch (error) {
        logger.error(`Health check failed for ${this.config.name}:`, error);
        set.status = 503;
        return {
          status: 'error',
          service: this.config.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    // Service info
    this.app.get('/info', () => ({
      service: this.config.name,
      version: this.config.version || '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
      node: process.version,
    }));

    // Metrics endpoint (basic placeholder)
    this.app.get('/metrics', () => 'uaip_up 1\n');
  }

  protected setup404Handler(): void {
    // handled in onNotFound
  }

  protected setupErrorHandler(): void {
    // handled in onError
  }

  protected async initializeDatabase(): Promise<void> {
    try {
      await this.databaseService.initialize();
      logger.info(`${this.config.name}: Database initialized`);

      // Initialize unified model selection facade
      await this.initializeModelSelection();
    } catch (error) {
      logger.error(`${this.config.name}: Database initialization failed:`, error);
      throw error;
    }
  }

  protected async initializeModelSelection(): Promise<void> {
    try {
      // Get TypeORM repositories for the facade
      const dataSource = await this.databaseService.getDataSource();

      this.modelSelectionFacade = new UnifiedModelSelectionFacade(
        dataSource.getRepository(Agent),
        dataSource.getRepository(UserLLMPreference),
        dataSource.getRepository(AgentLLMPreference),
        dataSource.getRepository(LLMProvider)
      );
      logger.info(`${this.config.name}: Unified model selection initialized`);
    } catch (error) {
      logger.warn(
        `${this.config.name}: Model selection initialization failed, continuing without it:`,
        error
      );
      // Service can still function without model selection
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
      logger.warn(
        `${this.config.name}: Event bus connection failed, continuing without event publishing:`,
        error
      );
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
        await this.server.stop();
        logger.info(`${this.config.name}: HTTP server closed`);
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

      // Model selection facade cleanup no longer needed (fallback service removed)

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

  // =============================================================================
  // UNIFIED MODEL SELECTION METHODS
  // =============================================================================

  /**
   * Select model for agent-based tasks
   */
  protected async selectModelForAgent(
    agentId: string,
    taskType: LLMTaskType,
    options?: {
      model?: string;
      provider?: string;
      urgency?: 'low' | 'medium' | 'high' | 'critical';
    }
  ): Promise<UnifiedModelSelection> {
    if (!this.modelSelectionFacade) {
      throw new Error(`Model selection not initialized in ${this.config.name}`);
    }

    return this.modelSelectionFacade.selectForAgent(agentId, taskType, options);
  }

  /**
   * Select model for user-based tasks
   */
  protected async selectModelForUser(
    userId: string,
    taskType: LLMTaskType,
    options?: {
      model?: string;
      provider?: string;
      urgency?: 'low' | 'medium' | 'high' | 'critical';
    }
  ): Promise<UnifiedModelSelection> {
    if (!this.modelSelectionFacade) {
      throw new Error(`Model selection not initialized in ${this.config.name}`);
    }

    return this.modelSelectionFacade.selectForUser(userId, taskType, options);
  }

  /**
   * Select model for system-level tasks
   */
  protected async selectModelForSystem(
    taskType: LLMTaskType,
    options?: {
      model?: string;
      provider?: string;
      urgency?: 'low' | 'medium' | 'high' | 'critical';
    }
  ): Promise<UnifiedModelSelection> {
    if (!this.modelSelectionFacade) {
      throw new Error(`Model selection not initialized in ${this.config.name}`);
    }

    return this.modelSelectionFacade.selectForSystem(taskType, options);
  }

  /**
   * Update model selection usage statistics for learning
   */
  protected async updateModelUsageStats(
    selection: UnifiedModelSelection,
    request: UnifiedSelectionRequest,
    responseTime: number,
    success: boolean,
    quality?: number
  ): Promise<void> {
    if (!this.modelSelectionFacade) {
      logger.warn(
        `Model selection not initialized, skipping usage stats update in ${this.config.name}`
      );
      return;
    }

    try {
      await this.modelSelectionFacade.updateUsageStats(
        selection,
        request,
        responseTime,
        success,
        quality
      );
    } catch (error) {
      logger.error(`Failed to update model usage stats in ${this.config.name}:`, error);
    }
  }

  /**
   * Get model selection metrics for monitoring
   */
  protected getModelSelectionMetrics() {
    if (!this.modelSelectionFacade) {
      return null;
    }

    return this.modelSelectionFacade.getMetrics();
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

      // Start server - Elysia runtime (Bun)
      this.server = this.app.listen(this.config.port);
      logger.info(`${this.config.name} (Elysia) started on port ${this.config.port}`);

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
    if (this.server) {
      await this.server.stop();
    }
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
