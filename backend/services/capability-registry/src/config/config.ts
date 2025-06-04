// Capability Registry Service Configuration
// Uses @uaip/config for shared configuration patterns

import { config as baseConfig } from '@uaip/config';
import { logger } from '@uaip/utils';

export interface CapabilityRegistryConfig {
  port: number;
  postgresql: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  };
  neo4j: {
    uri: string;
    user: string;
    password: string;
    database?: string;
    maxConnectionPoolSize?: number;
    connectionTimeout?: number;
  };
  auth: {
    jwtSecret: string;
    tokenExpiry?: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  tools: {
    defaultExecutionTimeout: number;
    maxConcurrentExecutions: number;
    enableApprovalWorkflow: boolean;
    defaultCostLimit: number;
  };
}

// Load configuration from environment variables with defaults
export const config: CapabilityRegistryConfig = {
  port: parseInt(process.env.PORT || '3003'),
  
  postgresql: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'capability_registry',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'password',
    ssl: process.env.PG_SSL === 'true',
    max: parseInt(process.env.PG_MAX_CONNECTIONS || '20'),
    idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT || '2000')
  },
  
  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
    database: process.env.NEO4J_DATABASE || 'neo4j',
    maxConnectionPoolSize: parseInt(process.env.NEO4J_MAX_CONNECTIONS || '50'),
    connectionTimeout: parseInt(process.env.NEO4J_CONNECTION_TIMEOUT || '5000')
  },
  
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'capability-registry-secret',
    tokenExpiry: process.env.JWT_EXPIRY || '24h'
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'), // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100')
  },
  
  tools: {
    defaultExecutionTimeout: parseInt(process.env.TOOL_EXECUTION_TIMEOUT || '30000'), // 30 seconds
    maxConcurrentExecutions: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '10'),
    enableApprovalWorkflow: process.env.ENABLE_APPROVAL_WORKFLOW === 'true',
    defaultCostLimit: parseFloat(process.env.DEFAULT_COST_LIMIT || '100.0')
  }
};

// Validate required configuration
function validateConfig(): void {
  const required = [
    'postgresql.host',
    'postgresql.database',
    'postgresql.user',
    'postgresql.password',
    'neo4j.uri',
    'neo4j.user',
    'neo4j.password',
    'auth.jwtSecret'
  ];

  for (const path of required) {
    const value = getNestedValue(config, path);
    if (!value) {
      throw new Error(`Missing required configuration: ${path}`);
    }
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Validate configuration on module load
try {
  validateConfig();
  logger.info('Capability Registry configuration loaded successfully');
} catch (error) {
  logger.error('Configuration validation failed:', error);
  process.exit(1);
}

export default config; 