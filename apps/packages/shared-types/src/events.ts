import { IDSchema } from './common.js';
import { z } from 'zod';
import type { ActionRecommendation } from './agent.js';
const randomUUID = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
// Event types
export enum EventType {
  AGENT_ANALYSIS_REQUESTED = 'agent.analysis.requested',
  AGENT_ANALYSIS_COMPLETED = 'agent.analysis.completed',
  OPERATION_CREATED = 'operation.created',
  OPERATION_STARTED = 'operation.started',
  OPERATION_STEP_COMPLETED = 'operation.step.completed',
  OPERATION_COMPLETED = 'operation.completed',
  OPERATION_FAILED = 'operation.failed',
  CAPABILITY_DISCOVERED = 'capability.discovered',
  CAPABILITY_UPDATED = 'capability.updated',
  SECURITY_VALIDATION_REQUESTED = 'security.validation.requested',
  SECURITY_VALIDATION_COMPLETED = 'security.validation.completed',
  APPROVAL_REQUESTED = 'approval.requested',
  APPROVAL_GRANTED = 'approval.granted',
  APPROVAL_DENIED = 'approval.denied',
  USER_AUTHENTICATION = 'user.authentication',
  AUDIT_EVENT_CREATED = 'audit.event.created',
}

// Base event schema
export const BaseEventSchema = z.object({
  id: IDSchema,
  type: z.string(),
  timestamp: z.date(),
  source: z.string(),
  correlationId: IDSchema.optional(),
  metadata: z.record(z.any()).optional(),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

// Actor security context
export const ActorSchema = z.object({
  userId: IDSchema,
  orgId: IDSchema,
  roles: z.array(z.string()),
});

export type Actor = z.infer<typeof ActorSchema>;

// Tenant context for multi-tenancy
export const TenantSchema = z.object({
  orgId: IDSchema,
});

export type Tenant = z.infer<typeof TenantSchema>;

// UAIP Event Envelope with security and tenant context
export const UAIPEventSchema = z.object({
  id: IDSchema,
  type: z.string(),
  source: z.string(),
  timestamp: z.string().datetime(),
  correlationId: IDSchema,
  actor: ActorSchema,
  tenant: TenantSchema,
  data: z.record(z.any()),
  version: z.literal('1'),
});

export type UAIPEventBase = z.infer<typeof UAIPEventSchema>;

export type UAIPEvent<T = Record<string, unknown>> = Omit<UAIPEventBase, 'data'> & {
  data: T;
};

// Helper function to create UAIPEvent
export function createUAIPEvent<T extends Record<string, unknown>>(
  type: string,
  source: string,
  data: T,
  actor: Actor,
  tenant: Tenant,
  correlationId?: string
): UAIPEvent<T> {
  return {
    id: randomUUID(),
    type,
    source,
    timestamp: new Date().toISOString(),
    correlationId: correlationId || randomUUID(),
    actor,
    tenant,
    data,
    version: '1',
  };
}

// Agent events
export const AgentCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal('agent.created'),
  data: z.object({
    agentId: IDSchema,
    userId: IDSchema,
    name: z.string(),
    capabilities: z.array(z.string()),
  }),
});

export const AgentUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal('agent.updated'),
  data: z.object({
    agentId: IDSchema,
    userId: IDSchema,
    changes: z.record(z.any()),
  }),
});

// Operation events
export const OperationStartedEventSchema = BaseEventSchema.extend({
  type: z.literal('operation.started'),
  data: z.object({
    operationId: IDSchema,
    agentId: IDSchema,
    userId: IDSchema,
    operationType: z.string(),
    context: z.record(z.any()).optional(),
  }),
});

export const OperationStepCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal('operation.step.completed'),
  data: z.object({
    operationId: IDSchema,
    stepId: IDSchema,
    stepName: z.string(),
    result: z.any(),
    duration: z.number(),
    success: z.boolean(),
  }),
});

export const OperationCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal('operation.completed'),
  data: z.object({
    operationId: IDSchema,
    userId: IDSchema,
    agentId: IDSchema.optional(),
    result: z.any(),
    duration: z.number(),
    success: z.boolean(),
  }),
});

