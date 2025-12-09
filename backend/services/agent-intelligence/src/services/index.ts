/**
 * Agent Intelligence Microservices Index
 * Exports all refactored agent intelligence services and orchestrator
 */

// Export all service classes - Full event-driven implementations
export { AgentCoreService } from './agent-core.service.js';
export { AgentContextService } from './agent-context.service.js';
export { AgentPlanningService } from './agent-planning.service.js';
export { AgentLearningService } from './agent-learning.service.js';
export { AgentDiscussionService } from './agent-discussion.service.js';

export { AgentMetricsService } from './agent-metrics.service';
export { AgentIntentService } from './agent-intent.service';
export { AgentInitializationService } from './agent-initialization.service';
export { AgentEventOrchestrator } from './agent-event-orchestrator.service';

// Export types from event-driven implementations
export type { AgentContextConfig } from './agent-context.service.js';
export type { AgentPlanningConfig } from './agent-planning.service.js';
export type { AgentLearningConfig } from './agent-learning.service.js';
export type { AgentDiscussionConfig } from './agent-discussion.service.js';

export type { AgentMetricsConfig } from './agent-metrics.service';
export type { AgentIntentConfig } from './agent-intent.service';
export type { AgentInitializationConfig } from './agent-initialization.service';
export type {
  AgentEventOrchestratorConfig,
  AgentOperationRequest,
} from './agent-event-orchestrator.service';

// Export additional types
export type { IntentAnalysis, ActionRecommendation } from './agent-intent.service';
export type { EnhancedAgentMetrics } from './agent-metrics.service';
export type { AgentCapabilities, EnvironmentFactors } from './agent-initialization.service';
