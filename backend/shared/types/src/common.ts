import { z } from 'zod';

// Base types
export const UUIDSchema = z.string().uuid();
export type UUID = z.infer<typeof UUIDSchema>;

export const TimestampSchema = z.date();
export type Timestamp = z.infer<typeof TimestampSchema>;

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

// Base entity schema
export const BaseEntitySchema = z.object({
  id: UUIDSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema.optional()
});

export type BaseEntity = z.infer<typeof BaseEntitySchema>;

// Pagination
export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

export type Pagination = z.infer<typeof PaginationSchema>;

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