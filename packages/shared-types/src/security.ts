import { z } from 'zod';
import { BaseEntitySchema, IDSchema } from './common.js';
import { AuditEventType } from './audit.js';

// Security types
export enum SecurityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum PermissionType {
  READ = 'read',
  WRITE = 'write',
  EXECUTE = 'execute',
  ADMIN = 'admin',
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

// Risk assessment types
export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// OAuth Provider Types
export enum OAuthProviderType {
  GITHUB = 'github',
  GOOGLE = 'google',
  ZOHO = 'zoho',
  MICROSOFT = 'microsoft',
  LINKEDIN = 'linkedin',
  SLACK = 'slack',
  DISCORD = 'discord',
  GMAIL = 'gmail',
  OUTLOOK = 'outlook',
  ZOHO_MAIL = 'zoho_mail',
  CUSTOM = 'custom',
}

export enum AuthenticationMethod {
  PASSWORD = 'password',
  OAUTH = 'oauth',
  SAML = 'saml',
  LDAP = 'ldap',
  API_KEY = 'api_key',
  CERTIFICATE = 'certificate',
  BIOMETRIC = 'biometric',
  AGENT_TOKEN = 'agent_token',
}

export enum MFAMethod {
  SMS = 'sms',
  EMAIL = 'email',
  TOTP = 'totp',
  PUSH = 'push',
  HARDWARE_TOKEN = 'hardware_token',
  BIOMETRIC = 'biometric',
  BACKUP_CODES = 'backup_codes',
}

export enum SessionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  SUSPENDED = 'suspended',
}

// User Types - including agents
export enum UserType {
  HUMAN = 'human',
  AGENT = 'agent',
  SERVICE = 'service',
  SYSTEM = 'system',
}

export enum AgentCapability {
  CODE_REPOSITORY = 'code_repository', // GitHub access
  EMAIL_ACCESS = 'email_access', // Email read/send
  NOTE_TAKING = 'note_taking', // Audio/video/text notes
  FILE_MANAGEMENT = 'file_management', // File operations
  COMMUNICATION = 'communication', // Chat/messaging
  DATA_ANALYSIS = 'data_analysis', // Data processing
  TASK_AUTOMATION = 'task_automation', // Workflow automation
  CONTENT_CREATION = 'content_creation', // Document/media creation
  INTEGRATION = 'integration', // API integrations
  MONITORING = 'monitoring', // System monitoring
  TOOL_EXECUTION = 'tool_execution', // Execute tools and APIs
  REPORTING = 'reporting', // Generate reports
  COLLABORATION = 'collaboration', // Team collaboration
  WORKFLOW_MANAGEMENT = 'workflow_management', // Manage workflows
  NATURAL_LANGUAGE_PROCESSING = 'natural_language_processing', // NLP capabilities
  KNOWLEDGE_RETRIEVAL = 'knowledge_retrieval', // Knowledge base access
  CONTEXT_AWARENESS = 'context_awareness', // Context understanding
  LEARNING = 'learning', // Learning and adaptation
}

// OAuth Provider Configuration
export const OAuthProviderConfigSchema = z.object({
  id: IDSchema,
  name: z.string().min(1).max(255),
  type: z.nativeEnum(OAuthProviderType),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1).optional(), // Encrypted in storage
  redirectUri: z.string().url(),
  scope: z.array(z.string()).default([]),
  authorizationUrl: z.string().url(),
  tokenUrl: z.string().url(),
  userInfoUrl: z.string().url(),
  issuer: z.string().optional(),
  jwksUri: z.string().url().optional(),
  additionalParams: z.record(z.string()).optional(),
  isEnabled: z.boolean().default(true),
  priority: z.number().min(0).default(0),
  rateLimit: z
    .object({
      requests: z.number().min(1),
      windowMs: z.number().min(1000),
    })
    .optional(),
  securityConfig: z
    .object({
      requirePKCE: z.boolean().default(true),
      requireState: z.boolean().default(true),
      allowedDomains: z.array(z.string()).optional(),
      blockedDomains: z.array(z.string()).optional(),
      minimumSecurityLevel: z.nativeEnum(SecurityLevel).default(SecurityLevel.MEDIUM),
      allowedUserTypes: z.array(z.nativeEnum(UserType)).default([UserType.HUMAN]),
      requiredCapabilities: z.array(z.nativeEnum(AgentCapability)).optional(),
    })
    .optional(),
  agentConfig: z
    .object({
      allowAgentAccess: z.boolean().default(false),
      requiredCapabilities: z.array(z.nativeEnum(AgentCapability)).default([]),
      permissions: z.array(z.string()).default([]),
      rateLimit: z
        .object({
          requests: z.number().min(1),
          windowMs: z.number().min(1000),
        })
        .optional(),
      monitoring: z
        .object({
          logAllRequests: z.boolean().default(true),
          alertOnSuspiciousActivity: z.boolean().default(true),
          maxDailyRequests: z.number().optional(),
        })
        .default({
          logAllRequests: true,
          alertOnSuspiciousActivity: true,
        }),
    })
    .optional(),
  metadata: z.record(z.any()).optional(),
});

