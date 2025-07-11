import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from '@uaip/config';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';
import { createLogger } from '@uaip/utils';
import IORedis from 'ioredis';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
import { ToolAssignment } from '../entities/toolAssignment.entity.js';
import { Artifact } from '../entities/artifact.entity.js';
import { ArtifactReview } from '../entities/artifactReview.entity.js';
import { ArtifactDeployment } from '../entities/artifactDeployment.entity.js';
import { Discussion } from '../entities/discussion.entity.js';
import { DiscussionParticipant } from '../entities/discussionParticipant.entity.js';
import { DiscussionMessage } from '../entities/discussionMessage.entity.js';
import { PersonaAnalytics } from '../entities/personaAnalytics.entity.js';
import { MCPServer } from '../entities/mcpServer.entity.js';
import { MCPToolCall } from '../entities/mcpToolCall.entity.js';
import { KnowledgeItemEntity } from '../entities/knowledge-item.entity.js';
import { KnowledgeRelationshipEntity } from '../entities/knowledge-relationship.entity.js';
import { LLMProvider } from '../entities/llmProvider.entity.js';
import { UserLLMProvider } from '../entities/userLLMProvider.entity.js';
import { IntegrationEventEntity } from '../entities/integrationEvent.entity.js';
import { OAuthProviderEntity } from '../entities/oauthProvider.entity.js';
import { OAuthStateEntity } from '../entities/oauthState.entity.js';
import { AgentOAuthConnectionEntity } from '../entities/agentOAuthConnection.entity.js';
import { MFAChallengeEntity } from '../entities/mfaChallenge.entity.js';
import { SessionEntity } from '../entities/session.entity.js';
import { UserToolPreferences } from '../entities/userToolPreferences.entity.js';
import { UserPreferencesEntity } from '../entities/user-preferences.entity.js';
import { UserContactEntity } from '../entities/user-contact.entity.js';
import { UserMessageEntity } from '../entities/user-message.entity.js';
import { UserPresenceEntity } from '../entities/user-presence.entity.js';
import { ShortLinkEntity } from '../entities/short-link.entity.js';
import { Project, ProjectTask, ProjectToolUsage, ProjectAgent, ProjectWorkflow, TaskExecution } from '../entities/Project.js';
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
  UserLLMProvider,
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
  Project,
  ProjectTask,
  ProjectToolUsage,
  ProjectAgent,
  ProjectWorkflow,
  TaskExecution,
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
    synchronize: true, // Re-enabled to create database schema
    logging: false, //process.env.NODE_ENV === 'development' || process.env.TYPEORM_LOGGING === 'true',
    entities: allEntities,
    subscribers: allSubscribers,
    migrations: [join(__dirname, '..', 'migrations', '*{.ts,.js}')],
    migrationsRun: true, // Enable automatic migrations to fix schema issues
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
/**
 * Redis Cache Manager for TypeORM
 * Handles Redis connection lifecycle and provides proper cleanup
 */
class RedisCacheManager {
  private static instance: RedisCacheManager;
  private redis: IORedis | null = null;
  private isConnected = false;

  private constructor() { }

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
      hasPassword: !!finalRedisConfig.password
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
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis ping timeout')), 5000)
        )
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

/**
 * Check if a query key represents a system query that shouldn't be cached
 */
function isSystemQuery(key: string): boolean {
  if (!key || typeof key !== 'string') return false;

  const lowerKey = key.toLowerCase();

  // System queries that cause hanging during initialization
  const systemPatterns = [
    'select version()',
    'select * from current_schema()',
    'current_schema',
    'information_schema',
    'pg_catalog',
    'show ',
    'create extension',
    'select current_database()',
    'select current_user',
    'select session_user',
    'select user',
    'pg_type',
    'pg_class',
    'pg_namespace',
    'pg_attribute',
    'pg_constraint',
    'pg_index',
    'pg_proc',
    'pg_description'
  ];

  // Check if key contains any system patterns
  for (const pattern of systemPatterns) {
    if (lowerKey.includes(pattern)) {
      return true;
    }
  }

  // Skip very long keys (likely complex system queries)
  if (key.length > 2000) {
    return true;
  }

  // Skip queries that look like schema introspection
  if (lowerKey.includes('table_schema') ||
    lowerKey.includes('column_name') ||
    lowerKey.includes('constraint_name') ||
    lowerKey.includes('pg_stat_') ||
    lowerKey.includes('pg_settings')) {
    return true;
  }

  return false;
}

async function createCacheConfig(): Promise<any | undefined> {
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

  private constructor() { }

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
        } catch (error) {
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

// Cache utility exports
export const getCacheManager = () => redisCacheManager;
export const getCacheConnection = () => redisCacheManager.getConnection();
export const isCacheHealthy = () => redisCacheManager.isHealthy();

// Create default DataSource for migrations and CLI
// Note: This will be initialized lazily to avoid top-level await
let _appDataSource: DataSource | null = null;

export const getAppDataSource = async (): Promise<DataSource> => {
  if (!_appDataSource) {
    const config = await createTypeOrmConfig();
    _appDataSource = new DataSource(config);
  }
  return _appDataSource;
};

// Legacy export for backward compatibility (will be initialized lazily)
export const AppDataSource = new Proxy({} as DataSource, {
  get(target, prop) {
    throw new Error('AppDataSource must be initialized first. Use getAppDataSource() instead.');
  }
});

export default AppDataSource; 