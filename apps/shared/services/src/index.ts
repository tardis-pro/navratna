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
export { BaseService, ServiceConfig, createService } from './BaseService';

// HTTP Server (Elysia)
export { createAppServer } from './http-app';

// Database Services (consolidated - no duplicates)
export * from './database/index';

// MCP Services
export { MCPService } from './services/MCPService';

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
} from './services/ModelSelectionOrchestrator';
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
} from './services/UnifiedModelSelectionFacade';

// Conversation Utilities
export { ConversationUtils } from './conversation/index';

// Vector Search Services
export { QdrantService, VectorSearchResult } from './qdrant.service';

// LLM Request Tracking Service
export { LLMRequestTracker } from './llm-request-tracker.service';

// =============================================================================
// DOMAIN SERVICES
// =============================================================================

// Domain Service Base Class
export { BaseDomainService } from './services/BaseDomainService';

// Core Domain Services
export { UserService } from './services/UserService';
export { ToolService } from './services/ToolService';
export { AgentService } from './services/AgentService';
export { ProjectService } from './services/ProjectService';
export { SessionService } from './services/SessionService';
export { MFAService } from './services/MFAService';
export { OAuthService } from './services/OAuthService';
export { AuditService } from './services/AuditService';
export { SecurityService } from './services/SecurityService';
export { UserToolPreferencesService } from './services/UserToolPreferencesService';
export { TaskService } from './services/task.service';
export type {
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskAssignmentRequest,
  TaskAssignmentSuggestion,
  TaskFilters,
} from '@uaip/types';
export type { Project as TaskEntity } from './database/drizzle/schemas/control.schema';

// Agent Intelligence Services
export { AgentIntelligenceService } from './agentIntelligenceService';
export { CapabilityDiscoveryService } from './capabilityDiscoveryService';
export { SecurityValidationService } from './securityValidationService';
export { ModelCapabilityDetector } from './capabilities/ModelCapabilityDetector';
export { AgentTaskTypeResolver } from './services/AgentTaskTypeResolver';

// Business Logic Services
export { ToolManagementService } from './tool-management.service';
export { ToolExecutionService } from './tool-execution.service';
export type {
  ToolExecutionRequestEvent,
  ToolExecutionResponseEvent,
  ToolExecutionOptions,
} from '@uaip/types';
export { OperationManagementService } from './operation-management.service';
export { ProjectManagementService } from './project-management.service';
export { ProjectLifecycleService } from './project-lifecycle.service';

// Persona and Discussion Services
export { PersonaService } from './personaService';
export { DiscussionService } from './discussionService';
export { ParticipantManagementService } from './participant-management.service';

// Widget Services
export { WidgetService, WidgetServiceOptions } from './widgetService';

// =============================================================================
// WORKFLOW AND STATE MANAGEMENT
// =============================================================================

// State Management Services
export { StateManagerService } from './stateManagerService';

// Workflow Services
export { StepExecutorService } from './stepExecutorService';
export { CompensationService } from './compensationService';
export { ResourceManagerService } from './resourceManagerService';

// =============================================================================
// ENTERPRISE AND SECURITY
// =============================================================================

// Enterprise Services
export {
  SERVICE_ACCESS_MATRIX,
  validateServiceAccess,
  AccessLevel,
  getDatabaseConnectionString,
} from './enterprise/ServiceAccessMatrix';

// =============================================================================
// SPECIALIZED SERVICES
// =============================================================================

// Tool Graph
export { ToolGraphDatabase } from './database/toolGraphDatabase';
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
export { UserKnowledgeService } from './user-knowledge.service';
export { ContextOrchestrationService } from './context-orchestration.service';

// Agent Memory Services
export * from './agent-memory/index';

// Integration Services - MCP + Neo4j Sync
export * from './integration/index';

// Cognitive Services
export { ThoughtParserService } from './cognitive/thought-parser.service';
export { CritiqueService } from './cognitive/critique.service';
export { DebateOrchestratorService } from './cognitive/debate-orchestrator.service';
export { TaskDAGService } from './cognitive/taskDAG.service';
export type { TaskNode, TaskDAG } from '@uaip/types';
export {
  matchTemplate,
  instantiateTemplate,
  WORKFLOW_TEMPLATES,
} from './cognitive/workflowTemplates';
export type { WorkflowTemplate } from './cognitive/workflowTemplates';
export { MetaReasoningInterceptor } from './cognitive/metaReasoning.interceptor';
export type {
  MetaReasoningInput,
  MetaReasoningDecision,
  CapabilityGapResult,
  ErrorHistoryResult,
} from '@uaip/types';
export { CapabilityGapRadarService } from './cognitive/capabilityGapRadar.service';
export type { CapabilityAssessment, CapabilityGap } from '@uaip/types';
export { ConfidenceGatedExecutionService } from './cognitive/confidenceGatedExecution.service';
export type { ExecutionGate, ConfidenceProfile } from '@uaip/types';
export { ExplanationDAGService } from './cognitive/explanationDAG.service';
export type { ReasoningNode, ReasoningEdge, ExplanationDAG } from '@uaip/types';

// =============================================================================
// ENTITIES
// =============================================================================

// Drizzle type aliases for backward-compat
export type { ShortLink as ShortLinkEntity } from './database/drizzle/schemas/intelligence.schema';
export type { Project } from './database/drizzle/schemas/control.schema';

// Contact Management Enums
export { ContactStatus, ContactType } from './database/repositories/UserContactRepository';

export { LLMModelRepository } from './repositories/llmModelRepository';

// Database Seeders
export { DefaultUserLLMProviderSeed } from './database/seeders/DefaultUserLLMProviderSeed';

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
} from './ServiceFactory';
