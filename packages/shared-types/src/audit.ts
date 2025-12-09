import { z } from 'zod';
import { BaseEntitySchema, IDSchema } from './common.js';

// Audit event types
export enum AuditEventType {
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  TOKEN_REFRESH = 'token_refresh',
  PASSWORD_CHANGED = 'password_changed',
  PASSWORD_CHANGE_FAILED = 'password_change_failed',
  PASSWORD_RESET_REQUESTED = 'password_reset_requested',
  PASSWORD_RESET_BY_ADMIN = 'password_reset_by_admin',
  AGENT_CREATED = 'agent_created',
  AGENT_UPDATED = 'agent_updated',
  AGENT_DELETED = 'agent_deleted',
  OPERATION_STARTED = 'operation_started',
  OPERATION_COMPLETED = 'operation_completed',
  OPERATION_FAILED = 'operation_failed',
  CAPABILITY_REGISTERED = 'capability_registered',
  CAPABILITY_EXECUTED = 'capability_executed',
  POLICY_CREATED = 'policy_created',
  POLICY_UPDATED = 'policy_updated',
  POLICY_DELETED = 'policy_deleted',
  APPROVAL_REQUESTED = 'approval_requested',
  APPROVAL_GRANTED = 'approval_granted',
  APPROVAL_DENIED = 'approval_denied',
  SECURITY_VIOLATION = 'security_violation',
  DATA_ACCESS = 'data_access',
  CONFIGURATION_CHANGED = 'configuration_changed',
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_DENIED = 'permission_denied',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  FAILED_LOGIN = 'failed_login',
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_DELETED = 'user_deleted',
  USER_UNLOCKED = 'user_unlocked',
  BULK_USER_ACTION = 'bulk_user_action',
  AUDIT_EXPORT = 'audit_export',
  COMPLIANCE_REPORT_GENERATED = 'compliance_report_generated',
  AUDIT_CLEANUP = 'audit_cleanup',
  RISK_ASSESSMENT = 'risk_assessment',
  USER_ACTION = 'user_action',

  // OAuth Events
  OAUTH_AUTHORIZE_INITIATED = 'oauth_authorize_initiated',
  OAUTH_AUTHORIZE_FAILED = 'oauth_authorize_failed',
  OAUTH_CALLBACK_SUCCESS = 'oauth_callback_success',
  OAUTH_CALLBACK_FAILED = 'oauth_callback_failed',
  OAUTH_CALLBACK_ERROR = 'oauth_callback_error',
  OAUTH_CONNECTION_CREATED = 'oauth_connection_created',

  // Agent Events
  AGENT_AUTH_SUCCESS = 'agent_auth_success',
  AGENT_AUTH_FAILED = 'agent_auth_failed',
  AGENT_OPERATION = 'agent_operation',
  AGENT_OPERATION_SUCCESS = 'agent_operation_success',
  AGENT_OPERATION_FAILED = 'agent_operation_failed',

  // Security Events
  SECURITY_CONFIG_CHANGE = 'security_config_change',
  MFA_SUCCESS = 'mfa_success',
  MFA_FAILED = 'mfa_failed',
  SYSTEM_ERROR = 'system_error',
}

// Audit log entry
export const AuditLogSchema = BaseEntitySchema.extend({
  eventType: z.nativeEnum(AuditEventType),
  userId: IDSchema.optional(),
  agentId: IDSchema.optional(),
  resourceType: z.string(),
  resourceId: IDSchema.optional(),
  action: z.string(),
  outcome: z.enum(['success', 'failure', 'partial']),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  details: z.record(z.any()),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  sessionId: z.string().optional(),
  correlationId: z.string().optional(),
  timestamp: z.date(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

// Audit search filters
export const AuditSearchFiltersSchema = z.object({
  eventType: z.nativeEnum(AuditEventType).optional(),
  userId: IDSchema.optional(),
  agentId: IDSchema.optional(),
  resourceType: z.string().optional(),
  outcome: z.enum(['success', 'failure', 'partial']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0),
});

export type AuditSearchFilters = z.infer<typeof AuditSearchFiltersSchema>;

// Audit statistics
export const AuditStatsSchema = z.object({
  totalEvents: z.number(),
  eventsByType: z.record(z.number()),
  eventsByOutcome: z.record(z.number()),
  eventsBySeverity: z.record(z.number()),
  topUsers: z.array(
    z.object({
      userId: IDSchema,
      eventCount: z.number(),
    })
  ),
  topResources: z.array(
    z.object({
      resourceType: z.string(),
      eventCount: z.number(),
    })
  ),
  timeRange: z.object({
    startDate: z.date(),
    endDate: z.date(),
  }),
  generatedAt: z.date(),
});

export type AuditStats = z.infer<typeof AuditStatsSchema>;

// Export configuration
export const AuditExportConfigSchema = z.object({
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
  filters: AuditSearchFiltersSchema,
  includeDetails: z.boolean().default(true),
  includeMetadata: z.boolean().default(false),
  compressionLevel: z.enum(['none', 'low', 'medium', 'high']).default('medium'),
});

export type AuditExportConfig = z.infer<typeof AuditExportConfigSchema>;

// Compliance report
export const ComplianceReportSchema = z.object({
  id: IDSchema,
  reportType: z.enum(['sox', 'gdpr', 'hipaa', 'pci', 'custom']),
  period: z.object({
    startDate: z.date(),
    endDate: z.date(),
  }),
  metrics: z.object({
    totalEvents: z.number(),
    complianceViolations: z.number(),
    securityIncidents: z.number(),
    dataAccessEvents: z.number(),
    unauthorizedAttempts: z.number(),
  }),
  findings: z.array(
    z.object({
      category: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      description: z.string(),
      recommendation: z.string(),
      affectedResources: z.array(z.string()),
    })
  ),
  recommendations: z.array(z.string()),
  includeMetrics: z.boolean().default(true),
  includeRecommendations: z.boolean().default(true),
  format: z.enum(['pdf', 'html', 'json']).default('pdf'),
  generatedAt: z.date(),
  generatedBy: IDSchema,
});

export type ComplianceReport = z.infer<typeof ComplianceReportSchema>;

// User activity summary
export const UserActivitySummarySchema = z.object({
  userId: IDSchema,
  period: z.object({
    startDate: z.date(),
    endDate: z.date(),
  }),
  totalEvents: z.number(),
  eventsByType: z.record(z.number()),
  loginSessions: z.number(),
  failedAttempts: z.number(),
  resourcesAccessed: z.array(z.string()),
  lastActivity: z.date().optional(),
  riskScore: z.number().min(0).max(10).default(0),
  anomalies: z.array(
    z.object({
      type: z.string(),
      description: z.string(),
      severity: z.enum(['low', 'medium', 'high']),
      timestamp: z.date(),
    })
  ),
});

export type UserActivitySummary = z.infer<typeof UserActivitySummarySchema>;

// Cleanup result
export const AuditCleanupResultSchema = z.object({
  deletedCount: z.number(),
  dryRun: z.boolean(),
  retentionDays: z.number(),
  eventTypesProcessed: z.array(z.string()),
  oldestDeletedDate: z.date().optional(),
  newestDeletedDate: z.date().optional(),
  processedAt: z.date(),
});

export type AuditCleanupResult = z.infer<typeof AuditCleanupResultSchema>;
