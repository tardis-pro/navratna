import { PgService } from '../database/pg_service';
import { RedisCacheService } from '../cache/redis_cache_service';
import { QdrantService } from './qdrant_service';
import { ToolGraphDatabase } from './tool_graph_database';
import { config } from '@uaip/config';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'infrastructure-factory',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export class InfrastructureFactory {
  private static instance: InfrastructureFactory;

  private pgService: PgService | null = null;
  private redisService: RedisCacheService | null = null;
  private qdrantService: QdrantService | null = null;
  private toolGraphDatabase: ToolGraphDatabase | null = null;

  private isInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): InfrastructureFactory {
    if (!InfrastructureFactory.instance) {
      InfrastructureFactory.instance = new InfrastructureFactory();
    }
    return InfrastructureFactory.instance;
  }

  /**
   * Initialize all infrastructure services
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Infrastructure already initialized');
      return;
    }

    try {
      logger.info('Initializing infrastructure services...');

      await this.initializePg();

      await this.initializeRedis();

      // Initialize Qdrant
      await this.initializeQdrant();

      // Initialize Neo4j/ToolGraphDatabase
      await this.initializeNeo4j();

      this.isInitialized = true;
      logger.info('All infrastructure services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize infrastructure', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async initializePg(): Promise<void> {
    logger.info('Initializing Postgres...');
    this.pgService = PgService.getInstance();
    await this.pgService.initialize();
    logger.info('Postgres initialized successfully');
  }

  /**
   * Initialize Redis cache (optional, with graceful fallback)
   */
  private async initializeRedis(): Promise<void> {
    try {
      logger.info('Initializing Redis...');
      const redisEnabled = config.redis?.host !== undefined; // Check if Redis is configured

      if (!redisEnabled) {
        logger.info('Redis not configured');
        return;
      }

      this.redisService = RedisCacheService.getInstance();
      await this.redisService.initialize();
      logger.info('Redis initialized successfully');
    } catch (error) {
      logger.warn('Redis initialization failed, continuing without cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Continue without Redis - it's optional
    }
  }

  /**
   * Initialize Qdrant vector database for embeddings
   */
  private async initializeQdrant(): Promise<void> {
    logger.info('Initializing Qdrant...');
    try {
      const qdrantConfig = config.database?.qdrant;
      const useTEI = false; // Default to false since embeddings config not available

      this.qdrantService = new QdrantService({
        host: qdrantConfig?.url ? new URL(qdrantConfig.url).hostname : 'localhost',
        port: qdrantConfig?.url
          ? new URL(qdrantConfig.url).port
            ? parseInt(new URL(qdrantConfig.url).port)
            : 6333
          : 6333,
        // apiKey: not supported in current config
        collection: qdrantConfig?.collectionName ?? 'knowledge',
        dimension: useTEI ? 768 : 1024, // TEI uses 768, default is 1024
        waitUntilReady: true,
      });

      await this.qdrantService.initialize();
      logger.info('Qdrant initialized successfully', {
        dimension: useTEI ? 768 : 1024,
        collection: qdrantConfig?.collectionName ?? 'knowledge',
      });
    } catch (error) {
      logger.warn('Qdrant initialization failed, continuing without vector search', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Continue without Qdrant - it's optional for some operations
    }
  }

  /**
   * Initialize Neo4j/ToolGraphDatabase for knowledge graph
   */
  private async initializeNeo4j(): Promise<void> {
    logger.info('Initializing Neo4j/ToolGraphDatabase...');
    try {
      const neo4jConfig = config.database?.neo4j;
      this.toolGraphDatabase = new ToolGraphDatabase({
        uri: neo4jConfig?.uri ?? 'bolt://localhost:7687',
        username: neo4jConfig?.user ?? 'neo4j',
        password: neo4jConfig?.password ?? 'password',
        database: neo4jConfig?.database ?? 'neo4j',
      });

      await this.toolGraphDatabase.initialize();
      logger.info('Neo4j/ToolGraphDatabase initialized successfully');
    } catch (error) {
      logger.warn('Neo4j initialization failed, continuing without graph database', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Continue without Neo4j - it's optional for some operations
    }
  }

  public getPgService(): PgService {
    if (!this.pgService) {
      throw new Error('Postgres not initialized. Call initialize() first.');
    }
    return this.pgService;
  }

  public getRedisService(): RedisCacheService | null {
    return this.redisService;
  }

  public getQdrantService(): QdrantService | null {
    return this.qdrantService;
  }

  public getToolGraphDatabase(): ToolGraphDatabase | null {
    return this.toolGraphDatabase;
  }

  public async healthCheck(): Promise<{
    postgres: boolean;
    redis: boolean;
    qdrant: boolean;
    neo4j: boolean;
  }> {
    const results = {
      postgres: false,
      redis: false,
      qdrant: false,
      neo4j: false,
    };

    try {
      results.postgres = (await this.pgService?.isHealthy()) ?? false;
    } catch {
      // Already false
    }

    try {
      results.redis = this.redisService?.isHealthy() ?? false;
    } catch {
      // Already false
    }

    try {
      results.qdrant = (await this.qdrantService?.isHealthy()) ?? false;
    } catch {
      // Already false
    }

    try {
      results.neo4j = this.toolGraphDatabase?.isHealthy() ?? false;
    } catch {
      // Already false
    }

    return results;
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down infrastructure services...');

    try {
      await this.toolGraphDatabase?.close();
    } catch (error) {
      logger.warn('Error closing Neo4j', { error });
    }

    try {
      await this.qdrantService?.close();
    } catch (error) {
      logger.warn('Error closing Qdrant', { error });
    }

    try {
      await this.redisService?.close();
    } catch (error) {
      logger.warn('Error closing Redis', { error });
    }

    try {
      await this.pgService?.close();
    } catch (error) {
      logger.warn('Error closing Postgres', { error });
    }

    this.isInitialized = false;
    logger.info('All infrastructure services shut down');
  }
}

export const infrastructureFactory = InfrastructureFactory.getInstance();
