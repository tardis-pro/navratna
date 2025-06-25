// Capability Registry Service Configuration
// Extends @uaip/config for shared configuration patterns

import { config as baseConfig, Config } from '@uaip/config';
import { createLogger } from '@uaip/utils';

// Initialize logger for this service
const logger = createLogger({
  serviceName: 'capability-registry-config',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info'
});

// Service-specific configuration extensions
export interface CapabilityRegistrySpecificConfig {
  tools: {
    defaultExecutionTimeout: number;
    maxConcurrentExecutions: number;
    enableApprovalWorkflow: boolean;
    defaultCostLimit: number;
  };
}

// Combined configuration interface
export interface CapabilityRegistryConfig extends Config {
  tools: CapabilityRegistrySpecificConfig['tools'];
}

// Service-specific configuration values
const serviceSpecificConfig: CapabilityRegistrySpecificConfig = {
  tools: {
    defaultExecutionTimeout: parseInt(process.env.TOOL_EXECUTION_TIMEOUT || '30000'), // 30 seconds
    maxConcurrentExecutions: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '10'),
    enableApprovalWorkflow: process.env.ENABLE_APPROVAL_WORKFLOW === 'true',
    defaultCostLimit: parseFloat(process.env.DEFAULT_COST_LIMIT || '100.0')
  }
};

// Compose final configuration by extending shared config
export const config: CapabilityRegistryConfig = {
  ...baseConfig,
  // Override port for this service
  port: parseInt(process.env.PORT || '3003'),
  // Add service-specific configurations
  ...serviceSpecificConfig,
  // Override logging service name
  logging: {
    ...baseConfig.logging,
    serviceName: 'capability-registry'
  }
};

// Validate service-specific required configuration
function validateConfig(): void {
  const required = [
    'database.neo4j.uri',
    'database.neo4j.user',
    'database.neo4j.password'
  ];

  for (const path of required) {
    const value = getNestedValue(config, path);
    if (!value) {
      throw new Error(`Missing required configuration: ${path}`);
    }
  }
  
  // Shared config validation is handled by @uaip/config
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