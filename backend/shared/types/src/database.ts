import { z } from 'zod';

// Database connection types
export const DatabaseConfigSchema = z.object({
  host: z.string(),
  port: z.number().positive(),
  database: z.string(),
  username: z.string(),
  password: z.string(),
  ssl: z.boolean().default(false),
  pool: z.object({
    min: z.number().min(0).default(2),
    max: z.number().positive().default(10),
    idleTimeoutMillis: z.number().positive().default(30000),
    connectionTimeoutMillis: z.number().positive().default(10000)
  }).optional()
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export const Neo4jConfigSchema = z.object({
  uri: z.string(),
  username: z.string(),
  password: z.string(),
  database: z.string().default('neo4j'),
  maxConnectionPoolSize: z.number().positive().default(50),
  connectionAcquisitionTimeout: z.number().positive().default(30000),
  connectionTimeout: z.number().positive().default(10000)
});

export type Neo4jConfig = z.infer<typeof Neo4jConfigSchema>;

// Query interfaces
export interface DatabaseQuery {
  text: string;
  values?: any[];
}

export interface Neo4jQuery {
  cypher: string;
  parameters?: Record<string, any>;
}

// Transaction types
export enum TransactionIsolation {
  READ_UNCOMMITTED = 'READ UNCOMMITTED',
  READ_COMMITTED = 'READ COMMITTED',
  REPEATABLE_READ = 'REPEATABLE READ',
  SERIALIZABLE = 'SERIALIZABLE'
}

export interface TransactionOptions {
  isolation?: TransactionIsolation;
  timeout?: number;
  readOnly?: boolean;
} 