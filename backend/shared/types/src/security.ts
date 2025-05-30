import { z } from 'zod';
import { BaseEntitySchema, UUIDSchema } from './common';

// Security types
export enum SecurityLevel {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum PermissionType {
  READ = 'read',
  WRITE = 'write',
  EXECUTE = 'execute',
  ADMIN = 'admin'
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

// Risk assessment types
export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export const RiskFactorSchema = z.object({
  type: z.string(),
  level: z.nativeEnum(RiskLevel),
  description: z.string(),
  score: z.number().min(0).max(10),
  mitigations: z.array(z.string()).optional()
});

export type RiskFactor = z.infer<typeof RiskFactorSchema>;

export const RiskAssessmentSchema = z.object({
  overallRisk: z.nativeEnum(RiskLevel),
  score: z.number().min(0).max(10),
  factors: z.array(RiskFactorSchema),
  mitigations: z.array(z.string()),
  assessedAt: z.date(),
  assessedBy: z.string().optional()
});

export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

// User types
export const UserSchema = BaseEntitySchema.extend({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.string(),
  securityClearance: z.nativeEnum(SecurityLevel).default(SecurityLevel.MEDIUM),
  isActive: z.boolean().default(true),
  lastLoginAt: z.date().optional()
});

export type User = z.infer<typeof UserSchema>;

// Permission system
export const PermissionSchema = BaseEntitySchema.extend({
  type: z.nativeEnum(PermissionType),
  resource: z.string(),
  operations: z.array(z.string()),
  conditions: z.record(z.any()).optional(),
  expiresAt: z.date().optional()
});

export type Permission = z.infer<typeof PermissionSchema>;

export const RoleSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.array(UUIDSchema),
  isSystemRole: z.boolean().default(false)
});

export type Role = z.infer<typeof RoleSchema>;

// Security context
export const SecurityContextSchema = z.object({
  userId: UUIDSchema,
  agentId: UUIDSchema.optional(),
  sessionId: UUIDSchema,
  permissions: z.array(PermissionSchema),
  securityLevel: z.nativeEnum(SecurityLevel),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
  timestamp: z.date()
});

export type SecurityContext = z.infer<typeof SecurityContextSchema>;

// Security validation
export const SecurityValidationRequestSchema = z.object({
  operation: z.object({
    type: z.string(),
    resource: z.string(),
    action: z.string(),
    context: z.record(z.any()).optional()
  }),
  securityContext: SecurityContextSchema
});

export type SecurityValidationRequest = z.infer<typeof SecurityValidationRequestSchema>;

export const SecurityValidationResultSchema = z.object({
  allowed: z.boolean(),
  approvalRequired: z.boolean(),
  riskLevel: z.nativeEnum(SecurityLevel),
  conditions: z.array(z.string()).optional(),
  reasoning: z.string().optional(),
  requiredApprovers: z.array(UUIDSchema).optional(),
  validUntil: z.date().optional()
});

export type SecurityValidationResult = z.infer<typeof SecurityValidationResultSchema>;

// Approval workflows
export const ApprovalWorkflowSchema = BaseEntitySchema.extend({
  operationId: UUIDSchema,
  requiredApprovers: z.array(UUIDSchema),
  currentApprovers: z.array(UUIDSchema).default([]),
  status: z.nativeEnum(ApprovalStatus).default(ApprovalStatus.PENDING),
  expiresAt: z.date().optional(),
  metadata: z.record(z.any()).optional()
});

export type ApprovalWorkflow = z.infer<typeof ApprovalWorkflowSchema>;

export const ApprovalDecisionSchema = z.object({
  workflowId: UUIDSchema,
  approverId: UUIDSchema,
  decision: z.enum(['approve', 'reject']),
  conditions: z.array(z.string()).optional(),
  feedback: z.string().optional(),
  decidedAt: z.date()
});

export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

// Audit system
export enum AuditEventType {
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  OPERATION_START = 'operation_start',
  OPERATION_COMPLETE = 'operation_complete',
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_DENIED = 'permission_denied',
  APPROVAL_REQUESTED = 'approval_requested',
  APPROVAL_GRANTED = 'approval_granted',
  APPROVAL_DENIED = 'approval_denied',
  SECURITY_VIOLATION = 'security_violation',
  DATA_ACCESS = 'data_access',
  CONFIGURATION_CHANGE = 'configuration_change'
}

export const AuditEventSchema = BaseEntitySchema.extend({
  eventType: z.nativeEnum(AuditEventType),
  userId: UUIDSchema.optional(),
  agentId: UUIDSchema.optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  details: z.record(z.any()),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
  riskLevel: z.nativeEnum(SecurityLevel).optional(),
  timestamp: z.date()
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

// JWT token types
export const JWTPayloadSchema = z.object({
  userId: UUIDSchema,
  sessionId: UUIDSchema,
  permissions: z.array(z.string()),
  securityLevel: z.nativeEnum(SecurityLevel),
  iat: z.number(),
  exp: z.number(),
  iss: z.string().optional(),
  aud: z.string().optional()
});

export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

// Rate limiting
export const RateLimitSchema = z.object({
  identifier: z.string(),
  limit: z.number().positive(),
  window: z.number().positive(), // seconds
  current: z.number().min(0),
  resetTime: z.date()
});

export type RateLimit = z.infer<typeof RateLimitSchema>; 