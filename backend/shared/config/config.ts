import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
console.log( path.resolve(__dirname, '../../../.env'));
export interface DatabaseConfig {
  postgres: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl: boolean;
    maxConnections: number;
  };
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  enableOfflineQueue: boolean;
}

export interface StateConfig {
  compressionEnabled: boolean;
  maxCheckpointSize: number;
  checkpointRetentionDays: number;
  cacheTimeout: number;
}

export interface TimeoutConfig {
  database: number;
  api: number;
  external: number;
}

export interface LoggingConfig {
  level: string;
  enableDetailedLogging: boolean;
  serviceName: string;
  environment: string;
  version?: string;
}

export interface ExecutionConfig {
  operationTimeoutMax: number;
  stepTimeoutMax: number;
  maxConcurrentOperations: number;
  maxRetryAttempts: number;
  cleanupOrphanedOperationsInterval: number;
  checkpointInterval: number;
  resourceMonitoringInterval: number;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  standardHeaders: boolean;
  legacyHeaders: boolean;
}

export interface MonitoringConfig {
  metricsEnabled: boolean;
}

export interface AppConfig {
  version: string;
}

export interface Config {
  database: DatabaseConfig;
  redis: RedisConfig;
  state: StateConfig;
  timeouts: TimeoutConfig;
  logging: LoggingConfig;
  execution: ExecutionConfig;
  rateLimit: RateLimitConfig;
  monitoring: MonitoringConfig;
  app: AppConfig;
  port: number;
  environment: string;
  
  getExecutionConfig(): ExecutionConfig;
  getRedisConfig(): RedisConfig;
  getStateConfig(): StateConfig;
}
console.log(process.env);

// Parse POSTGRES_URL if provided
function parsePostgresUrl(url?: string) {
  if (!url) {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'council_nycea'
    };
  }

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 5432,
      user: parsed.username,
      password: parsed.password,
      database: parsed.pathname.slice(1) // Remove leading slash
    };
  } catch (error) {
    console.error('Failed to parse POSTGRES_URL:', error);
    return {
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'password',
      database: 'council_nycea'
    };
  }
}

// Parse REDIS_URL if provided
function parseRedisUrl(url?: string) {
  if (!url) {
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0')
    };
  }

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 6379,
      password: parsed.password || undefined,
      db: parsed.pathname ? parseInt(parsed.pathname.slice(1)) || 0 : 0
    };
  } catch (error) {
    console.error('Failed to parse REDIS_URL:', error);
    return {
      host: 'localhost',
      port: 6379,
      password: undefined,
      db: 0
    };
  }
}

const postgresConfig = parsePostgresUrl(process.env.POSTGRES_URL);
const redisConfig = parseRedisUrl(process.env.REDIS_URL);

// Default configuration
const defaultConfig: Config = {
  database: {
    postgres: {
      host: postgresConfig.host,
      port: postgresConfig.port,
      user: postgresConfig.user,
      password: postgresConfig.password,
      database: postgresConfig.database,
      ssl: process.env.DB_SSL === 'true',
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20')
    }
  },
  redis: {
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    db: redisConfig.db,
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
    retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100'),
    enableOfflineQueue: process.env.REDIS_OFFLINE_QUEUE !== 'false'
  },
  state: {
    compressionEnabled: process.env.STATE_COMPRESSION === 'true',
    maxCheckpointSize: parseInt(process.env.MAX_CHECKPOINT_SIZE || '10485760'), // 10MB
    checkpointRetentionDays: parseInt(process.env.CHECKPOINT_RETENTION_DAYS || '7'),
    cacheTimeout: parseInt(process.env.STATE_CACHE_TIMEOUT || '3600') // 1 hour
  },
  timeouts: {
    database: parseInt(process.env.DB_TIMEOUT || '30000'),
    api: parseInt(process.env.API_TIMEOUT || '30000'),
    external: parseInt(process.env.EXTERNAL_TIMEOUT || '60000')
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableDetailedLogging: process.env.DETAILED_LOGGING === 'true',
    serviceName: process.env.SERVICE_NAME || 'shared-service',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.SERVICE_VERSION || '1.0.0'
  },
  execution: {
    operationTimeoutMax: parseInt(process.env.OPERATION_TIMEOUT_MAX || '3600000'), // 1 hour
    stepTimeoutMax: parseInt(process.env.STEP_TIMEOUT_MAX || '300000'), // 5 minutes
    maxConcurrentOperations: parseInt(process.env.MAX_CONCURRENT_OPERATIONS || '10'),
    maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
    cleanupOrphanedOperationsInterval: parseInt(process.env.CLEANUP_INTERVAL || '300000'), // 5 minutes
    checkpointInterval: parseInt(process.env.CHECKPOINT_INTERVAL || '60000'), // 1 minute
    resourceMonitoringInterval: parseInt(process.env.RESOURCE_MONITORING_INTERVAL || '10000') // 10 seconds
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    standardHeaders: process.env.RATE_LIMIT_STANDARD_HEADERS !== 'false',
    legacyHeaders: process.env.RATE_LIMIT_LEGACY_HEADERS === 'true'
  },
  monitoring: {
    metricsEnabled: process.env.METRICS_ENABLED !== 'false'
  },
  app: {
    version: process.env.SERVICE_VERSION || '1.0.0'
  },
  port: parseInt(process.env.PORT || '3000'),
  environment: process.env.NODE_ENV || 'development',
  
  getExecutionConfig(): ExecutionConfig {
    return this.execution;
  },
  
  getRedisConfig(): RedisConfig {
    return this.redis;
  },
  
  getStateConfig(): StateConfig {
    return this.state;
  }
};

export const config = defaultConfig; 