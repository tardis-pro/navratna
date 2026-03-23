import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from '@uaip/config';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { createLogger } from '@uaip/utils';
import IORedis from 'ioredis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import all entities directly
import { Agent } from '../entities/agent.entity';
import { Operation } from '../entities/operation.entity';
import { Persona } from '../entities/persona.entity';
import { UserEntity } from '../entities/user.entity';
import { RefreshTokenEntity } from '../entities/refreshToken.entity';
import { PasswordResetTokenEntity } from '../entities/passwordResetToken.entity';
import { AgentCapabilityMetric } from '../entities/agentCapabilityMetric.entity';
import { AgentActivity } from '../entities/agent-activity.entity';
import { AgentLearningRecord } from '../entities/agent-learning-record.entity';
import { ToolUsageRecord } from '../entities/toolUsageRecord.entity';
import { ConversationContext } from '../entities/conversationContext.entity';
import { OperationState } from '../entities/operationState.entity';
import { OperationCheckpoint } from '../entities/operationCheckpoint.entity';
import { StepResult } from '../entities/stepResult.entity';
import { ApprovalWorkflow } from '../entities/approvalWorkflow.entity';
import { ApprovalDecision } from '../entities/approvalDecision.entity';
import { AuditEvent } from '../entities/auditEvent.entity';
import { SecurityPolicy } from '../entities/securityPolicy.entity';
import { ToolDefinition } from '../entities/toolDefinition.entity';
import { ToolExecution } from '../entities/toolExecution.entity';
import { ToolAssignment } from '../entities/toolAssignment.entity';
import { Artifact } from '../entities/artifact.entity';
import { ArtifactReview } from '../entities/artifactReview.entity';
import { ArtifactDeployment } from '../entities/artifactDeployment.entity';
import { Discussion } from '../entities/discussion.entity';
import { DiscussionParticipant } from '../entities/discussionParticipant.entity';
import { DiscussionMessage } from '../entities/discussionMessage.entity';
import { PersonaAnalytics } from '../entities/personaAnalytics.entity';
import { MCPServer } from '../entities/mcpServer.entity';
import { MCPToolCall } from '../entities/mcpToolCall.entity';
import { KnowledgeItemEntity } from '../entities/knowledge-item.entity';
import { KnowledgeRelationshipEntity } from '../entities/knowledge-relationship.entity';
import { LLMProvider } from '../entities/llmProvider.entity';
import { LLMModel } from '../entities/llmModel.entity';
import { UserLLMProvider } from '../entities/userLLMProvider.entity';
import { UserLLMPreference } from '../entities/userLLMPreference.entity';
import { AgentLLMPreference } from '../entities/agentLLMPreference.entity';
import { IntegrationEventEntity } from '../entities/integrationEvent.entity';
import { OAuthProviderEntity } from '../entities/oauthProvider.entity';
import { OAuthStateEntity } from '../entities/oauthState.entity';
import { AgentOAuthConnectionEntity } from '../entities/agentOAuthConnection.entity';
import { MFAChallengeEntity } from '../entities/mfaChallenge.entity';
import { SessionEntity } from '../entities/session.entity';
import { UserToolPreferences } from '../entities/userToolPreferences.entity';
import { UserPreferencesEntity } from '../entities/user-preferences.entity';
import { UserContactEntity } from '../entities/user-contact.entity';
import { UserMessageEntity } from '../entities/user-message.entity';
import { UserPresenceEntity } from '../entities/user-presence.entity';
import { ShortLinkEntity } from '../entities/short-link.entity';
import { ProjectEntity } from '../entities/project.entity';
import { ProjectMemberEntity } from '../entities/project-member.entity';
import { ProjectFileEntity } from '../entities/project-file.entity';
import { TaskEntity } from '../entities/task.entity';
import { MCPServerSubscriber } from '../subscribers/MCPServerSubscriber';
import { MCPToolCallSubscriber } from '../subscribers/MCPToolCallSubscriber';

