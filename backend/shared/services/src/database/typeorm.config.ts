import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from '@uaip/config';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';
import { createLogger } from '@uaip/utils';
import IORedis from 'ioredis';

// Import all entities directly
import { Agent } from '../entities/agent.entity.js';
import { Operation } from '../entities/operation.entity.js';
import { Persona } from '../entities/persona.entity.js';
import { UserEntity } from '../entities/user.entity.js';
import { RefreshTokenEntity } from '../entities/refreshToken.entity.js';
import { PasswordResetTokenEntity } from '../entities/passwordResetToken.entity.js';
import { AgentCapabilityMetric } from '../entities/agentCapabilityMetric.entity.js';
import { ToolUsageRecord } from '../entities/toolUsageRecord.entity.js';
import { ConversationContext } from '../entities/conversationContext.entity.js';
import { OperationState } from '../entities/operationState.entity.js';
import { OperationCheckpoint } from '../entities/operationCheckpoint.entity.js';
import { StepResult } from '../entities/stepResult.entity.js';
import { ApprovalWorkflow } from '../entities/approvalWorkflow.entity.js';
import { ApprovalDecision } from '../entities/approvalDecision.entity.js';
import { AuditEvent } from '../entities/auditEvent.entity.js';
import { SecurityPolicy } from '../entities/securityPolicy.entity.js';
import { ToolDefinition } from '../entities/toolDefinition.entity.js';
import { ToolExecution } from '../entities/toolExecution.entity.js';
import { Artifact } from '../entities/artifact.entity.js';
import { ArtifactReview } from '../entities/artifactReview.entity.js';
import { ArtifactDeployment } from '../entities/artifactDeployment.entity.js';
import { Discussion } from '../entities/discussion.entity.js';
import { DiscussionParticipant } from '../entities/discussionParticipant.entity.js';
import { PersonaAnalytics } from '../entities/personaAnalytics.entity.js';
import { MCPServer } from '../entities/mcpServer.entity.js';
import { MCPToolCall } from '../entities/mcpToolCall.entity.js';
import { KnowledgeItemEntity } from '../entities/knowledge-item.entity.js';
import { KnowledgeRelationshipEntity } from '../entities/knowledge-relationship.entity.js';
import { LLMProvider } from '../entities/llmProvider.entity.js';
import { UserLLMProvider } from '../entities/userLLMProvider.entity.js';
import { IntegrationEventEntity } from '../entities/integrationEvent.entity.js';
import { MCPServerSubscriber } from '../subscribers/MCPServerSubscriber.js';
import { MCPToolCallSubscriber } from '../subscribers/MCPToolCallSubscriber.js';

/**
 * TypeORM Configuration for UAIP Backend
 * Clean, centralized database configuration
 */

// Initialize logger for database operations
const logger = createLogger({
  serviceName: 'typeorm-config',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info'
});

// All entities array for easy management
export const allEntities = [
  Agent,
  Operation,
  Persona,
  UserEntity,
  RefreshTokenEntity,
  PasswordResetTokenEntity,
  AgentCapabilityMetric,
  ToolUsageRecord,
  ConversationContext,
  OperationState,
  OperationCheckpoint,
  StepResult,
  ApprovalWorkflow,
  ApprovalDecision,
  AuditEvent,
  SecurityPolicy,
  ToolDefinition,
  ToolExecution,
  Artifact,
  ArtifactReview,
  ArtifactDeployment,
  Discussion,
  DiscussionParticipant,
  PersonaAnalytics,
  MCPServer,
  MCPToolCall,
  KnowledgeItemEntity,
  KnowledgeRelationshipEntity,
  LLMProvider,
  UserLLMProvider,
  IntegrationEventEntity,
];

// All subscribers array
export const allSubscribers = [
  MCPServerSubscriber,
  MCPToolCallSubscriber,
];

/**
 * Create base TypeORM configuration
 */
