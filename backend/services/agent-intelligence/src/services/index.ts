/**
 * Agent Intelligence Microservices Index
 * Exports all refactored agent intelligence services and orchestrator
 */

// Export all service classes
export { AgentCoreService } from './agent-core.service';
export { AgentContextService } from './agent-context.service';
export { AgentPlanningService } from './agent-planning.service';
export { AgentLearningService } from './agent-learning.service';
export { AgentDiscussionService } from './agent-discussion.service';
export { AgentMetricsService } from './agent-metrics.service';
export { AgentIntentService } from './agent-intent.service';
export { AgentInitializationService } from './agent-initialization.service';
export { AgentEventOrchestrator } from './agent-event-orchestrator.service';
export { ConversationIntelligenceService } from './conversation-intelligence.service';

// Export service configuration interfaces
export type { AgentCoreConfig } from './agent-core.service';
export type { AgentContextConfig } from './agent-context.service';
export type { AgentPlanningConfig } from './agent-planning.service';
export type { AgentLearningConfig } from './agent-learning.service';
export type { AgentDiscussionConfig } from './agent-discussion.service';
export type { AgentMetricsConfig } from './agent-metrics.service';
export type { AgentIntentConfig } from './agent-intent.service';
export type { AgentInitializationConfig } from './agent-initialization.service';
export type { AgentEventOrchestratorConfig, AgentOperationRequest } from './agent-event-orchestrator.service';

// Export additional types
export type { IntentAnalysis, ActionRecommendation } from './agent-intent.service';
export type { EnhancedAgentMetrics } from './agent-metrics.service';
export type { AgentCapabilities, EnvironmentFactors } from './agent-initialization.service';
