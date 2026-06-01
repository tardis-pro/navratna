/**
 * Intelligence Plane Schema — Navratna v3.0
 *
 * Tables owned by NAVRATNA-CORE (PC-A: Memory + Intelligence)
 * Domain: agents, personas, knowledge, discussions, artifacts, LLM
 *
 * Cross-plane FK note:
 *   These tables reference entities in the control plane (e.g., users, operations)
 *   by UUID only — no DB-level FK constraint. Referential integrity is enforced
 *   at the application layer via the CrossPlaneGuard helper in clients/index.ts.
 *
 * Deployment:
 *   Single-machine: POSTGRES_URL_INTELLIGENCE = POSTGRES_URL (same DB)
 *   Multi-machine:  POSTGRES_URL_INTELLIGENCE = postgresql://pc-a-navratna:5432/navratna
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  json,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';
const numericDecimal = customType<{ data: number; driverData: string }>({
  dataType(params: { precision?: number; scale?: number }) {
    const { precision, scale } = params;
    if (precision !== undefined && scale !== undefined) {
      return `numeric(${precision},${scale})`;
    }
    if (precision !== undefined) {
      return `numeric(${precision})`;
    }
    return 'numeric';
  },
  toDriver(value: number): string {
    return String(value);
  },
  fromDriver(value: string): number {
    return Number(value);
  },
});
import type {
  AgentRole,
  AgentPersona,
  AgentIntelligenceConfig,
  AgentSecurityContext,
  AgentSkill,
  PersonaTrait,
  ConversationalStyle,
  PersonaValidation,
  PersonaUsageStats,
  PersonaTone,
  PersonaStyle,
  PersonaEnergyLevel,
  DiscussionState,
  DiscussionSettings,
  TurnStrategyConfig,
  SourceType,
  ArtifactType,
  ValidationResult,
} from '@uaip/types';
import {
  PersonaStatus,
  PersonaVisibility,
  LLMProviderType,
  LLMProviderStatus,
  DiscussionStatus,
  DiscussionVisibility,
  KnowledgeType,
  MessageType,
} from '@uaip/types';
import { base, llmPreferenceCommonColumns } from './schema_base';
import { ADMIN_ORG_ID } from '../constants';

// ─── PERSONAS ──────────────────────────────────────────────────────────────

export const personas = pgTable(
  'personas',
  {
    ...base,
    name: varchar('name', { length: 255 }).notNull().unique(),
    role: varchar('role', { length: 255 }).notNull(),
    description: text('description').notNull(),
    background: text('background').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    traits: jsonb('traits').$type<PersonaTrait[]>().notNull().default([]),
    expertise: jsonb('expertise').$type<string[]>().notNull().default([]),
    tone: text('tone').$type<PersonaTone>(),
    style: text('style').$type<PersonaStyle>(),
    energyLevel: text('energy_level').$type<PersonaEnergyLevel>(),
    chattiness: numericDecimal('chattiness', { precision: 3, scale: 2 }),
    empathyLevel: numericDecimal('empathy_level', { precision: 3, scale: 2 }),
    parentPersonas: jsonb('parent_personas').$type<string[]>(),
    hybridTraits: jsonb('hybrid_traits').$type<string[]>(),
    dominantExpertise: varchar('dominant_expertise', { length: 255 }),
    personalityBlend: jsonb('personality_blend').$type<Record<string, number>>(),
    conversationalStyle: jsonb('conversational_style').$type<ConversationalStyle>(),
    status: text('status')
      .$type<PersonaStatus>()
      .notNull()
      .default(PersonaStatus.DRAFT),
    visibility: text('visibility')
      .$type<PersonaVisibility>()
      .notNull()
      .default(PersonaVisibility.PRIVATE),
    // cross-plane ref: control.users.id — no DB FK
    createdBy: varchar('created_by').notNull(),
    organizationId: uuid('organization_id').notNull().default(ADMIN_ORG_ID),
    teamId: varchar('team_id'),
    version: integer('version').notNull().default(1),
    parentPersonaId: varchar('parent_persona_id'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    validation: jsonb('validation').$type<PersonaValidation>(),
    usageStats: jsonb('usage_stats').$type<PersonaUsageStats>(),
    configuration: jsonb('configuration').$type<Record<string, unknown>>(),
    capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
    restrictions: jsonb('restrictions').$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    qualityScore: numericDecimal('quality_score', { precision: 3, scale: 2 }),
    consistencyScore: numericDecimal('consistency_score', { precision: 3, scale: 2 }),
    userSatisfaction: numericDecimal('user_satisfaction', { precision: 3, scale: 2 }),
    totalInteractions: integer('total_interactions').notNull().default(0),
    successfulInteractions: integer('successful_interactions').notNull().default(0),
    lastUsedAt: timestamp('last_used_at'),
    lastUpdatedBy: varchar('last_updated_by'),
  },
  (t) => [
    uniqueIndex('idx_personas_name').on(t.name),
    index('idx_personas_status_visibility').on(t.status, t.visibility),
    index('idx_personas_created_by_org').on(t.createdBy, t.organizationId),
    index('idx_personas_dominant_expertise').on(t.dominantExpertise),
  ]
);

export const personaAnalytics = pgTable('persona_analytics', {
  ...base,
  personaId: uuid('persona_id')
    .notNull()
    .references(() => personas.id, { onDelete: 'cascade' }),
  period: varchar('period', { length: 50 }).notNull(),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  interactions: integer('interactions').notNull().default(0),
  successRate: numericDecimal('success_rate', { precision: 5, scale: 2 }),
  avgResponseTime: numericDecimal('avg_response_time', { precision: 10, scale: 2 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

// ─── AGENTS ────────────────────────────────────────────────────────────────

export const agents = pgTable(
  'agents',
  {
    ...base,
    name: varchar('name', { length: 255 }).notNull().unique(),
    description: text('description'),
    role: text('role').$type<AgentRole>().notNull(),
    personaId: uuid('persona_id')
      .notNull()
      .references(() => personas.id),
    legacyPersona: jsonb('legacy_persona').$type<AgentPersona>(),
    intelligenceConfig: jsonb('intelligence_config').$type<AgentIntelligenceConfig>().notNull(),
    securityContext: jsonb('security_context').$type<AgentSecurityContext>().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    // cross-plane ref: control.users.id — no DB FK
    createdBy: varchar('created_by').notNull(),
    lastActiveAt: timestamp('last_active_at'),
    status: text('status').notNull().default('idle'),
    capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
    skills: jsonb('skills').$type<AgentSkill[]>().notNull().default([]),
    capabilityScores: jsonb('capability_scores').$type<Record<string, number>>(),
    learningHistory: jsonb('learning_history')
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    performanceMetrics: jsonb('performance_metrics').$type<Record<string, unknown>>(),
    securityLevel: text('security_level').notNull().default('medium'),
    complianceTags: jsonb('compliance_tags').$type<string[]>().notNull().default([]),
    auditTrail: jsonb('audit_trail').$type<Record<string, unknown>[]>().notNull().default([]),
    configuration: jsonb('configuration').$type<Record<string, unknown>>(),
    preferences: jsonb('preferences').$type<Record<string, unknown>>(),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    version: varchar('version', { length: 50 }).notNull().default('1.0.0'),
    deploymentEnvironment: varchar('deployment_environment', { length: 50 }),
    totalOperations: integer('total_operations').notNull().default(0),
    successfulOperations: integer('successful_operations').notNull().default(0),
    averageResponseTime: numericDecimal('average_response_time', { precision: 10, scale: 2 }),
    lastPerformanceReview: timestamp('last_performance_review'),
    toolPermissions: jsonb('tool_permissions').$type<Record<string, unknown>>(),
    toolPreferences: jsonb('tool_preferences').$type<Record<string, unknown>>(),
    toolBudget: jsonb('tool_budget').$type<Record<string, unknown>>(),
    maxConcurrentTools: integer('max_concurrent_tools').notNull().default(3),
    assignedMCPTools: jsonb('assigned_mcp_tools')
      .$type<
        Array<{
          toolId: string;
          toolName: string;
          serverName: string;
          enabled: boolean;
          priority?: number;
          parameters?: Record<string, unknown>;
        }>
      >()
      .notNull()
      .default([]),
    mcpToolSettings: jsonb('mcp_tool_settings').$type<{
      allowedServers?: string[];
      blockedServers?: string[];
      maxToolsPerServer?: number;
      autoDiscoveryEnabled?: boolean;
    }>(),
    modelId: varchar('model_id'),
    apiType: text('api_type'),
    // cross-plane ref: control.userLLMProviders.id — no DB FK
    userLLMProviderId: uuid('user_llm_provider_id'),
    temperature: numericDecimal('temperature', { precision: 3, scale: 2 }),
    maxTokens: integer('max_tokens'),
    systemPrompt: text('system_prompt'),
    organizationId: uuid('organization_id').notNull().default(ADMIN_ORG_ID),
  },
  (t) => [
    uniqueIndex('idx_agents_name').on(t.name),
    index('idx_agents_role_active').on(t.role, t.isActive),
    index('idx_agents_created_by').on(t.createdBy),
    index('idx_agents_last_active').on(t.lastActiveAt),
    index('idx_agents_security_level').on(t.securityLevel),
    index('idx_agents_persona_id').on(t.personaId),
    index('idx_agents_organization_id').on(t.organizationId),
  ]
);

export const agentLLMPreferences = pgTable('agent_llm_preferences', {
  ...base,
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  temperature: numericDecimal('temperature', { precision: 3, scale: 2 }),
  ...llmPreferenceCommonColumns,
});

export const agentCapabilityMetrics = pgTable('agent_capability_metrics', {
  ...base,
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  capability: varchar('capability', { length: 255 }).notNull(),
  score: numericDecimal('score', { precision: 5, scale: 2 }).notNull(),
  evaluatedAt: timestamp('evaluated_at').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const agentActivity = pgTable('agent_activity', {
  ...base,
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  activityType: varchar('activity_type', { length: 100 }).notNull(),
  duration: integer('duration'),
  success: boolean('success').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const agentLearningRecords = pgTable('agent_learning_records', {
  ...base,
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  lessonType: varchar('lesson_type', { length: 100 }).notNull(),
  content: jsonb('content').$type<Record<string, unknown>>().notNull(),
  confidence: numericDecimal('confidence', { precision: 3, scale: 2 }),
  appliedAt: timestamp('applied_at'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

// ─── KNOWLEDGE ─────────────────────────────────────────────────────────────

export const knowledgeItems = pgTable(
  'knowledge_items',
  {
    ...base,
    content: text('content').notNull(),
    type: text('type')
      .$type<KnowledgeType>()
      .notNull()
      .default(KnowledgeType.FACTUAL),
    sourceType: text('source_type').$type<SourceType>().notNull(),
    sourceIdentifier: varchar('source_identifier', { length: 255 }).notNull(),
    sourceUrl: text('source_url'),
    tags: text('tags').array().notNull().default([]),
    confidence: numericDecimal('confidence', { precision: 3, scale: 2 }).notNull().default(0.8),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    // cross-plane refs: control.users.id, intelligence.agents.id
    createdBy: varchar('created_by', { length: 36 }),
    organizationId: uuid('organization_id').notNull().default(ADMIN_ORG_ID),
    accessLevel: varchar('access_level', { length: 50 }).notNull().default('public'),
    userId: varchar('user_id', { length: 36 }),
    agentId: varchar('agent_id', { length: 36 }),
    summary: text('summary'),
  },
  (t) => [
    index('idx_knowledge_items_source').on(t.sourceType, t.sourceIdentifier),
    index('idx_knowledge_items_type').on(t.type),
    index('idx_knowledge_items_confidence').on(t.confidence),
    index('idx_knowledge_items_created_at').on(t.createdAt),
    index('idx_knowledge_items_user_type').on(t.userId, t.type),
    index('idx_knowledge_items_agent_type').on(t.agentId, t.type),
    index('idx_knowledge_items_organization_id').on(t.organizationId),
  ]
);

export const knowledgeRelationships = pgTable('knowledge_relationships', {
  ...base,
  sourceId: uuid('source_id')
    .notNull()
    .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
  targetId: uuid('target_id')
    .notNull()
    .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
  relationshipType: varchar('relationship_type', { length: 100 }).notNull(),
  strength: numericDecimal('strength', { precision: 3, scale: 2 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

// ─── DISCUSSIONS ───────────────────────────────────────────────────────────

export const discussions = pgTable('discussions', {
  ...base,
  title: varchar('title', { length: 255 }).notNull(),
  topic: varchar('topic', { length: 1000 }).notNull(),
  description: text('description'),
  documentId: uuid('document_id'),
  // cross-plane ref: control.operations.id — no DB FK
  operationId: uuid('operation_id'),
  state: jsonb('state').$type<DiscussionState>(),
  settings: jsonb('settings').$type<DiscussionSettings>().notNull(),
  turnStrategy: jsonb('turn_strategy').$type<TurnStrategyConfig>().notNull(),
  status: text('status')
    .$type<DiscussionStatus>()
    .notNull()
    .default(DiscussionStatus.DRAFT),
  visibility: text('visibility')
    .$type<DiscussionVisibility>()
    .notNull()
    .default(DiscussionVisibility.PRIVATE),
  // cross-plane ref: control.users.id — no DB FK
  createdBy: uuid('created_by').notNull(),
  organizationId: uuid('organization_id').notNull().default(ADMIN_ORG_ID),
  teamId: uuid('team_id'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  scheduledFor: timestamp('scheduled_for'),
  estimatedDuration: integer('estimated_duration'),
  actualDuration: integer('actual_duration'),
  tags: text('tags').array().notNull().default([]),
  objectives: text('objectives').array().notNull().default([]),
  outcomes: jsonb('outcomes')
    .$type<Array<{ outcome: string; achievedAt: Date; confidence: number }>>()
    .notNull()
    .default([]),
  relatedDiscussions: uuid('related_discussions').array().notNull().default([]),
  parentDiscussionId: uuid('parent_discussion_id'),
  childDiscussions: uuid('child_discussions').array().notNull().default([]),
  analytics: jsonb('analytics').$type<{
    totalMessages: number;
    uniqueParticipants: number;
    averageMessageLength: number;
    participationDistribution?: Record<string, number>;
    sentimentDistribution?: Record<string, number>;
    topicProgression: Array<{ topic: string; timestamp: Date; confidence: number }>;
  }>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
},
(t) => [
  index('idx_discussions_organization_id').on(t.organizationId),
]
);

export const discussionParticipants = pgTable('discussion_participants', {
  ...base,
  discussionId: uuid('discussion_id')
    .notNull()
    .references(() => discussions.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  // cross-plane ref: control.users.id — no DB FK
  userId: uuid('user_id'),
  personaId: uuid('persona_id').references(() => personas.id, { onDelete: 'set null' }),
  role: varchar('role', { length: 100 }),
  participantType: varchar('participant_type', { length: 50 }),
  joinedAt: timestamp('joined_at'),
  leftAt: timestamp('left_at'),
  isActive: boolean('is_active').notNull().default(true),
  turnCount: integer('turn_count').notNull().default(0),
  messageCount: integer('message_count').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

export const discussionMessages = pgTable('discussion_messages', {
  ...base,
  discussionId: uuid('discussion_id')
    .notNull()
    .references(() => discussions.id, { onDelete: 'cascade' }),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => discussionParticipants.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  messageType: text('message_type')
    .$type<MessageType>()
    .notNull()
    .default(MessageType.MESSAGE),
  replyToMessageId: uuid('reply_to_message_id'),
  attachments: text('attachments').array().notNull().default([]),
  reactions: jsonb('reactions').$type<Record<string, string[]>>(),
  isEdited: boolean('is_edited').notNull().default(false),
  editedAt: timestamp('edited_at'),
  editReason: text('edit_reason'),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
  deletedBy: uuid('deleted_by'),
  isPinned: boolean('is_pinned').notNull().default(false),
  pinnedAt: timestamp('pinned_at'),
  pinnedBy: uuid('pinned_by'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  confidence: numericDecimal('confidence', { precision: 5, scale: 4 }),
  agentId: uuid('agent_id'),
  processingInfo: jsonb('processing_info').$type<{
    source: string;
    processingTime?: number;
    llmModel?: string;
    llmProvider?: string;
    isInitialParticipation?: boolean;
  }>(),
  organizationId: uuid('organization_id').notNull().default(ADMIN_ORG_ID),
},
(t) => [
  index('idx_discussion_messages_organization_id').on(t.organizationId),
]
);

export const conversationContexts = pgTable('conversation_contexts', {
  ...base,
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  discussionId: uuid('discussion_id').references(() => discussions.id, { onDelete: 'set null' }),
  contextData: jsonb('context_data').$type<Record<string, unknown>>().notNull().default({}),
  summary: text('summary'),
  tokenCount: integer('token_count'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

// ─── ARTIFACTS ─────────────────────────────────────────────────────────────

export const artifacts = pgTable(
  'artifacts',
  {
    ...base,
    type: text('type').$type<ArtifactType>().notNull(),
    content: text('content').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    language: varchar('language'),
    framework: varchar('framework'),
    targetFile: varchar('target_file'),
    estimatedEffort: text('estimated_effort'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    // cross-plane ref: control.projects.id — no DB FK
    projectId: uuid('project_id'),
    conversationId: varchar('conversation_id').notNull(),
    generatedBy: varchar('generated_by').notNull(),
    generatedAt: timestamp('generated_at').notNull(),
    generator: varchar('generator', { length: 255 }).notNull(),
    confidence: numericDecimal('confidence', { precision: 3, scale: 2 }).notNull(),
    sourceMessages: jsonb('source_messages').$type<string[]>().notNull().default([]),
    validationResult: jsonb('validation_result').$type<ValidationResult>(),
    validationStatus: text('validation_status').notNull().default('pending'),
    validationScore: numericDecimal('validation_score', { precision: 3, scale: 2 }),
    version: varchar('version', { length: 50 }).notNull().default('1.0.0'),
    parentArtifactId: varchar('parent_artifact_id'),
    iterationCount: integer('iteration_count').notNull().default(1),
    isLatestVersion: boolean('is_latest_version').notNull().default(true),
    status: text('status').notNull().default('draft'),
    approvedBy: varchar('approved_by'),
    approvedAt: timestamp('approved_at'),
    deployedAt: timestamp('deployed_at'),
    archivedAt: timestamp('archived_at'),
    qualityScore: numericDecimal('quality_score', { precision: 3, scale: 2 }),
    userRating: numericDecimal('user_rating', { precision: 3, scale: 2 }),
    usageCount: integer('usage_count').notNull().default(0),
    downloadCount: integer('download_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at'),
    contentSizeBytes: integer('content_size_bytes'),
    lineCount: integer('line_count'),
    complexityScore: numericDecimal('complexity_score', { precision: 3, scale: 2 }),
    securityLevel: text('security_level').notNull().default('medium'),
    complianceTags: jsonb('compliance_tags').$type<string[]>().notNull().default([]),
    securityScanResult: jsonb('security_scan_result').$type<Record<string, unknown>>(),
    license: varchar('license'),
    dependencies: jsonb('dependencies').$type<string[]>().notNull().default([]),
    systemRequirements: jsonb('system_requirements').$type<Record<string, unknown>>(),
    deploymentConfig: jsonb('deployment_config').$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    generationContext: jsonb('generation_context').$type<Record<string, unknown>>(),
    externalReferences: jsonb('external_references').$type<Record<string, string>>(),
    organizationId: uuid('organization_id').notNull().default(ADMIN_ORG_ID),
  },
  (t) => [
    index('idx_artifacts_type_created').on(t.type, t.createdAt),
    index('idx_artifacts_conversation_id').on(t.conversationId),
    index('idx_artifacts_generated_by').on(t.generatedBy),
    index('idx_artifacts_language_framework').on(t.language, t.framework),
    index('idx_artifacts_organization_id').on(t.organizationId),
  ]
);

export const artifactReviews = pgTable('artifact_reviews', {
  ...base,
  artifactId: uuid('artifact_id')
    .notNull()
    .references(() => artifacts.id, { onDelete: 'cascade' }),
  reviewerId: varchar('reviewer_id').notNull(),
  status: text('status').notNull().default('pending'),
  score: numericDecimal('score', { precision: 3, scale: 2 }),
  comments: text('comments'),
  suggestions: jsonb('suggestions').$type<string[]>().notNull().default([]),
  reviewedAt: timestamp('reviewed_at'),
  qualityScore: numericDecimal('quality_score', { precision: 3, scale: 2 }),
  securityScore: numericDecimal('security_score', { precision: 3, scale: 2 }),
  performanceScore: numericDecimal('performance_score', { precision: 3, scale: 2 }),
  maintainabilityScore: numericDecimal('maintainability_score', { precision: 3, scale: 2 }),
  documentationScore: numericDecimal('documentation_score', { precision: 3, scale: 2 }),
  codeQualityFeedback: text('code_quality_feedback'),
  securityFeedback: text('security_feedback'),
  performanceFeedback: text('performance_feedback'),
  documentationFeedback: text('documentation_feedback'),
  reviewDurationMinutes: integer('review_duration_minutes'),
  reviewType: text('review_type').notNull().default('manual'),
  reviewPriority: text('review_priority').notNull().default('medium'),
  requiresFollowUp: boolean('requires_follow_up').notNull().default(false),
  followUpDate: timestamp('follow_up_date'),
  approvalLevel: text('approval_level'),
  escalatedTo: varchar('escalated_to'),
  escalatedAt: timestamp('escalated_at'),
  escalationReason: text('escalation_reason'),
  checklistItems: jsonb('checklist_items').$type<Record<string, unknown>[]>().notNull().default([]),
  complianceChecks: jsonb('compliance_checks')
    .$type<Record<string, unknown>[]>()
    .notNull()
    .default([]),
  securityScanPassed: boolean('security_scan_passed'),
  automatedTestsPassed: boolean('automated_tests_passed'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  reviewContext: jsonb('review_context').$type<Record<string, unknown>>(),
  externalReferences: jsonb('external_references').$type<Record<string, string>>(),
});

export const artifactDeployments = pgTable('artifact_deployments', {
  ...base,
  artifactId: uuid('artifact_id')
    .notNull()
    .references(() => artifacts.id, { onDelete: 'cascade' }),
  environment: varchar('environment', { length: 100 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  deployedBy: varchar('deployed_by').notNull(),
  deployedAt: timestamp('deployed_at').notNull(),
  rollbackAt: timestamp('rollback_at'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
});

// ─── LLM ───────────────────────────────────────────────────────────────────

export const llmProviders = pgTable(
  'llm_providers',
  {
    ...base,
    name: varchar('name', { length: 255 }).notNull().unique(),
    description: varchar('description', { length: 500 }),
    type: text('type')
      .$type<LLMProviderType>()
      .notNull()
      .default(LLMProviderType.CUSTOM),
    baseUrl: varchar('base_url', { length: 500 }).notNull(),
    apiKeyEncrypted: text('api_key_encrypted'),
    defaultModel: varchar('default_model', { length: 255 }),
    configuration: json('configuration').$type<{
      timeout?: number;
      retries?: number;
      rateLimit?: number;
      headers?: Record<string, string>;
      customEndpoints?: { models?: string; chat?: string; completions?: string };
    }>(),
    status: text('status')
      .$type<LLMProviderStatus>()
      .notNull()
      .default(LLMProviderStatus.ACTIVE),
    isActive: boolean('is_active').notNull().default(true),
    priority: integer('priority').notNull().default(0),
    totalTokensUsed: integer('total_tokens_used').notNull().default(0),
    totalRequests: integer('total_requests').notNull().default(0),
    totalErrors: integer('total_errors').notNull().default(0),
    lastUsedAt: timestamp('last_used_at'),
    lastHealthCheckAt: timestamp('last_health_check_at'),
    healthCheckResult: json('health_check_result').$type<{
      status: 'healthy' | 'unhealthy' | 'unknown';
      latency?: number;
      error?: string;
      checkedAt: Date;
    }>(),
    // cross-plane refs: control.users.id — no DB FK
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    organizationId: uuid('organization_id').notNull().default(ADMIN_ORG_ID),
  },
  (t) => [
    uniqueIndex('idx_llm_providers_name').on(t.name),
    index('idx_llm_providers_type_active').on(t.type, t.isActive),
    index('idx_llm_providers_organization_id').on(t.organizationId),
  ]
);

export const llmModels = pgTable('llm_models', {
  ...base,
  providerId: uuid('provider_id')
    .notNull()
    .references(() => llmProviders.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  description: text('description'),
  contextWindow: integer('context_window'),
  maxOutputTokens: integer('max_output_tokens'),
  inputCostPer1kTokens: numericDecimal('input_cost_per_1k_tokens', { precision: 10, scale: 6 }),
  outputCostPer1kTokens: numericDecimal('output_cost_per_1k_tokens', { precision: 10, scale: 6 }),
  capabilities: jsonb('capabilities').$type<string[]>().default([]),
  isEnabled: boolean('is_enabled').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  organizationId: uuid('organization_id').notNull().default(ADMIN_ORG_ID),
},
(t) => [
  index('idx_llm_models_organization_id').on(t.organizationId),
]
);

export const shortLinks = pgTable(
  'short_links',
  {
    ...base,
    shortCode: varchar('short_code', { length: 20 }).notNull().unique(),
    originalUrl: text('original_url').notNull(),
    title: varchar('title', { length: 255 }),
    description: text('description'),
    type: text('type').notNull().default('external'),
    status: text('status').notNull().default('active'),
    // cross-plane ref: control.users.id — no DB FK
    createdById: uuid('created_by_id').notNull(),
    artifactId: uuid('artifact_id').references(() => artifacts.id, { onDelete: 'set null' }),
    projectFileId: uuid('project_file_id'),
    expiresAt: timestamp('expires_at'),
    accessRestrictions: jsonb('access_restrictions')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    analytics: jsonb('analytics').$type<Record<string, unknown>>().notNull().default({}),
    tags: json('tags').$type<string[]>(),
    customDomain: varchar('custom_domain', { length: 500 }),
    password: varchar('password', { length: 100 }),
    lastClickedAt: timestamp('last_clicked_at'),
    clickCount: integer('click_count').notNull().default(0),
    isPublic: boolean('is_public').notNull().default(true),
    metadata: json('metadata').$type<Record<string, unknown>>(),
    qrCode: text('qr_code'),
    trackClicks: boolean('track_clicks').notNull().default(true),
    utmSource: varchar('utm_source', { length: 200 }),
    utmMedium: varchar('utm_medium', { length: 200 }),
    utmCampaign: varchar('utm_campaign', { length: 200 }),
    organizationId: uuid('organization_id').notNull().default(ADMIN_ORG_ID),
  },
  (t) => [
    uniqueIndex('idx_short_links_code').on(t.shortCode),
    index('idx_short_links_created_by').on(t.createdById),
    index('idx_short_links_type').on(t.type),
    index('idx_short_links_status').on(t.status),
    index('idx_short_links_expires_at').on(t.expiresAt),
    index('idx_short_links_organization_id').on(t.organizationId),
  ]
);

// ─── TYPE EXPORTS ──────────────────────────────────────────────────────────

export type Persona = typeof personas.$inferSelect;
export type NewPersona = typeof personas.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
export type KnowledgeItemEntity = KnowledgeItem;
export type NewKnowledgeItem = typeof knowledgeItems.$inferInsert;
export type KnowledgeRelationship = typeof knowledgeRelationships.$inferSelect;
export type KnowledgeRelationshipEntity = KnowledgeRelationship;
export type NewKnowledgeRelationship = typeof knowledgeRelationships.$inferInsert;
export type Discussion = typeof discussions.$inferSelect;
export type NewDiscussion = typeof discussions.$inferInsert;
export type DiscussionParticipant = typeof discussionParticipants.$inferSelect;
export type NewDiscussionParticipant = typeof discussionParticipants.$inferInsert;
export type DiscussionMessage = typeof discussionMessages.$inferSelect;
export type NewDiscussionMessage = typeof discussionMessages.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type ArtifactReview = typeof artifactReviews.$inferSelect;
export type NewArtifactReview = typeof artifactReviews.$inferInsert;
export type LLMProvider = typeof llmProviders.$inferSelect;
export type NewLLMProvider = typeof llmProviders.$inferInsert;
export type LLMModel = typeof llmModels.$inferSelect;
export type NewLLMModel = typeof llmModels.$inferInsert;
export type ShortLink = typeof shortLinks.$inferSelect;
export type NewShortLink = typeof shortLinks.$inferInsert;
export type AgentLLMPreference = typeof agentLLMPreferences.$inferSelect;
export type NewAgentLLMPreference = typeof agentLLMPreferences.$inferInsert;