export type OAuthProviderConfig = z.infer<typeof OAuthProviderConfigSchema>;

// Agent-specific OAuth connection
export const AgentOAuthConnectionSchema = z.object({
  id: IDSchema,
  agentId: IDSchema,
  providerId: IDSchema,
  providerType: z.nativeEnum(OAuthProviderType),
  capabilities: z.array(z.nativeEnum(AgentCapability)),
  accessToken: z.string(), // Encrypted
  refreshToken: z.string().optional(), // Encrypted
  tokenExpiresAt: z.date().optional(),
  scope: z.array(z.string()),
  permissions: z.array(z.string()),
  isActive: z.boolean().default(true),
  lastUsedAt: z.date().optional(),
  usageStats: z
    .object({
      totalRequests: z.number().min(0).default(0),
      dailyRequests: z.number().min(0).default(0),
      lastResetDate: z.date(),
      errors: z.number().min(0).default(0),
      rateLimitHits: z.number().min(0).default(0),
    })
    .optional(),
  restrictions: z
    .object({
      allowedOperations: z.array(z.string()).optional(),
      blockedOperations: z.array(z.string()).optional(),
      timeRestrictions: z
        .object({
          allowedHours: z.array(z.number().min(0).max(23)).optional(),
          allowedDays: z.array(z.number().min(0).max(6)).optional(),
          timezone: z.string().optional(),
        })
        .optional(),
      ipRestrictions: z.array(z.string()).optional(),
    })
    .optional(),
  metadata: z.record(z.any()).optional(),
});

export type AgentOAuthConnection = z.infer<typeof AgentOAuthConnectionSchema>;

