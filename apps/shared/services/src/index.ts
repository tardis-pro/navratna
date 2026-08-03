/**
 * UAIP Shared Services - Clean Export Index
 * Organized by functional categories with no duplicates
 */

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================
export { SecurityLevel } from '@uaip/types';

// =============================================================================
// CORE INFRASTRUCTURE
// =============================================================================

// Base Service Classes for all microservices
export { BaseService, createService } from './base_service';
export type { ServiceConfig } from './base_service';

// HTTP Server (Elysia)
export { createAppServer } from './http_app';

// Database Services (consolidated - no duplicates)
export * from './database/index';

// MCP Services
export { MCPService } from './services/m_c_p_service';

// Communication Services - re-exported from @uaip/infra
export { EventBusService } from '@uaip/infra';

// Cache Services - re-exported from @uaip/infra
export { RedisCacheService, redisCacheService } from '@uaip/infra';

// Database Services - full DatabaseService from local databaseService.ts
// (exported via export * from './database/index' on line 22)

// Agent Intelligence Services
// LLMPreferenceResolutionService deprecated - use UnifiedModelSelectionFacade from BaseService

// =============================================================================
// UNIFIED MODEL SELECTION SERVICES
// =============================================================================

// Unified Model Selection System (replaces distributed selection logic)
export {
  ModelSelectionOrchestrator,
  AgentSpecificStrategy,
  UserSpecificStrategy,
  PerformanceOptimizedStrategy,
  ContextAwareStrategy,
  SystemDefaultStrategy,
  UNIFIED_SYSTEM_DEFAULTS,
} from './services/model_selection_orchestrator';
export type {
  ModelSelectionRequest,
  ModelSelectionResult,
  FallbackChain,
  ModelSelectionStrategy,
  ModelSelectionContext,
} from '@uaip/types';

export { UnifiedModelSelectionFacade } from './services/unified_model_selection_facade';
export type {
  UnifiedModelSelection,
  UnifiedSelectionRequest,
  SelectionMetrics,
} from './services/unified_model_selection_facade';

// Conversation Utilities
export { ConversationUtils } from './conversation/index';

// Vector Search Services
export { QdrantService, buildVectorFilters } from './qdrant_service';

// LLM Request Tracking Service
export { LLMRequestTracker } from './llm_request_tracker_service';

// =============================================================================
// DOMAIN SERVICES
// =============================================================================

// Domain Service Base Class
export { BaseDomainService } from './services/base_domain_service';

export { UserErasureService } from './user_erasure_service';

// Agent access guard — per-user agent assignment authorization
export {
  AgentAccessDeniedError,
  ONBOARDING_GUIDE_AGENT_ID,
  assertAgentAccess,
  canAccessAgent,
  isPrivilegedRole,
} from './agent_access_service';
export type { AgentAccessContext, AgentAccessOptions } from './agent_access_service';
export {
  ADMIN_ORG_ID,
  isOfferableToOrg,
  isPlatformAgentOrg,
} from './database/drizzle/constants';

// Conversational onboarding — server-owned interview state, LLM extracts deltas only
export { ONBOARDING_SLOTS } from './onboarding/types';
export type {
  OnboardingSlot,
  SlotStatus,
  InterviewStatus,
  InterviewSlot,
  UserIntent,
} from './onboarding/types';
export {
  ExtractedSlotUpdateSchema,
  SlotSourceKindSchema,
  SlotUpdateStatusSchema,
  TurnExtractionSchema,
  UserIntentSchema,
  BaseImprintSchema,
} from './onboarding/schemas';
export type {
  BaseImprint,
  ExtractedSlotUpdate,
  SlotSourceKind,
  SlotUpdate,
  SlotUpdateStatus,
  TurnExtraction,
} from './onboarding/schemas';
export {
  ExtractionFailedError,
  composeQuestion,
  extractJsonBlock,
  extractTurn,
  setOnboardingLLMGateway,
} from './onboarding/extraction_service';
export type {
  ComposeQuestionParams,
  ExtractTurnParams,
  ExtractionResult,
  OnboardingLLMGateway,
  RejectedUpdate,
  TranscriptEntry,
} from './onboarding/extraction_service';
export {
  DOMAIN_SIGNALS,
  MAX_RECOMMENDED_AGENTS,
  detectDomains,
  recommendAgents,
} from './onboarding/agent_recommendation_service';
export {
  OnboardingInterviewRepository,
  InterviewNotFoundError,
} from './database/repositories/onboarding_interview_repository';
export {
  INTERVIEW_CLOSING_LINE,
  OnboardingService,
  assembleImprint,
  isInterviewComplete,
  selectNextObjective,
} from './onboarding/onboarding_service';
export type {
  CompleteInterviewResult,
  OnboardingServiceDeps,
  OnboardingStatusResult,
  StartInterviewResult,
  SubmitTurnParams,
  SubmitTurnResult,
  UpdateSlotParams,
  UpdateSlotResult,
} from './onboarding/onboarding_service';
export type {
  CommitTurnParams,
  CommitTurnResult,
  CreateInterviewParams,
  ExtractionRunRecord,
  InterviewSnapshot,
  MarkStatusParams,
  MarkUserOnboardedParams,
  RecordFailedRunParams,
} from './database/repositories/onboarding_interview_repository';
export type {
  AgentCandidate,
  AgentRecommendation,
  DomainSignal,
  RecommendAgentsParams,
  RecommendationResult,
} from './onboarding/agent_recommendation_service';