// Security events
export const SecurityValidationRequestedEventSchema = BaseEventSchema.extend({
  type: z.literal(EventType.SECURITY_VALIDATION_REQUESTED),
  payload: z.object({
    operationId: IDSchema,
    userId: IDSchema,
    agentId: IDSchema.optional(),
    requestType: z.string(),
    resource: z.string(),
  }),
});

// Approval events
export const ApprovalRequestedEventSchema = BaseEventSchema.extend({
  type: z.literal('approval.requested'),
  data: z.object({
    workflowId: IDSchema,
    operationId: IDSchema,
    requiredApprovers: z.array(IDSchema),
    context: z.record(z.any()).optional(),
  }),
});

// Export all event types
export type AgentCreatedEvent = z.infer<typeof AgentCreatedEventSchema>;
export type AgentUpdatedEvent = z.infer<typeof AgentUpdatedEventSchema>;
export type OperationStartedEvent = z.infer<typeof OperationStartedEventSchema>;
export type OperationStepCompletedEvent = z.infer<typeof OperationStepCompletedEventSchema>;
export type OperationCompletedEvent = z.infer<typeof OperationCompletedEventSchema>;
export type ApprovalRequestedEvent = z.infer<typeof ApprovalRequestedEventSchema>;

export type Event =
  | AgentCreatedEvent
  | AgentUpdatedEvent
  | OperationStartedEvent
  | OperationStepCompletedEvent
  | OperationCompletedEvent
  | ApprovalRequestedEvent;

// Event handler interface
export interface EventHandler<T extends BaseEvent = BaseEvent> {
  handle(event: T): Promise<void>;
}

// Event message interface
export interface EventMessage {
  operationId?: string;
  reason?: string;
  checkpointId?: string;
  compensate?: boolean;
  force?: boolean;
  [key: string]: unknown;
}

// Event bus interface
export interface EventBus {
  publish(event: Event): Promise<void>;
  subscribe<T extends BaseEvent>(eventType: EventType, handler: EventHandler<T>): void;
  unsubscribe(eventType: EventType, handler: EventHandler): void;
}

// ============================================================================
// Agent Event Bus Types (moved from backend/shared/services)
// ============================================================================

export interface AgentEvent {
  eventType: string;
  agentId?: string;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface StateChangedEvent extends AgentEvent {
  eventType: 'state.changed';
  agentId: string;
  data: {
    from: string;
    to: string;
    trigger: string;
    context?: Record<string, unknown>;
  };
}

export interface DecisionMadeEvent extends AgentEvent {
  eventType: 'decision.made';
  agentId: string;
  data: {
    selectedAction: ActionRecommendation | null;
    alternatives: ActionRecommendation[];
    confidence: number;
    reasoning: string;
    duration: number;
  };
}

export interface MemorySavedEvent extends AgentEvent {
  eventType: 'memory.saved';
  agentId: string;
  data: {
    memoryType: 'working' | 'episodic' | 'semantic';
    entryId: string;
    significance: number;
    content: string | Record<string, unknown>;
  };
}

export interface WorkflowStepEvent extends AgentEvent {
  eventType: 'workflow.step.started' | 'workflow.step.completed' | 'workflow.step.failed';
  agentId: string;
  data: {
    workflowId: string;
    stepId: string;
    stepName: string;
    status: string;
    duration?: number;
    output?: Record<string, unknown>;
    error?: string;
  };
}

export interface ToolExecutionEvent extends AgentEvent {
  eventType: 'tool.execution.started' | 'tool.execution.completed' | 'tool.execution.failed';
  agentId: string;
  data: {
    toolId: string;
    toolName: string;
    duration?: number;
    success?: boolean;
    output?: Record<string, unknown>;
    error?: string;
  };
}

export interface PerformanceMetricEvent extends AgentEvent {
  eventType: 'performance.metric';
  agentId?: string;
  data: {
    metricName: string;
    value: number;
    unit: string;
    tags?: Record<string, string>;
  };
}
