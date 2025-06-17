import dotenv from 'dotenv';
import path from 'path';
// import { fileURLToPath } from 'url';

// Get the directory of this module
// const __filename = fileURLToPath(import.meta.url);

const __dirname = '/app/';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Debug environment variable loading
console.log('🔧 Config Debug Info:');
console.log('- __dirname:', __dirname);
console.log('- .env path:', path.resolve(__dirname, '.env'));
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- SERVICE_NAME:', process.env.SERVICE_NAME);
console.log('- POSTGRES_URL:', process.env.POSTGRES_URL ? 'SET' : 'NOT SET');
console.log('- NEO4J_URL:', process.env.NEO4J_URL ? 'SET' : 'NOT SET');
console.log('- REDIS_URL:', process.env.REDIS_URL ? 'SET' : 'NOT SET');
console.log('- RABBITMQ_URL:', process.env.RABBITMQ_URL ? 'SET' : 'NOT SET');

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
  neo4j: {
    uri: string;
    user: string;
    password: string;
    database?: string;
    maxConnectionPoolSize?: number;
    connectionTimeout?: number;
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

export interface ServicesConfig {
  agentIntelligence: {
    port: number;
    url: string;
  };
  orchestrationPipeline: {
    port: number;
    url: string;
  };
  capabilityRegistry: {
    port: number;
    url: string;
  };
  discussionOrchestration: {
    port: number;
    url: string;
  };
  securityGateway: {
    port: number;
    url: string;
  };
  artifactService: {
    port: number;
    url: string;
  };
}


  type Unit =
      | "Years"
      | "Year"
      | "Yrs"
      | "Yr"
      | "Y"
      | "Weeks"
      | "Week"
      | "W"
      | "Days"
      | "Day"
      | "D"
      | "Hours"
      | "Hour"
      | "Hrs"
      | "Hr"
      | "H"
      | "Minutes"
      | "Minute"
      | "Mins"
      | "Min"
      | "M"
      | "Seconds"
      | "Second"
      | "Secs"
      | "Sec"
      | "s"
      | "Milliseconds"
      | "Millisecond"
      | "Msecs"
      | "Msec"
      | "Ms";

  type UnitAnyCase = Unit | Uppercase<Unit> | Lowercase<Unit>;

  type StringValue =
      | `${number}`
      | `${number}${UnitAnyCase}`
      | `${number} ${UnitAnyCase}`;


const fullString = (value: string | undefined) => {
  return value as StringValue;
}
export interface CorsConfig {
  allowedOrigins: string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshExpiresIn: StringValue;
  issuer: string;
  audience: string;
  accessTokenExpiry: StringValue;
  refreshSecret: string;
  refreshTokenExpiry: StringValue;
}

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  // SMTP configuration used by security gateway
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
  };
}

export interface FrontendConfig {
  url: string;
  resetPasswordPath: string;
  verifyEmailPath: string;
  // Base URL used by security gateway
  baseUrl: string;
}

export interface NotificationsConfig {
  enabled: boolean;
  channels: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  retryAttempts: number;
  retryDelay: number;
  // Additional properties used by security gateway
  webhook?: {
    url: string;
    secret: string;
  };
  sms?: {
    provider: string;
  };
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
  services: ServicesConfig;
  cors: CorsConfig;
  jwt: JwtConfig;
  email: EmailConfig;
  frontend: FrontendConfig;
  notifications: NotificationsConfig;
  port: number;
  environment: string;
  
  getExecutionConfig(): ExecutionConfig;
  getRedisConfig(): RedisConfig;
  getStateConfig(): StateConfig;
}

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

