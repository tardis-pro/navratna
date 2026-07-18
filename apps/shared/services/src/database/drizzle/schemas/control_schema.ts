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
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  decimal,
  real,
  timestamp,
  jsonb,
  json,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { base, llmPreferenceCommonColumns } from './schema_base';
import { ADMIN_ORG_ID } from '../constants';
import type {
  AgentCapability,
  OperationStatus,
  ExecutionPlan,
  ToolCategory,
  JSONSchema,
  ToolExample,
  MCPServerType,
  MCPServerCapabilities,
  MCPServerStats,
  AuthenticationMethod,
  OAuthProviderType,
  LLMProviderUsageType,
} from '@uaip/types';
import {
  SecurityLevel,
  UserType,
  MCPServerStatus,
  SessionStatus,
} from '@uaip/types';

// ─── ORGANIZATIONS ─────────────────────────────────────────────────────────

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    plan: varchar('plan', { length: 50 }).notNull().default('free'),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_organizations_slug').on(t.slug),
    index('idx_organizations_is_active').on(t.isActive),
  ]
);

/**
 * Organization membership ledger. `users.organizationId` remains the user's
 * ACTIVE org (what RLS keys off); this table records every org a user belongs to
 * with their role, so provisioning can add/remove members and support multi-org
 * membership later without changing the RLS model.
 */
export const orgMembers = pgTable(
  'org_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).notNull().default('member'), // owner | admin | member
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uq_org_members_org_user').on(t.organizationId, t.userId),
    index('idx_org_members_user').on(t.userId),
  ]
);