function createBaseConfig(): PostgresConnectionOptions {
  // Parse POSTGRES_URL if provided, otherwise use individual env vars
  let dbConfig;
  if (process.env.POSTGRES_URL) {
    try {
      const url = new URL(process.env.POSTGRES_URL);
      dbConfig = {
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        username: url.username,
        password: url.password,
        database: url.pathname.slice(1) // Remove leading slash
      };
    } catch (error) {
      logger.warn('Failed to parse POSTGRES_URL, falling back to individual env vars');
      dbConfig = {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        username: process.env.POSTGRES_USER || 'uaip_user',
        password: process.env.POSTGRES_PASSWORD || 'uaip_password',
        database: process.env.POSTGRES_DB || 'uaip'
      };
    }
  } else {
    dbConfig = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      username: process.env.POSTGRES_USER || 'uaip_user',
      password: process.env.POSTGRES_PASSWORD || 'uaip_password',
      database: process.env.POSTGRES_DB || 'uaip'
    };
  }

  return {
    type: 'postgres',
    ...dbConfig,
    synchronize: process.env.NODE_ENV === 'development' && process.env.TYPEORM_SYNC === 'true',
    logging: process.env.NODE_ENV === 'development' || process.env.TYPEORM_LOGGING === 'true',
    entities: allEntities,
    subscribers: allSubscribers,
    migrations: ['dist/migrations/**/*.{ts,js}'],
    migrationsRun: process.env.TYPEORM_MIGRATIONS_RUN === 'true' || process.env.NODE_ENV !== 'development',
    ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    maxQueryExecutionTime: parseInt(process.env.DB_TIMEOUT || '30000'),
    extra: {
      max: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
      connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT || '30000'),
    }
  };
}

/**
 * Create Redis cache configuration if available
 */
async function createCacheConfig(): Promise<any | undefined> {
  // Skip cache if explicitly disabled or in migration mode
  if (process.env.TYPEORM_DISABLE_CACHE === 'true' || process.env.NODE_ENV === 'migration') {
    return undefined;
  }

  try {
    // Parse REDIS_URL if provided, otherwise use individual env vars
    let redisConfig;
    if (process.env.REDIS_URL) {
      try {
        const url = new URL(process.env.REDIS_URL);
        redisConfig = {
          host: url.hostname,
          port: parseInt(url.port) || 6379,
          password: url.password || undefined,
          db: url.pathname ? parseInt(url.pathname.slice(1)) : 0,
        };
      } catch (error) {
        logger.warn('Failed to parse REDIS_URL, falling back to individual env vars');
        redisConfig = {
          host: process.env.REDIS_HOST || 'redis',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_DB || '0'),
        };
      }
    } else {
      redisConfig = {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
      };
    }

    const finalRedisConfig = {
      ...redisConfig,
      retryStrategy: (times: number) => Math.min(times * parseInt(process.env.REDIS_RETRY_DELAY || '50'), 2000),
      maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
      commandTimeout: 5000,
      lazyConnect: true, // Don't connect immediately
      enableOfflineQueue: process.env.REDIS_OFFLINE_QUEUE !== 'false',
    };

    logger.info('Configuring Redis cache', {
      host: finalRedisConfig.host,
      port: finalRedisConfig.port,
      db: finalRedisConfig.db
    });

    const redis = new IORedis(finalRedisConfig);

    // Test connection
    await redis.ping();
    logger.info('Redis cache connection successful');

    return {
      type: 'ioredis' as const,
      options: redis,
      duration: 60000, // 1 minute
      ignoreErrors: true,
      alwaysEnabled: true,
    };
  } catch (error) {
    logger.warn('Redis cache unavailable, continuing without cache', { error: error.message });
    return undefined;
  }
}

/**
 * Create complete TypeORM configuration
 */