// Core Domain Services
export { UserService } from './services/user_service';
export { ToolService } from './services/tool_service';
export { AgentService } from './services/agent_service';
export { ProjectService } from './services/project_service';
export { SessionService } from './services/session_service';
export { MFAService } from './services/m_f_a_service';
export { OAuthService } from './services/o_auth_service';
export { AuditService } from './services/audit_service';
export { SecurityService } from './services/security_service';
export { UserToolPreferencesService } from './services/user_tool_preferences_service';
export { TaskService } from './services/task_service';
export {
  ProjectTaskToolService,
  ProjectTaskToolError,
  isProjectTaskToolId,
  PROJECT_TASK_TOOL_IDS,
  type ProjectTaskToolId,
} from './services/project_task_tool_service';
export { ProjectTaskRepository } from './database/repositories/project_task_repository';
export {
  OAuthTokenResolver,
  decryptOAuthSecret,
  encryptOAuthSecret,
  type ResolvedOAuthToken,
} from './services/oauth_token_resolver';
export {
  McpConnectionResolver,
  McpConnectionError,
  type McpConnectionErrorCode,
  type McpExecutionRequest,
  type McpIntegrationServerSummary,
  type McpResolvedConnection,
  type McpResolvedCredential,
} from './services/mcp_connection_resolver';
export {
  AgentMcpToolAssignmentService,
  type AgentMcpToolAssignment,
} from './services/agent_mcp_tool_assignment_service';
export {
  IntegrationConnectionService,
  IntegrationError,
  type IntegrationErrorCode,
  type IntegrationProviderSummary,
  type IntegrationProviderRef,
  type IntegrationConnectionSummary,
  type IntegrationBindingSummary,
  type CreateIntegrationConnectionInput,
  type LinkIntegrationConnectionInput,
} from './services/integration_connection_service';
export {
  CalendarToolService,
  CalendarToolError,
  isCalendarToolId,
  CALENDAR_TOOL_IDS,
  type CalendarToolId,
} from './services/calendar_tool_service';
export type {
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskAssignmentRequest,
  TaskAssignmentSuggestion,
  TaskFilters,
} from '@uaip/types';
export type { TaskEntity } from '@uaip/types';

// Agent Intelligence Services
export { AgentIntelligenceService } from './agent_intelligence_service';
export { CapabilityDiscoveryService } from './capability_discovery_service';
export { SecurityValidationService } from './security_validation_service';
export { ModelCapabilityDetector } from './capabilities/model_capability_detector';
export { AgentTaskTypeResolver } from './services/agent_task_type_resolver';
export {
  ToolRegistryCapabilityResolver,
} from './agent/agent-intelligence/capability_resolver';
export type {
  PlanStepRequirement,
  CapabilitySourceBreakdown,
  PlanCapabilityResolutionResult,
} from './agent/agent-intelligence/capability_resolver';

// Business Logic Services
export { ToolManagementService } from './tool_management_service';
export { ToolExecutionService } from './tool_execution_service';
export type {
  ToolExecutionRequestEvent,
  ToolExecutionResponseEvent,
  ToolExecutionOptions,
} from '@uaip/types';
export { OperationManagementService } from './operation_management_service';
export { ProjectManagementService } from './project_management_service';
export { ProjectLifecycleService } from './project_lifecycle_service';

