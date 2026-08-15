// Capability Registry Service Configuration
// Extends @uaip/config for shared configuration patterns

import { config as baseConfig, Config } from '@uaip/config';
import { createLogger, ValidationError } from '@uaip/utils';

// Initialize logger for this service
const logger = createLogger({
  serviceName: 'capability-registry-config',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

// Service-specific configuration extensions
export interface CapabilityRegistrySpecificConfig {
  tools: {
    defaultExecutionTimeout: number;
    maxConcurrentExecutions: number;
    enableApprovalWorkflow: boolean;
    defaultCostLimit: number;
  };
  // Hybrid Execution Mesh (spec 11). OFF by default; when off the legacy
  // in-process executor path is unchanged.
  execMesh: {
    enabled: boolean;
    maxConcurrentPerRuntime: number;
    heartbeatTimeoutMs: number;
    // Phase 2 — Cloudflare exec-worker (light tier). When workerUrl is empty no
    // worker-cf node is registered and worker-runtime tools fall back to native.
    workerUrl: string;
    workerSecret: string;
  };
}

// Combined configuration interface
export interface CapabilityRegistryConfig extends Config {
  tools: CapabilityRegistrySpecificConfig['tools'];
  execMesh: CapabilityRegistrySpecificConfig['execMesh'];
}

// Service-specific configuration values
const serviceSpecificConfig: CapabilityRegistrySpecificConfig = {
  tools: {
    defaultExecutionTimeout: parseInt(process.env.TOOL_EXECUTION_TIMEOUT || '30000'), // 30 seconds
    maxConcurrentExecutions: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '10'),
    // NOT a kill switch for the danger-tool gate. Dangerous tools are refused
    // without approval regardless of this value; it only decides whether the
    // refusal also raises a reviewable tool.approval.required request.
    enableApprovalWorkflow: process.env.ENABLE_APPROVAL_WORKFLOW === 'true',
    defaultCostLimit: parseFloat(process.env.DEFAULT_COST_LIMIT || '100.0'),
  },
  execMesh: {
    // Feature flag — default OFF. Only 'true' enables the mesh routing path.
    enabled: process.env.FEATURE_EXEC_MESH === 'true',
    maxConcurrentPerRuntime: parseInt(process.env.EXEC_MESH_MAX_CONCURRENT || '100'),
    heartbeatTimeoutMs: parseInt(process.env.EXEC_MESH_HEARTBEAT_INTERVAL_MS || '10000'),
    // Empty by default → no worker-cf node registered → native fallback (unchanged).
    workerUrl: process.env.EXEC_WORKER_URL || '',
    workerSecret: process.env.EXEC_WORKER_SECRET || '',
  },
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
    serviceName: 'capability-registry',
  },
};

// Validate service-specific required configuration
function validateConfig(): void {
  const required = ['database.neo4j.uri', 'database.neo4j.user', 'database.neo4j.password'];

  for (const path of required) {
    const value = getNestedValue(config, path);
    if (!value) {
      throw new ValidationError(`Missing required configuration: ${path}`);
    }
  }

  // Shared config validation is handled by @uaip/config
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, obj);
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
