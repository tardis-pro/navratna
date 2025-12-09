import { z } from 'zod';
import { BaseEntitySchema, IDSchema, HealthCheckSchema } from './common.js';

// System health status
export enum HealthStatusLevel {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  CRITICAL = 'critical',
}

export const HealthStatusSchema = z.object({
  status: z.nativeEnum(HealthStatusLevel),
  version: z.string(),
  uptime: z.number().min(0), // seconds
  timestamp: z.date(),
  environment: z.string().optional(),
  services: z.array(HealthCheckSchema).default([]),
  dependencies: z.array(HealthCheckSchema).default([]),
  resources: z
    .object({
      memory: z
        .object({
          used: z.number().min(0),
          total: z.number().min(0),
          percentage: z.number().min(0).max(100),
        })
        .optional(),
      cpu: z
        .object({
          usage: z.number().min(0).max(100),
          load: z.array(z.number()).optional(),
        })
        .optional(),
      disk: z
        .object({
          used: z.number().min(0),
          total: z.number().min(0),
          percentage: z.number().min(0).max(100),
        })
        .optional(),
    })
    .optional(),
  metadata: z.record(z.any()).optional(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

// System metrics
export const SystemMetricsSchema = z.object({
  timestamp: z.date(),
  system: z.object({
    uptime: z.number().min(0),
    version: z.string(),
    environment: z.string(),
    nodeVersion: z.string().optional(),
    platform: z.string().optional(),
    architecture: z.string().optional(),
  }),
  performance: z.object({
    cpu: z.object({
      usage: z.number().min(0).max(100),
      load: z.array(z.number()).optional(),
      cores: z.number().min(1).optional(),
    }),
    memory: z.object({
      used: z.number().min(0),
      total: z.number().min(0),
      free: z.number().min(0),
      percentage: z.number().min(0).max(100),
      heap: z
        .object({
          used: z.number().min(0),
          total: z.number().min(0),
        })
        .optional(),
    }),
    disk: z
      .object({
        used: z.number().min(0),
        total: z.number().min(0),
        free: z.number().min(0),
        percentage: z.number().min(0).max(100),
      })
      .optional(),
    network: z
      .object({
        bytesIn: z.number().min(0),
        bytesOut: z.number().min(0),
        packetsIn: z.number().min(0),
        packetsOut: z.number().min(0),
      })
      .optional(),
  }),
  application: z.object({
    activeConnections: z.number().min(0),
    totalRequests: z.number().min(0),
    requestsPerSecond: z.number().min(0),
    averageResponseTime: z.number().min(0),
    errorRate: z.number().min(0).max(100),
    activeUsers: z.number().min(0),
    activeSessions: z.number().min(0),
    databaseConnections: z.number().min(0).optional(),
    cacheHitRate: z.number().min(0).max(100).optional(),
    queueSize: z.number().min(0).optional(),
  }),
  services: z
    .record(
      z.object({
        status: z.nativeEnum(HealthStatusLevel),
        responseTime: z.number().min(0).optional(),
        lastChecked: z.date(),
        errorCount: z.number().min(0).default(0),
        metadata: z.record(z.any()).optional(),
      })
    )
    .default({}),
  alerts: z
    .array(
      z.object({
        id: IDSchema,
        level: z.enum(['info', 'warning', 'error', 'critical']),
        message: z.string(),
        service: z.string().optional(),
        createdAt: z.date(),
        acknowledged: z.boolean().default(false),
      })
    )
    .default([]),
});

export type SystemMetrics = z.infer<typeof SystemMetricsSchema>;

// Service status (ServiceStatus enum is already defined in common.ts)
export const ServiceStatusDetailSchema = z.object({
  name: z.string(),
  status: z.nativeEnum(HealthStatusLevel),
  version: z.string().optional(),
  uptime: z.number().min(0).optional(),
  lastChecked: z.date(),
  endpoint: z.string().url().optional(),
  responseTime: z.number().min(0).optional(),
  dependencies: z.array(z.string()).default([]),
  metrics: z.record(z.any()).optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        timestamp: z.date(),
        count: z.number().min(1).default(1),
      })
    )
    .default([]),
});

export type ServiceStatusDetail = z.infer<typeof ServiceStatusDetailSchema>;

// Performance metrics
export const PerformanceMetricsSchema = z.object({
  timestamp: z.date(),
  duration: z.number().min(0), // Time period in seconds
  requests: z.object({
    total: z.number().min(0),
    successful: z.number().min(0),
    failed: z.number().min(0),
    rate: z.number().min(0), // requests per second
    averageResponseTime: z.number().min(0),
    p95ResponseTime: z.number().min(0),
    p99ResponseTime: z.number().min(0),
  }),
  errors: z.object({
    total: z.number().min(0),
    rate: z.number().min(0), // errors per second
    byType: z.record(z.number()).default({}),
    byEndpoint: z.record(z.number()).default({}),
  }),
  resources: z.object({
    avgCpuUsage: z.number().min(0).max(100),
    avgMemoryUsage: z.number().min(0).max(100),
    maxCpuUsage: z.number().min(0).max(100),
    maxMemoryUsage: z.number().min(0).max(100),
  }),
  business: z
    .object({
      activeUsers: z.number().min(0),
      newUsers: z.number().min(0),
      completedOperations: z.number().min(0),
      failedOperations: z.number().min(0),
    })
    .optional(),
});

export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;

// Alert definitions
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export const AlertSchema = BaseEntitySchema.extend({
  name: z.string(),
  severity: z.nativeEnum(AlertSeverity),
  message: z.string(),
  service: z.string().optional(),
  metric: z.string().optional(),
  threshold: z.number().optional(),
  currentValue: z.number().optional(),
  isActive: z.boolean().default(true),
  acknowledgedBy: IDSchema.optional(),
  acknowledgedAt: z.date().optional(),
  resolvedAt: z.date().optional(),
  metadata: z.record(z.any()).optional(),
});

export type Alert = z.infer<typeof AlertSchema>;
