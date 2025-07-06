/**
 * Agent Intelligence Microservices Index
 * Exports all refactored agent intelligence services and orchestrator
 */

// Export all service classes - Updated implementations
export { AgentCoreService } from './AgentCoreService.js';
export { AgentContextService } from './AgentContextService.js';
export { AgentPlanningService } from './AgentPlanningService.js';
export { AgentLearningService } from './AgentLearningService.js';
export { AgentDiscussionService } from './AgentDiscussionService.js';

// Legacy service exports (old pattern)
// export { AgentCoreService } from './agent-core.service';
// export { AgentContextService } from './agent-context.service';
// export { AgentPlanningService } from './agent-planning.service';
// export { AgentLearningService } from './agent-learning.service';
// export { AgentDiscussionService } from './agent-discussion.service';
export { AgentMetricsService } from './agent-metrics.service';
export { AgentIntentService } from './agent-intent.service';
export { AgentInitializationService } from './agent-initialization.service';
// export { AgentEventOrchestrator } from './agent-event-orchestrator.service'; // Temporarily disabled
export { ConversationIntelligenceService } from './conversation-intelligence.service';

// Export types from updated implementations
export type { ConversationContext, AnalysisResult } from './AgentContextService.js';
export type { ExecutionStep, ExecutionPlan } from './AgentPlanningService.js';
export type { LearningInteraction, LearningResult } from './AgentLearningService.js';
export type { DiscussionMessage, DiscussionResponse } from './AgentDiscussionService.js';

// Legacy service configuration interfaces
// export type { AgentCoreConfig } from './agent-core.service';
// export type { AgentContextConfig } from './agent-context.service';
// export type { AgentPlanningConfig } from './agent-planning.service';
// export type { AgentLearningConfig } from './agent-learning.service';
// export type { AgentDiscussionConfig } from './agent-discussion.service';
export type { AgentMetricsConfig } from './agent-metrics.service';
export type { AgentIntentConfig } from './agent-intent.service';
export type { AgentInitializationConfig } from './agent-initialization.service';
// export type { AgentEventOrchestratorConfig, AgentOperationRequest } from './agent-event-orchestrator.service'; // Temporarily disabled

// Export additional types
export type { IntentAnalysis, ActionRecommendation } from './agent-intent.service';
export type { EnhancedAgentMetrics } from './agent-metrics.service';
export type { AgentCapabilities, EnvironmentFactors } from './agent-initialization.service';