// Persona and Discussion Services
export { PersonaService } from './persona_service';
export { DiscussionService } from './discussion_service';
export { addReactionToMessage } from './discussion_reactions';
export type { ReactionMap } from './discussion_reactions';
export { compareAndSetDiscussionStatus } from './discussion_status_cas';
export type { CompareAndSetResult } from './discussion_status_cas';
export { compareAndSetDiscussionTurn } from './discussion_turn_cas';
export type { NextTurn } from './discussion_turn_cas';
export { enforceParticipantCapacity } from './participant_capacity_cas';
export { ParticipantManagementService } from './participant_management_service';
export {
  AgentChatPersistenceService,
  agentChatPersistenceService,
} from './agent_chat_persistence_service';
export type {
  ResolveConversationParams,
  BeginTurnParams,
  CompleteTurnParams,
  LoadHistoryParams,
} from './agent_chat_persistence_service';

// Widget Services
export { WidgetService } from './widget_service';

// =============================================================================
// WORKFLOW AND STATE MANAGEMENT
// =============================================================================

// State Management Services
export { StateManagerService } from './state_manager_service';

// Workflow Services
export { StepExecutorService } from './step_executor_service';
export { CompensationService } from './compensation_service';
export { ResourceManagerService } from './resource_manager_service';

// =============================================================================
// ENTERPRISE AND SECURITY
// =============================================================================

// Enterprise Services
export {
  SERVICE_ACCESS_MATRIX,
  validateServiceAccess,
  AccessLevel,
  getDatabaseConnectionString,
} from './enterprise/service_access_matrix';

// =============================================================================
// SPECIALIZED SERVICES
// =============================================================================

// Tool Graph
export { ToolGraphDatabase } from './database/tool_graph_database';
export type {
  ToolGraphRelationship,
  ToolRecommendation,
  UsagePattern,
  ToolUsageAnalyticsRecord,
  AgentToolPreference,
  PopularToolRecord,
} from '@uaip/types';

// Knowledge Graph Services
export * from './knowledge-graph/index';
export { UserKnowledgeService } from './user_knowledge_service';
export { ContextOrchestrationService } from './context_orchestration_service';
export { scoreRelevance } from './relevance_service';
export { getConstellations } from './constellation_service';

// Agent Memory Services
export * from './agent-memory/index';

// Memory Domain Events
export {
  MEMORY_CONSOLIDATION_REQUEST,
  MEMORY_CONSOLIDATION_RESULT,
} from './events/memory_events';
export type {
  MemoryConsolidationRequestEvent,
  MemoryConsolidationResultEvent,
} from './events/memory_events';

// Integration Services - MCP + Neo4j Sync
export * from './integration/index';

// Cognitive Services
export { ThoughtParserService } from './cognitive/thought_parser_service';
export { CritiqueService } from './cognitive/critique_service';
export { DebateOrchestratorService } from './cognitive/debate_orchestrator_service';
export { TaskDAGService } from './cognitive/task_d_a_g_service';
export type { TaskNode, TaskDAG } from '@uaip/types';
export {
  matchTemplate,
  instantiateTemplate,
  WORKFLOW_TEMPLATES,
} from './cognitive/workflow_templates';
export type { WorkflowTemplate } from './cognitive/workflow_templates';
export { MetaReasoningInterceptor } from './cognitive/meta_reasoning_interceptor';
export type {
  MetaReasoningInput,
  MetaReasoningDecision,
  CapabilityGapResult,
  ErrorHistoryResult,
} from '@uaip/types';
export { fetchAgentCapabilitiesViaEventBus } from './cognitive/agent_capability_utils';
export { CapabilityGapRadarService } from './cognitive/capability_gap_radar_service';
export type { CapabilityAssessment, CapabilityGap } from '@uaip/types';
export { ConfidenceGatedExecutionService } from './cognitive/confidence_gated_execution_service';
export type { ExecutionGate, ConfidenceProfile, DomainConfidenceProfile } from '@uaip/types';
export { ExplanationDAGService } from './cognitive/explanation_d_a_g_service';
export { CompositionPolicyService } from './composition/composition_policy_service';
export type {
  CompositionPolicy,
  PolicyRule,
  PolicyEvaluationResult,
  PolicyViolation,
  PolicyWarning,
  EstimatedBlastRadius,
} from './composition/composition_policy_service';
export { ImmutableAuditService } from './composition/immutable_audit_service';
export type {
  CompositionAuditEventInput,
  ChainVerificationResult,
  AuditTrailOptions,
  AuditTrailResult,
  ActorType,
} from './composition/immutable_audit_service';
export { WorkflowValidator } from './composition/workflow_validator';
export type {
  ValidationError,
  ValidationWarning,
  WorkflowValidationResult,
} from './composition/workflow_validator';
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
} from './composition/circuit_breaker';
export type {
  CircuitState,
  CircuitBreakerOptions,
  CircuitBreakerSnapshot,
} from './composition/circuit_breaker';
export type { ReasoningNode, ReasoningEdge, ExplanationDAG } from '@uaip/types';
export { MCPOutputValidator } from './composition/mcp_output_validator';
export type {
  ValidatedOutput,
  InjectionScanResult,
  SanitizedOutput,
} from './composition/mcp_output_validator';
export { SecretReferenceService } from './composition/secret_reference_service';
export type {
  SecretReference,
  SecretScanResult,
} from './composition/secret_reference_service';
export {
  resolvePath,
  evaluateExpression,
  executeTransformStep,
  validateTransformExpression,
  getAvailableTransforms,
} from './composition/transform_engine';
export {
  workflowExecutionTotal,
  workflowExecutionDuration,
  workflowPolicyViolationsTotal,
  workflowActiveExecutions,
  workflowStepFailuresTotal,
} from './composition/workflow_metrics';