/**
 * TypeORM Configuration for UAIP Backend
 * Clean, centralized database configuration
 */

// Initialize logger for database operations
const logger = createLogger({
  serviceName: 'typeorm-config',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
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
  AgentActivity,
  AgentLearningRecord,
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
  ToolAssignment,
  Artifact,
  ArtifactReview,
  ArtifactDeployment,
  Discussion,
  DiscussionParticipant,
  DiscussionMessage,
  PersonaAnalytics,
  MCPServer,
  MCPToolCall,
  KnowledgeItemEntity,
  KnowledgeRelationshipEntity,
  LLMProvider,
  LLMModel,
  UserLLMProvider,
  UserLLMPreference,
  AgentLLMPreference,
  IntegrationEventEntity,
  OAuthProviderEntity,
  OAuthStateEntity,
  AgentOAuthConnectionEntity,
  MFAChallengeEntity,
  SessionEntity,
  UserToolPreferences,
  UserPreferencesEntity,
  UserContactEntity,
  UserMessageEntity,
  UserPresenceEntity,
  ShortLinkEntity,
  // Note: Using new ProjectEntity system instead of legacy Project.ts entities
  // Legacy entities commented out to avoid duplicate table mapping
  // Project, ProjectTask, ProjectToolUsage, ProjectAgent, ProjectWorkflow, TaskExecution
  // New Project System entities
  ProjectEntity,
  ProjectMemberEntity,
  ProjectFileEntity,
  TaskEntity,
];

// All subscribers array
export const allSubscribers = [MCPServerSubscriber, MCPToolCallSubscriber];

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
        database: url.pathname.slice(1), // Remove leading slash
      };
    } catch {
      logger.warn('Failed to parse POSTGRES_URL, falling back to individual env vars');
      dbConfig = {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        username: process.env.POSTGRES_USER || 'uaip_user',
        password: process.env.POSTGRES_PASSWORD || 'uaip_password',
        database: process.env.POSTGRES_DB || 'uaip',
      };
    }
  } else {
    dbConfig = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      username: process.env.POSTGRES_USER || 'uaip_user',
      password: process.env.POSTGRES_PASSWORD || 'uaip_password',
      database: process.env.POSTGRES_DB || 'uaip',
    };
  }

  return {
    type: 'postgres',
    ...dbConfig,
    synchronize: false, // Enable for development - creates schema automatically
    dropSchema: false, // Don't drop schema on startup
    logging:
      process.env.NODE_ENV === 'development' ? ['error', 'warn', 'schema'] : ['error', 'warn'],
    entities: allEntities,
    subscribers: allSubscribers,
    migrations: [join(__dirname, '..', 'migrations', '*{.ts,.js}')],
    migrationsRun: false, // Disabled - using synchronize instead; migrations have type errors
    ssl:
      process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    maxQueryExecutionTime: parseInt(process.env.DB_TIMEOUT || '30000'),
    extra: {
      max: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
      connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT || '30000'),
    },
  };
}

/**
 * Create Redis cache configuration if available
 */
/**
 * Redis Cache Manager for TypeORM
 * Handles Redis connection lifecycle and provides proper cleanup
 */
class RedisCacheManager {
  private static instance: RedisCacheManager;
  private redis: IORedis | null = null;
  private isConnected = false;

  private constructor() {}

  static getInstance(): RedisCacheManager {
    if (!RedisCacheManager.instance) {
      RedisCacheManager.instance = new RedisCacheManager();
    }
    return RedisCacheManager.instance;
  }

