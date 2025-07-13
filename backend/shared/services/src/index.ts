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

// Base Service Class for all microservices
export { BaseService, ServiceConfig, createService } from './BaseService.js';

// Database Services (consolidated - no duplicates)
export * from './database/index.js';

// Communication Services
export { EventBusService } from './eventBusService.js';

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
  UNIFIED_SYSTEM_DEFAULTS
} from './services/ModelSelectionOrchestrator.js';

export {
  ProviderFallbackService,
  ProviderResolution,
  ProviderCapabilities,
  FallbackConfig,
  DEFAULT_FALLBACK_CONFIG
} from './services/ProviderFallbackService.js';

export {
  UnifiedModelSelectionFacade,
  UnifiedModelSelection,
  UnifiedSelectionRequest,
  SelectionMetrics
} from './services/UnifiedModelSelectionFacade.js';

// Conversation Utilities
export { ConversationUtils } from './conversation/index.js';

// Vector Search Services
export { QdrantService } from './qdrant.service.js';

// Cache Services
export { redisCacheService, RedisCacheService } from './redis-cache.service.js';

// =============================================================================
// DOMAIN SERVICES
// =============================================================================

// Core Domain Services
export { UserService } from './services/UserService.js';
export { ToolService } from './services/ToolService.js';
export { AgentService } from './services/AgentService.js';
export { ProjectService } from './services/ProjectService.js';
export { SessionService } from './services/SessionService.js';
export { MFAService } from './services/MFAService.js';
export { OAuthService } from './services/OAuthService.js';
export { AuditService } from './services/AuditService.js';
export { SecurityService } from './services/SecurityService.js';
export { UserToolPreferencesService } from './services/UserToolPreferencesService.js';
export { TaskService } from './services/task.service.js';
export type {
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskAssignmentRequest,
  TaskFilters
} from './services/task.service.js';

// Agent Intelligence Services
export { AgentIntelligenceService } from './agentIntelligenceService.js';
export { CapabilityDiscoveryService } from './capabilityDiscoveryService.js';
export { SecurityValidationService } from './securityValidationService.js';
export { ModelCapabilityDetector } from './capabilities/ModelCapabilityDetector.js';

// Business Logic Services
export { ToolManagementService } from './tool-management.service.js';
export { ToolExecutionService } from './tool-execution.service.js';
export { OperationManagementService } from './operation-management.service.js';
export { ProjectManagementService } from './project-management.service.js';
export { ProjectLifecycleService } from './project-lifecycle.service.js';

// Persona and Discussion Services
export { PersonaService } from './personaService.js';
export { DiscussionService } from './discussionService.js';
export { ParticipantManagementService } from './participant-management.service.js';

// Widget Services
export { WidgetService, WidgetServiceOptions } from './widgetService.js';

// =============================================================================
// WORKFLOW AND STATE MANAGEMENT
// =============================================================================

// State Management Services
export { StateManagerService } from './stateManagerService.js';

// Workflow Services
export { StepExecutorService } from './stepExecutorService.js';
export { CompensationService } from './compensationService.js';
export { ResourceManagerService } from './resourceManagerService.js';

// =============================================================================
// ENTERPRISE AND SECURITY
// =============================================================================

// Enterprise Services
export { SERVICE_ACCESS_MATRIX, validateServiceAccess, AccessLevel, getDatabaseConnectionString } from './enterprise/ServiceAccessMatrix.js';

// =============================================================================
// SPECIALIZED SERVICES
// =============================================================================

// Tool Graph Types
export type {
  ToolRelationship,
  ToolRecommendation,
  UsagePattern
} from './database/toolGraphDatabase.js';

// Knowledge Graph Services
export * from './knowledge-graph/index.js';
export { UserKnowledgeService } from './user-knowledge.service.js';
export { ContextOrchestrationService } from './context-orchestration.service.js';

// Agent Memory Services
export * from './agent-memory/index.js';

// Integration Services - MCP + Neo4j Sync
export * from './integration/index.js';

// =============================================================================
// ENTITIES
// =============================================================================

// Project Management Entities
export {
  Project,
  ProjectTask,
  ProjectToolUsage,
  ProjectAgent,
  ProjectWorkflow,
  TaskExecution
} from './entities/Project.js';

// Contact Management Entities
export { ContactStatus, ContactType } from './database/repositories/UserContactRepository.js';

// Database Seeders
export { DefaultUserLLMProviderSeed } from './database/seeders/DefaultUserLLMProviderSeed.js';

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
  resetServices
} from './ServiceFactory.js';