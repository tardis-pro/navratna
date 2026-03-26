/**
 * Agent Intelligence Microservices Index
 * Exports all refactored agent intelligence services and orchestrator
 */

// Export all service classes - Full event-driven implementations
export { AgentCoreService } from './agent_core_service';
export { AgentContextService } from './agent_context_service';
export { AgentPlanningService } from './agent_planning_service';
export { AgentLearningService } from './agent_learning_service';
export { AgentDiscussionService } from './agent_discussion_service';

export { AgentMetricsService } from './agent_metrics_service';
export { AgentIntentService } from './agent_intent_service';
export { AgentInitializationService } from './agent_initialization_service';
export { AgentEventOrchestrator } from './agent_event_orchestrator_service';

// Export types from event-driven implementations
export type { AgentContextConfig } from './agent_context_service';
export type { AgentPlanningConfig } from './agent_planning_service';
export type { AgentLearningConfig } from './agent_learning_service';
export type { AgentDiscussionConfig } from './agent_discussion_service';

export type { AgentMetricsConfig } from './agent_metrics_service';
export type { AgentIntentConfig } from './agent_intent_service';
export type { AgentInitializationConfig } from './agent_initialization_service';
export type {
  AgentEventOrchestratorConfig,
  AgentOperationRequest,
} from './agent_event_orchestrator_service';

// Export additional types
export type { IntentAnalysis, ActionRecommendation } from './agent_intent_service';
export type { EnhancedAgentMetrics } from './agent_metrics_service';
export type { AgentCapabilities, EnvironmentFactors } from './agent_initialization_service';

// Process Archaeology — onboarding & entity matching
export { ProcessArchaeologyService } from './process_archaeology_service';
export { EntityMatcherService } from './entity_matcher_service';
export type {
  DataSource,
  DiscoveredEntity,
  EntityRelationship,
  OntologyProposal,
} from './process_archaeology_types';
export type { MatchCandidate, MatchSignal } from './entity_matcher_service';
