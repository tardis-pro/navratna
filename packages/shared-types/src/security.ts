import { z } from 'zod';
import { BaseEntitySchema, IDSchema } from './common.js';
import { AuditEventType } from './audit.js';

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
  level: z.nativeEnum(SecurityLevel),
  score: z.number().min(0).max(10),
  factors: z.array(z.string()),
  recommendations: z.array(z.string()),
  mitigations: z.array(z.string()).optional(),
  assessedAt: z.date(),
  assessedBy: IDSchema.optional(),
  validUntil: z.date().optional()
});

export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

// User types
export const UserSchema = BaseEntitySchema.extend({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.string(),
  passwordHash: z.string().optional(),
  securityClearance: z.nativeEnum(SecurityLevel).default(SecurityLevel.MEDIUM),
  isActive: z.boolean().default(true),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  department: z.string().max(100).optional(),
  failedLoginAttempts: z.number().int().min(0).default(0),
  lockedUntil: z.date().optional(),
  passwordChangedAt: z.date().optional(),
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
  permissions: z.array(IDSchema),
  isSystemRole: z.boolean().default(false)
});

export type Role = z.infer<typeof RoleSchema>;

// Security context
export const SecurityContextSchema = z.object({
  userId: IDSchema,
  sessionId: z.string(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  department: z.string().optional(),
  role: z.string(),
  permissions: z.array(z.string()),
  securityLevel: z.nativeEnum(SecurityLevel),
  lastAuthentication: z.date(),
  mfaVerified: z.boolean().default(false),
  riskScore: z.number().min(0).max(10).default(0)
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
  requiredApprovers: z.array(IDSchema).optional(),
  validUntil: z.date().optional()
});

export type SecurityValidationResult = z.infer<typeof SecurityValidationResultSchema>;

// Approval workflows
export const ApprovalWorkflowSchema = BaseEntitySchema.extend({
  operationId: IDSchema,
  requiredApprovers: z.array(IDSchema),
  currentApprovers: z.array(IDSchema).default([]),
  status: z.nativeEnum(ApprovalStatus).default(ApprovalStatus.PENDING),
  expiresAt: z.date().optional(),
  metadata: z.record(z.any()).optional()
});

export type ApprovalWorkflow = z.infer<typeof ApprovalWorkflowSchema>;

export const ApprovalDecisionSchema = z.object({
  workflowId: IDSchema,
  approverId: IDSchema,
  decision: z.enum(['approve', 'reject']),
  conditions: z.array(z.string()).optional(),
  feedback: z.string().optional(),
  decidedAt: z.date()
});

export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

// AuditEventType is imported from audit.ts to avoid duplication

export const AuditEventSchema = BaseEntitySchema.extend({
  id: IDSchema,
  eventType: z.nativeEnum(AuditEventType),
  userId: IDSchema.optional(),
  agentId: IDSchema.optional(),
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
  userId: IDSchema,
  sessionId: IDSchema,
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

// Security policy
export const SecurityPolicySchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  description: z.string(),
  category: z.enum(['access_control', 'data_protection', 'audit', 'compliance', 'incident_response', 'general']),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  rules: z.array(z.object({
    id: z.string(),
    condition: z.string(),
    action: z.enum(['allow', 'deny', 'require_approval', 'log']),
    parameters: z.record(z.any()).optional()
  })),
  scope: z.object({
    resourceTypes: z.array(z.string()),
    userRoles: z.array(z.string()),
    departments: z.array(z.string()).optional()
  }),
  enforcement: z.object({
    enabled: z.boolean().default(true),
    mode: z.enum(['enforce', 'monitor', 'disabled']).default('enforce'),
    exceptions: z.array(z.string()).optional()
  }),
  compliance: z.object({
    frameworks: z.array(z.enum(['sox', 'gdpr', 'hipaa', 'pci', 'iso27001'])),
    requirements: z.array(z.string())
  }).optional(),
  version: z.string(),
  effectiveDate: z.date(),
  expiryDate: z.date().optional(),
  approvedBy: IDSchema,
  lastReviewDate: z.date().optional(),
  nextReviewDate: z.date().optional()
});

export type SecurityPolicy = z.infer<typeof SecurityPolicySchema>;

// Security stats
export const SecurityStatsSchema = z.object({
  totalPolicies: z.number(),
  activePolicies: z.number(),
  violationsToday: z.number(),
  violationsThisWeek: z.number(),
  violationsThisMonth: z.number(),
  riskDistribution: z.object({
    low: z.number(),
    medium: z.number(),
    high: z.number(),
    critical: z.number()
  }),
  topViolatedPolicies: z.array(z.object({
    policyId: IDSchema,
    policyName: z.string(),
    violationCount: z.number()
  })),
  complianceScore: z.number().min(0).max(100),
  lastAssessment: z.date().optional(),
  generatedAt: z.date()
});

export type SecurityStats = z.infer<typeof SecurityStatsSchema>;

// Approval requirement check
export const ApprovalRequirementSchema = z.object({
  required: z.boolean(),
  approvers: z.array(IDSchema).optional(),
  reason: z.string().optional(),
  estimatedTime: z.string().optional(),
  escalationPath: z.array(z.object({
    level: z.number(),
    approvers: z.array(IDSchema),
    timeoutHours: z.number()
  })).optional()
});

export type ApprovalRequirement = z.infer<typeof ApprovalRequirementSchema>;

// Operation security request
export const OperationSecurityRequestSchema = z.object({
  operation: z.object({
    type: z.string(),
    resource: z.string(),
    action: z.string(),
    parameters: z.record(z.any()).optional()
  }),
  context: SecurityContextSchema,
  purpose: z.string().optional(),
  urgency: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  requestedAt: z.date()
});

export type OperationSecurityRequest = z.infer<typeof OperationSecurityRequestSchema>;

// Security violation
export const SecurityViolationSchema = BaseEntitySchema.extend({
  policyId: IDSchema,
  userId: IDSchema.optional(),
  agentId: IDSchema.optional(),
  violationType: z.enum(['policy_violation', 'unauthorized_access', 'data_breach', 'suspicious_activity']),
  severity: z.nativeEnum(SecurityLevel),
  description: z.string(),
  evidence: z.record(z.any()),
  automaticallyDetected: z.boolean().default(true),
  resolved: z.boolean().default(false),
  resolution: z.string().optional(),
  resolvedBy: IDSchema.optional(),
  resolvedAt: z.date().optional(),
  reportedBy: IDSchema.optional(),
  occurredAt: z.date()
});

export type SecurityViolation = z.infer<typeof SecurityViolationSchema>;

// Provider configuration (for LLM providers)
export const ProviderConfigSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['ollama', 'llmstudio', 'openai', 'anthropic', 'custom']),
  baseUrl: z.string().url(),
  defaultModel: z.string().optional(),
  status: z.enum(['active', 'inactive', 'error']).default('active'),
  isActive: z.boolean().default(true),
  priority: z.number().min(0).default(0),
  configuration: z.record(z.any()).optional(),
  hasApiKey: z.boolean().default(false),
  totalTokensUsed: z.number().min(0).default(0),
  totalRequests: z.number().min(0).default(0),
  totalErrors: z.number().min(0).default(0),
  lastUsedAt: z.date().optional(),
  healthCheckResult: z.object({
    success: z.boolean(),
    latency: z.number().optional(),
    error: z.string().optional(),
    checkedAt: z.date()
  }).optional()
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// Provider test result
export const ProviderTestResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  latency: z.number().optional(),
  responseTime: z.number().optional(),
  modelAvailable: z.boolean().optional(),
  testedAt: z.date()
});

