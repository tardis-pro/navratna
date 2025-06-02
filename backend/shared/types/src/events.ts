import { z } from 'zod';
import { UUIDSchema } from './common.js';

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
  id: UUIDSchema,
  type: z.nativeEnum(EventType),
  source: z.string(),
  timestamp: z.date(),
  correlationId: UUIDSchema.optional(),
  metadata: z.record(z.any()).optional()
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

// Agent events
export const AgentAnalysisRequestedEventSchema = BaseEventSchema.extend({
  type: z.literal(EventType.AGENT_ANALYSIS_REQUESTED),
  payload: z.object({
    agentId: UUIDSchema,
    userId: UUIDSchema,
    conversationContext: z.record(z.any()),
    userRequest: z.string()
  })
});

export const AgentAnalysisCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal(EventType.AGENT_ANALYSIS_COMPLETED),
  payload: z.object({
    agentId: UUIDSchema,
    userId: UUIDSchema,
    analysisResult: z.record(z.any())
  })
});

// Operation events
export const OperationCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal(EventType.OPERATION_CREATED),
  payload: z.object({
    operationId: UUIDSchema,
    agentId: UUIDSchema,
    userId: UUIDSchema,
    operationType: z.string(),
    plan: z.record(z.any())
  })
});

export const OperationStepCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal(EventType.OPERATION_STEP_COMPLETED),
  payload: z.object({
    operationId: UUIDSchema,
    stepId: UUIDSchema,
    stepName: z.string(),
    result: z.record(z.any()).optional(),
    error: z.string().optional()
  })
});

// Security events
export const SecurityValidationRequestedEventSchema = BaseEventSchema.extend({
  type: z.literal(EventType.SECURITY_VALIDATION_REQUESTED),
  payload: z.object({
    operationId: UUIDSchema,
    userId: UUIDSchema,
    agentId: UUIDSchema.optional(),
    requestType: z.string(),
    resource: z.string()
  })
});

export const ApprovalRequestedEventSchema = BaseEventSchema.extend({
  type: z.literal(EventType.APPROVAL_REQUESTED),
  payload: z.object({
    workflowId: UUIDSchema,
    operationId: UUIDSchema,
    requiredApprovers: z.array(UUIDSchema),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical'])
  })
});

// Union type for all events
export type UAIPEvent = 
  | z.infer<typeof AgentAnalysisRequestedEventSchema>
  | z.infer<typeof AgentAnalysisCompletedEventSchema>
  | z.infer<typeof OperationCreatedEventSchema>
  | z.infer<typeof OperationStepCompletedEventSchema>
  | z.infer<typeof SecurityValidationRequestedEventSchema>
  | z.infer<typeof ApprovalRequestedEventSchema>;

// Event handler interface
export interface EventHandler<T extends BaseEvent = BaseEvent> {
  handle(event: T): Promise<void>;
}

// Event bus interface
export interface EventBus {
  publish(event: UAIPEvent): Promise<void>;
  subscribe<T extends BaseEvent>(eventType: EventType, handler: EventHandler<T>): void;
  unsubscribe(eventType: EventType, handler: EventHandler): void;
} 