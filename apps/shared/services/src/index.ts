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
export { BaseService, ServiceConfig, createService } from './base_service';

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

export {
  UnifiedModelSelectionFacade,
  UnifiedModelSelection,
  UnifiedSelectionRequest,
  SelectionMetrics,
} from './services/unified_model_selection_facade';

// Conversation Utilities
export { ConversationUtils } from './conversation/index';

// Vector Search Services
export { QdrantService, VectorSearchResult } from './qdrant_service';

// LLM Request Tracking Service
export { LLMRequestTracker } from './llm_request_tracker_service';

// =============================================================================
// DOMAIN SERVICES
// =============================================================================

// Domain Service Base Class
export { BaseDomainService } from './services/base_domain_service';

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
export type {
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskAssignmentRequest,
  TaskAssignmentSuggestion,
  TaskFilters,
} from '@uaip/types';
export type { Project as TaskEntity } from './database/drizzle/schemas/control_schema';

// Agent Intelligence Services
export { AgentIntelligenceService } from './agent_intelligence_service';
export { CapabilityDiscoveryService } from './capability_discovery_service';
export { SecurityValidationService } from './security_validation_service';
export { ModelCapabilityDetector } from './capabilities/model_capability_detector';
export { AgentTaskTypeResolver } from './services/agent_task_type_resolver';

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
export { ParticipantManagementService } from './participant_management_service';

// Widget Services
export { WidgetService, WidgetServiceOptions } from './widget_service';

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

// Agent Memory Services
export * from './agent-memory/index';

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
export { CapabilityGapRadarService } from './cognitive/capability_gap_radar_service';
export type { CapabilityAssessment, CapabilityGap } from '@uaip/types';
export { ConfidenceGatedExecutionService } from './cognitive/confidence_gated_execution_service';
export type { ExecutionGate, ConfidenceProfile } from '@uaip/types';
export { ExplanationDAGService } from './cognitive/explanation_d_a_g_service';
export type { ReasoningNode, ReasoningEdge, ExplanationDAG } from '@uaip/types';

// =============================================================================
// ENTITIES
// =============================================================================

// Drizzle type aliases for backward-compat
export type { ShortLink as ShortLinkEntity } from './database/drizzle/schemas/intelligence_schema';
export type { Project } from './database/drizzle/schemas/control_schema';

// Contact Management Enums
export { ContactStatus, ContactType } from './database/repositories/user_contact_repository';

export { LLMModelRepository } from './repositories/llm_model_repository';

// Database Seeders
export { DefaultUserLLMProviderSeed } from './database/seeders/default_user_l_l_m_provider_seed';

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
  initializeServices,
  servicesHealthCheck,
  resetServices,
} from './service_factory';