export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>;

// Additional approval workflow types
export const CreateApprovalWorkflowRequestSchema = z.object({
  operationId: IDSchema,
  operationType: z.string(),
  requestedBy: IDSchema,
  description: z.string(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  requiredApprovers: z.array(IDSchema),
  autoApprovalRules: z.array(z.object({
    condition: z.string(),
    action: z.enum(['approve', 'reject', 'escalate'])
  })).optional(),
  expiresAt: z.date().optional(),
  metadata: z.record(z.any()).optional()
});

export type CreateApprovalWorkflowRequest = z.infer<typeof CreateApprovalWorkflowRequestSchema>;

export const ApprovalStatsSchema = z.object({
  totalWorkflows: z.number().min(0),
  pendingApprovals: z.number().min(0),
  approvedToday: z.number().min(0),
  rejectedToday: z.number().min(0),
  expiredToday: z.number().min(0),
  averageApprovalTime: z.number().min(0), // minutes
  approvalsByType: z.record(z.number()),
  approverStats: z.array(z.object({
    approverId: IDSchema,
    totalApprovals: z.number().min(0),
    averageTime: z.number().min(0),
    rejectionRate: z.number().min(0).max(100)
  })),
  generatedAt: z.date()
});

export type ApprovalStats = z.infer<typeof ApprovalStatsSchema>; 