// Parse NEO4J_URL if provided
function parseNeo4jUrl(url?: string) {
  if (!url) {
    return {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      user: process.env.NEO4J_USER || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
      database: process.env.NEO4J_DATABASE || 'neo4j'
    };
  }

  try {
    const parsed = new URL(url);
    return {
      uri: `${parsed.protocol}//${parsed.host}`,
      // If URL has credentials, use them; otherwise fall back to env vars
      user: parsed.username || process.env.NEO4J_USER || 'neo4j',
      password: parsed.password || process.env.NEO4J_PASSWORD || 'password',
      database: parsed.pathname ? parsed.pathname.slice(1) : (process.env.NEO4J_DATABASE || 'neo4j')
    };
  } catch (error) {
    console.error('Failed to parse NEO4J_URL:', error);
    return {
      uri: 'bolt://localhost:7687',
      user: 'neo4j',
      password: 'password',
      database: 'neo4j'
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
      db: parsed.pathname ? parseInt(parsed.pathname.slice(1)) : 0
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
const neo4jConfig = parseNeo4jUrl(process.env.NEO4J_URL);

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
    },
    neo4j: {
      uri: neo4jConfig.uri,
      user: neo4jConfig.user,
      password: neo4jConfig.password,
      database: neo4jConfig.database,
      maxConnectionPoolSize: parseInt(process.env.NEO4J_MAX_CONNECTIONS || '50'),
      connectionTimeout: parseInt(process.env.NEO4J_CONNECTION_TIMEOUT || '5000')
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
  services: {
    agentIntelligence: {
      port: parseInt(process.env.AGENT_INTELLIGENCE_PORT || '3001'),
      url: process.env.AGENT_INTELLIGENCE_URL || 'http://localhost:3001'
    },
    orchestrationPipeline: {
      port: parseInt(process.env.ORCHESTRATION_PIPELINE_PORT || '3002'),
      url: process.env.ORCHESTRATION_PIPELINE_URL || 'http://localhost:3002'
    },
    capabilityRegistry: {
      port: parseInt(process.env.CAPABILITY_REGISTRY_PORT || '3003'),
      url: process.env.CAPABILITY_REGISTRY_URL || 'http://localhost:3003'
    },
    discussionOrchestration: {
      port: parseInt(process.env.DISCUSSION_ORCHESTRATION_PORT || '3005'),
      url: process.env.DISCUSSION_ORCHESTRATION_URL || 'http://localhost:3005'
    },
    securityGateway: {
      port: parseInt(process.env.SECURITY_GATEWAY_PORT || '3004'),
      url: process.env.SECURITY_GATEWAY_URL || 'http://localhost:3004'
    },
    artifactService: {
      port: parseInt(process.env.ARTIFACT_SERVICE_PORT || '3006'),
      url: process.env.ARTIFACT_SERVICE_URL || 'http://localhost:3006'
    }
  },
  cors: {
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:8080'],
    credentials: process.env.CORS_CREDENTIALS !== 'false',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'uaip_dev_jwt_secret_key_change_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshExpiresIn: fullString(process.env.JWT_REFRESH_EXPIRES_IN) || '1h',
    issuer: process.env.JWT_ISSUER || 'uaip-security-gateway',
    audience: process.env.JWT_AUDIENCE || 'uaip-services',
    accessTokenExpiry: fullString(process.env.JWT_ACCESS_TOKEN_EXPIRY) || '1h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'uaip_dev_jwt_refresh_secret_key_change_in_production',
    refreshTokenExpiry: fullString(process.env.JWT_REFRESH_TOKEN_EXPIRY) || '2h'
  },
  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'noreply@uaip.dev'
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
    resetPasswordPath: process.env.FRONTEND_RESET_PASSWORD_PATH || '/reset-password',
    verifyEmailPath: process.env.FRONTEND_VERIFY_EMAIL_PATH || '/verify-email',
    // Base URL used by security gateway
    baseUrl: process.env.FRONTEND_BASE_URL || 'http://localhost:3000'
  },
  notifications: {
    enabled: process.env.NOTIFICATIONS_ENABLED !== 'false',
    channels: {
      email: process.env.NOTIFICATIONS_EMAIL !== 'false',
      push: process.env.NOTIFICATIONS_PUSH === 'true',
      sms: process.env.NOTIFICATIONS_SMS === 'true'
    },
    retryAttempts: parseInt(process.env.NOTIFICATIONS_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.NOTIFICATIONS_RETRY_DELAY || '5000'),
    // Additional properties used by security gateway
    webhook: process.env.NOTIFICATIONS_WEBHOOK_URL ? {
      url: process.env.NOTIFICATIONS_WEBHOOK_URL,
      secret: process.env.NOTIFICATIONS_WEBHOOK_SECRET || ''
    } : undefined,
    sms: process.env.NOTIFICATIONS_SMS_PROVIDER ? {
      provider: process.env.NOTIFICATIONS_SMS_PROVIDER
    } : undefined
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