import { z } from 'zod';

// Replace UUID with numeric ID schema
export const IDSchema = z.string();
export type ID = z.infer<typeof IDSchema>;

// Timestamp schemas
export const TimestampSchema = z.date();
export const OptionalTimestampSchema = z.date().optional();

// Common enums
export enum ServiceStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn', 
  INFO = 'info',
  DEBUG = 'debug'
}

// Pagination schemas
export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  offset: z.number().int().nonnegative().optional()
});

export type Pagination = z.infer<typeof PaginationSchema>;

// Base entity schema
export const BaseEntitySchema = z.object({
  id: IDSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema.optional()
});

export type BaseEntity = z.infer<typeof BaseEntitySchema>;

export const PaginatedResultSchema = z.object({
  data: z.array(z.any()),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number()
  })
});

export type PaginatedResult<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

// Error types
export const APIErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.any()).optional(),
  timestamp: TimestampSchema
});

export type APIError = z.infer<typeof APIErrorSchema>;

// Health check response
export const HealthCheckSchema = z.object({
  status: z.nativeEnum(ServiceStatus),
  timestamp: TimestampSchema,
  uptime: z.number(),
  version: z.string(),
  dependencies: z.record(z.nativeEnum(ServiceStatus)).optional()
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>; 