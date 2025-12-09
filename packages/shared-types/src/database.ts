import { z } from 'zod';
import { IDSchema } from './common.js';

// Database connection types
export const DatabaseConfigSchema = z.object({
  host: z.string(),
  port: z.number().positive(),
  database: z.string(),
  username: z.string(),
  password: z.string(),
  ssl: z.boolean().default(false),
  pool: z
    .object({
      min: z.number().min(0).default(2),
      max: z.number().positive().default(10),
      idleTimeoutMillis: z.number().positive().default(30000),
      connectionTimeoutMillis: z.number().positive().default(10000),
    })
    .optional(),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export const Neo4jConfigSchema = z.object({
  uri: z.string(),
  username: z.string(),
  password: z.string(),
  database: z.string().default('neo4j'),
  maxConnectionPoolSize: z.number().positive().default(50),
  connectionAcquisitionTimeout: z.number().positive().default(30000),
  connectionTimeout: z.number().positive().default(10000),
});

export type Neo4jConfig = z.infer<typeof Neo4jConfigSchema>;

// Query interfaces
export interface DatabaseQuery {
  text: string;
  values?: unknown[];
}

export interface Neo4jQuery {
  cypher: string;
  parameters?: Record<string, unknown>;
}

// Transaction types
export enum TransactionIsolation {
  READ_UNCOMMITTED = 'READ UNCOMMITTED',
  READ_COMMITTED = 'READ COMMITTED',
  REPEATABLE_READ = 'REPEATABLE READ',
  SERIALIZABLE = 'SERIALIZABLE',
}

export interface TransactionOptions {
  isolation?: TransactionIsolation;
  timeout?: number;
  readOnly?: boolean;
}

// ===== DATABASE ENTITY TYPES =====
// These types match the database schema and seeded data

// User entity
export const DbUserSchema = z.object({
  id: IDSchema,
  email: z.string().email(),
  password_hash: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  role: z.string(),
  is_active: z.boolean(),
  last_login_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type DbUser = z.infer<typeof DbUserSchema>;

// Role entity
export const DbRoleSchema = z.object({
  id: IDSchema,
  name: z.string(),
  description: z.string().nullable(),
  is_system_role: z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type DbRole = z.infer<typeof DbRoleSchema>;

// Permission entity
export const DbPermissionSchema = z.object({
  id: IDSchema,
  type: z.string(),
  resource: z.string(),
  operations: z.array(z.string()),
  conditions: z.record(z.any()).nullable(),
  expires_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type DbPermission = z.infer<typeof DbPermissionSchema>;

// Capability entity
export const DbCapabilitySchema = z.object({
  id: IDSchema,
  name: z.string(),
  description: z.string(),
  type: z.string(),
  category: z.string(),
  version: z.string(),
  config: z.record(z.any()),
  is_active: z.boolean(),
  created_by: IDSchema,
  created_at: z.date(),
  updated_at: z.date(),
});

export type DbCapability = z.infer<typeof DbCapabilitySchema>;

// Agent entity
export const DbAgentSchema = z.object({
  id: IDSchema,
  name: z.string(),
  role: z.string(),
  persona: z.record(z.any()),
  intelligence_config: z.record(z.any()),
  security_context: z.record(z.any()),
  is_active: z.boolean(),
  created_by: IDSchema,
  last_active_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type DbAgent = z.infer<typeof DbAgentSchema>;

// Operation entity
export const DbOperationSchema = z.object({
  id: IDSchema,
  type: z.string(),
  status: z.string(),
  priority: z.string(),
  agent_id: IDSchema.nullable(),
  user_id: IDSchema.nullable(),
  input_data: z.record(z.any()),
  output_data: z.record(z.any()).nullable(),
  error_details: z.record(z.any()).nullable(),
  started_at: z.date().nullable(),
  completed_at: z.date().nullable(),
  estimated_duration: z.number().nullable(),
  actual_duration: z.number().nullable(),
  progress_percentage: z.number(),
  current_step: z.string().nullable(),
  total_steps: z.number().nullable(),
  step_details: z.record(z.any()).nullable(),
  retry_count: z.number(),
  max_retries: z.number(),
  retry_delay: z.number().nullable(),
  timeout_duration: z.number().nullable(),
  resource_requirements: z.record(z.any()).nullable(),
  resource_allocation: z.record(z.any()).nullable(),
  performance_metrics: z.record(z.any()).nullable(),
  quality_metrics: z.record(z.any()).nullable(),
  dependencies: z.array(z.string()),
  dependent_operations: z.array(z.string()),
  tags: z.array(z.string()),
  metadata: z.record(z.any()).nullable(),
  is_archived: z.boolean(),
  archived_at: z.date().nullable(),
  archived_by: IDSchema.nullable(),
  archive_reason: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type DbOperation = z.infer<typeof DbOperationSchema>;

// Audit event entity
export const DbAuditEventSchema = z.object({
  id: IDSchema,
  event_type: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  user_id: IDSchema.nullable(),
  agent_id: IDSchema.nullable(),
  action: z.string(),
  changes: z.record(z.any()).nullable(),
  metadata: z.record(z.any()).nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  session_id: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type DbAuditEvent = z.infer<typeof DbAuditEventSchema>;

// User session entity
export const UserSessionSchema = z.object({
  id: IDSchema,
  user_id: IDSchema,
  session_token: z.string(),
  refresh_token: z.string().nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  expires_at: z.date(),
  created_at: z.date(),
  last_used_at: z.date(),
});

export type UserSession = z.infer<typeof UserSessionSchema>;

// Refresh token entity
export const DbRefreshTokenSchema = z.object({
  id: IDSchema,
  user_id: IDSchema,
  token_hash: z.string(),
  expires_at: z.date(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type RefreshToken = z.infer<typeof DbRefreshTokenSchema>;

// Password reset token entity
export const DbPasswordResetTokenSchema = z.object({
  id: IDSchema,
  user_id: IDSchema,
  token_hash: z.string(),
  expires_at: z.date(),
  used: z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type PasswordResetToken = z.infer<typeof DbPasswordResetTokenSchema>;

// Rate limit entity
export const DbRateLimitSchema = z.object({
  id: IDSchema,
  identifier: z.string(),
  limit_type: z.string(),
  limit_value: z.number(),
  window_seconds: z.number(),
  current_count: z.number(),
  reset_time: z.date(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type DbRateLimit = z.infer<typeof DbRateLimitSchema>;

// Junction table types
export interface RolePermission {
  role_Id: string;
  permission_Id: string;
  granted_at: Date;
}

export interface UserRole {
  user_Id: string;
  role_Id: string;
  granted_at: Date;
  expires_at: Date | null;
}

export interface UserPermission {
  user_Id: string;
  permission_Id: string;
  granted_at: Date;
  expires_at: Date | null;
}

// Approval workflow entities
export const DbApprovalWorkflowSchema = z.object({
  id: IDSchema,
  operation_id: IDSchema,
  required_approvers: z.array(IDSchema),
  current_approvers: z.array(IDSchema),
  status: z.string(),
  expires_at: z.date().nullable(),
  metadata: z.record(z.any()).nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type DbApprovalWorkflow = z.infer<typeof DbApprovalWorkflowSchema>;

export const DbApprovalDecisionSchema = z.object({
  id: IDSchema,
  workflow_id: IDSchema,
  approver_id: IDSchema,
  decision: z.enum(['approve', 'reject']),
  conditions: z.array(z.string()),
  feedback: z.string().nullable(),
  decided_at: z.date(),
});

export type DbApprovalDecision = z.infer<typeof DbApprovalDecisionSchema>;

// ===== DATABASE OPERATION TYPES =====

export interface DatabaseOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  rowCount?: number;
}

export interface BulkOperationResult {
  success: boolean;
  inserted: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export interface DatabaseStats {
  totalOperations: number;
  activeOperations: number;
  totalCheckpoints: number;
  averageStateSize: number;
}

export interface PoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  details: {
    connected: boolean;
    totalConnections: number;
    idleConnections: number;
    waitingConnections: number;
    responseTime?: number;
  };
}

// ===== SEEDED DATA CONSTANTS =====

export const SYSTEM_USER_IDS = {
  SYSTEM: '00000000-0000-0000-0000-000000000001',
  ADMIN: '00000000-0000-0000-0000-000000000002',
  TEST: '00000000-0000-0000-0000-000000000003',
  DEMO: '00000000-0000-0000-0000-000000000004',
} as const;

export const SYSTEM_ROLE_IDS = {
  SYSTEM_ADMIN: '10000000-0000-0000-0000-000000000001',
  ADMIN: '10000000-0000-0000-0000-000000000002',
  USER: '10000000-0000-0000-0000-000000000003',
  PERSONA_CREATOR: '10000000-0000-0000-0000-000000000004',
  DISCUSSION_MODERATOR: '10000000-0000-0000-0000-000000000005',
} as const;

export const SYSTEM_PERMISSION_IDS = {
  PERSONAS: '20000000-0000-0000-0000-000000000001',
  DISCUSSIONS: '20000000-0000-0000-0000-000000000002',
  USERS: '20000000-0000-0000-0000-000000000003',
  ADMINISTRATION: '20000000-0000-0000-0000-000000000004',
} as const;

export const SYSTEM_CAPABILITY_IDS = {
  TEXT_ANALYSIS: '30000000-0000-0000-0000-000000000001',
  CREATIVE_WRITING: '30000000-0000-0000-0000-000000000002',
  LOGICAL_REASONING: '30000000-0000-0000-0000-000000000003',
  DATA_VISUALIZATION: '30000000-0000-0000-0000-000000000004',
} as const;

export const SYSTEM_PERSONA_IDS = {
  SOCRATIC_PHILOSOPHER: '40000000-0000-0000-0000-000000000001',
  CREATIVE_BRAINSTORMER: '40000000-0000-0000-0000-000000000002',
  DATA_ANALYST: '40000000-0000-0000-0000-000000000003',
  EMPATHETIC_MEDIATOR: '40000000-0000-0000-0000-000000000004',
  TECHNICAL_ARCHITECT: '40000000-0000-0000-0000-000000000005',
} as const;

export const SYSTEM_DISCUSSION_IDS = {
  AI_ETHICS: '50000000-0000-0000-0000-000000000001',
  REMOTE_WORK: '50000000-0000-0000-0000-000000000002',
  ARCHITECTURE_REVIEW: '50000000-0000-0000-0000-000000000003',
} as const;