  async createConnection(): Promise<IORedis> {
    if (this.redis && this.isConnected) {
      return this.redis;
    }

    const redisConfig = config.redis;

    const finalRedisConfig = {
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * redisConfig.retryDelayOnFailover, 2000);
        logger.info(`Redis retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
      maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
      commandTimeout: 5000,
      connectTimeout: 10000,
      lazyConnect: true,
      enableOfflineQueue: redisConfig.enableOfflineQueue,
      keepAlive: 30000,
      family: 4, // Force IPv4
    };

    logger.info('Creating Redis cache connection', {
      host: finalRedisConfig.host,
      port: finalRedisConfig.port,
      db: finalRedisConfig.db,
      hasPassword: !!finalRedisConfig.password,
    });

    this.redis = new IORedis(finalRedisConfig);

    // Set up event handlers
    this.redis.on('connect', () => {
      logger.info('Redis cache connected');
      this.isConnected = true;
    });

    this.redis.on('ready', () => {
      logger.info('Redis cache ready');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis cache error', { error: error.message });
      this.isConnected = false;
    });

    this.redis.on('close', () => {
      logger.info('Redis cache connection closed');
      this.isConnected = false;
    });

    this.redis.on('reconnecting', () => {
      logger.info('Redis cache reconnecting...');
    });

    // Test connection with timeout
    try {
      await Promise.race([
        this.redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis ping timeout')), 5000)),
      ]);

      this.isConnected = true;
      logger.info('Redis cache connection verified');
      return this.redis;
    } catch (error) {
      logger.error('Redis cache connection failed', { error: error.message });
      await this.closeConnection();
      throw error;
    }
  }

  async closeConnection(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
        logger.info('Redis cache connection closed gracefully');
      } catch (error) {
        logger.warn('Error closing Redis cache connection', { error: error.message });
        this.redis.disconnect();
      }
      this.redis = null;
      this.isConnected = false;
    }
  }

  getConnection(): IORedis | null {
    return this.redis;
  }

  isHealthy(): boolean {
    return this.isConnected && this.redis !== null;
  }
}

// Global cache manager instance
const redisCacheManager = RedisCacheManager.getInstance();


async function createCacheConfig(): Promise<Record<string, unknown> | undefined> {
  // Skip cache if explicitly disabled or in migration mode
  if (process.env.TYPEORM_DISABLE_CACHE === 'true' || process.env.NODE_ENV === 'migration') {
    logger.info('Redis cache disabled via environment variables');
    return undefined;
  }

  // Temporarily disable cache to prevent hanging during initialization
  // TODO: Re-enable once we solve the system query caching issue
  logger.info('Redis cache temporarily disabled to prevent initialization hanging');
  return undefined;

  /*
  try {
    // Create Redis connection through cache manager
    const redis = await redisCacheManager.createConnection();

    // Create a smart Redis wrapper that filters problematic queries
    const smartRedis = {
      ...redis,
      
      // Override get to filter system queries
      get: async function(key: string) {
        logger.debug('Cache GET attempt', { key: key.substring(0, 100) });
        if (isSystemQuery(key)) {
          logger.debug('Skipping cache GET for system query', { key: key.substring(0, 100) });
          return null; // Force cache miss for system queries
        }
        return redis.get.call(this, key);
      },
      
      // Override set to filter system queries  
      set: async function(key: string, value: any, ...args: any[]) {
        logger.debug('Cache SET attempt', { key: key.substring(0, 100) });
        if (isSystemQuery(key)) {
          logger.debug('Skipping cache SET for system query', { key: key.substring(0, 100) });
          return 'OK'; // Pretend it worked
        }
        return redis.set.call(this, key, value, ...args);
      },
      
      // Override setex to filter system queries
      setex: async function(key: string, seconds: number, value: any) {
        logger.debug('Cache SETEX attempt', { key: key.substring(0, 100) });
        if (isSystemQuery(key)) {
          logger.debug('Skipping cache SETEX for system query', { key: key.substring(0, 100) });
          return 'OK';
        }
        return redis.setex.call(this, key, seconds, value);
      }
    };

    const cacheConfig = {
      type: 'redis' as const,
      options: smartRedis,
      duration: parseInt(process.env.TYPEORM_CACHE_DURATION || '60000'), // Default 1 minute
      ignoreErrors: true, // Don't fail queries if cache fails
      alwaysEnabled: false, // Only cache when explicitly requested via .cache()
    };

    logger.info('Redis cache configured for TypeORM with smart filtering', {
      duration: cacheConfig.duration,
      ignoreErrors: cacheConfig.ignoreErrors,
      alwaysEnabled: cacheConfig.alwaysEnabled
    });

    return cacheConfig;
  } catch (error) {
    logger.warn('Redis cache unavailable, continuing without cache', { 
      error: error.message,
      stack: error.stack 
    });
    return undefined;
  }
  */
}

/**
 * Create complete TypeORM configuration
 */
export async function createTypeOrmConfig(
  disableCache = false
): Promise<DataSourceOptions & PostgresConnectionOptions> {
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

  private async performInitialization(
    maxRetries: number,
    disableCache: boolean
  ): Promise<DataSource> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        const dsConfig = await createTypeOrmConfig(disableCache);

        logger.info('Initializing TypeORM DataSource', {
          attempt: `${attempt}/${maxRetries}`,
          host: dsConfig.host,
          port: dsConfig.port,
          database: dsConfig.database,
          cacheEnabled: !!dsConfig.cache,
        });

        this.dataSource = new DataSource(dsConfig);
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        await this.dataSource.initialize();

        logger.info('TypeORM DataSource initialized successfully');
        return this.dataSource;
      } catch (error) {
        lastError = error as Error;
        logger.error(`TypeORM initialization failed (attempt ${attempt}/${maxRetries})`, {
          error: error.message,
        });

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          logger.info(`Retrying in ${delay}ms...`);
          // oxlint-disable-next-line no-await-in-loop -- sequential processing required
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    this.initializationPromise = null;
    throw new Error(
      `Failed to initialize TypeORM after ${maxRetries} attempts. Last error: ${lastError.message}`
    );
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

    // Close Redis cache connection
    await redisCacheManager.closeConnection();

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
      cacheHealthy?: boolean;
    };
  }> {
    const startTime = Date.now();

    try {
      if (!this.dataSource?.isInitialized) {
        // Try to initialize the DataSource if not already done
        try {
          await this.initialize();
          if (!this.dataSource?.isInitialized) {
            return {
              status: 'unhealthy',
              details: {
                connected: false,
                driver: 'postgres',
                database: process.env.POSTGRES_DB || 'uaip',
                cacheEnabled: false,
                cacheHealthy: false,
              },
            };
          }
        } catch {
          return {
            status: 'unhealthy',
            details: {
              connected: false,
              driver: 'postgres',
              database: process.env.POSTGRES_DB || 'uaip',
              cacheEnabled: false,
              cacheHealthy: false,
            },
          };
        }
      }

      await this.dataSource.query('SELECT 1');
      const responseTime = Date.now() - startTime;
      const cacheEnabled = !!this.dataSource.options.cache;
      const cacheHealthy = cacheEnabled ? redisCacheManager.isHealthy() : false;

      return {
        status: 'healthy',
        details: {
          connected: true,
          driver: 'postgres',
          database: process.env.POSTGRES_DB || 'uaip',
          responseTime,
          cacheEnabled,
          cacheHealthy,
        },
      };
    } catch {
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

// Cache utility exports
export const getCacheManager = () => redisCacheManager;
export const getCacheConnection = () => redisCacheManager.getConnection();
export const isCacheHealthy = () => redisCacheManager.isHealthy();

// Create default DataSource for migrations and CLI
// Note: This will be initialized lazily to avoid top-level await
let _appDataSource: DataSource | null = null;

export const getAppDataSource = async (): Promise<DataSource> => {
  if (!_appDataSource) {
    const dsConfig = await createTypeOrmConfig();
    _appDataSource = new DataSource(dsConfig);
  }
  return _appDataSource;
};

// Legacy export for backward compatibility (will be initialized lazily)
export const AppDataSource = new Proxy({} as DataSource, {
  get(_target, _prop) {
    throw new Error('AppDataSource must be initialized first. Use getAppDataSource() instead.');
  },
});

export default AppDataSource;
