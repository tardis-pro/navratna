import { z } from 'zod';
export declare enum EventType {
    AGENT_ANALYSIS_REQUESTED = "agent.analysis.requested",
    AGENT_ANALYSIS_COMPLETED = "agent.analysis.completed",
    OPERATION_CREATED = "operation.created",
    OPERATION_STARTED = "operation.started",
    OPERATION_STEP_COMPLETED = "operation.step.completed",
    OPERATION_COMPLETED = "operation.completed",
    OPERATION_FAILED = "operation.failed",
    CAPABILITY_DISCOVERED = "capability.discovered",
    CAPABILITY_UPDATED = "capability.updated",
    SECURITY_VALIDATION_REQUESTED = "security.validation.requested",
    SECURITY_VALIDATION_COMPLETED = "security.validation.completed",
    APPROVAL_REQUESTED = "approval.requested",
    APPROVAL_GRANTED = "approval.granted",
    APPROVAL_DENIED = "approval.denied",
    USER_AUTHENTICATION = "user.authentication",
    AUDIT_EVENT_CREATED = "audit.event.created"
}
export declare const BaseEventSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodNativeEnum<typeof EventType>;
    source: z.ZodString;
    timestamp: z.ZodDate;
    correlationId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    type: EventType;
    id: string;
    timestamp: Date;
    source: string;
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}, {
    type: EventType;
    id: string;
    timestamp: Date;
    source: string;
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}>;
export type BaseEvent = z.infer<typeof BaseEventSchema>;
export declare const AgentAnalysisRequestedEventSchema: z.ZodObject<{
    id: z.ZodString;
    source: z.ZodString;
    timestamp: z.ZodDate;
    correlationId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    type: z.ZodLiteral<EventType.AGENT_ANALYSIS_REQUESTED>;
    payload: z.ZodObject<{
        agentId: z.ZodString;
        userId: z.ZodString;
        conversationContext: z.ZodRecord<z.ZodString, z.ZodAny>;
        userRequest: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        agentId: string;
        userId: string;
        conversationContext: Record<string, any>;
        userRequest: string;
    }, {
        agentId: string;
        userId: string;
        conversationContext: Record<string, any>;
        userRequest: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: EventType.AGENT_ANALYSIS_REQUESTED;
    id: string;
    timestamp: Date;
    source: string;
    payload: {
        agentId: string;
        userId: string;
        conversationContext: Record<string, any>;
        userRequest: string;
    };
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}, {
    type: EventType.AGENT_ANALYSIS_REQUESTED;
    id: string;
    timestamp: Date;
    source: string;
    payload: {
        agentId: string;
        userId: string;
        conversationContext: Record<string, any>;
        userRequest: string;
    };
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}>;
export declare const AgentAnalysisCompletedEventSchema: z.ZodObject<{
    id: z.ZodString;
    source: z.ZodString;
    timestamp: z.ZodDate;
    correlationId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    type: z.ZodLiteral<EventType.AGENT_ANALYSIS_COMPLETED>;
    payload: z.ZodObject<{
        agentId: z.ZodString;
        userId: z.ZodString;
        analysisResult: z.ZodRecord<z.ZodString, z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        agentId: string;
        userId: string;
        analysisResult: Record<string, any>;
    }, {
        agentId: string;
        userId: string;
        analysisResult: Record<string, any>;
    }>;
}, "strip", z.ZodTypeAny, {
    type: EventType.AGENT_ANALYSIS_COMPLETED;
    id: string;
    timestamp: Date;
    source: string;
    payload: {
        agentId: string;
        userId: string;
        analysisResult: Record<string, any>;
    };
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}, {
    type: EventType.AGENT_ANALYSIS_COMPLETED;
    id: string;
    timestamp: Date;
    source: string;
    payload: {
        agentId: string;
        userId: string;
        analysisResult: Record<string, any>;
    };
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}>;
export declare const OperationCreatedEventSchema: z.ZodObject<{
    id: z.ZodString;
    source: z.ZodString;
    timestamp: z.ZodDate;
    correlationId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    type: z.ZodLiteral<EventType.OPERATION_CREATED>;
    payload: z.ZodObject<{
        operationId: z.ZodString;
        agentId: z.ZodString;
        userId: z.ZodString;
        operationType: z.ZodString;
        plan: z.ZodRecord<z.ZodString, z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        agentId: string;
        userId: string;
        operationId: string;
        plan: Record<string, any>;
        operationType: string;
    }, {
        agentId: string;
        userId: string;
        operationId: string;
        plan: Record<string, any>;
        operationType: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: EventType.OPERATION_CREATED;
    id: string;
    timestamp: Date;
    source: string;
    payload: {
        agentId: string;
        userId: string;
        operationId: string;
        plan: Record<string, any>;
        operationType: string;
    };
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}, {
    type: EventType.OPERATION_CREATED;
    id: string;
    timestamp: Date;
    source: string;
    payload: {
        agentId: string;
        userId: string;
        operationId: string;
        plan: Record<string, any>;
        operationType: string;
    };
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}>;
export declare const OperationStepCompletedEventSchema: z.ZodObject<{
    id: z.ZodString;
    source: z.ZodString;
    timestamp: z.ZodDate;
    correlationId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    type: z.ZodLiteral<EventType.OPERATION_STEP_COMPLETED>;
    payload: z.ZodObject<{
        operationId: z.ZodString;
        stepId: z.ZodString;
        stepName: z.ZodString;
        result: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        error: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        stepId: string;
        operationId: string;
        stepName: string;
        error?: string | undefined;
        result?: Record<string, any> | undefined;
    }, {
        stepId: string;
        operationId: string;
        stepName: string;
        error?: string | undefined;
        result?: Record<string, any> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: EventType.OPERATION_STEP_COMPLETED;
    id: string;
    timestamp: Date;
    source: string;
    payload: {
        stepId: string;
        operationId: string;
        stepName: string;
        error?: string | undefined;
        result?: Record<string, any> | undefined;
    };
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}, {
    type: EventType.OPERATION_STEP_COMPLETED;
    id: string;
    timestamp: Date;
    source: string;
    payload: {
        stepId: string;
        operationId: string;
        stepName: string;
        error?: string | undefined;
        result?: Record<string, any> | undefined;
    };
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}>;
export declare const SecurityValidationRequestedEventSchema: z.ZodObject<{
    id: z.ZodString;
    source: z.ZodString;
    timestamp: z.ZodDate;
    correlationId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    type: z.ZodLiteral<EventType.SECURITY_VALIDATION_REQUESTED>;
    payload: z.ZodObject<{
        operationId: z.ZodString;
        userId: z.ZodString;
        agentId: z.ZodOptional<z.ZodString>;
        requestType: z.ZodString;
        resource: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        userId: string;
        operationId: string;
        resource: string;
        requestType: string;
        agentId?: string | undefined;
    }, {
        userId: string;
        operationId: string;
        resource: string;
        requestType: string;
        agentId?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: EventType.SECURITY_VALIDATION_REQUESTED;
    id: string;
    timestamp: Date;
    source: string;
    payload: {
        userId: string;
        operationId: string;
        resource: string;
        requestType: string;
        agentId?: string | undefined;
    };
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}, {
    type: EventType.SECURITY_VALIDATION_REQUESTED;
    id: string;
    timestamp: Date;
    source: string;
    payload: {
        userId: string;
        operationId: string;
        resource: string;
        requestType: string;
        agentId?: string | undefined;
    };
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}>;
export declare const ApprovalRequestedEventSchema: z.ZodObject<{
    id: z.ZodString;
    source: z.ZodString;
    timestamp: z.ZodDate;
    correlationId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
} & {
    type: z.ZodLiteral<EventType.APPROVAL_REQUESTED>;
    payload: z.ZodObject<{
        workflowId: z.ZodString;
        operationId: z.ZodString;
        requiredApprovers: z.ZodArray<z.ZodString, "many">;
        riskLevel: z.ZodEnum<["low", "medium", "high", "critical"]>;
    }, "strip", z.ZodTypeAny, {
        riskLevel: "low" | "medium" | "high" | "critical";
        operationId: string;
        requiredApprovers: string[];
        workflowId: string;
    }, {
        riskLevel: "low" | "medium" | "high" | "critical";
        operationId: string;
        requiredApprovers: string[];
        workflowId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: EventType.APPROVAL_REQUESTED;
    id: string;
    timestamp: Date;
    source: string;
    payload: {
        riskLevel: "low" | "medium" | "high" | "critical";
        operationId: string;
        requiredApprovers: string[];
        workflowId: string;
    };
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}, {
    type: EventType.APPROVAL_REQUESTED;
    id: string;
    timestamp: Date;
    source: string;
    payload: {
        riskLevel: "low" | "medium" | "high" | "critical";
        operationId: string;
        requiredApprovers: string[];
        workflowId: string;
    };
    metadata?: Record<string, any> | undefined;
    correlationId?: string | undefined;
}>;
export type UAIPEvent = z.infer<typeof AgentAnalysisRequestedEventSchema> | z.infer<typeof AgentAnalysisCompletedEventSchema> | z.infer<typeof OperationCreatedEventSchema> | z.infer<typeof OperationStepCompletedEventSchema> | z.infer<typeof SecurityValidationRequestedEventSchema> | z.infer<typeof ApprovalRequestedEventSchema>;
export interface EventHandler<T extends BaseEvent = BaseEvent> {
    handle(event: T): Promise<void>;
}
export interface EventBus {
    publish(event: UAIPEvent): Promise<void>;
    subscribe<T extends BaseEvent>(eventType: EventType, handler: EventHandler<T>): void;
    unsubscribe(eventType: EventType, handler: EventHandler): void;
}
//# sourceMappingURL=events.d.ts.map