export type OrganizationRow = typeof organizations.$inferSelect;
export type NewOrganizationRow = typeof organizations.$inferInsert;

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
      .default(UserType.HUMAN),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    securityClearance: text('security_clearance')
      .$type<SecurityLevel>()
      .notNull()
      .default(SecurityLevel.MEDIUM),
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
    organizationId: uuid('organization_id')
      .notNull()
      .default(ADMIN_ORG_ID)
      .references(() => organizations.id, { onDelete: 'restrict' }),
  },
  (t) => [
    uniqueIndex('idx_users_email').on(t.email),
    index('idx_users_is_active').on(t.isActive),
    index('idx_users_role').on(t.role),
    index('idx_users_organization_id').on(t.organizationId),
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
      .default(SessionStatus.ACTIVE),
    userType: text('user_type')
      .$type<UserType>()
      .notNull()
      .default(UserType.HUMAN),
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

const userTokenColumns = {
  userId: varchar('user_id').notNull(),
  token: varchar('token', { length: 500 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
};

export const refreshTokens = pgTable(
  'refresh_tokens',
  { ...base, ...userTokenColumns, revokedAt: timestamp('revoked_at') },
  (t) => [
    uniqueIndex('idx_refresh_tokens_token').on(t.token),
    index('idx_refresh_tokens_user_id').on(t.userId),
    index('idx_refresh_tokens_expires_at').on(t.expiresAt),
  ]
);

export const passwordResetTokens = pgTable('password_reset_tokens', {
  ...base,
  userId: varchar('user_id').notNull(),
  token: varchar('token', { length: 500 }).notNull().unique('password_reset_tokens_token_unique'),
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
  // cross-plane ref: intelligence.llmProviders.id OR a provider type tag ('anthropic'/'ollama'/...) — no DB FK, stored as text
  providerId: text('provider_id').notNull(),
  apiKeyEncrypted: text('api_key_encrypted'),
  usageType: text('usage_type').$type<LLMProviderUsageType>(),
  isDefault: boolean('is_default').notNull().default(false),
  configuration: jsonb('configuration').$type<Record<string, unknown>>(),
});

export const userLLMPreferences = pgTable('user_llm_preferences', {
  ...base,
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  temperature: decimal('temperature', { precision: 3, scale: 2 }),
  ...llmPreferenceCommonColumns,
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
      .default(MCPServerStatus.STOPPED),
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

export const workflowDefinitions = pgTable('workflow_definitions', {
  ...base,
  name: text('name').notNull(),
  description: text('description'),
  trigger: jsonb('trigger')
    .$type<{ kind: 'cron' | 'every' | 'webhook' | 'event'; expr: string; tz?: string }>()
    .notNull(),
  steps: jsonb('steps')
    .$type<Array<{ type: 'agentTurn' | 'bash' | 'httpCall'; [key: string]: unknown }>>()
    .notNull(),
  delivery: jsonb('delivery').$type<{
    type: 'webhook' | 'email' | 'slack' | 'whatsapp';
    target: string;
    retryPolicy?: object;
  } | null>(),
  enabled: boolean('enabled').default(true).notNull(),
  agentId: text('agent_id'),
  sessionKey: text('session_key'),
  model: text('model'),
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
  resolved: boolean('resolved').default(false).notNull(),
  resolvedBy: uuid('resolved_by'),
  resolvedAt: timestamp('resolved_at'),
}, (t) => [
  index('idx_audit_events_actor_id').on(t.actorId),
  index('idx_audit_events_event_type').on(t.eventType),
  index('idx_audit_events_created_at').on(t.createdAt),
  index('idx_audit_events_entity_id').on(t.entityId),
]);

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

// ─── FEDERATION ───────────────────────────────────────────────────────────

export const federatedSubdomains = pgTable(
  'federated_subdomains',
  {
    ...base,
    name: varchar('name', { length: 255 }).notNull(),
    subdomain: varchar('subdomain', { length: 255 }).notNull().unique(),
    description: text('description'),
    mcpManifestUrl: text('mcp_manifest_url').notNull(),
    mcpServerUrl: text('mcp_server_url').notNull(),
    transport: varchar('transport', { length: 50 }).notNull().default('streamable-http'),
    status: text('status')
      .$type<'discovered' | 'healthy' | 'degraded' | 'down' | 'deregistered'>()
      .notNull()
      .default('discovered'),
    toolsCount: integer('tools_count').notNull().default(0),
    lastCrawlAt: timestamp('last_crawl_at'),
    lastHealthyAt: timestamp('last_healthy_at'),
    healthEndpoint: text('health_endpoint'),
    iconUrl: text('icon_url'),
    category: varchar('category', { length: 100 }),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    manifestVersion: varchar('manifest_version', { length: 50 }),
    authType: varchar('auth_type', { length: 50 }).notNull().default('tardis-jwt'),
    authConfig: jsonb('auth_config').$type<Record<string, unknown>>(),
    autoDiscovered: boolean('auto_discovered').notNull().default(true),
    registeredBy: uuid('registered_by').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex('idx_federated_subdomains_subdomain').on(t.subdomain),
    index('idx_federated_subdomains_status').on(t.status),
    index('idx_federated_subdomains_category').on(t.category),
  ]
);

export const federatedTools = pgTable(
  'federated_tools',
  {
    ...base,
    subdomainId: uuid('subdomain_id')
      .notNull()
      .references(() => federatedSubdomains.id, { onDelete: 'cascade' }),
    toolName: varchar('tool_name', { length: 255 }).notNull(),
    description: text('description'),
    inputSchema: jsonb('input_schema').$type<Record<string, unknown>>().notNull(),
    category: varchar('category', { length: 100 }),
    isActive: boolean('is_active').notNull().default(true),
    callCount: integer('call_count').notNull().default(0),
    avgResponseMs: integer('avg_response_ms'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (t) => [
    index('idx_federated_tools_subdomain').on(t.subdomainId),
    index('idx_federated_tools_name').on(t.toolName),
    index('idx_federated_tools_category').on(t.category),
    index('idx_federated_tools_active').on(t.isActive),
  ]
);

// ─── DEPLOYMENTS ──────────────────────────────────────────────────────────

export const deployments = pgTable(
  'deployments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subdomainName: varchar('subdomain_name', { length: 255 }).notNull(),
    repoUrl: varchar('repo_url', { length: 512 }),
    platform: varchar('platform', { length: 50 }).notNull(),
    appName: varchar('app_name', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('provisioned'),
    currentVersion: varchar('current_version', { length: 255 }),
    previousVersion: varchar('previous_version', { length: 255 }),
    url: varchar('url', { length: 512 }),
    healthEndpoint: varchar('health_endpoint', { length: 255 }).default('/health'),
    config: jsonb('config').$type<Record<string, unknown>>(),
    lastHealthCheck: timestamp('last_health_check'),
    lastDeployAt: timestamp('last_deploy_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_deployments_subdomain_name').on(t.subdomainName),
    index('idx_deployments_platform').on(t.platform),
    index('idx_deployments_status').on(t.status),
    index('idx_deployments_app_name').on(t.appName),
  ]
);

export const deploymentEvents = pgTable(
  'deployment_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deploymentId: uuid('deployment_id')
      .notNull()
      .references(() => deployments.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    details: jsonb('details').$type<Record<string, unknown>>(),
    triggeredBy: varchar('triggered_by', { length: 50 }).default('user'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_deployment_events_deployment_id').on(t.deploymentId),
    index('idx_deployment_events_event_type').on(t.eventType),
  ]
);

// ─── WORKFLOW COMPOSITIONS & INSTANCES (Self-Composing Platform) ──────────

export const workflowCompositions = pgTable(
  'workflow_compositions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    version: varchar('version', { length: 50 }).default('1.0.0'),
    category: varchar('category', { length: 100 }),
    tags: jsonb('tags').$type<string[]>().default([]),
    definition: jsonb('definition').notNull(), // Full CompositionDefinition
    composedBy: varchar('composed_by', { length: 50 }), // agent, user, marketplace
    agentId: uuid('agent_id'),
    userId: uuid('user_id'),
    isActive: boolean('is_active').default(true).notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    executionCount: integer('execution_count').default(0).notNull(),
    successCount: integer('success_count').default(0).notNull(),
    lastExecutedAt: timestamp('last_executed_at'),
    avgExecutionMs: integer('avg_execution_ms'),
    rating: real('rating'),
    installCount: integer('install_count').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_wf_comp_category').on(t.category),
    index('idx_wf_comp_active').on(t.isActive),
    index('idx_wf_comp_user').on(t.userId),
    index('idx_wf_comp_public').on(t.isPublic),
  ]
);

export const workflowInstances = pgTable(
  'workflow_instances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowId: uuid('workflow_id')
      .references(() => workflowCompositions.id)
      .notNull(),
    status: varchar('status', { length: 30 }).notNull().default('pending'),
    currentStepId: varchar('current_step_id', { length: 100 }),
    triggerType: varchar('trigger_type', { length: 30 }),
    triggerData: jsonb('trigger_data').$type<Record<string, unknown>>(),
    state: jsonb('state').$type<Record<string, unknown>>().default({}),
    error: text('error'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    agentId: uuid('agent_id'),
    failedStepId: varchar('failed_step_id', { length: 100 }),
    toolCallCount: integer('tool_call_count').notNull().default(0),
    totalLatencyMs: integer('total_latency_ms'),
    outputSnapshot: jsonb('output_snapshot').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_workflow_instances_status').on(t.status),
    index('idx_workflow_instances_workflow_id').on(t.workflowId),
    index('idx_workflow_instances_started_at').on(t.startedAt),
    index('idx_workflow_instances_agent_id').on(t.agentId),
  ]
);

export const workflowInstanceSteps = pgTable(
  'workflow_instance_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    instanceId: uuid('instance_id')
      .references(() => workflowInstances.id)
      .notNull(),
    stepId: varchar('step_id', { length: 100 }).notNull(),
    stepName: varchar('step_name', { length: 255 }),
    status: varchar('status', { length: 30 }).notNull().default('pending'),
    toolName: varchar('tool_name', { length: 255 }),
    inputSnapshot: jsonb('input_snapshot').$type<Record<string, unknown>>(),
    outputSnapshot: jsonb('output_snapshot').$type<Record<string, unknown>>(),
    errorMessage: text('error_message'),
    latencyMs: integer('latency_ms'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_workflow_instance_steps_instance_id').on(t.instanceId),
    index('idx_workflow_instance_steps_step_id').on(t.stepId),
    index('idx_workflow_instance_steps_status').on(t.status),
  ]
);

// ─── GDPR ERASURE ─────────────────────────────────────────────────────────

export const erasureStatusEnum = pgEnum('erasure_status', [
  'pending', 'in_progress', 'completed', 'failed',
]);

export const erasureSurfaceEnum = pgEnum('erasure_surface', [
  'pg_control', 'pg_intelligence', 'neo4j', 'qdrant', 'redis',
]);

export const erasureOutbox = pgTable(
  'erasure_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    requestedAt: timestamp('requested_at').defaultNow().notNull(),
    status: erasureStatusEnum('status').notNull().default('pending'),
    storesCompleted: jsonb('stores_completed').$type<Record<string, boolean>>().notNull().default({}),
    completedAt: timestamp('completed_at'),
    error: text('error'),
  },
  (t) => [
    index('idx_erasure_outbox_user_id').on(t.userId),
    index('idx_erasure_outbox_status').on(t.status),
    index('idx_erasure_outbox_requested_at').on(t.requestedAt),
    uniqueIndex('idx_erasure_outbox_user_id_pending').on(t.userId, t.status).where(sql`status = 'pending'`),
  ]
);

export const erasureLedger = pgTable(
  'erasure_ledger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    erasureId: uuid('erasure_id').notNull().references(() => erasureOutbox.id, { onDelete: 'restrict' }),
    surface: erasureSurfaceEnum('surface').notNull(),
    deletedCount: integer('deleted_count').notNull().default(0),
    hashedSubject: varchar('hashed_subject', { length: 64 }).notNull(),
    confirmedAt: timestamp('confirmed_at').defaultNow().notNull(),
    certificateHash: varchar('certificate_hash', { length: 64 }).notNull(),
  },
  (t) => [
    index('idx_erasure_ledger_erasure_id').on(t.erasureId),
    index('idx_erasure_ledger_surface').on(t.surface),
    index('idx_erasure_ledger_hashed_subject').on(t.hashedSubject),
    uniqueIndex('idx_erasure_ledger_erasure_surface').on(t.erasureId, t.surface),
  ]
);

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
export type UserLLMPreference = typeof userLLMPreferences.$inferSelect;
export type NewUserLLMPreference = typeof userLLMPreferences.$inferInsert;
export type ApprovalWorkflow = typeof approvalWorkflows.$inferSelect;
export type NewApprovalWorkflow = typeof approvalWorkflows.$inferInsert;
export type ToolDefinition = typeof toolDefinitions.$inferSelect;
export type NewToolDefinition = typeof toolDefinitions.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type WorkflowDefinition = typeof workflowDefinitions.$inferSelect;
export type NewWorkflowDefinition = typeof workflowDefinitions.$inferInsert;
export type MCPServer = typeof mcpServers.$inferSelect;
export type NewMCPServer = typeof mcpServers.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
export type UserLLMProvider = typeof userLLMProviders.$inferSelect;
export type NewUserLLMProvider = typeof userLLMProviders.$inferInsert;
export type SecurityPolicy = typeof securityPolicies.$inferSelect;
export type NewSecurityPolicy = typeof securityPolicies.$inferInsert;
export type Capability = typeof capabilities.$inferSelect;
export type NewCapability = typeof capabilities.$inferInsert;
export type MfaChallenge = typeof mfaChallenges.$inferSelect;
export type NewMfaChallenge = typeof mfaChallenges.$inferInsert;
export type OAuthProvider = typeof oauthProviders.$inferSelect;
export type NewOAuthProvider = typeof oauthProviders.$inferInsert;
export type OAuthState = typeof oauthStates.$inferSelect;
export type NewOAuthState = typeof oauthStates.$inferInsert;
export type AgentOAuthConnection = typeof agentOAuthConnections.$inferSelect;
export type NewAgentOAuthConnection = typeof agentOAuthConnections.$inferInsert;
export type FederatedSubdomain = typeof federatedSubdomains.$inferSelect;
export type NewFederatedSubdomain = typeof federatedSubdomains.$inferInsert;
export type FederatedTool = typeof federatedTools.$inferSelect;
export type NewFederatedTool = typeof federatedTools.$inferInsert;
export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;
export type DeploymentEvent = typeof deploymentEvents.$inferSelect;
export type NewDeploymentEvent = typeof deploymentEvents.$inferInsert;

// ─── COMPOSITION ATTEMPTS (Replay Buffer) ────────────────────────────────

export const compositionAttempts = pgTable(
  'composition_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    intent: text('intent').notNull(),
    tools: jsonb('tools').$type<string[]>().notNull().default([]),
    definition: jsonb('definition').$type<Record<string, unknown>>(),
    outcome: varchar('outcome', { length: 30 }).notNull(), // 'success' | 'failure' | 'partial'
    failureType: varchar('failure_type', { length: 30 }), // 'structural' | 'binding' | 'semantic' | 'runtime'
    failureDetails: text('failure_details'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_composition_attempts_outcome').on(t.outcome),
    index('idx_composition_attempts_created_at').on(t.createdAt),
  ]
);

export type CompositionAttemptRow = typeof compositionAttempts.$inferSelect;
export type NewCompositionAttemptRow = typeof compositionAttempts.$inferInsert;

// ─── DOMAIN CONFIDENCE PROFILES ───────────────────────────────────────────

export const domainConfidenceProfiles = pgTable(
  'domain_confidence_profiles',
  {
    ...base,
    // cross-plane ref: intelligence.agents.id — no DB FK
    agentId: uuid('agent_id').notNull(),
    domain: varchar('domain', { length: 100 }).notNull(),
    accuracy: decimal('accuracy', { precision: 6, scale: 5 }).notNull().default('0.5'),
    sampleSize: integer('sample_size').notNull().default(0),
    lastComposedAt: timestamp('last_composed_at'),
  },
  (t) => [
    uniqueIndex('idx_domain_confidence_agent_domain').on(t.agentId, t.domain),
    index('idx_domain_confidence_domain').on(t.domain),
  ]
);

export type DomainConfidenceProfileRow = typeof domainConfidenceProfiles.$inferSelect;
export type NewDomainConfidenceProfileRow = typeof domainConfidenceProfiles.$inferInsert;

// ─── COMPOSITION AUDIT EVENTS (Immutable / Merkle-chained) ──────────────

export const compositionAuditEvents = pgTable(
  'composition_audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    actorType: varchar('actor_type', { length: 20 })
      .$type<'user' | 'agent' | 'system'>()
      .notNull(),
    actorId: varchar('actor_id', { length: 255 }).notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    previousHash: varchar('previous_hash', { length: 64 }),
    currentHash: varchar('current_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_composition_audit_entity_id').on(t.entityId),
    index('idx_composition_audit_event_type').on(t.eventType),
    index('idx_composition_audit_created_at').on(t.createdAt),
  ]
);

export type CompositionAuditEvent = typeof compositionAuditEvents.$inferSelect;
export type NewCompositionAuditEvent = typeof compositionAuditEvents.$inferInsert;
export type WorkflowComposition = typeof workflowCompositions.$inferSelect;
export type NewWorkflowComposition = typeof workflowCompositions.$inferInsert;
export type WorkflowInstance = typeof workflowInstances.$inferSelect;
export type NewWorkflowInstance = typeof workflowInstances.$inferInsert;
export type WorkflowInstanceStep = typeof workflowInstanceSteps.$inferSelect;
export type NewWorkflowInstanceStep = typeof workflowInstanceSteps.$inferInsert;
export type ErasureOutboxRow = typeof erasureOutbox.$inferSelect;
export type NewErasureOutboxRow = typeof erasureOutbox.$inferInsert;
export type ErasureLedgerRow = typeof erasureLedger.$inferSelect;
export type NewErasureLedgerRow = typeof erasureLedger.$inferInsert;

// ─── GITHUB APP INSTALLATIONS ───────────────────────────────────────────────
//
// One row per (user, project, repository) binding to a GitHub App installation.
// installationId and repositoryId are stored as decimal strings because GitHub
// uses 64-bit integers that exceed the safe JavaScript integer range in some
// future repos; we never coerce to JS number until we have verified safety.
//
// Cross-plane note: userId is a UUID reference to the intelligence-plane users
// table; no DB-level FK to avoid cross-plane DDL coupling. Integrity enforced
// at application layer.
//
// Uniqueness invariant: at most one *active* binding per (userId, projectId,
// repositoryId) triple — prevents cross-user/cross-project ambiguity.

const REPO_FULL_NAME_RE = /^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/;

export const githubAppInstallations = pgTable(
  'github_app_installations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** GitHub App installation ID stored as decimal string (no length limit). */
    installationId: text('installation_id').notNull(),
    /** GitHub account/org login for the installation (e.g. "acme-corp"). */
    accountLogin: varchar('account_login', { length: 255 }).notNull(),
    /** UUID of the Navratna user who authorised this binding. No cross-plane FK. */
    userId: uuid('user_id').notNull(),
    /** Navratna tenant/organisation ID string (mirrors organisations.id or slug). */
    tenantId: varchar('tenant_id', { length: 255 }).notNull(),
    /** Navratna project ID string. */
    projectId: varchar('project_id', { length: 255 }).notNull(),
    /** GitHub repository numeric ID stored as canonical decimal string (no leading zeros). */
    repositoryId: text('repository_id').notNull(),
    /** GitHub repository full name in "owner/repo" format. Validated at insert. */
    repositoryFullName: varchar('repository_full_name', { length: 512 }).notNull(),
    /** When false the binding must not be used to mint tokens. */
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    // Enforce at most one active binding per (user, project, repository).
    uniqueIndex('uq_gh_app_install_active_user_proj_repo')
      .on(t.userId, t.projectId, t.repositoryId)
      .where(sql`${t.active} = TRUE`),
    // Fast lookup by binding ID (PK already indexed; this index is on composite).
    index('idx_gh_app_install_user_proj').on(t.userId, t.projectId),
    // Lookup by repositoryId (used by broker before minting).
    index('idx_gh_app_install_repo').on(t.repositoryId),
    // Lookup by installationId (used for revocation / admin queries).
    index('idx_gh_app_install_installation_id').on(t.installationId),
  ]
);

export type GitHubAppInstallationRow = typeof githubAppInstallations.$inferSelect;
export type NewGitHubAppInstallationRow = typeof githubAppInstallations.$inferInsert;
