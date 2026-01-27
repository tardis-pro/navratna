import type { Actor, Tenant, UAIPEvent } from '@uaip/types';

// Event Contracts for Service-to-Service Communication
export interface EventContracts {
  // Tool Execution Events
  toolExecuteRequest: ToolExecuteRequestEvent;
  toolExecuteResponse: ToolExecuteResponseEvent;

  // Approval Events
  approvalRequest: ApprovalRequestEvent;
  approvalResponse: ApprovalResponseEvent;

  // Orchestration Events
  operationStarted: OperationStartedEvent;
  operationCompleted: OperationCompletedEvent;
  operationFailed: OperationFailedEvent;
  stepCompleted: StepCompletedEvent;
  stepFailed: StepFailedEvent;

  // Capability Events
  capabilityDiscovered: CapabilityDiscoveredEvent;
  capabilityUpdated: CapabilityUpdatedEvent;

  // Security Events
  securityValidationRequested: SecurityValidationRequestedEvent;
  securityValidationCompleted: SecurityValidationCompletedEvent;
}

// Tool Execution Events
export interface ToolExecuteRequestEvent extends UAIPEvent<ToolExecuteRequestPayload> {
  type: 'tool.execute.request';
}

export interface ToolExecuteRequestPayload {
  requestId: string;
  toolId: string;
  parameters: Record<string, unknown>;
}

export interface ToolExecuteResponseEvent extends UAIPEvent<ToolExecuteResponsePayload> {
  type: 'tool.execute.response';
}

export interface ToolExecuteResponsePayload {
  requestId: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
  executionTime: number;
}

// Approval Events
export interface ApprovalRequestEvent extends UAIPEvent<ApprovalRequestPayload> {
  type: 'approval.request';
}

export interface ApprovalRequestPayload {
  workflowId: string;
  operationId: string;
  requiredApprovers: string[];
  context: Record<string, unknown>;
  expiresAt?: string;
}

export interface ApprovalResponseEvent extends UAIPEvent<ApprovalResponsePayload> {
  type: 'approval.response';
}

export interface ApprovalResponsePayload {
  workflowId: string;
  decision: 'approved' | 'denied' | 'pending';
  approverId?: string;
  reason?: string;
  timestamp: string;
}

// Operation Events
export interface OperationStartedEvent extends UAIPEvent<OperationStartedPayload> {
  type: 'operation.started';
}

export interface OperationStartedPayload {
  operationId: string;
  agentId: string;
  userId: string;
  operationType: string;
}

export interface OperationCompletedEvent extends UAIPEvent<OperationCompletedPayload> {
  type: 'operation.completed';
}

export interface OperationCompletedPayload {
  operationId: string;
  userId: string;
  agentId?: string;
  result: Record<string, unknown>;
  duration: number;
  success: boolean;
}

export interface OperationFailedEvent extends UAIPEvent<OperationFailedPayload> {
  type: 'operation.failed';
}

export interface OperationFailedPayload {
  operationId: string;
  userId: string;
  error: string;
  stepId?: string;
}

export interface StepCompletedEvent extends UAIPEvent<StepCompletedPayload> {
  type: 'operation.step.completed';
}

export interface StepCompletedPayload {
  operationId: string;
  stepId: string;
  stepName: string;
  result: Record<string, unknown>;
  duration: number;
  success: boolean;
}

export interface StepFailedEvent extends UAIPEvent<StepFailedPayload> {
  type: 'operation.step.failed';
}

export interface StepFailedPayload {
  operationId: string;
  stepId: string;
  stepName: string;
  error: string;
  retryable: boolean;
}

// Capability Events
export interface CapabilityDiscoveredEvent extends UAIPEvent<CapabilityDiscoveredPayload> {
  type: 'capability.discovered';
}

export interface CapabilityDiscoveredPayload {
  capabilityId: string;
  name: string;
  version: string;
  provider: string;
  type: string;
}

export interface CapabilityUpdatedEvent extends UAIPEvent<CapabilityUpdatedPayload> {
  type: 'capability.updated';
}

export interface CapabilityUpdatedPayload {
  capabilityId: string;
  changes: Record<string, unknown>;
}

// Security Events
export interface SecurityValidationRequestedEvent extends UAIPEvent<SecurityValidationRequestedPayload> {
  type: 'security.validation.requested';
}

export interface SecurityValidationRequestedPayload {
  operationId: string;
  userId: string;
  agentId?: string;
  requestType: string;
  resource: string;
}

export interface SecurityValidationCompletedEvent extends UAIPEvent<SecurityValidationCompletedPayload> {
  type: 'security.validation.completed';
}

export interface SecurityValidationCompletedPayload {
  operationId: string;
  valid: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  violations?: string[];
}
