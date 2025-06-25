import { ToolGraphDatabase } from '../database/toolGraphDatabase.js';
import { TypeOrmService } from '../typeormService.js';
import { OutboxPublisher } from './OutboxPublisher.js';
import { GraphSyncWorker } from './GraphSyncWorker.js';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';

export class IntegrationService {
  private static instance: IntegrationService;
  private outboxPublisher: OutboxPublisher | null = null;
  private graphSyncWorker: GraphSyncWorker | null = null;
  private toolGraphDatabase: ToolGraphDatabase | null = null;
  private isInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): IntegrationService {
    if (!IntegrationService.instance) {
      IntegrationService.instance = new IntegrationService();
    }
    return IntegrationService.instance;
  }

  /**
   * Initialize the integration service
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('IntegrationService already initialized');
      return;
    }

    try {
      logger.info('Initializing IntegrationService...');

      // Initialize TypeORM service first
      const typeormService = TypeOrmService.getInstance();
      await typeormService.initialize();

      // Initialize ToolGraphDatabase
      this.toolGraphDatabase = new ToolGraphDatabase(config.database.neo4j);
      
      // Verify Neo4j connectivity (non-blocking)
      try {
        await this.toolGraphDatabase.verifyConnectivity();
        logger.info('Neo4j connectivity verified for integration service');
      } catch (error) {
        logger.warn('Neo4j connectivity failed, integration will continue with degraded functionality', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Initialize OutboxPublisher
      const integrationEventRepository = typeormService.integrationEventRepository;
      this.outboxPublisher = new OutboxPublisher(integrationEventRepository);

      // Initialize GraphSyncWorker
      this.graphSyncWorker = new GraphSyncWorker(
        this.outboxPublisher,
        this.toolGraphDatabase
      );

      this.isInitialized = true;
      logger.info('IntegrationService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize IntegrationService', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Start the graph sync worker
   */
  public start(): void {
    if (!this.isInitialized) {
      throw new Error('IntegrationService must be initialized before starting');
    }

    if (!this.graphSyncWorker) {
      throw new Error('GraphSyncWorker not initialized');
    }

    this.graphSyncWorker.start();
    logger.info('IntegrationService started');
  }

  /**
   * Stop the graph sync worker
   */
  public stop(): void {
    if (this.graphSyncWorker) {
      this.graphSyncWorker.stop();
      logger.info('IntegrationService stopped');
    }
  }

  /**
   * Get the outbox publisher instance
   */
  public getOutboxPublisher(): OutboxPublisher {
    if (!this.outboxPublisher) {
      throw new Error('IntegrationService not initialized');
    }
    return this.outboxPublisher;
  }

  /**
   * Get the graph sync worker instance
   */
  public getGraphSyncWorker(): GraphSyncWorker {
    if (!this.graphSyncWorker) {
      throw new Error('IntegrationService not initialized');
    }
    return this.graphSyncWorker;
  }

  /**
   * Get the tool graph database instance
   */
  public getToolGraphDatabase(): ToolGraphDatabase {
    if (!this.toolGraphDatabase) {
      throw new Error('IntegrationService not initialized');
    }
    return this.toolGraphDatabase;
  }

  /**
   * Process retry events manually
   */
  public async processRetries(): Promise<void> {
    if (!this.graphSyncWorker) {
      throw new Error('IntegrationService not initialized');
    }
    await this.graphSyncWorker.processRetries();
  }

  /**
   * Clean up old processed events
   */
  public async cleanupOldEvents(olderThanDays: number = 7): Promise<number> {
    if (!this.outboxPublisher) {
      throw new Error('IntegrationService not initialized');
    }
    return await this.outboxPublisher.cleanupOldEvents(olderThanDays);
  }

  /**
   * Get service status
   */
  public getStatus(): {
    isInitialized: boolean;
    worker: {
      isRunning: boolean;
      batchSize: number;
      intervalMs: number;
    } | null;
    neo4j: {
      isConnected: boolean;
      database: string;
      retries: number;
    } | null;
  } {
    return {
      isInitialized: this.isInitialized,
      worker: this.graphSyncWorker ? this.graphSyncWorker.getStatus() : null,
      neo4j: this.toolGraphDatabase ? this.toolGraphDatabase.getConnectionStatus() : null
    };
  }

  /**
   * Health check for the integration service
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: {
      initialized: boolean;
      workerRunning: boolean;
      neo4jConnected: boolean;
      pendingEvents?: number;
    };
  }> {
    try {
      const status = this.getStatus();
      let pendingEvents = 0;

      if (this.outboxPublisher) {
        const events = await this.outboxPublisher.getPendingEvents(1);
        pendingEvents = events.length;
      }

      const isHealthy = status.isInitialized && 
                       status.worker?.isRunning && 
                       status.neo4j?.isConnected;

      const isDegraded = status.isInitialized && 
                        status.worker?.isRunning && 
                        !status.neo4j?.isConnected;

      return {
        status: isHealthy ? 'healthy' : (isDegraded ? 'degraded' : 'unhealthy'),
        details: {
          initialized: status.isInitialized,
          workerRunning: status.worker?.isRunning || false,
          neo4jConnected: status.neo4j?.isConnected || false,
          pendingEvents
        }
      };
    } catch (error) {
      logger.error('Integration service health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        status: 'unhealthy',
        details: {
          initialized: false,
          workerRunning: false,
          neo4jConnected: false
        }
      };
    }
  }

  /**
   * Shutdown the integration service
   */
  public async shutdown(): Promise<void> {
    try {
      this.stop();
      
      if (this.toolGraphDatabase) {
        await this.toolGraphDatabase.close();
      }

      this.isInitialized = false;
      logger.info('IntegrationService shut down successfully');
    } catch (error) {
      logger.error('Error during IntegrationService shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
} 