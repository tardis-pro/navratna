export type {
  Agent,
  AgentRole,
  AgentCreate,
  AgentCreateRequest,
  AgentUpdate,
  AgentPersona,
  AgentIntelligenceConfig,
  AgentSecurityContext,
  Operation,
  OperationType,
  OperationStatus,
  OperationPriority,
  OperationStep,
  ExecutionStep,
  ExecutionContext,
  ExecutionPlan,
  ToolCall,
  ToolResult,
  ToolPermissionSet,
  ToolUsageRecord,
  ToolExecution,
  ToolPreferences,
  ToolBudget,
  ToolCapableMessage,
  ToolDefinition,
  ToolExample,
  ToolExecutionError,
  ToolCategory,
  SecurityLevel,
  Capability,
  Message as SharedMessage,
  MessageRole,
  PersonaAnalytics,
  PersonaValidation,
  PersonaUsageStats,
  PersonaTemplate,
} from '@uaip/types';

export type {
  AgentState,
  AgentProps,
  AgentContextValue,
  ModelProvider,
  ModelInfo,
  Message,
  ConversationPattern,
} from './frontend-extensions';

export type {
  EnhancedAgentState,
  UIOperation,
  UICapability,
  UIApprovalWorkflow,
  AgentCapabilityMetrics,
  SecurityContext,
  OperationEvent,
  SystemMetrics,
  ToolIntegration,
  AIInsight,
  ConversationContext,
  CapabilityUsage,
  WebSocketEvent,
  UIState,
  UIError,
  DataState,
} from '@uaip/types';

export type { Persona } from './persona';

export type {
  Microexpression,
  MicroexpressionConfig,
  ExpressionStyle,
  AgentActivityEventDetail,
  AgentActivityType,
} from '@uaip/types';
export {
  MICROEXPRESSION_COLORS,
  MICROEXPRESSION_STYLES,
  MICROEXPRESSION_LABELS,
  DEFAULT_MICROEXPRESSION_CONFIG,
  AGENT_ACTIVITY_EVENT,
} from '@uaip/types';

export { createAgentStateFromShared as createAgentStateFromBackend } from './frontend-extensions';