// =============================================================================
// ENTITIES
// =============================================================================

// Drizzle type aliases for backward-compat
export type { ShortLink as ShortLinkEntity } from './database/drizzle/schemas/intelligence_schema';
export type { Project } from './database/drizzle/schemas/control_schema';
export type {
  WorkflowInstance,
  NewWorkflowInstance,
  WorkflowInstanceStep,
  NewWorkflowInstanceStep,
} from './database/drizzle/schemas/control_schema';
export { workflowInstanceSteps } from './database/drizzle/schemas/control_schema';

// Contact Management Enums
export { ContactStatus, ContactType } from './database/repositories/user_contact_repository';

export { LLMModelRepository } from './repositories/llm_model_repository';

export { base as schemaBase, llmPreferenceCommonColumns } from './database/drizzle/schemas/schema_base';

// Database Seeders
export { DefaultUserLLMProviderSeed } from './database/seeders/default_user_l_l_m_provider_seed';
export {
  OAuthProviderSeed,
  OAUTH_PROVIDER_TEMPLATES,
  type OAuthProviderTemplate,
  type OAuthProviderSeedResult,
} from './database/seeders/oauth_provider_seed';
export {
  IntegrationProviderSeed,
  INTEGRATION_CATALOG,
  type IntegrationCatalogEntry,
  type IntegrationProviderSeedResult,
} from './database/seeders/integration_provider_seed';
export { EnsureSystemActor } from './database/migrations/ensure_system_actor';
export type { EnsureSystemActorResult } from './database/migrations/ensure_system_actor';
export { EnsureOnboardingGuide } from './database/migrations/ensure_onboarding_guide';
export type { EnsureOnboardingGuideResult } from './database/migrations/ensure_onboarding_guide';
export {
  EnsureOnboardingSchema,
  ONBOARDING_SCHEMA_STATEMENTS,
} from './database/migrations/ensure_onboarding_schema';
export {
  EnsureAgentChatThreads,
  AGENT_CHAT_THREAD_STATEMENTS,
} from './database/migrations/ensure_agent_chat_threads';
export { BackfillUserAgentAssignments } from './database/migrations/backfill_user_agent_assignments';
export type { BackfillUserAgentAssignmentsResult } from './database/migrations/backfill_user_agent_assignments';

// =============================================================================
// SERVICE FACTORY AND DEPENDENCY INJECTION
// =============================================================================

// Service Factory - Dependency Injection Container
export {
  ServiceFactory,
  serviceFactory,
  getKnowledgeGraphService,
  getUserKnowledgeService,
  getContextOrchestrationService,
  getAgentMemoryService,
  getEnhancedRAGService,
  initializeServices,
  servicesHealthCheck,
  resetServices,
} from './service_factory'

export { FeatureFactory, type Feature, type ServiceDeps } from './feature_factory.js';

export {
  KnowledgeSummaryEnrichmentJob,
  getKnowledgeSummaryEnrichmentJob,
  type SummaryEnrichmentPayload,
  type SummarizeFn,
} from './jobs/knowledge_summary_enrichment_job';
