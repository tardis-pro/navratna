// Re-export types needed by entities
export { SecurityLevel } from '@uaip/types';

// Database Services
export { DatabaseService } from './databaseService.js';
// Note: TypeOrmService is internal and not exported

// All Database-related exports (TypeORM, services, types)
export * from './database/index.js';

// TypeORM Entities

// Agent Intelligence Services  
export { AgentIntelligenceService } from './agentIntelligenceService.js';
export { CapabilityDiscoveryService } from './capabilityDiscoveryService.js';
export { SecurityValidationService } from './securityValidationService.js';

// Communication Services
export { EventBusService } from './eventBusService.js';

// Vector Search Services - Aliases for compatibility
export { QdrantService as VectorSearchService } from './qdrant.service.js';
export { QdrantService } from './qdrant.service.js';

// Enterprise Services
export { SERVICE_ACCESS_MATRIX, validateServiceAccess, AccessLevel, getDatabaseConnectionString } from './enterprise/ServiceAccessMatrix.js';

// Widget Services - NEW
export { WidgetService, WidgetServiceOptions } from './widgetService.js';

// State Management Services
export { StateManagerService } from './stateManagerService.js';

// Workflow Services
export { StepExecutorService } from './stepExecutorService.js';
export { CompensationService } from './compensationService.js';
export { ResourceManagerService } from './resourceManagerService.js';

// Persona and Discussion Services - NEW
export { PersonaService } from './personaService.js';
export { DiscussionService } from './discussionService.js';

// Tool Services - NEW
export type {
} from './database/toolDatabase.js';
export type {

  ToolRelationship,
  ToolRecommendation,
  UsagePattern
} from './database/toolGraphDatabase.js';

// Knowledge Graph Services - NEW
export * from './knowledge-graph/index.js';
export { UserKnowledgeService } from './user-knowledge.service.js';
export { ContextOrchestrationService } from './context-orchestration.service.js';

// Agent Memory Services - NEW
export * from './agent-memory/index.js';
// export { EnhancedAgentIntelligenceService } from './enhanced-agent-intelligence.service.js';

// Integration Services - MCP + Neo4j Sync
export * from './integration/index.js';

// Service Factory - Dependency Injection
export {
  ServiceFactory,
  serviceFactory,
  getKnowledgeGraphService,
  getUserKnowledgeService,
  getContextOrchestrationService,
  getAgentMemoryService
} from './ServiceFactory.js';

// Domain Services
export { ToolManagementService } from './tool-management.service.js';
export { ToolExecutionService } from './tool-execution.service.js';
export { OperationManagementService } from './operation-management.service.js';

// TEI Embedding Services - NEW
export { TEIEmbeddingService, RerankResult, TEIHealthStatus } from './knowledge-graph/tei-embedding.service.js';
export { SmartEmbeddingService, EmbeddingServiceConfig, SmartEmbeddingStatus } from './knowledge-graph/smart-embedding.service.js';
export { EnhancedRAGService, SearchResult, EnhancedSearchResult, SearchOptions } from './knowledge-graph/enhanced-rag.service.js';

// Service Initializer - Easy API Integration
export {
  ServiceInitializer,
  initializeServices,
  getUserKnowledgeService as getUserKnowledgeServiceForAPI,
  getContextOrchestrationService as getContextOrchestrationServiceForAPI,
  getAgentMemoryService as getAgentMemoryServiceForAPI,
  servicesHealthCheck
} from './ServiceInitializer.js';

// Redis Cache Service
export { redisCacheService, RedisCacheService } from './redis-cache.service.js';