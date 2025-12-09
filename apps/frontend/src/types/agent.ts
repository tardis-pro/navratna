/**
 * Frontend Agent Types
 * This file re-exports shared agent types and provides frontend-specific extensions
 */

// Re-export shared types
export type {
  Agent,
  AgentRole,
  AgentCreate,
  AgentCreateRequest,
  AgentUpdate,
  AgentPersona,
  AgentIntelligenceConfig,
  AgentSecurityContext,
  Message as SharedMessage,
  MessageRole,
  ConversationContext as SharedConversationContext,
  ContextAnalysis,
  ActionRecommendation,
  AgentAnalysisResult,
  ExecutionPlan,
  LearningResult,
} from '@uaip/types';

// Import frontend extensions
export type {
  Message,
  ConversationPattern,
  AgentState,
  AgentProps,
  AgentContextValue,
  ModelProvider,
  ModelInfo,
} from './frontend-extensions';

// Import tool types
export type {
  ToolCall,
  ToolResult,
  ToolPermissionSet,
  ToolUsageRecord,
  ToolExecution,
  ToolPreferences,
  ToolBudget,
  ToolCapableMessage,
} from '@uaip/types';

// Re-export the helper function
export { createAgentStateFromShared as createAgentStateFromBackend } from './frontend-extensions';