export async function createTypeOrmConfig(disableCache = false): Promise<DataSourceOptions & PostgresConnectionOptions> {
  const baseConfig = createBaseConfig();
  
  if (disableCache) {
    return baseConfig;
  }

  const cacheConfig = await createCacheConfig();
  
  return {
    ...baseConfig,
    ...(cacheConfig && { cache: cacheConfig }),
  };
}

/**
 * TypeORM DataSource Manager
 * Handles connection lifecycle and provides utilities
 */
export class TypeOrmDataSourceManager {
  private static instance: TypeOrmDataSourceManager;
  private dataSource: DataSource | null = null;
  private initializationPromise: Promise<DataSource> | null = null;

  private constructor() {}

  static getInstance(): TypeOrmDataSourceManager {
    if (!TypeOrmDataSourceManager.instance) {
      TypeOrmDataSourceManager.instance = new TypeOrmDataSourceManager();
    }
    return TypeOrmDataSourceManager.instance;
  }

  /**
   * Initialize DataSource with retry logic
   */
  async initialize(maxRetries = 3, disableCache = false): Promise<DataSource> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization(maxRetries, disableCache);
    return this.initializationPromise;
  }

  private async performInitialization(maxRetries: number, disableCache: boolean): Promise<DataSource> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const config = await createTypeOrmConfig(disableCache);
        
        logger.info('Initializing TypeORM DataSource', {
          attempt: `${attempt}/${maxRetries}`,
          host: config.host,
          port: config.port,
          database: config.database,
          cacheEnabled: !!config.cache
        });

        this.dataSource = new DataSource(config);
        await this.dataSource.initialize();
        
        logger.info('TypeORM DataSource initialized successfully');
        return this.dataSource;
      } catch (error) {
        lastError = error as Error;
        logger.error(`TypeORM initialization failed (attempt ${attempt}/${maxRetries})`, {
          error: error.message
        });

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          logger.info(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.initializationPromise = null;
    throw new Error(`Failed to initialize TypeORM after ${maxRetries} attempts. Last error: ${lastError.message}`);
  }

  /**
   * Get initialized DataSource
   */
  getDataSource(): DataSource {
    if (!this.dataSource?.isInitialized) {
      throw new Error('DataSource is not initialized. Call initialize() first.');
    }
    return this.dataSource;
  }

  /**
   * Close DataSource
   */
  async close(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
      logger.info('TypeORM DataSource closed successfully');
    }
    this.dataSource = null;
    this.initializationPromise = null;
  }

  /**
   * Health check
   */
  async checkHealth(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      driver: string;
      database: string;
      responseTime?: number;
      cacheEnabled?: boolean;
    };
  }> {
    const startTime = Date.now();

    try {
      if (!this.dataSource?.isInitialized) {
        return {
          status: 'unhealthy',
          details: {
            connected: false,
            driver: 'postgres',
            database: process.env.POSTGRES_DB || 'uaip',
            cacheEnabled: false,
          },
        };
      }

      await this.dataSource.query('SELECT 1');
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        details: {
          connected: true,
          driver: 'postgres',
          database: process.env.POSTGRES_DB || 'uaip',
          responseTime,
          cacheEnabled: !!this.dataSource.options.cache,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          driver: 'postgres',
          database: process.env.POSTGRES_DB || 'uaip',
          responseTime: Date.now() - startTime,
          cacheEnabled: false,
        },
      };
    }
  }
}

// Export singleton manager instance
export const dataSourceManager = TypeOrmDataSourceManager.getInstance();

// Legacy exports for backward compatibility
export const initializeDatabase = (maxRetries = 3) => dataSourceManager.initialize(maxRetries);
export const closeDatabase = () => dataSourceManager.close();
export const getDataSource = () => dataSourceManager.getDataSource();
export const checkDatabaseHealth = () => dataSourceManager.checkHealth();

// Create default DataSource for migrations and CLI
export const AppDataSource = new DataSource(await createTypeOrmConfig());
export default AppDataSource; 