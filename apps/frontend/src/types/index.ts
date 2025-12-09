/**
 * Frontend Types Index
 * This file provides a clean export interface for all frontend types
 */

// Core shared types (re-exported from @uaip/types)
export type {
  // Agent types
  Agent,
  AgentRole,
  AgentCreate,
  AgentCreateRequest,
  AgentUpdate,
  AgentPersona,
  AgentIntelligenceConfig,
  AgentSecurityContext,

  // Operation types
  Operation,
  OperationType,
  OperationStatus,
  OperationPriority,
  OperationStep,
  ExecutionStep,
  ExecutionContext,
  ExecutionPlan,

  // Tool types
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

  // Capability types
  Capability,

  // Message types
  Message as SharedMessage,
  MessageRole,

  // Persona types
  PersonaAnalytics,
  PersonaValidation,
  PersonaUsageStats,
  PersonaTemplate,
} from '@uaip/types';

// Frontend-specific extensions
export type {
  // Agent extensions
  AgentState,
  AgentProps,
  AgentContextValue,
  ModelProvider,
  ModelInfo,

  // Message extensions
  Message,
  ConversationPattern,
} from './frontend-extensions';

// UI-specific interfaces
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
} from './ui-interfaces';

// Local types that remain frontend-specific
export type { Persona } from './persona';
// AnalysisDepth, CollaborationMode, AuditLevel types were not actually defined - removed

// Re-export helper functions
export { createAgentStateFromShared as createAgentStateFromBackend } from './frontend-extensions';
