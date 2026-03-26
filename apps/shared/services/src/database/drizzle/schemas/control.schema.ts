/**
 * Control Plane Schema — Navratna v3.0
 *
 * Tables owned by NAVRATNA-GATEWAY (PC-B: Control + Compute)
 * Domain: users, auth, security, operations, tools, MCP, capabilities, projects
 *
 * Cross-plane FK note:
 *   These tables reference entities in the intelligence plane (e.g., agents, personas)
 *   by UUID only — no DB-level FK constraint. Referential integrity is enforced
 *   at the application layer via the CrossPlaneGuard helper in clients/index.ts.
 *
 * Deployment:
 *   Single-machine: POSTGRES_URL_CONTROL = POSTGRES_URL (same DB)
 *   Multi-machine:  POSTGRES_URL_CONTROL = postgresql://pc-b-navratna:5432/navratna
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  decimal,
  timestamp,
  jsonb,
  json,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  SecurityLevel,
  UserType,
  AgentCapability,
  OperationStatus,
  ExecutionPlan,
  ToolCategory,
  JSONSchema,
  ToolExample,
  MCPServerType,
  MCPServerStatus,
  MCPServerCapabilities,
  MCPServerStats,
  SessionStatus,
  AuthenticationMethod,
  OAuthProviderType,
  LLMProviderType,
} from '@uaip/types';

// ─── base ──────────────────────────────────────────────────────────────────

const base = {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
};

// ─── USERS & AUTH ──────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    ...base,
    email: varchar('email', { length: 255 }).notNull().unique(),
    firstName: varchar('first_name', { length: 255 }),
    lastName: varchar('last_name', { length: 255 }),
    department: varchar('department', { length: 100 }),
    role: varchar('role', { length: 50 }).notNull(),
    userType: text('user_type')
      .$type<UserType>()
      .notNull()
      .default('human' as UserType),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    securityClearance: text('security_clearance')
      .$type<SecurityLevel>()
      .notNull()
      .default('medium' as SecurityLevel),
    isActive: boolean('is_active').notNull().default(true),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until'),
    passwordChangedAt: timestamp('password_changed_at'),
    lastLoginAt: timestamp('last_login_at'),
    permissions: json('permissions').$type<string[]>(),
    agentConfig: json('agent_config').$type<{
      capabilities?: AgentCapability[];
      securityLevel?: SecurityLevel;
      restrictions?: Record<string, unknown>;
      monitoring?: { maxDailyOperations?: number; [key: string]: unknown };
      maxConcurrentSessions?: number;
      allowedProviders?: string[];
      [key: string]: unknown;
    }>(),
    userPersona: json('user_persona').$type<{
      workStyle: 'collaborative' | 'independent' | 'hybrid';
      communicationPreference: 'brief' | 'detailed' | 'visual';
      domainExpertise: string[];
      toolPreferences: string[];
      workflowStyle: 'structured' | 'flexible' | 'experimental';
      problemSolvingApproach: 'analytical' | 'creative' | 'pragmatic';
      decisionMaking: 'quick' | 'deliberate' | 'consensus';
      learningStyle: 'hands-on' | 'theoretical' | 'collaborative';
      timeManagement: 'deadline-driven' | 'flexible' | 'time-blocked';
      riskTolerance: 'conservative' | 'moderate' | 'aggressive';
    }>(),
    onboardingProgress: json('onboarding_progress').$type<{
      isCompleted: boolean;
      currentStep: number;
      completedSteps: string[];
      startedAt?: Date;
      completedAt?: Date;
      responses: Record<string, unknown>;
    }>(),
    behavioralPatterns: json('behavioral_patterns').$type<{
      sessionDuration: number;
      activeHours: string[];
      frequentlyUsedTools: string[];
      preferredAgents: string[];
      workflowPatterns: string[];
      interactionStyle: 'direct' | 'exploratory' | 'methodical';
      feedbackPreference: 'immediate' | 'summary' | 'detailed';
    }>(),
  },
  (t) => [
    uniqueIndex('idx_users_email').on(t.email),
    index('idx_users_is_active').on(t.isActive),
    index('idx_users_role').on(t.role),
  ]
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionToken: varchar('session_token', { length: 255 }).notNull().unique(),
    refreshToken: text('refresh_token'),
    status: text('status')
      .$type<SessionStatus>()
      .notNull()
      .default('active' as SessionStatus),
    userType: text('user_type')
      .$type<UserType>()
      .notNull()
      .default('human' as UserType),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    deviceInfo: json('device_info').$type<{
      deviceId?: string;
      deviceName?: string;
      platform?: string;
      browser?: string;
      version?: string;
      isMobile?: boolean;
      isTablet?: boolean;
      isDesktop?: boolean;
    }>(),
    location: json('location').$type<{
      country?: string;
      region?: string;
      city?: string;
      timezone?: string;
      coordinates?: { latitude: number; longitude: number };
    }>(),
    authenticationMethod: text('authentication_method').$type<AuthenticationMethod>().notNull(),
    oauthProvider: text('oauth_provider').$type<OAuthProviderType>(),
    agentCapabilities: json('agent_capabilities').$type<AgentCapability[]>(),
    mfaVerified: boolean('mfa_verified').notNull().default(false),
    riskScore: decimal('risk_score', { precision: 3, scale: 1 }).notNull().default('0'),
    expiresAt: timestamp('expires_at').notNull(),
    lastActivityAt: timestamp('last_activity_at').notNull(),
    metadata: json('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_sessions_user_id').on(t.userId),
    uniqueIndex('idx_sessions_session_token').on(t.sessionToken),
    index('idx_sessions_status').on(t.status),
    index('idx_sessions_expires_at').on(t.expiresAt),
  ]
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    ...base,
    userId: varchar('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 500 }).notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
  },
  (t) => [
    uniqueIndex('idx_refresh_tokens_token').on(t.token),
    index('idx_refresh_tokens_user_id').on(t.userId),
    index('idx_refresh_tokens_expires_at').on(t.expiresAt),
  ]
);

export const passwordResetTokens = pgTable('password_reset_tokens', {
  ...base,
  userId: varchar('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 500 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
});

export const mfaChallenges = pgTable('mfa_challenges', {
  ...base,
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  challengeType: varchar('challenge_type', { length: 50 }).notNull(),
  challengeData: jsonb('challenge_data').$type<Record<string, unknown>>(),
  expiresAt: timestamp('expires_at').notNull(),
  verifiedAt: timestamp('verified_at'),
  attempts: integer('attempts').notNull().default(0),
});

export const oauthProviders = pgTable(
  'oauth_providers',
  {
    ...base,
    name: varchar('name', { length: 255 }).notNull(),
    type: text('type').$type<OAuthProviderType>().notNull(),
    clientId: varchar('client_id', { length: 255 }).notNull(),
    clientSecretEncrypted: text('client_secret_encrypted'),
    authorizationUrl: varchar('authorization_url', { length: 500 }),
    tokenUrl: varchar('token_url', { length: 500 }),
    userInfoUrl: varchar('user_info_url', { length: 500 }),
    scopes: jsonb('scopes').$type<string[]>().default([]),
    isEnabled: boolean('is_enabled').notNull().default(true),
    configuration: jsonb('configuration').$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex('idx_oauth_providers_name').on(t.name),
    index('idx_oauth_providers_type').on(t.type),
  ]
);

export const oauthStates = pgTable('oauth_states', {
  ...base,
  state: varchar('state', { length: 255 }).notNull().unique(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  providerId: uuid('provider_id').references(() => oauthProviders.id, { onDelete: 'cascade' }),
  redirectUrl: varchar('redirect_url', { length: 500 }),
  expiresAt: timestamp('expires_at').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const agentOAuthConnections = pgTable('agent_oauth_connections', {
  ...base,
  // cross-plane ref: intelligence.agents.id — no DB FK
  agentId: uuid('agent_id').notNull(),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => oauthProviders.id, { onDelete: 'cascade' }),
  accessTokenEncrypted: text('access_token_encrypted'),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
  expiresAt: timestamp('expires_at'),
  scopes: jsonb('scopes').$type<string[]>().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const userPreferences = pgTable('user_preferences', {
  ...base,
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  theme: varchar('theme', { length: 50 }).default('dark'),
  language: varchar('language', { length: 10 }).default('en'),
  timezone: varchar('timezone', { length: 100 }),
  notifications: jsonb('notifications').$type<Record<string, unknown>>(),
  accessibility: jsonb('accessibility').$type<Record<string, unknown>>(),
  preferences: jsonb('preferences').$type<Record<string, unknown>>(),
});

export const userContacts = pgTable('user_contacts', {
  ...base,
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  contactUserId: uuid('contact_user_id').references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  relationship: varchar('relationship', { length: 100 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const userMessages = pgTable('user_messages', {
  ...base,
  fromUserId: uuid('from_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  toUserId: uuid('to_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  readAt: timestamp('read_at'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const userPresence = pgTable('user_presence', {
  ...base,
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).notNull().default('offline'),
  lastSeenAt: timestamp('last_seen_at'),
  currentSessionId: uuid('current_session_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const userToolPreferences = pgTable('user_tool_preferences', {
  ...base,
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  preferences: jsonb('preferences').$type<Record<string, unknown>>().notNull().default({}),
  favoriteTools: jsonb('favorite_tools').$type<string[]>().default([]),
  blockedTools: jsonb('blocked_tools').$type<string[]>().default([]),
});

export const userLLMProviders = pgTable('user_llm_providers', {
  ...base,
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // cross-plane ref: intelligence.llmProviders.id — no DB FK
  providerId: uuid('provider_id').notNull(),
  apiKeyEncrypted: text('api_key_encrypted'),
  isDefault: boolean('is_default').notNull().default(false),
  configuration: jsonb('configuration').$type<Record<string, unknown>>(),
});

export const userLLMPreferences = pgTable('user_llm_preferences', {
  ...base,
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  modelId: uuid('model_id'),
  temperature: decimal('temperature', { precision: 3, scale: 2 }),
  maxTokens: integer('max_tokens'),
  systemPrompt: text('system_prompt'),
  preferences: jsonb('preferences').$type<Record<string, unknown>>(),
});

// ─── OPERATIONS ────────────────────────────────────────────────────────────

export const operations = pgTable(
  'operations',
  {
    ...base,
    type: varchar('type', { length: 100 }).notNull(),
    status: text('status').$type<OperationStatus>().notNull(),
    // cross-plane refs: intelligence.agents.id, control.users.id — no DB FK
    agentId: varchar('agent_id').notNull(),
    userId: varchar('user_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    executionPlan: jsonb('execution_plan').$type<ExecutionPlan>().notNull(),
    context: jsonb('context').$type<Record<string, unknown>>(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    error: text('error'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    estimatedDuration: integer('estimated_duration'),
    actualDuration: integer('actual_duration'),
    priority: text('priority').notNull().default('medium'),
    progress: decimal('progress', { precision: 5, scale: 2 }),
    currentStep: integer('current_step').notNull().default(0),
    totalSteps: integer('total_steps'),
    stepDetails: jsonb('step_details').$type<Record<string, unknown>>(),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    retryDelay: integer('retry_delay'),
    timeoutDuration: integer('timeout_duration'),
    resourceRequirements: jsonb('resource_requirements').$type<Record<string, unknown>>(),
    resourceAllocation: jsonb('resource_allocation').$type<Record<string, unknown>>(),
    performanceMetrics: jsonb('performance_metrics').$type<Record<string, unknown>>(),
    qualityMetrics: jsonb('quality_metrics').$type<Record<string, unknown>>(),
    dependencies: jsonb('dependencies').$type<string[]>().notNull().default([]),
    dependentOperations: jsonb('dependent_operations').$type<string[]>().notNull().default([]),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    isArchived: boolean('is_archived').notNull().default(false),
    archivedAt: timestamp('archived_at'),
    archivedBy: varchar('archived_by'),
    archiveReason: text('archive_reason'),
  },
  (t) => [
    index('idx_operations_status_agent').on(t.status, t.agentId),
    index('idx_operations_type_created').on(t.type, t.createdAt),
    index('idx_operations_priority_status').on(t.priority, t.status),
    index('idx_operations_user_id').on(t.userId),
    index('idx_operations_started_completed').on(t.startedAt, t.completedAt),
  ]
);

export const operationStates = pgTable('operation_states', {
  ...base,
  operationId: uuid('operation_id')
    .notNull()
    .references(() => operations.id, { onDelete: 'cascade' }),
  state: jsonb('state').$type<Record<string, unknown>>().notNull(),
  checkpoint: varchar('checkpoint', { length: 255 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const operationCheckpoints = pgTable('operation_checkpoints', {
  ...base,
  operationId: uuid('operation_id')
    .notNull()
    .references(() => operations.id, { onDelete: 'cascade' }),
  stepIndex: integer('step_index').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const stepResults = pgTable('step_results', {
  ...base,
  operationId: uuid('operation_id')
    .notNull()
    .references(() => operations.id, { onDelete: 'cascade' }),
  stepIndex: integer('step_index').notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  result: jsonb('result').$type<Record<string, unknown>>(),
  error: text('error'),
  duration: integer('duration'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const approvalWorkflows = pgTable(
  'approval_workflows',
  {
    ...base,
    operationId: varchar('operation_id').notNull(),
    requiredApprovers: jsonb('required_approvers').$type<string[]>().notNull(),
    currentApprovers: jsonb('current_approvers').$type<string[]>().notNull().default([]),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at'),
    lastReminderAt: timestamp('last_reminder_at'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (t) => [
    index('idx_approval_workflows_operation_status').on(t.operationId, t.status),
    index('idx_approval_workflows_status_expires').on(t.status, t.expiresAt),
    index('idx_approval_workflows_created').on(t.createdAt),
  ]
);

export const approvalDecisions = pgTable('approval_decisions', {
  ...base,
  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => approvalWorkflows.id, { onDelete: 'cascade' }),
  approverId: varchar('approver_id').notNull(),
  decision: text('decision').notNull(),
  reason: text('reason'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

// ─── TOOLS ─────────────────────────────────────────────────────────────────

export const toolDefinitions = pgTable(
  'tool_definitions',
  {
    ...base,
    name: varchar('name', { length: 255 }).notNull().unique(),
    description: text('description').notNull(),
    category: text('category').$type<ToolCategory>().notNull(),
    parameters: jsonb('parameters').$type<JSONSchema>().notNull(),
    returnType: jsonb('return_type').$type<JSONSchema>().notNull(),
    examples: jsonb('examples').$type<ToolExample[]>().notNull().default([]),
    securityLevel: text('security_level').$type<SecurityLevel>().notNull(),
    costEstimate: decimal('cost_estimate', { precision: 10, scale: 2 }),
    executionTimeEstimate: integer('execution_time_estimate'),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    dependencies: jsonb('dependencies').$type<string[]>().notNull().default([]),
    version: varchar('version', { length: 50 }).notNull(),
    author: varchar('author', { length: 255 }).notNull(),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    isEnabled: boolean('is_enabled').notNull().default(true),
    rateLimits: jsonb('rate_limits').$type<Record<string, number>>(),
    totalExecutions: integer('total_executions').notNull().default(0),
    successfulExecutions: integer('successful_executions').notNull().default(0),
    averageExecutionTime: decimal('average_execution_time', { precision: 10, scale: 2 }),
    lastUsedAt: timestamp('last_used_at'),
    documentationUrl: text('documentation_url'),
    supportContact: varchar('support_contact'),
    changelog: jsonb('changelog').$type<Record<string, unknown>[]>().notNull().default([]),
    deploymentConfig: jsonb('deployment_config').$type<Record<string, unknown>>(),
    environmentRequirements: jsonb('environment_requirements').$type<Record<string, unknown>>(),
    reliabilityScore: decimal('reliability_score', { precision: 3, scale: 2 }),
    userRating: decimal('user_rating', { precision: 3, scale: 2 }),
    maintenanceStatus: text('maintenance_status').notNull().default('active'),
  },
  (t) => [
    index('idx_tool_definitions_category_enabled').on(t.category, t.isEnabled),
    index('idx_tool_definitions_security_level').on(t.securityLevel),
    index('idx_tool_definitions_author').on(t.author),
  ]
);

export const toolExecutions = pgTable('tool_executions', {
  ...base,
  toolId: uuid('tool_id')
    .notNull()
    .references(() => toolDefinitions.id, { onDelete: 'restrict' }),
  // cross-plane refs: intelligence.agents.id, control.users.id, control.operations.id
  agentId: uuid('agent_id'),
  userId: uuid('user_id'),
  operationId: uuid('operation_id'),
  status: varchar('status', { length: 50 }).notNull(),
  parameters: jsonb('parameters').$type<Record<string, unknown>>(),
  result: jsonb('result').$type<Record<string, unknown>>(),
  error: text('error'),
  duration: integer('duration'),
  tokensUsed: integer('tokens_used'),
  cost: decimal('cost', { precision: 10, scale: 4 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const toolAssignments = pgTable('tool_assignments', {
  ...base,
  toolId: uuid('tool_id')
    .notNull()
    .references(() => toolDefinitions.id, { onDelete: 'cascade' }),
  // cross-plane ref: intelligence.agents.id — no DB FK
  agentId: uuid('agent_id').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  priority: integer('priority').notNull().default(0),
  configuration: jsonb('configuration').$type<Record<string, unknown>>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const toolUsageRecords = pgTable('tool_usage_records', {
  ...base,
  toolId: uuid('tool_id')
    .notNull()
    .references(() => toolDefinitions.id, { onDelete: 'restrict' }),
  agentId: uuid('agent_id'),
  userId: uuid('user_id'),
  executionId: uuid('execution_id'),
  success: boolean('success').notNull().default(true),
  duration: integer('duration'),
  cost: decimal('cost', { precision: 10, scale: 4 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

// ─── MCP ───────────────────────────────────────────────────────────────────

export const mcpServers = pgTable(
  'mcp_servers',
  {
    ...base,
    name: varchar('name', { length: 255 }).notNull().unique(),
    description: text('description').notNull(),
    type: text('type').$type<MCPServerType>().notNull(),
    command: text('command'),
    args: jsonb('args').$type<string[]>().notNull().default([]),
    env: jsonb('env').$type<Record<string, string>>(),
    workingDirectory: varchar('working_directory'),
    transportType: varchar('transport_type', { length: 20 }).notNull().default('stdio'),
    url: text('url'),
    headers: text('headers'),
    enabled: boolean('enabled').notNull().default(true),
    autoStart: boolean('auto_start').notNull().default(false),
    retryAttempts: integer('retry_attempts').notNull().default(3),
    healthCheckInterval: integer('health_check_interval').notNull().default(30000),
    timeout: integer('timeout').notNull().default(30000),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    author: varchar('author', { length: 255 }).notNull(),
    version: varchar('version', { length: 50 }).notNull(),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    securityLevel: text('security_level').$type<SecurityLevel>().notNull(),
    status: text('status')
      .$type<MCPServerStatus>()
      .notNull()
      .default('stopped' as MCPServerStatus),
    pid: integer('pid'),
    startTime: timestamp('start_time'),
    lastHealthCheck: timestamp('last_health_check'),
    error: text('error'),
    capabilities: jsonb('capabilities').$type<MCPServerCapabilities>(),
    capabilitiesLastUpdated: timestamp('capabilities_last_updated'),
    toolCount: integer('tool_count').notNull().default(0),
    resourceCount: integer('resource_count').notNull().default(0),
    promptCount: integer('prompt_count').notNull().default(0),
    stats: jsonb('stats').$type<MCPServerStats>(),
    totalCalls: integer('total_calls').notNull().default(0),
    successfulCalls: integer('successful_calls').notNull().default(0),
    failedCalls: integer('failed_calls').notNull().default(0),
    averageResponseTime: decimal('average_response_time', { precision: 10, scale: 2 }),
    lastCallTime: timestamp('last_call_time'),
    uptimeSeconds: integer('uptime_seconds').notNull().default(0),
    memoryUsageMb: decimal('memory_usage_mb', { precision: 10, scale: 2 }),
    cpuUsagePercent: decimal('cpu_usage_percent', { precision: 5, scale: 2 }),
    restartCount: integer('restart_count').notNull().default(0),
    lastRestartTime: timestamp('last_restart_time'),
    crashCount: integer('crash_count').notNull().default(0),
    lastCrashTime: timestamp('last_crash_time'),
    deploymentConfig: jsonb('deployment_config').$type<Record<string, unknown>>(),
    environmentVariables: jsonb('environment_variables').$type<Record<string, string>>(),
    resourceLimits: jsonb('resource_limits').$type<Record<string, unknown>>(),
    networkConfig: jsonb('network_config').$type<Record<string, unknown>>(),
    logLevel: text('log_level').notNull().default('info'),
    logRetentionDays: integer('log_retention_days').notNull().default(7),
    debugMode: boolean('debug_mode').notNull().default(false),
    traceEnabled: boolean('trace_enabled').notNull().default(false),
    maintenanceMode: boolean('maintenance_mode').notNull().default(false),
    maintenanceMessage: text('maintenance_message'),
    scheduledMaintenance: timestamp('scheduled_maintenance'),
    deprecationDate: timestamp('deprecation_date'),
    endOfLifeDate: timestamp('end_of_life_date'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    externalReferences: jsonb('external_references').$type<Record<string, string>>(),
    documentationUrl: text('documentation_url'),
    supportContact: varchar('support_contact'),
  },
  (t) => [
    index('idx_mcp_servers_enabled_autostart').on(t.enabled, t.autoStart),
    index('idx_mcp_servers_type').on(t.type),
    index('idx_mcp_servers_status').on(t.status),
    index('idx_mcp_servers_security_level').on(t.securityLevel),
  ]
);

export const mcpToolCalls = pgTable('mcp_tool_calls', {
  ...base,
  serverId: uuid('server_id')
    .notNull()
    .references(() => mcpServers.id, { onDelete: 'cascade' }),
  toolName: varchar('tool_name', { length: 255 }).notNull(),
  agentId: uuid('agent_id'),
  parameters: jsonb('parameters').$type<Record<string, unknown>>(),
  result: jsonb('result').$type<Record<string, unknown>>(),
  error: text('error'),
  status: varchar('status', { length: 50 }).notNull(),
  duration: integer('duration'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

// ─── CAPABILITIES ──────────────────────────────────────────────────────────

export const capabilities = pgTable('capabilities', {
  ...base,
  name: varchar('name', { length: 255 }).notNull().unique(),
  description: text('description'),
  type: varchar('type', { length: 100 }).notNull(),
  configuration: jsonb('configuration').$type<Record<string, unknown>>(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

// ─── PROJECTS ──────────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  ...base,
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  type: varchar('type', { length: 100 }),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  organizationId: uuid('organization_id'),
  settings: jsonb('settings').$type<Record<string, unknown>>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  archivedAt: timestamp('archived_at'),
});

export const projectMembers = pgTable('project_members', {
  ...base,
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  // cross-plane ref: intelligence.agents.id — no DB FK
  agentId: uuid('agent_id'),
  role: varchar('role', { length: 100 }).notNull().default('member'),
  joinedAt: timestamp('joined_at').defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const projectFiles = pgTable('project_files', {
  ...base,
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  path: varchar('path', { length: 1000 }).notNull(),
  mimeType: varchar('mime_type', { length: 255 }),
  sizeBytes: integer('size_bytes'),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const tasks = pgTable('tasks', {
  ...base,
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  priority: varchar('priority', { length: 50 }).notNull().default('medium'),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  dueAt: timestamp('due_at'),
  completedAt: timestamp('completed_at'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

// ─── SECURITY & AUDIT ──────────────────────────────────────────────────────

export const securityPolicies = pgTable('security_policies', {
  ...base,
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  policyType: varchar('policy_type', { length: 100 }).notNull(),
  rules: jsonb('rules').$type<Record<string, unknown>>().notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  priority: integer('priority').notNull().default(0),
  appliesTo: jsonb('applies_to').$type<string[]>().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const auditEvents = pgTable('audit_events', {
  ...base,
  eventType: varchar('event_type', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }),
  entityId: varchar('entity_id'),
  actorId: varchar('actor_id'),
  actorType: varchar('actor_type', { length: 50 }),
  action: varchar('action', { length: 100 }).notNull(),
  outcome: varchar('outcome', { length: 50 }).notNull(),
  details: jsonb('details').$type<Record<string, unknown>>(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const integrationEvents = pgTable('integration_events', {
  ...base,
  eventType: varchar('event_type', { length: 100 }).notNull(),
  source: varchar('source', { length: 100 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  processedAt: timestamp('processed_at'),
  error: text('error'),
  retryCount: integer('retry_count').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

// ─── TYPE EXPORTS ──────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type UserEntity = User;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
export type Operation = typeof operations.$inferSelect;
export type NewOperation = typeof operations.$inferInsert;
export type ApprovalWorkflow = typeof approvalWorkflows.$inferSelect;
export type NewApprovalWorkflow = typeof approvalWorkflows.$inferInsert;
export type ToolDefinition = typeof toolDefinitions.$inferSelect;
export type NewToolDefinition = typeof toolDefinitions.$inferInsert;
export type MCPServer = typeof mcpServers.$inferSelect;
export type NewMCPServer = typeof mcpServers.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
