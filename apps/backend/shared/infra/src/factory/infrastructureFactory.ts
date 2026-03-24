/**
 * InfrastructureFactory - Centralized infrastructure initialization
 *
 * Manages TypeORM, Redis, Qdrant, and Neo4j initialization
 * Extracted from ServiceFactory.ts for clean separation
 */
import { TypeOrmService } from '../database/typeormService';
import { RedisCacheService } from '../cache/redisCacheService';
import { QdrantService } from './qdrantService';
import { ToolGraphDatabase } from './toolGraphDatabase';
import { config } from '@uaip/config';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'infrastructure-factory',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export class InfrastructureFactory {
  private static instance: InfrastructureFactory;

  private typeormService: TypeOrmService | null = null;
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

      // Initialize TypeORM
      await this.initializeTypeORM();

      // Initialize Redis (optional, with fallback)
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

  /**
   * Initialize TypeORM database connection
   */
  private async initializeTypeORM(): Promise<void> {
    logger.info('Initializing TypeORM...');
    this.typeormService = TypeOrmService.getInstance();
    await this.typeormService.initialize();
    logger.info('TypeORM initialized successfully');
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

  /**
   * Get TypeORM service
   */
  public getTypeORMService(): TypeOrmService {
    if (!this.typeormService) {
      throw new Error('TypeORM not initialized. Call initialize() first.');
    }
    return this.typeormService;
  }

  /**
   * Get Redis cache service
   */
  public getRedisService(): RedisCacheService | null {
    return this.redisService;
  }

  /**
   * Get Qdrant service
   */
  public getQdrantService(): QdrantService | null {
    return this.qdrantService;
  }

  /**
   * Get ToolGraphDatabase
   */
  public getToolGraphDatabase(): ToolGraphDatabase | null {
    return this.toolGraphDatabase;
  }

  /**
   * Check if infrastructure is healthy
   */
  public async healthCheck(): Promise<{
    typeorm: boolean;
    redis: boolean;
    qdrant: boolean;
    neo4j: boolean;
  }> {
    const results = {
      typeorm: false,
      redis: false,
      qdrant: false,
      neo4j: false,
    };

    // Check TypeORM
    try {
      results.typeorm = (await this.typeormService?.isHealthy()) ?? false;
    } catch {
      // Already false
    }

    // Check Redis
    try {
      results.redis = this.redisService?.isHealthy() ?? false;
    } catch {
      // Already false
    }

    // Check Qdrant
    try {
      results.qdrant = (await this.qdrantService?.isHealthy()) ?? false;
    } catch {
      // Already false
    }

    // Check Neo4j
    try {
      results.neo4j = this.toolGraphDatabase?.isHealthy() ?? false;
    } catch {
      // Already false
    }

    return results;
  }

  /**
   * Gracefully shutdown all infrastructure
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down infrastructure services...');

    // Shutdown in reverse order of initialization

    // Neo4j
    try {
      await this.toolGraphDatabase?.close();
    } catch (error) {
      logger.warn('Error closing Neo4j', { error });
    }

    // Qdrant
    try {
      await this.qdrantService?.close();
    } catch (error) {
      logger.warn('Error closing Qdrant', { error });
    }

    // Redis
    try {
      await this.redisService?.close();
    } catch (error) {
      logger.warn('Error closing Redis', { error });
    }

    // TypeORM
    try {
      await this.typeormService?.close();
    } catch (error) {
      logger.warn('Error closing TypeORM', { error });
    }

    this.isInitialized = false;
    logger.info('All infrastructure services shut down');
  }
}

export const infrastructureFactory = InfrastructureFactory.getInstance();