// Enhanced User Schema with OAuth support and Agent capabilities
export const EnhancedUserSchema = BaseEntitySchema.extend({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.string(),
  userType: z.nativeEnum(UserType).default(UserType.HUMAN),
  passwordHash: z.string().optional(),
  securityClearance: z.nativeEnum(SecurityLevel).default(SecurityLevel.MEDIUM),
  isActive: z.boolean().default(true),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  department: z.string().max(100).optional(),
  failedLoginAttempts: z.number().int().min(0).default(0),
  lockedUntil: z.date().optional(),
  passwordChangedAt: z.date().optional(),
  lastLoginAt: z.date().optional(),

  // Agent-specific fields
  agentConfig: z
    .object({
      capabilities: z.array(z.nativeEnum(AgentCapability)).default([]),
      maxConcurrentSessions: z.number().min(1).default(5),
      allowedProviders: z.array(z.nativeEnum(OAuthProviderType)).default([]),
      securityLevel: z.nativeEnum(SecurityLevel).default(SecurityLevel.MEDIUM),
      monitoring: z
        .object({
          logLevel: z.enum(['minimal', 'standard', 'detailed', 'verbose']).default('standard'),
          alertOnNewProvider: z.boolean().default(true),
          alertOnUnusualActivity: z.boolean().default(true),
          maxDailyOperations: z.number().optional(),
        })
        .default({
          logLevel: 'standard',
          alertOnNewProvider: true,
          alertOnUnusualActivity: true,
        }),
      restrictions: z
        .object({
          allowedOperationTypes: z.array(z.string()).optional(),
          blockedOperationTypes: z.array(z.string()).optional(),
          maxFileSize: z.number().optional(), // bytes
          allowedFileTypes: z.array(z.string()).optional(),
          blockedFileTypes: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),

  // OAuth specific fields
  oauthProviders: z
    .array(
      z.object({
        providerId: IDSchema,
        providerType: z.nativeEnum(OAuthProviderType),
        providerUserId: z.string(),
        email: z.string().email().optional(),
        displayName: z.string().optional(),
        avatarUrl: z.string().url().optional(),
        accessToken: z.string().optional(), // Encrypted
        refreshToken: z.string().optional(), // Encrypted
        tokenExpiresAt: z.date().optional(),
        isVerified: z.boolean().default(false),
        isPrimary: z.boolean().default(false),
        linkedAt: z.date(),
        lastUsedAt: z.date().optional(),
        capabilities: z.array(z.nativeEnum(AgentCapability)).optional(), // For agent connections
        metadata: z.record(z.any()).optional(),
      })
    )
    .default([]),

  // MFA Configuration
  mfaEnabled: z.boolean().default(false),
  mfaMethods: z
    .array(
      z.object({
        id: IDSchema,
        type: z.nativeEnum(MFAMethod),
        isEnabled: z.boolean().default(true),
        isPrimary: z.boolean().default(false),
        secret: z.string().optional(), // Encrypted
        backupCodes: z.array(z.string()).optional(), // Encrypted
        phoneNumber: z.string().optional(), // For SMS
        email: z.string().email().optional(), // For email MFA
        deviceInfo: z.record(z.any()).optional(),
        configuredAt: z.date(),
        lastUsedAt: z.date().optional(),
        metadata: z.record(z.any()).optional(),
      })
    )
    .default([]),

  // Security preferences
  securityPreferences: z
    .object({
      requireMFAForSensitiveOperations: z.boolean().default(true),
      sessionTimeout: z.number().min(300).max(86400).default(3600), // seconds
      allowMultipleSessions: z.boolean().default(true),
      trustedDevices: z
        .array(
          z.object({
            deviceId: z.string(),
            deviceName: z.string(),
            userAgent: z.string(),
            ipAddress: z.string(),
            trustedAt: z.date(),
            expiresAt: z.date().optional(),
          })
        )
        .default([]),
      securityNotifications: z
        .object({
          newDevice: z.boolean().default(true),
          suspiciousActivity: z.boolean().default(true),
          passwordChange: z.boolean().default(true),
          mfaChange: z.boolean().default(true),
          oauthProviderChange: z.boolean().default(true),
          agentActivityAlerts: z.boolean().default(true),
        })
        .default({
          newDevice: true,
          suspiciousActivity: true,
          passwordChange: true,
          mfaChange: true,
          oauthProviderChange: true,
          agentActivityAlerts: true,
        }),
    })
    .default({
      requireMFAForSensitiveOperations: true,
      sessionTimeout: 3600,
      allowMultipleSessions: true,
      trustedDevices: [],
      securityNotifications: {
        newDevice: true,
        suspiciousActivity: true,
        passwordChange: true,
        mfaChange: true,
        oauthProviderChange: true,
        agentActivityAlerts: true,
      },
    }),
});

export type EnhancedUser = z.infer<typeof EnhancedUserSchema>;

// Session Management
export const SessionSchema = BaseEntitySchema.extend({
  userId: IDSchema,
  sessionToken: z.string(),
  refreshToken: z.string().optional(),
  status: z.nativeEnum(SessionStatus).default(SessionStatus.ACTIVE),
  userType: z.nativeEnum(UserType).default(UserType.HUMAN),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  deviceInfo: z
    .object({
      deviceId: z.string(),
      deviceName: z.string(),
      deviceType: z.enum(['desktop', 'mobile', 'tablet', 'server', 'agent', 'unknown']),
      os: z.string().optional(),
      browser: z.string().optional(),
      isTrusted: z.boolean().default(false),
    })
    .optional(),
  location: z
    .object({
      country: z.string().optional(),
      region: z.string().optional(),
      city: z.string().optional(),
      timezone: z.string().optional(),
      coordinates: z
        .object({
          latitude: z.number(),
          longitude: z.number(),
        })
        .optional(),
    })
    .optional(),
  authenticationMethod: z.nativeEnum(AuthenticationMethod),
  oauthProvider: z.nativeEnum(OAuthProviderType).optional(),
  agentCapabilities: z.array(z.nativeEnum(AgentCapability)).optional(),
  mfaVerified: z.boolean().default(false),
  riskScore: z.number().min(0).max(10).default(0),
  expiresAt: z.date(),
  lastActivityAt: z.date(),
  metadata: z.record(z.any()).optional(),
});

export type Session = z.infer<typeof SessionSchema>;

// Enhanced Security Context
export const EnhancedSecurityContextSchema = z.object({
  userId: IDSchema,
  sessionId: IDSchema,
  userType: z.nativeEnum(UserType).default(UserType.HUMAN),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  department: z.string().optional(),
  role: z.string(),
  permissions: z.array(z.string()),
  securityLevel: z.nativeEnum(SecurityLevel),
  lastAuthentication: z.date(),
  mfaVerified: z.boolean().default(false),
  riskScore: z.number().min(0).max(10).default(0),

  // Enhanced context
  authenticationMethod: z.nativeEnum(AuthenticationMethod),
  oauthProvider: z.nativeEnum(OAuthProviderType).optional(),
  agentCapabilities: z.array(z.nativeEnum(AgentCapability)).optional(),
  deviceTrusted: z.boolean().default(false),
  locationTrusted: z.boolean().default(false),
  sessionRisk: z
    .object({
      score: z.number().min(0).max(10),
      factors: z.array(z.string()),
      mitigations: z.array(z.string()),
    })
    .optional(),
  compliance: z
    .object({
      frameworks: z.array(z.string()),
      requirements: z.array(z.string()),
      status: z.enum(['compliant', 'non_compliant', 'pending']),
    })
    .optional(),

  // Agent-specific context
  agentContext: z
    .object({
      agentId: IDSchema,
      agentName: z.string(),
      capabilities: z.array(z.nativeEnum(AgentCapability)),
      connectedProviders: z.array(
        z.object({
          providerId: IDSchema,
          providerType: z.nativeEnum(OAuthProviderType),
          capabilities: z.array(z.nativeEnum(AgentCapability)),
          lastUsed: z.date().optional(),
        })
      ),
      operationLimits: z
        .object({
          maxDailyOperations: z.number().optional(),
          currentDailyOperations: z.number().default(0),
          maxConcurrentOperations: z.number().default(5),
          currentConcurrentOperations: z.number().default(0),
        })
        .optional(),
    })
    .optional(),
});

export type EnhancedSecurityContext = z.infer<typeof EnhancedSecurityContextSchema>;

// OAuth Flow State
export const OAuthStateSchema = z.object({
  state: z.string(),
  providerId: IDSchema,
  redirectUri: z.string().url(),
  codeVerifier: z.string().optional(), // For PKCE
  nonce: z.string().optional(),
  scope: z.array(z.string()).optional(),
  userId: IDSchema.optional(), // For linking existing accounts
  userType: z.nativeEnum(UserType).optional(),
  agentCapabilities: z.array(z.nativeEnum(AgentCapability)).optional(),
  metadata: z.record(z.any()).optional(),
  createdAt: z.date(),
  expiresAt: z.date(),
});

export type OAuthState = z.infer<typeof OAuthStateSchema>;

// MFA Challenge
export const MFAChallengeSchema = z.object({
  id: IDSchema,
  userId: IDSchema,
  sessionId: IDSchema,
  method: z.nativeEnum(MFAMethod),
  challenge: z.string(), // Encrypted
  attempts: z.number().min(0).default(0),
  maxAttempts: z.number().min(1).default(3),
  isVerified: z.boolean().default(false),
  createdAt: z.date(),
  expiresAt: z.date(),
  verifiedAt: z.date().optional(),
  metadata: z.record(z.any()).optional(),
});

export type MFAChallenge = z.infer<typeof MFAChallengeSchema>;

// Provider-specific configurations for common services
export const GitHubProviderConfigSchema = OAuthProviderConfigSchema.extend({
  type: z.literal(OAuthProviderType.GITHUB),
  scope: z
    .array(
      z.enum([
        'repo',
        'user',
        'read:user',
        'user:email',
        'public_repo',
        'write:repo_hook',
        'read:repo_hook',
      ])
    )
    .default(['repo', 'user:email']),
  agentConfig: z
    .object({
      allowAgentAccess: z.boolean().default(true),
      requiredCapabilities: z
        .array(z.nativeEnum(AgentCapability))
        .default([AgentCapability.CODE_REPOSITORY]),
      permissions: z
        .array(
          z.enum([
            'clone',
            'pull',
            'push',
            'create_branch',
            'create_pr',
            'merge_pr',
            'create_issue',
            'comment',
          ])
        )
        .default(['clone', 'pull']),
      rateLimit: z
        .object({
          requests: z.number().min(1).default(5000),
          windowMs: z.number().min(1000).default(3600000), // 1 hour
        })
        .optional(),
      monitoring: z
        .object({
          logAllRequests: z.boolean().default(true),
          alertOnSuspiciousActivity: z.boolean().default(true),
          maxDailyRequests: z.number().default(1000),
        })
        .default({
          logAllRequests: true,
          alertOnSuspiciousActivity: true,
          maxDailyRequests: 1000,
        }),
    })
    .optional(),
});

export const EmailProviderConfigSchema = OAuthProviderConfigSchema.extend({
  type: z.enum([OAuthProviderType.GMAIL, OAuthProviderType.OUTLOOK, OAuthProviderType.ZOHO_MAIL]),
  scope: z
    .array(z.string())
    .default([
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ]),
  agentConfig: z
    .object({
      allowAgentAccess: z.boolean().default(true),
      requiredCapabilities: z
        .array(z.nativeEnum(AgentCapability))
        .default([AgentCapability.EMAIL_ACCESS]),
      permissions: z
        .array(z.enum(['read', 'send', 'search', 'label', 'archive', 'delete']))
        .default(['read']),
      rateLimit: z
        .object({
          requests: z.number().min(1).default(250),
          windowMs: z.number().min(1000).default(86400000), // 24 hours
        })
        .optional(),
      monitoring: z
        .object({
          logAllRequests: z.boolean().default(true),
          alertOnSuspiciousActivity: z.boolean().default(true),
          maxDailyRequests: z.number().default(100),
        })
        .default({
          logAllRequests: true,
          alertOnSuspiciousActivity: true,
          maxDailyRequests: 100,
        }),
    })
    .optional(),
});

export type GitHubProviderConfig = z.infer<typeof GitHubProviderConfigSchema>;
export type EmailProviderConfig = z.infer<typeof EmailProviderConfigSchema>;

export const RiskFactorSchema = z.object({
  type: z.string(),
  level: z.nativeEnum(RiskLevel),
  description: z.string(),
  score: z.number().min(0).max(10),
  mitigations: z.array(z.string()).optional(),
});

export type RiskFactor = z.infer<typeof RiskFactorSchema>;

export const RiskAssessmentSchema = z.object({
  level: z.nativeEnum(SecurityLevel),
  overallRisk: z.nativeEnum(RiskLevel),
  score: z.number().min(0).max(10),
  factors: z.array(RiskFactorSchema),
  recommendations: z.array(z.string()),
  mitigations: z.array(z.string()).optional(),
  assessedAt: z.date(),
  assessedBy: IDSchema.optional(),
  validUntil: z.date().optional(),
});

export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

// Permission system
export const PermissionSchema = BaseEntitySchema.extend({
  type: z.nativeEnum(PermissionType),
  resource: z.string(),
  operations: z.array(z.string()),
  conditions: z.record(z.any()).optional(),
  expiresAt: z.date().optional(),
});

export type Permission = z.infer<typeof PermissionSchema>;

export const RoleSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.array(IDSchema),
  isSystemRole: z.boolean().default(false),
  allowedUserTypes: z.array(z.nativeEnum(UserType)).default([UserType.HUMAN]),
  agentCapabilities: z.array(z.nativeEnum(AgentCapability)).optional(),
});

export type Role = z.infer<typeof RoleSchema>;

// Enhanced Security validation
export const EnhancedSecurityValidationRequestSchema = z.object({
  operation: z.object({
    type: z.string(),
    resource: z.string(),
    action: z.string(),
    context: z.record(z.any()).optional(),
  }),
  securityContext: EnhancedSecurityContextSchema,
  requestMetadata: z
    .object({
      requestId: z.string().optional(),
      correlationId: z.string().optional(),
      source: z.string().optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      deadline: z.date().optional(),
    })
    .optional(),
});

export type EnhancedSecurityValidationRequest = z.infer<
  typeof EnhancedSecurityValidationRequestSchema
>;

export const SecurityValidationResultSchema = z.object({
  allowed: z.boolean(),
  approvalRequired: z.boolean(),
  riskLevel: z.nativeEnum(SecurityLevel),
  conditions: z.array(z.string()).optional(),
  reasoning: z.string().optional(),
  requiredApprovers: z.array(IDSchema).optional(),
  validUntil: z.date().optional(),

  // Enhanced result fields
  mfaRequired: z.boolean().default(false),
  mfaMethods: z.array(z.nativeEnum(MFAMethod)).optional(),
  additionalVerification: z.array(z.string()).optional(),
  complianceStatus: z
    .object({
      compliant: z.boolean(),
      violations: z.array(z.string()),
      requirements: z.array(z.string()),
    })
    .optional(),
  monitoring: z
    .object({
      enhanced: z.boolean().default(false),
      duration: z.number().optional(), // minutes
      alerts: z.array(z.string()).optional(),
    })
    .optional(),

  // Agent-specific result fields
  agentRestrictions: z
    .object({
      allowedOperations: z.array(z.string()).optional(),
      blockedOperations: z.array(z.string()).optional(),
      rateLimit: z
        .object({
          requests: z.number(),
          windowMs: z.number(),
        })
        .optional(),
      monitoring: z
        .object({
          logLevel: z.enum(['minimal', 'standard', 'detailed', 'verbose']),
          alertThresholds: z.record(z.number()).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type SecurityValidationResult = z.infer<typeof SecurityValidationResultSchema>;

// Legacy compatibility - keeping original schemas
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
  riskScore: z.number().min(0).max(10).default(0),
});

export type SecurityContext = z.infer<typeof SecurityContextSchema>;

export const SecurityValidationRequestSchema = z.object({
  operation: z.object({
    type: z.string(),
    resource: z.string(),
    action: z.string(),
    context: z.record(z.any()).optional(),
  }),
  securityContext: SecurityContextSchema,
});

export type SecurityValidationRequest = z.infer<typeof SecurityValidationRequestSchema>;

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
  lastLoginAt: z.date().optional(),
});

export type User = z.infer<typeof UserSchema>;

// Approval workflows
export const ApprovalWorkflowSchema = BaseEntitySchema.extend({
  operationId: IDSchema,
  requiredApprovers: z.array(IDSchema),
  currentApprovers: z.array(IDSchema).default([]),
  status: z.nativeEnum(ApprovalStatus).default(ApprovalStatus.PENDING),
  expiresAt: z.date().optional(),
  metadata: z.record(z.any()).optional(),
});

export type ApprovalWorkflow = z.infer<typeof ApprovalWorkflowSchema>;

export const ApprovalDecisionSchema = z.object({
  workflowId: IDSchema,
  approverId: IDSchema,
  decision: z.enum(['approve', 'reject']),
  conditions: z.array(z.string()).optional(),
  feedback: z.string().optional(),
  decidedAt: z.date(),
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
  timestamp: z.date(),
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
  aud: z.string().optional(),
});

export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

// Rate limiting
export const RateLimitSchema = z.object({
  identifier: z.string(),
  limit: z.number().positive(),
  window: z.number().positive(), // seconds
  current: z.number().min(0),
  resetTime: z.date(),
});

export type RateLimit = z.infer<typeof RateLimitSchema>;

// Security policy
export const SecurityPolicySchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  description: z.string(),
  category: z.enum([
    'access_control',
    'data_protection',
    'audit',
    'compliance',
    'incident_response',
    'general',
  ]),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  rules: z.array(
    z.object({
      id: z.string(),
      condition: z.string(),
      action: z.enum(['allow', 'deny', 'require_approval', 'log']),
      parameters: z.record(z.any()).optional(),
    })
  ),
  scope: z.object({
    resourceTypes: z.array(z.string()),
    userRoles: z.array(z.string()),
    departments: z.array(z.string()).optional(),
  }),
  enforcement: z.object({
    enabled: z.boolean().default(true),
    mode: z.enum(['enforce', 'monitor', 'disabled']).default('enforce'),
    exceptions: z.array(z.string()).optional(),
  }),
  compliance: z
    .object({
      frameworks: z.array(z.enum(['sox', 'gdpr', 'hipaa', 'pci', 'iso27001'])),
      requirements: z.array(z.string()),
    })
    .optional(),
  version: z.string(),
  effectiveDate: z.date(),
  expiryDate: z.date().optional(),
  approvedBy: IDSchema,
  lastReviewDate: z.date().optional(),
  nextReviewDate: z.date().optional(),
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
    critical: z.number(),
  }),
  topViolatedPolicies: z.array(
    z.object({
      policyId: IDSchema,
      policyName: z.string(),
      violationCount: z.number(),
    })
  ),
  complianceScore: z.number().min(0).max(100),
  lastAssessment: z.date().optional(),
  generatedAt: z.date(),
});

