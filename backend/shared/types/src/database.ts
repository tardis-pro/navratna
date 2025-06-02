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

// ===== DATABASE ENTITY TYPES =====
// These types match the database schema and seeded data

// User entity
export const DbUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.string(),
  security_clearance: z.string(),
  is_active: z.boolean(),
  last_login_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date()
});

export type DbUser = z.infer<typeof DbUserSchema>;

// Role entity
export const DbRoleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  is_system_role: z.boolean(),
  created_at: z.date(),
  updated_at: z.date()
});

export type DbRole = z.infer<typeof DbRoleSchema>;

// Permission entity
export const DbPermissionSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  resource: z.string(),
  operations: z.array(z.string()),
  conditions: z.record(z.any()).nullable(),
  expires_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date()
});

export type DbPermission = z.infer<typeof DbPermissionSchema>;

// Capability entity
export const DbCapabilitySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  type: z.string(),
  category: z.string(),
  version: z.string(),
  config: z.record(z.any()),
  is_active: z.boolean(),
  created_by: z.string().uuid(),
  created_at: z.date(),
  updated_at: z.date()
});

export type DbCapability = z.infer<typeof DbCapabilitySchema>;

// Agent entity
export const DbAgentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.string(),
  persona: z.record(z.any()),
  intelligence_config: z.record(z.any()),
  security_context: z.record(z.any()),
  is_active: z.boolean(),
  created_by: z.string().uuid(),
  last_active_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date()
});

export type DbAgent = z.infer<typeof DbAgentSchema>;

// Operation entity
export const DbOperationSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  status: z.string(),
  priority: z.string(),
  agent_id: z.string().uuid().nullable(),
  user_id: z.string().uuid().nullable(),
  plan: z.record(z.any()),
  context: z.record(z.any()),
  current_step: z.number(),
  progress: z.record(z.any()),
  results: z.record(z.any()).nullable(),
  error: z.string().nullable(),
  started_at: z.date().nullable(),
  completed_at: z.date().nullable(),
  cancelled_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date()
});

export type DbOperation = z.infer<typeof DbOperationSchema>;

// Audit event entity
export const DbAuditEventSchema = z.object({
  id: z.string().uuid(),
  event_type: z.string(),
  user_id: z.string().uuid().nullable(),
  agent_id: z.string().uuid().nullable(),
  resource_type: z.string().nullable(),
  resource_id: z.string().nullable(),
  details: z.record(z.any()),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  risk_level: z.string().nullable(),
  timestamp: z.date()
});

export type DbAuditEvent = z.infer<typeof DbAuditEventSchema>;

// User session entity
export const UserSessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  session_token: z.string(),
  refresh_token: z.string().nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  expires_at: z.date(),
  created_at: z.date(),
  last_used_at: z.date()
});

export type UserSession = z.infer<typeof UserSessionSchema>;

// Rate limit entity
export const DbRateLimitSchema = z.object({
  id: z.string().uuid(),
  identifier: z.string(),
  limit_type: z.string(),
  limit_value: z.number(),
  window_seconds: z.number(),
  current_count: z.number(),
  reset_time: z.date(),
  created_at: z.date(),
  updated_at: z.date()
});

export type DbRateLimit = z.infer<typeof DbRateLimitSchema>;

// Junction table types
export interface RolePermission {
  role_id: string;
  permission_id: string;
  granted_at: Date;
}

export interface UserRole {
  user_id: string;
  role_id: string;
  granted_at: Date;
  expires_at: Date | null;
}

export interface UserPermission {
  user_id: string;
  permission_id: string;
  granted_at: Date;
  expires_at: Date | null;
}

// Approval workflow entities
export const DbApprovalWorkflowSchema = z.object({
  id: z.string().uuid(),
  operation_id: z.string().uuid(),
  required_approvers: z.array(z.string().uuid()),
  current_approvers: z.array(z.string().uuid()),
  status: z.string(),
  expires_at: z.date().nullable(),
  metadata: z.record(z.any()).nullable(),
  created_at: z.date(),
  updated_at: z.date()
});

export type DbApprovalWorkflow = z.infer<typeof DbApprovalWorkflowSchema>;

export const DbApprovalDecisionSchema = z.object({
  id: z.string().uuid(),
  workflow_id: z.string().uuid(),
  approver_id: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  conditions: z.array(z.string()),
  feedback: z.string().nullable(),
  decided_at: z.date()
});

export type DbApprovalDecision = z.infer<typeof DbApprovalDecisionSchema>;

// ===== DATABASE OPERATION TYPES =====

export interface DatabaseOperationResult<T = any> {
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
  DEMO: '00000000-0000-0000-0000-000000000004'
} as const;

export const SYSTEM_ROLE_IDS = {
  SYSTEM_ADMIN: '10000000-0000-0000-0000-000000000001',
  ADMIN: '10000000-0000-0000-0000-000000000002',
  USER: '10000000-0000-0000-0000-000000000003',
  PERSONA_CREATOR: '10000000-0000-0000-0000-000000000004',
  DISCUSSION_MODERATOR: '10000000-0000-0000-0000-000000000005'
} as const;

export const SYSTEM_PERMISSION_IDS = {
  PERSONAS: '20000000-0000-0000-0000-000000000001',
  DISCUSSIONS: '20000000-0000-0000-0000-000000000002',
  USERS: '20000000-0000-0000-0000-000000000003',
  ADMINISTRATION: '20000000-0000-0000-0000-000000000004'
} as const;

export const SYSTEM_CAPABILITY_IDS = {
  TEXT_ANALYSIS: '30000000-0000-0000-0000-000000000001',
  CREATIVE_WRITING: '30000000-0000-0000-0000-000000000002',
  LOGICAL_REASONING: '30000000-0000-0000-0000-000000000003',
  DATA_VISUALIZATION: '30000000-0000-0000-0000-000000000004'
} as const;

export const SYSTEM_PERSONA_IDS = {
  SOCRATIC_PHILOSOPHER: '40000000-0000-0000-0000-000000000001',
  CREATIVE_BRAINSTORMER: '40000000-0000-0000-0000-000000000002',
  DATA_ANALYST: '40000000-0000-0000-0000-000000000003',
  EMPATHETIC_MEDIATOR: '40000000-0000-0000-0000-000000000004',
  TECHNICAL_ARCHITECT: '40000000-0000-0000-0000-000000000005'
} as const;

export const SYSTEM_DISCUSSION_IDS = {
  AI_ETHICS: '50000000-0000-0000-0000-000000000001',
  REMOTE_WORK: '50000000-0000-0000-0000-000000000002',
  ARCHITECTURE_REVIEW: '50000000-0000-0000-0000-000000000003'
} as const; 