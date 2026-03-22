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

// TypeORM Service
export { TypeOrmService, typeormService } from './typeormService';

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
  ModelSelectionRequest,
  ModelSelectionResult,
  FallbackChain,
  ModelSelectionStrategy,
  ModelSelectionContext,
  AgentSpecificStrategy,
  UserSpecificStrategy,
  PerformanceOptimizedStrategy,
  ContextAwareStrategy,
  SystemDefaultStrategy,
  UNIFIED_SYSTEM_DEFAULTS,
} from './services/ModelSelectionOrchestrator';

export {
  UnifiedModelSelectionFacade,
  UnifiedModelSelection,
  UnifiedSelectionRequest,
  SelectionMetrics,
} from './services/UnifiedModelSelectionFacade';

// Conversation Utilities
export { ConversationUtils } from './conversation/index';

// Vector Search Services
export { QdrantService } from './qdrant.service';

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
} from './services/task.service';
export { TaskEntity } from './entities/task.entity';

// Agent Intelligence Services
export { AgentIntelligenceService } from './agentIntelligenceService';
export { CapabilityDiscoveryService } from './capabilityDiscoveryService';
export { SecurityValidationService } from './securityValidationService';
export { ModelCapabilityDetector } from './capabilities/ModelCapabilityDetector';
export { AgentTaskTypeResolver } from './services/AgentTaskTypeResolver';

// Business Logic Services
export { ToolManagementService } from './tool-management.service';
export {
  ToolExecutionService,
  ToolExecutionRequestEvent,
  ToolExecutionResponseEvent,
  ToolExecutionOptions,
} from './tool-execution.service';
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

// Tool Graph Types
export type {
  ToolRelationship,
  ToolRecommendation,
  UsagePattern,
} from './database/toolGraphDatabase';

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
export type { TaskNode, TaskDAG } from './cognitive/taskDAG.service';
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
} from './cognitive/metaReasoning.interceptor';
export { CapabilityGapRadarService } from './cognitive/capabilityGapRadar.service';
export type { CapabilityAssessment, CapabilityGap } from './cognitive/capabilityGapRadar.service';
export { ConfidenceGatedExecutionService } from './cognitive/confidenceGatedExecution.service';
export type {
  ExecutionGate,
  ConfidenceProfile,
} from './cognitive/confidenceGatedExecution.service';
export { ExplanationDAGService } from './cognitive/explanationDAG.service';
export type {
  ReasoningNode,
  ReasoningEdge,
  ExplanationDAG,
} from './cognitive/explanationDAG.service';

// =============================================================================
// ENTITIES
// =============================================================================

// Short Link Entities
export { ShortLinkEntity, LinkType, LinkStatus } from './entities/short-link.entity';

// Project Management Entities
export {
  Project,
  ProjectTask,
  ProjectToolUsage,
  ProjectAgent,
  ProjectWorkflow,
  TaskExecution,
} from './entities/Project';

// Contact Management Entities
export { ContactStatus, ContactType } from './database/repositories/UserContactRepository';

// Database Seeders
export { DefaultUserLLMProviderSeed } from './database/seeders/DefaultUserLLMProviderSeed';

// All Entities Export
export * from './entities/index';

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