export type SecurityStats = z.infer<typeof SecurityStatsSchema>;

// Approval requirement check
export const ApprovalRequirementSchema = z.object({
  required: z.boolean(),
  approvers: z.array(IDSchema).optional(),
  reason: z.string().optional(),
  estimatedTime: z.string().optional(),
  escalationPath: z
    .array(
      z.object({
        level: z.number(),
        approvers: z.array(IDSchema),
        timeoutHours: z.number(),
      })
    )
    .optional(),
});

export type ApprovalRequirement = z.infer<typeof ApprovalRequirementSchema>;

// Operation security request
export const OperationSecurityRequestSchema = z.object({
  operation: z.object({
    type: z.string(),
    resource: z.string(),
    action: z.string(),
    parameters: z.record(z.any()).optional(),
  }),
  context: SecurityContextSchema,
  purpose: z.string().optional(),
  urgency: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  requestedAt: z.date(),
});

export type OperationSecurityRequest = z.infer<typeof OperationSecurityRequestSchema>;

// Security violation
export const SecurityViolationSchema = BaseEntitySchema.extend({
  policyId: IDSchema,
  userId: IDSchema.optional(),
  agentId: IDSchema.optional(),
  violationType: z.enum([
    'policy_violation',
    'unauthorized_access',
    'data_breach',
    'suspicious_activity',
  ]),
  severity: z.nativeEnum(SecurityLevel),
  description: z.string(),
  evidence: z.record(z.any()),
  automaticallyDetected: z.boolean().default(true),
  resolved: z.boolean().default(false),
  resolution: z.string().optional(),
  resolvedBy: IDSchema.optional(),
  resolvedAt: z.date().optional(),
  reportedBy: IDSchema.optional(),
  occurredAt: z.date(),
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
  healthCheckResult: z
    .object({
      success: z.boolean(),
      latency: z.number().optional(),
      error: z.string().optional(),
      checkedAt: z.date(),
    })
    .optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// Provider test result
export const ProviderTestResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  latency: z.number().optional(),
  responseTime: z.number().optional(),
  modelAvailable: z.boolean().optional(),
  testedAt: z.date(),
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
  autoApprovalRules: z
    .array(
      z.object({
        condition: z.string(),
        action: z.enum(['approve', 'reject', 'escalate']),
      })
    )
    .optional(),
  expiresAt: z.date().optional(),
  metadata: z.record(z.any()).optional(),
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
  approverStats: z.array(
    z.object({
      approverId: IDSchema,
      totalApprovals: z.number().min(0),
      averageTime: z.number().min(0),
      rejectionRate: z.number().min(0).max(100),
    })
  ),
  generatedAt: z.date(),
});

export type ApprovalStats = z.infer<typeof ApprovalStatsSchema>;
