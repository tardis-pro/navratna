import { IDSchema } from './common.js';
import { z } from 'zod';

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
  AUDIT_EVENT_CREATED = 'audit.event.created'
}

// Base event schema
export const BaseEventSchema = z.object({
  id: IDSchema,
  type: z.string(),
  timestamp: z.date(),
  source: z.string(),
  correlationId: IDSchema.optional(),
  metadata: z.record(z.any()).optional()
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

// Agent events
export const AgentCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal('agent.created'),
  data: z.object({
    agentId: IDSchema,
    userId: IDSchema,
    name: z.string(),
    capabilities: z.array(z.string())
  })
});

export const AgentUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal('agent.updated'),
  data: z.object({
    agentId: IDSchema,
    userId: IDSchema,
    changes: z.record(z.any())
  })
});

// Operation events
export const OperationStartedEventSchema = BaseEventSchema.extend({
  type: z.literal('operation.started'),
  data: z.object({
    operationId: IDSchema,
    agentId: IDSchema,
    userId: IDSchema,
    operationType: z.string(),
    context: z.record(z.any()).optional()
  })
});

export const OperationStepCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal('operation.step.completed'),
  data: z.object({
    operationId: IDSchema,
    stepId: IDSchema,
    stepName: z.string(),
    result: z.any(),
    duration: z.number(),
    success: z.boolean()
  })
});

export const OperationCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal('operation.completed'),
  data: z.object({
    operationId: IDSchema,
    userId: IDSchema,
    agentId: IDSchema.optional(),
    result: z.any(),
    duration: z.number(),
    success: z.boolean()
  })
});

// Security events
export const SecurityValidationRequestedEventSchema = BaseEventSchema.extend({
  type: z.literal(EventType.SECURITY_VALIDATION_REQUESTED),
  payload: z.object({
    operationId: IDSchema,
    userId: IDSchema,
    agentId: IDSchema.optional(),
    requestType: z.string(),
    resource: z.string()
  })
});

// Approval events
export const ApprovalRequestedEventSchema = BaseEventSchema.extend({
  type: z.literal('approval.requested'),
  data: z.object({
    workflowId: IDSchema,
    operationId: IDSchema,
    requiredApprovers: z.array(IDSchema),
    context: z.record(z.any()).optional()
  })
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

// Event bus interface
export interface EventBus {
  publish(event: Event): Promise<void>;
  subscribe<T extends BaseEvent>(eventType: EventType, handler: EventHandler<T>): void;
  unsubscribe(eventType: EventType, handler: EventHandler): void;
} 