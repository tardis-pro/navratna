/**
 * UAIP Frontend Interfaces
 * This file imports shared types and provides frontend-specific UAIP interfaces
 */

// Re-export shared types
export type {
  Operation,
  OperationType,
  OperationStatus,
  OperationPriority,
  Capability,
  ApprovalWorkflow
} from '@uaip/types';

// Import UI-specific interfaces
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
  DataState
} from './ui-interfaces';

// Re-export persona types
export type {
  PersonaAnalytics,
  PersonaValidation,
  PersonaUsageStats,
  PersonaTemplate
} from '@uaip/types'; 