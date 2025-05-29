import { z } from 'zod';
export declare enum OperationType {
    TOOL_EXECUTION = "tool_execution",
    ARTIFACT_GENERATION = "artifact_generation",
    HYBRID_WORKFLOW = "hybrid_workflow",
    ANALYSIS = "analysis"
}
export declare enum OperationStatus {
    PENDING = "pending",
    QUEUED = "queued",
    RUNNING = "running",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled",
    SUSPENDED = "suspended",
    PAUSED = "paused",
    COMPENSATING = "compensating"
}
export declare enum OperationPriority {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    URGENT = "urgent"
}
export declare enum StepStatus {
    PENDING = "pending",
    RUNNING = "running",
    COMPLETED = "completed",
    FAILED = "failed",
    SKIPPED = "skipped",
    CANCELLED = "cancelled"
}
export declare enum OperationEventType {
    OPERATION_STARTED = "operation_started",
    OPERATION_COMPLETED = "operation_completed",
    OPERATION_FAILED = "operation_failed",
    OPERATION_PAUSED = "operation_paused",
    OPERATION_RESUMED = "operation_resumed",
    STEP_STARTED = "step_started",
    STEP_COMPLETED = "step_completed",
    STEP_FAILED = "step_failed",
    CHECKPOINT_CREATED = "checkpoint_created"
}
export declare enum CheckpointType {
    STATE_SNAPSHOT = "state_snapshot",
    PROGRESS_MARKER = "progress_marker",
    ERROR_RECOVERY = "error_recovery"
}
export declare const ExecutionContextSchema: z.ZodObject<{
    agentId: z.ZodString;
    userId: z.ZodString;
    conversationId: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
    environment: z.ZodDefault<z.ZodEnum<["development", "staging", "production"]>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    timeout: z.ZodDefault<z.ZodNumber>;
    resourceLimits: z.ZodObject<{
        maxMemory: z.ZodDefault<z.ZodNumber>;
        maxCpu: z.ZodDefault<z.ZodNumber>;
        maxDuration: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        maxMemory: number;
        maxCpu: number;
        maxDuration: number;
    }, {
        maxMemory?: number | undefined;
        maxCpu?: number | undefined;
        maxDuration?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    agentId: string;
    userId: string;
    environment: "development" | "staging" | "production";
    timeout: number;
    resourceLimits: {
        maxMemory: number;
        maxCpu: number;
        maxDuration: number;
    };
    metadata?: Record<string, any> | undefined;
    conversationId?: string | undefined;
    sessionId?: string | undefined;
}, {
    agentId: string;
    userId: string;
    resourceLimits: {
        maxMemory?: number | undefined;
        maxCpu?: number | undefined;
        maxDuration?: number | undefined;
    };
    metadata?: Record<string, any> | undefined;
    conversationId?: string | undefined;
    sessionId?: string | undefined;
    environment?: "development" | "staging" | "production" | undefined;
    timeout?: number | undefined;
}>;
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;
export declare const ResourceRequirementsSchema: z.ZodObject<{
    cpu: z.ZodOptional<z.ZodNumber>;
    memory: z.ZodOptional<z.ZodNumber>;
    storage: z.ZodOptional<z.ZodNumber>;
    network: z.ZodDefault<z.ZodBoolean>;
    gpu: z.ZodDefault<z.ZodBoolean>;
    estimatedDuration: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    network: boolean;
    gpu: boolean;
    estimatedDuration?: number | undefined;
    cpu?: number | undefined;
    memory?: number | undefined;
    storage?: number | undefined;
}, {
    estimatedDuration?: number | undefined;
    cpu?: number | undefined;
    memory?: number | undefined;
    storage?: number | undefined;
    network?: boolean | undefined;
    gpu?: boolean | undefined;
}>;
export type ResourceRequirements = z.infer<typeof ResourceRequirementsSchema>;
export declare const ExecutionStepSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    type: z.ZodEnum<["tool", "artifact", "validation", "approval", "delay", "decision"]>;
    status: z.ZodDefault<z.ZodNativeEnum<typeof StepStatus>>;
    input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    error: z.ZodOptional<z.ZodString>;
    startedAt: z.ZodOptional<z.ZodDate>;
    completedAt: z.ZodOptional<z.ZodDate>;
    retryCount: z.ZodDefault<z.ZodNumber>;
    maxRetries: z.ZodDefault<z.ZodNumber>;
    timeout: z.ZodDefault<z.ZodNumber>;
    condition: z.ZodOptional<z.ZodString>;
    outputMapping: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    required: z.ZodDefault<z.ZodBoolean>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    retryPolicy: z.ZodOptional<z.ZodObject<{
        maxAttempts: z.ZodDefault<z.ZodNumber>;
        backoffStrategy: z.ZodDefault<z.ZodEnum<["fixed", "exponential", "linear"]>>;
        retryDelay: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        maxAttempts: number;
        backoffStrategy: "fixed" | "exponential" | "linear";
        retryDelay: number;
    }, {
        maxAttempts?: number | undefined;
        backoffStrategy?: "fixed" | "exponential" | "linear" | undefined;
        retryDelay?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    type: "validation" | "tool" | "artifact" | "approval" | "delay" | "decision";
    status: StepStatus;
    id: string;
    name: string;
    required: boolean;
    timeout: number;
    retryCount: number;
    maxRetries: number;
    error?: string | undefined;
    metadata?: Record<string, any> | undefined;
    startedAt?: Date | undefined;
    input?: Record<string, any> | undefined;
    output?: Record<string, any> | undefined;
    completedAt?: Date | undefined;
    condition?: string | undefined;
    outputMapping?: Record<string, string> | undefined;
    retryPolicy?: {
        maxAttempts: number;
        backoffStrategy: "fixed" | "exponential" | "linear";
        retryDelay: number;
    } | undefined;
}, {
    type: "validation" | "tool" | "artifact" | "approval" | "delay" | "decision";
    id: string;
    name: string;
    status?: StepStatus | undefined;
    error?: string | undefined;
    metadata?: Record<string, any> | undefined;
    startedAt?: Date | undefined;
    required?: boolean | undefined;
    timeout?: number | undefined;
    input?: Record<string, any> | undefined;
    output?: Record<string, any> | undefined;
    completedAt?: Date | undefined;
    retryCount?: number | undefined;
    maxRetries?: number | undefined;
    condition?: string | undefined;
    outputMapping?: Record<string, string> | undefined;
    retryPolicy?: {
        maxAttempts?: number | undefined;
        backoffStrategy?: "fixed" | "exponential" | "linear" | undefined;
        retryDelay?: number | undefined;
    } | undefined;
}>;
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;
export declare const OperationStepSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    type: z.ZodEnum<["tool", "artifact", "validation", "approval"]>;
    status: z.ZodNativeEnum<typeof OperationStatus>;
    input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    error: z.ZodOptional<z.ZodString>;
    startedAt: z.ZodOptional<z.ZodDate>;
    completedAt: z.ZodOptional<z.ZodDate>;
    retryCount: z.ZodDefault<z.ZodNumber>;
    maxRetries: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "validation" | "tool" | "artifact" | "approval";
    status: OperationStatus;
    id: string;
    name: string;
    retryCount: number;
    maxRetries: number;
    error?: string | undefined;
    startedAt?: Date | undefined;
    input?: Record<string, any> | undefined;
    output?: Record<string, any> | undefined;
    completedAt?: Date | undefined;
}, {
    type: "validation" | "tool" | "artifact" | "approval";
    status: OperationStatus;
    id: string;
    name: string;
    error?: string | undefined;
    startedAt?: Date | undefined;
    input?: Record<string, any> | undefined;
    output?: Record<string, any> | undefined;
    completedAt?: Date | undefined;
    retryCount?: number | undefined;
    maxRetries?: number | undefined;
}>;
export type OperationStep = z.infer<typeof OperationStepSchema>;
export declare const StepDependencySchema: z.ZodObject<{
    stepId: z.ZodString;
    dependsOn: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    stepId: string;
    dependsOn: string[];
}, {
    stepId: string;
    dependsOn: string[];
}>;
export type StepDependency = z.infer<typeof StepDependencySchema>;
export declare const ParallelExecutionPolicySchema: z.ZodObject<{
    policy: z.ZodDefault<z.ZodEnum<["all_success", "any_success", "majority_success"]>>;
    maxConcurrency: z.ZodDefault<z.ZodNumber>;
    timeoutPolicy: z.ZodDefault<z.ZodEnum<["wait_all", "fail_fast"]>>;
}, "strip", z.ZodTypeAny, {
    policy: "all_success" | "any_success" | "majority_success";
    maxConcurrency: number;
    timeoutPolicy: "wait_all" | "fail_fast";
}, {
    policy?: "all_success" | "any_success" | "majority_success" | undefined;
    maxConcurrency?: number | undefined;
    timeoutPolicy?: "wait_all" | "fail_fast" | undefined;
}>;
export type ParallelExecutionPolicy = z.infer<typeof ParallelExecutionPolicySchema>;
export declare const ParallelGroupSchema: z.ZodObject<{
    id: z.ZodString;
    stepIds: z.ZodArray<z.ZodString, "many">;
    policy: z.ZodObject<{
        policy: z.ZodDefault<z.ZodEnum<["all_success", "any_success", "majority_success"]>>;
        maxConcurrency: z.ZodDefault<z.ZodNumber>;
        timeoutPolicy: z.ZodDefault<z.ZodEnum<["wait_all", "fail_fast"]>>;
    }, "strip", z.ZodTypeAny, {
        policy: "all_success" | "any_success" | "majority_success";
        maxConcurrency: number;
        timeoutPolicy: "wait_all" | "fail_fast";
    }, {
        policy?: "all_success" | "any_success" | "majority_success" | undefined;
        maxConcurrency?: number | undefined;
        timeoutPolicy?: "wait_all" | "fail_fast" | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    policy: {
        policy: "all_success" | "any_success" | "majority_success";
        maxConcurrency: number;
        timeoutPolicy: "wait_all" | "fail_fast";
    };
    stepIds: string[];
}, {
    id: string;
    policy: {
        policy?: "all_success" | "any_success" | "majority_success" | undefined;
        maxConcurrency?: number | undefined;
        timeoutPolicy?: "wait_all" | "fail_fast" | undefined;
    };
    stepIds: string[];
}>;
export type ParallelGroup = z.infer<typeof ParallelGroupSchema>;
export declare const FailurePolicySchema: z.ZodObject<{
    onStepFailure: z.ZodDefault<z.ZodEnum<["fail_immediately", "continue", "compensate"]>>;
    compensationRequired: z.ZodDefault<z.ZodBoolean>;
    retryPolicy: z.ZodOptional<z.ZodObject<{
        maxAttempts: z.ZodDefault<z.ZodNumber>;
        backoffStrategy: z.ZodDefault<z.ZodEnum<["fixed", "exponential", "linear"]>>;
        retryDelay: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        maxAttempts: number;
        backoffStrategy: "fixed" | "exponential" | "linear";
        retryDelay: number;
    }, {
        maxAttempts?: number | undefined;
        backoffStrategy?: "fixed" | "exponential" | "linear" | undefined;
        retryDelay?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    onStepFailure: "fail_immediately" | "continue" | "compensate";
    compensationRequired: boolean;
    retryPolicy?: {
        maxAttempts: number;
        backoffStrategy: "fixed" | "exponential" | "linear";
        retryDelay: number;
    } | undefined;
}, {
    retryPolicy?: {
        maxAttempts?: number | undefined;
        backoffStrategy?: "fixed" | "exponential" | "linear" | undefined;
        retryDelay?: number | undefined;
    } | undefined;
    onStepFailure?: "fail_immediately" | "continue" | "compensate" | undefined;
    compensationRequired?: boolean | undefined;
}>;
export type FailurePolicy = z.infer<typeof FailurePolicySchema>;
export declare const OperationPlanSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodNativeEnum<typeof OperationType>;
    description: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        type: z.ZodEnum<["tool", "artifact", "validation", "approval"]>;
        status: z.ZodNativeEnum<typeof OperationStatus>;
        input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        error: z.ZodOptional<z.ZodString>;
        startedAt: z.ZodOptional<z.ZodDate>;
        completedAt: z.ZodOptional<z.ZodDate>;
        retryCount: z.ZodDefault<z.ZodNumber>;
        maxRetries: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        type: "validation" | "tool" | "artifact" | "approval";
        status: OperationStatus;
        id: string;
        name: string;
        retryCount: number;
        maxRetries: number;
        error?: string | undefined;
        startedAt?: Date | undefined;
        input?: Record<string, any> | undefined;
        output?: Record<string, any> | undefined;
        completedAt?: Date | undefined;
    }, {
        type: "validation" | "tool" | "artifact" | "approval";
        status: OperationStatus;
        id: string;
        name: string;
        error?: string | undefined;
        startedAt?: Date | undefined;
        input?: Record<string, any> | undefined;
        output?: Record<string, any> | undefined;
        completedAt?: Date | undefined;
        retryCount?: number | undefined;
        maxRetries?: number | undefined;
    }>, "many">;
    dependencies: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    resourceRequirements: z.ZodObject<{
        cpu: z.ZodOptional<z.ZodNumber>;
        memory: z.ZodOptional<z.ZodNumber>;
        storage: z.ZodOptional<z.ZodNumber>;
        network: z.ZodDefault<z.ZodBoolean>;
        gpu: z.ZodDefault<z.ZodBoolean>;
        estimatedDuration: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        network: boolean;
        gpu: boolean;
        estimatedDuration?: number | undefined;
        cpu?: number | undefined;
        memory?: number | undefined;
        storage?: number | undefined;
    }, {
        estimatedDuration?: number | undefined;
        cpu?: number | undefined;
        memory?: number | undefined;
        storage?: number | undefined;
        network?: boolean | undefined;
        gpu?: boolean | undefined;
    }>;
    estimatedDuration: z.ZodNumber;
    riskAssessment: z.ZodObject<{
        level: z.ZodEnum<["low", "medium", "high", "critical"]>;
        factors: z.ZodArray<z.ZodString, "many">;
        mitigations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        level: "low" | "medium" | "high" | "critical";
        factors: string[];
        mitigations?: string[] | undefined;
    }, {
        level: "low" | "medium" | "high" | "critical";
        factors: string[];
        mitigations?: string[] | undefined;
    }>;
    approvalRequired: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    type: OperationType;
    id: string;
    createdAt: Date;
    description: string;
    approvalRequired: boolean;
    estimatedDuration: number;
    steps: {
        type: "validation" | "tool" | "artifact" | "approval";
        status: OperationStatus;
        id: string;
        name: string;
        retryCount: number;
        maxRetries: number;
        error?: string | undefined;
        startedAt?: Date | undefined;
        input?: Record<string, any> | undefined;
        output?: Record<string, any> | undefined;
        completedAt?: Date | undefined;
    }[];
    resourceRequirements: {
        network: boolean;
        gpu: boolean;
        estimatedDuration?: number | undefined;
        cpu?: number | undefined;
        memory?: number | undefined;
        storage?: number | undefined;
    };
    riskAssessment: {
        level: "low" | "medium" | "high" | "critical";
        factors: string[];
        mitigations?: string[] | undefined;
    };
    dependencies?: string[] | undefined;
}, {
    type: OperationType;
    id: string;
    createdAt: Date;
    description: string;
    estimatedDuration: number;
    steps: {
        type: "validation" | "tool" | "artifact" | "approval";
        status: OperationStatus;
        id: string;
        name: string;
        error?: string | undefined;
        startedAt?: Date | undefined;
        input?: Record<string, any> | undefined;
        output?: Record<string, any> | undefined;
        completedAt?: Date | undefined;
        retryCount?: number | undefined;
        maxRetries?: number | undefined;
    }[];
    resourceRequirements: {
        estimatedDuration?: number | undefined;
        cpu?: number | undefined;
        memory?: number | undefined;
        storage?: number | undefined;
        network?: boolean | undefined;
        gpu?: boolean | undefined;
    };
    riskAssessment: {
        level: "low" | "medium" | "high" | "critical";
        factors: string[];
        mitigations?: string[] | undefined;
    };
    dependencies?: string[] | undefined;
    approvalRequired?: boolean | undefined;
}>;
export type OperationPlan = z.infer<typeof OperationPlanSchema>;
export declare const StepResultSchema: z.ZodObject<{
    stepId: z.ZodString;
    status: z.ZodNativeEnum<typeof StepStatus>;
    data: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    error: z.ZodOptional<z.ZodString>;
    executionTime: z.ZodOptional<z.ZodNumber>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    status: StepStatus;
    data: Record<string, any>;
    stepId: string;
    error?: string | undefined;
    metadata?: Record<string, any> | undefined;
    executionTime?: number | undefined;
}, {
    status: StepStatus;
    stepId: string;
    error?: string | undefined;
    data?: Record<string, any> | undefined;
    metadata?: Record<string, any> | undefined;
    executionTime?: number | undefined;
}>;
export type StepResult = z.infer<typeof StepResultSchema>;
export declare const OperationStateSchema: z.ZodObject<{
    operationId: z.ZodString;
    status: z.ZodOptional<z.ZodNativeEnum<typeof OperationStatus>>;
    currentStep: z.ZodOptional<z.ZodString>;
    completedSteps: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    failedSteps: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    variables: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    checkpoints: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    startedAt: z.ZodOptional<z.ZodDate>;
    completedAt: z.ZodOptional<z.ZodDate>;
    lastUpdated: z.ZodDate;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    error: z.ZodOptional<z.ZodString>;
    result: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    operationId: string;
    completedSteps: string[];
    failedSteps: string[];
    variables: Record<string, any>;
    checkpoints: string[];
    lastUpdated: Date;
    status?: OperationStatus | undefined;
    error?: string | undefined;
    metadata?: Record<string, any> | undefined;
    startedAt?: Date | undefined;
    completedAt?: Date | undefined;
    currentStep?: string | undefined;
    result?: Record<string, any> | undefined;
}, {
    operationId: string;
    lastUpdated: Date;
    status?: OperationStatus | undefined;
    error?: string | undefined;
    metadata?: Record<string, any> | undefined;
    startedAt?: Date | undefined;
    completedAt?: Date | undefined;
    currentStep?: string | undefined;
    completedSteps?: string[] | undefined;
    failedSteps?: string[] | undefined;
    variables?: Record<string, any> | undefined;
    checkpoints?: string[] | undefined;
    result?: Record<string, any> | undefined;
}>;
export type OperationState = z.infer<typeof OperationStateSchema>;
export declare const WorkflowInstanceSchema: z.ZodObject<{
    id: z.ZodString;
    operationId: z.ZodString;
    status: z.ZodNativeEnum<typeof OperationStatus>;
    currentStepIndex: z.ZodDefault<z.ZodNumber>;
    executionContext: z.ZodObject<{
        agentId: z.ZodString;
        userId: z.ZodString;
        conversationId: z.ZodOptional<z.ZodString>;
        sessionId: z.ZodOptional<z.ZodString>;
        environment: z.ZodDefault<z.ZodEnum<["development", "staging", "production"]>>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        timeout: z.ZodDefault<z.ZodNumber>;
        resourceLimits: z.ZodObject<{
            maxMemory: z.ZodDefault<z.ZodNumber>;
            maxCpu: z.ZodDefault<z.ZodNumber>;
            maxDuration: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            maxMemory: number;
            maxCpu: number;
            maxDuration: number;
        }, {
            maxMemory?: number | undefined;
            maxCpu?: number | undefined;
            maxDuration?: number | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        agentId: string;
        userId: string;
        environment: "development" | "staging" | "production";
        timeout: number;
        resourceLimits: {
            maxMemory: number;
            maxCpu: number;
            maxDuration: number;
        };
        metadata?: Record<string, any> | undefined;
        conversationId?: string | undefined;
        sessionId?: string | undefined;
    }, {
        agentId: string;
        userId: string;
        resourceLimits: {
            maxMemory?: number | undefined;
            maxCpu?: number | undefined;
            maxDuration?: number | undefined;
        };
        metadata?: Record<string, any> | undefined;
        conversationId?: string | undefined;
        sessionId?: string | undefined;
        environment?: "development" | "staging" | "production" | undefined;
        timeout?: number | undefined;
    }>;
    state: z.ZodObject<{
        operationId: z.ZodString;
        status: z.ZodOptional<z.ZodNativeEnum<typeof OperationStatus>>;
        currentStep: z.ZodOptional<z.ZodString>;
        completedSteps: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        failedSteps: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        variables: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
        checkpoints: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        startedAt: z.ZodOptional<z.ZodDate>;
        completedAt: z.ZodOptional<z.ZodDate>;
        lastUpdated: z.ZodDate;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        error: z.ZodOptional<z.ZodString>;
        result: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        operationId: string;
        completedSteps: string[];
        failedSteps: string[];
        variables: Record<string, any>;
        checkpoints: string[];
        lastUpdated: Date;
        status?: OperationStatus | undefined;
        error?: string | undefined;
        metadata?: Record<string, any> | undefined;
        startedAt?: Date | undefined;
        completedAt?: Date | undefined;
        currentStep?: string | undefined;
        result?: Record<string, any> | undefined;
    }, {
        operationId: string;
        lastUpdated: Date;
        status?: OperationStatus | undefined;
        error?: string | undefined;
        metadata?: Record<string, any> | undefined;
        startedAt?: Date | undefined;
        completedAt?: Date | undefined;
        currentStep?: string | undefined;
        completedSteps?: string[] | undefined;
        failedSteps?: string[] | undefined;
        variables?: Record<string, any> | undefined;
        checkpoints?: string[] | undefined;
        result?: Record<string, any> | undefined;
    }>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    status: OperationStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    operationId: string;
    currentStepIndex: number;
    executionContext: {
        agentId: string;
        userId: string;
        environment: "development" | "staging" | "production";
        timeout: number;
        resourceLimits: {
            maxMemory: number;
            maxCpu: number;
            maxDuration: number;
        };
        metadata?: Record<string, any> | undefined;
        conversationId?: string | undefined;
        sessionId?: string | undefined;
    };
    state: {
        operationId: string;
        completedSteps: string[];
        failedSteps: string[];
        variables: Record<string, any>;
        checkpoints: string[];
        lastUpdated: Date;
        status?: OperationStatus | undefined;
        error?: string | undefined;
        metadata?: Record<string, any> | undefined;
        startedAt?: Date | undefined;
        completedAt?: Date | undefined;
        currentStep?: string | undefined;
        result?: Record<string, any> | undefined;
    };
}, {
    status: OperationStatus;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    operationId: string;
    executionContext: {
        agentId: string;
        userId: string;
        resourceLimits: {
            maxMemory?: number | undefined;
            maxCpu?: number | undefined;
            maxDuration?: number | undefined;
        };
        metadata?: Record<string, any> | undefined;
        conversationId?: string | undefined;
        sessionId?: string | undefined;
        environment?: "development" | "staging" | "production" | undefined;
        timeout?: number | undefined;
    };
    state: {
        operationId: string;
        lastUpdated: Date;
        status?: OperationStatus | undefined;
        error?: string | undefined;
        metadata?: Record<string, any> | undefined;
        startedAt?: Date | undefined;
        completedAt?: Date | undefined;
        currentStep?: string | undefined;
        completedSteps?: string[] | undefined;
        failedSteps?: string[] | undefined;
        variables?: Record<string, any> | undefined;
        checkpoints?: string[] | undefined;
        result?: Record<string, any> | undefined;
    };
    currentStepIndex?: number | undefined;
}>;
export type WorkflowInstance = z.infer<typeof WorkflowInstanceSchema>;
export declare const OperationEventSchema: z.ZodObject<{
    operationId: z.ZodString;
    eventType: z.ZodNativeEnum<typeof OperationEventType>;
    data: z.ZodRecord<z.ZodString, z.ZodAny>;
    timestamp: z.ZodDate;
    source: z.ZodString;
}, "strip", z.ZodTypeAny, {
    data: Record<string, any>;
    timestamp: Date;
    operationId: string;
    eventType: OperationEventType;
    source: string;
}, {
    data: Record<string, any>;
    timestamp: Date;
    operationId: string;
    eventType: OperationEventType;
    source: string;
}>;
export type OperationEvent = z.infer<typeof OperationEventSchema>;
export declare const CheckpointSchema: z.ZodObject<{
    id: z.ZodString;
    stepId: z.ZodString;
    type: z.ZodNativeEnum<typeof CheckpointType>;
    data: z.ZodObject<{
        operationState: z.ZodObject<{
            operationId: z.ZodString;
            status: z.ZodOptional<z.ZodNativeEnum<typeof OperationStatus>>;
            currentStep: z.ZodOptional<z.ZodString>;
            completedSteps: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            failedSteps: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            variables: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
            checkpoints: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            startedAt: z.ZodOptional<z.ZodDate>;
            completedAt: z.ZodOptional<z.ZodDate>;
            lastUpdated: z.ZodDate;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            error: z.ZodOptional<z.ZodString>;
            result: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        }, "strip", z.ZodTypeAny, {
            operationId: string;
            completedSteps: string[];
            failedSteps: string[];
            variables: Record<string, any>;
            checkpoints: string[];
            lastUpdated: Date;
            status?: OperationStatus | undefined;
            error?: string | undefined;
            metadata?: Record<string, any> | undefined;
            startedAt?: Date | undefined;
            completedAt?: Date | undefined;
            currentStep?: string | undefined;
            result?: Record<string, any> | undefined;
        }, {
            operationId: string;
            lastUpdated: Date;
            status?: OperationStatus | undefined;
            error?: string | undefined;
            metadata?: Record<string, any> | undefined;
            startedAt?: Date | undefined;
            completedAt?: Date | undefined;
            currentStep?: string | undefined;
            completedSteps?: string[] | undefined;
            failedSteps?: string[] | undefined;
            variables?: Record<string, any> | undefined;
            checkpoints?: string[] | undefined;
            result?: Record<string, any> | undefined;
        }>;
        timestamp: z.ZodDate;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        timestamp: Date;
        version: string;
        operationState: {
            operationId: string;
            completedSteps: string[];
            failedSteps: string[];
            variables: Record<string, any>;
            checkpoints: string[];
            lastUpdated: Date;
            status?: OperationStatus | undefined;
            error?: string | undefined;
            metadata?: Record<string, any> | undefined;
            startedAt?: Date | undefined;
            completedAt?: Date | undefined;
            currentStep?: string | undefined;
            result?: Record<string, any> | undefined;
        };
    }, {
        timestamp: Date;
        version: string;
        operationState: {
            operationId: string;
            lastUpdated: Date;
            status?: OperationStatus | undefined;
            error?: string | undefined;
            metadata?: Record<string, any> | undefined;
            startedAt?: Date | undefined;
            completedAt?: Date | undefined;
            currentStep?: string | undefined;
            completedSteps?: string[] | undefined;
            failedSteps?: string[] | undefined;
            variables?: Record<string, any> | undefined;
            checkpoints?: string[] | undefined;
            result?: Record<string, any> | undefined;
        };
    }>;
    timestamp: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    type: CheckpointType;
    id: string;
    data: {
        timestamp: Date;
        version: string;
        operationState: {
            operationId: string;
            completedSteps: string[];
            failedSteps: string[];
            variables: Record<string, any>;
            checkpoints: string[];
            lastUpdated: Date;
            status?: OperationStatus | undefined;
            error?: string | undefined;
            metadata?: Record<string, any> | undefined;
            startedAt?: Date | undefined;
            completedAt?: Date | undefined;
            currentStep?: string | undefined;
            result?: Record<string, any> | undefined;
        };
    };
    timestamp: Date;
    stepId: string;
}, {
    type: CheckpointType;
    id: string;
    data: {
        timestamp: Date;
        version: string;
        operationState: {
            operationId: string;
            lastUpdated: Date;
            status?: OperationStatus | undefined;
            error?: string | undefined;
            metadata?: Record<string, any> | undefined;
            startedAt?: Date | undefined;
            completedAt?: Date | undefined;
            currentStep?: string | undefined;
            completedSteps?: string[] | undefined;
            failedSteps?: string[] | undefined;
            variables?: Record<string, any> | undefined;
            checkpoints?: string[] | undefined;
            result?: Record<string, any> | undefined;
        };
    };
    timestamp: Date;
    stepId: string;
}>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export declare const CompensationActionSchema: z.ZodObject<{
    id: z.ZodString;
    stepId: z.ZodString;
    action: z.ZodEnum<["undo", "cleanup", "notify"]>;
    parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    timeout: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    timeout: number;
    stepId: string;
    action: "undo" | "cleanup" | "notify";
    parameters?: Record<string, any> | undefined;
}, {
    id: string;
    stepId: string;
    action: "undo" | "cleanup" | "notify";
    timeout?: number | undefined;
    parameters?: Record<string, any> | undefined;
}>;
export type CompensationAction = z.infer<typeof CompensationActionSchema>;
export declare const OperationErrorSchema: z.ZodObject<{
    id: z.ZodString;
    operationId: z.ZodString;
    stepId: z.ZodOptional<z.ZodString>;
    errorType: z.ZodEnum<["validation", "execution", "timeout", "resource", "system"]>;
    message: z.ZodString;
    code: z.ZodOptional<z.ZodString>;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    timestamp: z.ZodDate;
    resolved: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    message: string;
    id: string;
    timestamp: Date;
    operationId: string;
    errorType: "validation" | "system" | "timeout" | "execution" | "resource";
    resolved: boolean;
    code?: string | undefined;
    details?: Record<string, any> | undefined;
    stepId?: string | undefined;
}, {
    message: string;
    id: string;
    timestamp: Date;
    operationId: string;
    errorType: "validation" | "system" | "timeout" | "execution" | "resource";
    code?: string | undefined;
    details?: Record<string, any> | undefined;
    stepId?: string | undefined;
    resolved?: boolean | undefined;
}>;
export type OperationError = z.infer<typeof OperationErrorSchema>;
export declare const ResourceUsageSchema: z.ZodObject<{
    cpu: z.ZodNumber;
    memory: z.ZodNumber;
    network: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    cpu: number;
    memory: number;
    network: number;
}, {
    cpu: number;
    memory: number;
    network: number;
}>;
export type ResourceUsage = z.infer<typeof ResourceUsageSchema>;
export declare const StepMetricsSchema: z.ZodObject<{
    stepId: z.ZodString;
    executionTime: z.ZodNumber;
    resourceUsage: z.ZodObject<{
        cpu: z.ZodNumber;
        memory: z.ZodNumber;
        network: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        cpu: number;
        memory: number;
        network: number;
    }, {
        cpu: number;
        memory: number;
        network: number;
    }>;
    retryCount: z.ZodNumber;
    errorCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    retryCount: number;
    stepId: string;
    executionTime: number;
    resourceUsage: {
        cpu: number;
        memory: number;
        network: number;
    };
    errorCount: number;
}, {
    retryCount: number;
    stepId: string;
    executionTime: number;
    resourceUsage: {
        cpu: number;
        memory: number;
        network: number;
    };
    errorCount: number;
}>;
export type StepMetrics = z.infer<typeof StepMetricsSchema>;
export declare const OperationMetricsSchema: z.ZodObject<{
    executionTime: z.ZodNumber;
    resourceUsage: z.ZodObject<{
        cpu: z.ZodNumber;
        memory: z.ZodNumber;
        network: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        cpu: number;
        memory: number;
        network: number;
    }, {
        cpu: number;
        memory: number;
        network: number;
    }>;
    stepMetrics: z.ZodArray<z.ZodObject<{
        stepId: z.ZodString;
        executionTime: z.ZodNumber;
        resourceUsage: z.ZodObject<{
            cpu: z.ZodNumber;
            memory: z.ZodNumber;
            network: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            cpu: number;
            memory: number;
            network: number;
        }, {
            cpu: number;
            memory: number;
            network: number;
        }>;
        retryCount: z.ZodNumber;
        errorCount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        retryCount: number;
        stepId: string;
        executionTime: number;
        resourceUsage: {
            cpu: number;
            memory: number;
            network: number;
        };
        errorCount: number;
    }, {
        retryCount: number;
        stepId: string;
        executionTime: number;
        resourceUsage: {
            cpu: number;
            memory: number;
            network: number;
        };
        errorCount: number;
    }>, "many">;
    throughput: z.ZodNumber;
    errorRate: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    executionTime: number;
    resourceUsage: {
        cpu: number;
        memory: number;
        network: number;
    };
    stepMetrics: {
        retryCount: number;
        stepId: string;
        executionTime: number;
        resourceUsage: {
            cpu: number;
            memory: number;
            network: number;
        };
        errorCount: number;
    }[];
    throughput: number;
    errorRate: number;
}, {
    executionTime: number;
    resourceUsage: {
        cpu: number;
        memory: number;
        network: number;
    };
    stepMetrics: {
        retryCount: number;
        stepId: string;
        executionTime: number;
        resourceUsage: {
            cpu: number;
            memory: number;
            network: number;
        };
        errorCount: number;
    }[];
    throughput: number;
    errorRate: number;
}>;
export type OperationMetrics = z.infer<typeof OperationMetricsSchema>;
export declare const OperationResultSchema: z.ZodObject<{
    operationId: z.ZodString;
    status: z.ZodNativeEnum<typeof OperationStatus>;
    result: z.ZodRecord<z.ZodString, z.ZodAny>;
    metrics: z.ZodObject<{
        executionTime: z.ZodNumber;
        resourceUsage: z.ZodObject<{
            cpu: z.ZodNumber;
            memory: z.ZodNumber;
            network: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            cpu: number;
            memory: number;
            network: number;
        }, {
            cpu: number;
            memory: number;
            network: number;
        }>;
        stepMetrics: z.ZodArray<z.ZodObject<{
            stepId: z.ZodString;
            executionTime: z.ZodNumber;
            resourceUsage: z.ZodObject<{
                cpu: z.ZodNumber;
                memory: z.ZodNumber;
                network: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                cpu: number;
                memory: number;
                network: number;
            }, {
                cpu: number;
                memory: number;
                network: number;
            }>;
            retryCount: z.ZodNumber;
            errorCount: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            retryCount: number;
            stepId: string;
            executionTime: number;
            resourceUsage: {
                cpu: number;
                memory: number;
                network: number;
            };
            errorCount: number;
        }, {
            retryCount: number;
            stepId: string;
            executionTime: number;
            resourceUsage: {
                cpu: number;
                memory: number;
                network: number;
            };
            errorCount: number;
        }>, "many">;
        throughput: z.ZodNumber;
        errorRate: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        executionTime: number;
        resourceUsage: {
            cpu: number;
            memory: number;
            network: number;
        };
        stepMetrics: {
            retryCount: number;
            stepId: string;
            executionTime: number;
            resourceUsage: {
                cpu: number;
                memory: number;
                network: number;
            };
            errorCount: number;
        }[];
        throughput: number;
        errorRate: number;
    }, {
        executionTime: number;
        resourceUsage: {
            cpu: number;
            memory: number;
            network: number;
        };
        stepMetrics: {
            retryCount: number;
            stepId: string;
            executionTime: number;
            resourceUsage: {
                cpu: number;
                memory: number;
                network: number;
            };
            errorCount: number;
        }[];
        throughput: number;
        errorRate: number;
    }>;
    completedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    status: OperationStatus;
    completedAt: Date;
    operationId: string;
    result: Record<string, any>;
    metrics: {
        executionTime: number;
        resourceUsage: {
            cpu: number;
            memory: number;
            network: number;
        };
        stepMetrics: {
            retryCount: number;
            stepId: string;
            executionTime: number;
            resourceUsage: {
                cpu: number;
                memory: number;
                network: number;
            };
            errorCount: number;
        }[];
        throughput: number;
        errorRate: number;
    };
}, {
    status: OperationStatus;
    completedAt: Date;
    operationId: string;
    result: Record<string, any>;
    metrics: {
        executionTime: number;
        resourceUsage: {
            cpu: number;
            memory: number;
            network: number;
        };
        stepMetrics: {
            retryCount: number;
            stepId: string;
            executionTime: number;
            resourceUsage: {
                cpu: number;
                memory: number;
                network: number;
            };
            errorCount: number;
        }[];
        throughput: number;
        errorRate: number;
    };
}>;
export type OperationResult = z.infer<typeof OperationResultSchema>;
export declare const OperationSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodOptional<z.ZodDate>;
} & {
    type: z.ZodNativeEnum<typeof OperationType>;
    status: z.ZodNativeEnum<typeof OperationStatus>;
    priority: z.ZodDefault<z.ZodNativeEnum<typeof OperationPriority>>;
    agentId: z.ZodString;
    userId: z.ZodString;
    plan: z.ZodObject<{
        id: z.ZodString;
        type: z.ZodNativeEnum<typeof OperationType>;
        description: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            type: z.ZodEnum<["tool", "artifact", "validation", "approval"]>;
            status: z.ZodNativeEnum<typeof OperationStatus>;
            input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            error: z.ZodOptional<z.ZodString>;
            startedAt: z.ZodOptional<z.ZodDate>;
            completedAt: z.ZodOptional<z.ZodDate>;
            retryCount: z.ZodDefault<z.ZodNumber>;
            maxRetries: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            type: "validation" | "tool" | "artifact" | "approval";
            status: OperationStatus;
            id: string;
            name: string;
            retryCount: number;
            maxRetries: number;
            error?: string | undefined;
            startedAt?: Date | undefined;
            input?: Record<string, any> | undefined;
            output?: Record<string, any> | undefined;
            completedAt?: Date | undefined;
        }, {
            type: "validation" | "tool" | "artifact" | "approval";
            status: OperationStatus;
            id: string;
            name: string;
            error?: string | undefined;
            startedAt?: Date | undefined;
            input?: Record<string, any> | undefined;
            output?: Record<string, any> | undefined;
            completedAt?: Date | undefined;
            retryCount?: number | undefined;
            maxRetries?: number | undefined;
        }>, "many">;
        dependencies: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        resourceRequirements: z.ZodObject<{
            cpu: z.ZodOptional<z.ZodNumber>;
            memory: z.ZodOptional<z.ZodNumber>;
            storage: z.ZodOptional<z.ZodNumber>;
            network: z.ZodDefault<z.ZodBoolean>;
            gpu: z.ZodDefault<z.ZodBoolean>;
            estimatedDuration: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            network: boolean;
            gpu: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        }, {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
            gpu?: boolean | undefined;
        }>;
        estimatedDuration: z.ZodNumber;
        riskAssessment: z.ZodObject<{
            level: z.ZodEnum<["low", "medium", "high", "critical"]>;
            factors: z.ZodArray<z.ZodString, "many">;
            mitigations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "medium" | "high" | "critical";
            factors: string[];
            mitigations?: string[] | undefined;
        }, {
            level: "low" | "medium" | "high" | "critical";
            factors: string[];
            mitigations?: string[] | undefined;
        }>;
        approvalRequired: z.ZodDefault<z.ZodBoolean>;
        createdAt: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        type: OperationType;
        id: string;
        createdAt: Date;
        description: string;
        approvalRequired: boolean;
        estimatedDuration: number;
        steps: {
            type: "validation" | "tool" | "artifact" | "approval";
            status: OperationStatus;
            id: string;
            name: string;
            retryCount: number;
            maxRetries: number;
            error?: string | undefined;
            startedAt?: Date | undefined;
            input?: Record<string, any> | undefined;
            output?: Record<string, any> | undefined;
            completedAt?: Date | undefined;
        }[];
        resourceRequirements: {
            network: boolean;
            gpu: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        };
        riskAssessment: {
            level: "low" | "medium" | "high" | "critical";
            factors: string[];
            mitigations?: string[] | undefined;
        };
        dependencies?: string[] | undefined;
    }, {
        type: OperationType;
        id: string;
        createdAt: Date;
        description: string;
        estimatedDuration: number;
        steps: {
            type: "validation" | "tool" | "artifact" | "approval";
            status: OperationStatus;
            id: string;
            name: string;
            error?: string | undefined;
            startedAt?: Date | undefined;
            input?: Record<string, any> | undefined;
            output?: Record<string, any> | undefined;
            completedAt?: Date | undefined;
            retryCount?: number | undefined;
            maxRetries?: number | undefined;
        }[];
        resourceRequirements: {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
            gpu?: boolean | undefined;
        };
        riskAssessment: {
            level: "low" | "medium" | "high" | "critical";
            factors: string[];
            mitigations?: string[] | undefined;
        };
        dependencies?: string[] | undefined;
        approvalRequired?: boolean | undefined;
    }>;
    context: z.ZodObject<{
        executionContext: z.ZodObject<{
            agentId: z.ZodString;
            userId: z.ZodString;
            conversationId: z.ZodOptional<z.ZodString>;
            sessionId: z.ZodOptional<z.ZodString>;
            environment: z.ZodDefault<z.ZodEnum<["development", "staging", "production"]>>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            timeout: z.ZodDefault<z.ZodNumber>;
            resourceLimits: z.ZodObject<{
                maxMemory: z.ZodDefault<z.ZodNumber>;
                maxCpu: z.ZodDefault<z.ZodNumber>;
                maxDuration: z.ZodDefault<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                maxMemory: number;
                maxCpu: number;
                maxDuration: number;
            }, {
                maxMemory?: number | undefined;
                maxCpu?: number | undefined;
                maxDuration?: number | undefined;
            }>;
        }, "strip", z.ZodTypeAny, {
            agentId: string;
            userId: string;
            environment: "development" | "staging" | "production";
            timeout: number;
            resourceLimits: {
                maxMemory: number;
                maxCpu: number;
                maxDuration: number;
            };
            metadata?: Record<string, any> | undefined;
            conversationId?: string | undefined;
            sessionId?: string | undefined;
        }, {
            agentId: string;
            userId: string;
            resourceLimits: {
                maxMemory?: number | undefined;
                maxCpu?: number | undefined;
                maxDuration?: number | undefined;
            };
            metadata?: Record<string, any> | undefined;
            conversationId?: string | undefined;
            sessionId?: string | undefined;
            environment?: "development" | "staging" | "production" | undefined;
            timeout?: number | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        executionContext: {
            agentId: string;
            userId: string;
            environment: "development" | "staging" | "production";
            timeout: number;
            resourceLimits: {
                maxMemory: number;
                maxCpu: number;
                maxDuration: number;
            };
            metadata?: Record<string, any> | undefined;
            conversationId?: string | undefined;
            sessionId?: string | undefined;
        };
    }, {
        executionContext: {
            agentId: string;
            userId: string;
            resourceLimits: {
                maxMemory?: number | undefined;
                maxCpu?: number | undefined;
                maxDuration?: number | undefined;
            };
            metadata?: Record<string, any> | undefined;
            conversationId?: string | undefined;
            sessionId?: string | undefined;
            environment?: "development" | "staging" | "production" | undefined;
            timeout?: number | undefined;
        };
    }>;
    executionPlan: z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
        agentId: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodString;
            description: z.ZodString;
            estimatedDuration: z.ZodNumber;
            required: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            type: string;
            id: string;
            description: string;
            estimatedDuration: number;
            required: boolean;
        }, {
            type: string;
            id: string;
            description: string;
            estimatedDuration: number;
            required: boolean;
        }>, "many">;
        dependencies: z.ZodArray<z.ZodString, "many">;
        estimatedDuration: z.ZodNumber;
        priority: z.ZodString;
        constraints: z.ZodArray<z.ZodString, "many">;
        metadata: z.ZodObject<{
            generatedBy: z.ZodString;
            basedOnAnalysis: z.ZodDate;
            userPreferences: z.ZodOptional<z.ZodAny>;
            version: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            version: string;
            generatedBy: string;
            basedOnAnalysis: Date;
            userPreferences?: any;
        }, {
            version: string;
            generatedBy: string;
            basedOnAnalysis: Date;
            userPreferences?: any;
        }>;
        created_at: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        type: string;
        id: string;
        dependencies: string[];
        constraints: string[];
        metadata: {
            version: string;
            generatedBy: string;
            basedOnAnalysis: Date;
            userPreferences?: any;
        };
        agentId: string;
        priority: string;
        estimatedDuration: number;
        steps: {
            type: string;
            id: string;
            description: string;
            estimatedDuration: number;
            required: boolean;
        }[];
        created_at: Date;
    }, {
        type: string;
        id: string;
        dependencies: string[];
        constraints: string[];
        metadata: {
            version: string;
            generatedBy: string;
            basedOnAnalysis: Date;
            userPreferences?: any;
        };
        agentId: string;
        priority: string;
        estimatedDuration: number;
        steps: {
            type: string;
            id: string;
            description: string;
            estimatedDuration: number;
            required: boolean;
        }[];
        created_at: Date;
    }>;
    estimatedDuration: z.ZodNumber;
    currentStep: z.ZodDefault<z.ZodNumber>;
    progress: z.ZodObject<{
        completedSteps: z.ZodNumber;
        totalSteps: z.ZodNumber;
        percentage: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        completedSteps: number;
        totalSteps: number;
        percentage: number;
    }, {
        completedSteps: number;
        totalSteps: number;
        percentage: number;
    }>;
    results: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    error: z.ZodOptional<z.ZodString>;
    startedAt: z.ZodOptional<z.ZodDate>;
    completedAt: z.ZodOptional<z.ZodDate>;
    cancelledAt: z.ZodOptional<z.ZodDate>;
    metadata: z.ZodOptional<z.ZodObject<{
        priority: z.ZodOptional<z.ZodNativeEnum<typeof OperationPriority>>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        environment: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        priority?: OperationPriority | undefined;
        environment?: string | undefined;
        tags?: string[] | undefined;
    }, {
        priority?: OperationPriority | undefined;
        environment?: string | undefined;
        tags?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    type: OperationType;
    status: OperationStatus;
    id: string;
    createdAt: Date;
    agentId: string;
    userId: string;
    priority: OperationPriority;
    estimatedDuration: number;
    context: {
        executionContext: {
            agentId: string;
            userId: string;
            environment: "development" | "staging" | "production";
            timeout: number;
            resourceLimits: {
                maxMemory: number;
                maxCpu: number;
                maxDuration: number;
            };
            metadata?: Record<string, any> | undefined;
            conversationId?: string | undefined;
            sessionId?: string | undefined;
        };
    };
    currentStep: number;
    plan: {
        type: OperationType;
        id: string;
        createdAt: Date;
        description: string;
        approvalRequired: boolean;
        estimatedDuration: number;
        steps: {
            type: "validation" | "tool" | "artifact" | "approval";
            status: OperationStatus;
            id: string;
            name: string;
            retryCount: number;
            maxRetries: number;
            error?: string | undefined;
            startedAt?: Date | undefined;
            input?: Record<string, any> | undefined;
            output?: Record<string, any> | undefined;
            completedAt?: Date | undefined;
        }[];
        resourceRequirements: {
            network: boolean;
            gpu: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        };
        riskAssessment: {
            level: "low" | "medium" | "high" | "critical";
            factors: string[];
            mitigations?: string[] | undefined;
        };
        dependencies?: string[] | undefined;
    };
    executionPlan: {
        type: string;
        id: string;
        dependencies: string[];
        constraints: string[];
        metadata: {
            version: string;
            generatedBy: string;
            basedOnAnalysis: Date;
            userPreferences?: any;
        };
        agentId: string;
        priority: string;
        estimatedDuration: number;
        steps: {
            type: string;
            id: string;
            description: string;
            estimatedDuration: number;
            required: boolean;
        }[];
        created_at: Date;
    };
    progress: {
        completedSteps: number;
        totalSteps: number;
        percentage: number;
    };
    error?: string | undefined;
    updatedAt?: Date | undefined;
    metadata?: {
        priority?: OperationPriority | undefined;
        environment?: string | undefined;
        tags?: string[] | undefined;
    } | undefined;
    startedAt?: Date | undefined;
    completedAt?: Date | undefined;
    results?: Record<string, any> | undefined;
    cancelledAt?: Date | undefined;
}, {
    type: OperationType;
    status: OperationStatus;
    id: string;
    createdAt: Date;
    agentId: string;
    userId: string;
    estimatedDuration: number;
    context: {
        executionContext: {
            agentId: string;
            userId: string;
            resourceLimits: {
                maxMemory?: number | undefined;
                maxCpu?: number | undefined;
                maxDuration?: number | undefined;
            };
            metadata?: Record<string, any> | undefined;
            conversationId?: string | undefined;
            sessionId?: string | undefined;
            environment?: "development" | "staging" | "production" | undefined;
            timeout?: number | undefined;
        };
    };
    plan: {
        type: OperationType;
        id: string;
        createdAt: Date;
        description: string;
        estimatedDuration: number;
        steps: {
            type: "validation" | "tool" | "artifact" | "approval";
            status: OperationStatus;
            id: string;
            name: string;
            error?: string | undefined;
            startedAt?: Date | undefined;
            input?: Record<string, any> | undefined;
            output?: Record<string, any> | undefined;
            completedAt?: Date | undefined;
            retryCount?: number | undefined;
            maxRetries?: number | undefined;
        }[];
        resourceRequirements: {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
            gpu?: boolean | undefined;
        };
        riskAssessment: {
            level: "low" | "medium" | "high" | "critical";
            factors: string[];
            mitigations?: string[] | undefined;
        };
        dependencies?: string[] | undefined;
        approvalRequired?: boolean | undefined;
    };
    executionPlan: {
        type: string;
        id: string;
        dependencies: string[];
        constraints: string[];
        metadata: {
            version: string;
            generatedBy: string;
            basedOnAnalysis: Date;
            userPreferences?: any;
        };
        agentId: string;
        priority: string;
        estimatedDuration: number;
        steps: {
            type: string;
            id: string;
            description: string;
            estimatedDuration: number;
            required: boolean;
        }[];
        created_at: Date;
    };
    progress: {
        completedSteps: number;
        totalSteps: number;
        percentage: number;
    };
    error?: string | undefined;
    updatedAt?: Date | undefined;
    metadata?: {
        priority?: OperationPriority | undefined;
        environment?: string | undefined;
        tags?: string[] | undefined;
    } | undefined;
    startedAt?: Date | undefined;
    priority?: OperationPriority | undefined;
    completedAt?: Date | undefined;
    currentStep?: number | undefined;
    results?: Record<string, any> | undefined;
    cancelledAt?: Date | undefined;
}>;
export type Operation = z.infer<typeof OperationSchema>;
export declare const ExecuteOperationRequestSchema: z.ZodObject<{
    operationPlan: z.ZodObject<{
        id: z.ZodString;
        type: z.ZodNativeEnum<typeof OperationType>;
        description: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            type: z.ZodEnum<["tool", "artifact", "validation", "approval"]>;
            status: z.ZodNativeEnum<typeof OperationStatus>;
            input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            error: z.ZodOptional<z.ZodString>;
            startedAt: z.ZodOptional<z.ZodDate>;
            completedAt: z.ZodOptional<z.ZodDate>;
            retryCount: z.ZodDefault<z.ZodNumber>;
            maxRetries: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            type: "validation" | "tool" | "artifact" | "approval";
            status: OperationStatus;
            id: string;
            name: string;
            retryCount: number;
            maxRetries: number;
            error?: string | undefined;
            startedAt?: Date | undefined;
            input?: Record<string, any> | undefined;
            output?: Record<string, any> | undefined;
            completedAt?: Date | undefined;
        }, {
            type: "validation" | "tool" | "artifact" | "approval";
            status: OperationStatus;
            id: string;
            name: string;
            error?: string | undefined;
            startedAt?: Date | undefined;
            input?: Record<string, any> | undefined;
            output?: Record<string, any> | undefined;
            completedAt?: Date | undefined;
            retryCount?: number | undefined;
            maxRetries?: number | undefined;
        }>, "many">;
        dependencies: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        resourceRequirements: z.ZodObject<{
            cpu: z.ZodOptional<z.ZodNumber>;
            memory: z.ZodOptional<z.ZodNumber>;
            storage: z.ZodOptional<z.ZodNumber>;
            network: z.ZodDefault<z.ZodBoolean>;
            gpu: z.ZodDefault<z.ZodBoolean>;
            estimatedDuration: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            network: boolean;
            gpu: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        }, {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
            gpu?: boolean | undefined;
        }>;
        estimatedDuration: z.ZodNumber;
        riskAssessment: z.ZodObject<{
            level: z.ZodEnum<["low", "medium", "high", "critical"]>;
            factors: z.ZodArray<z.ZodString, "many">;
            mitigations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            level: "low" | "medium" | "high" | "critical";
            factors: string[];
            mitigations?: string[] | undefined;
        }, {
            level: "low" | "medium" | "high" | "critical";
            factors: string[];
            mitigations?: string[] | undefined;
        }>;
        approvalRequired: z.ZodDefault<z.ZodBoolean>;
        createdAt: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        type: OperationType;
        id: string;
        createdAt: Date;
        description: string;
        approvalRequired: boolean;
        estimatedDuration: number;
        steps: {
            type: "validation" | "tool" | "artifact" | "approval";
            status: OperationStatus;
            id: string;
            name: string;
            retryCount: number;
            maxRetries: number;
            error?: string | undefined;
            startedAt?: Date | undefined;
            input?: Record<string, any> | undefined;
            output?: Record<string, any> | undefined;
            completedAt?: Date | undefined;
        }[];
        resourceRequirements: {
            network: boolean;
            gpu: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        };
        riskAssessment: {
            level: "low" | "medium" | "high" | "critical";
            factors: string[];
            mitigations?: string[] | undefined;
        };
        dependencies?: string[] | undefined;
    }, {
        type: OperationType;
        id: string;
        createdAt: Date;
        description: string;
        estimatedDuration: number;
        steps: {
            type: "validation" | "tool" | "artifact" | "approval";
            status: OperationStatus;
            id: string;
            name: string;
            error?: string | undefined;
            startedAt?: Date | undefined;
            input?: Record<string, any> | undefined;
            output?: Record<string, any> | undefined;
            completedAt?: Date | undefined;
            retryCount?: number | undefined;
            maxRetries?: number | undefined;
        }[];
        resourceRequirements: {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
            gpu?: boolean | undefined;
        };
        riskAssessment: {
            level: "low" | "medium" | "high" | "critical";
            factors: string[];
            mitigations?: string[] | undefined;
        };
        dependencies?: string[] | undefined;
        approvalRequired?: boolean | undefined;
    }>;
    executionOptions: z.ZodOptional<z.ZodObject<{
        priority: z.ZodOptional<z.ZodNativeEnum<typeof OperationPriority>>;
        timeout: z.ZodOptional<z.ZodNumber>;
        retryPolicy: z.ZodOptional<z.ZodObject<{
            maxRetries: z.ZodDefault<z.ZodNumber>;
            backoffStrategy: z.ZodDefault<z.ZodEnum<["fixed", "exponential", "linear"]>>;
            retryDelay: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            maxRetries: number;
            backoffStrategy: "fixed" | "exponential" | "linear";
            retryDelay: number;
        }, {
            maxRetries?: number | undefined;
            backoffStrategy?: "fixed" | "exponential" | "linear" | undefined;
            retryDelay?: number | undefined;
        }>>;
        notificationSettings: z.ZodOptional<z.ZodObject<{
            onStart: z.ZodDefault<z.ZodBoolean>;
            onComplete: z.ZodDefault<z.ZodBoolean>;
            onFailure: z.ZodDefault<z.ZodBoolean>;
            webhookUrl: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            onStart: boolean;
            onComplete: boolean;
            onFailure: boolean;
            webhookUrl?: string | undefined;
        }, {
            onStart?: boolean | undefined;
            onComplete?: boolean | undefined;
            onFailure?: boolean | undefined;
            webhookUrl?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        priority?: OperationPriority | undefined;
        timeout?: number | undefined;
        retryPolicy?: {
            maxRetries: number;
            backoffStrategy: "fixed" | "exponential" | "linear";
            retryDelay: number;
        } | undefined;
        notificationSettings?: {
            onStart: boolean;
            onComplete: boolean;
            onFailure: boolean;
            webhookUrl?: string | undefined;
        } | undefined;
    }, {
        priority?: OperationPriority | undefined;
        timeout?: number | undefined;
        retryPolicy?: {
            maxRetries?: number | undefined;
            backoffStrategy?: "fixed" | "exponential" | "linear" | undefined;
            retryDelay?: number | undefined;
        } | undefined;
        notificationSettings?: {
            onStart?: boolean | undefined;
            onComplete?: boolean | undefined;
            onFailure?: boolean | undefined;
            webhookUrl?: string | undefined;
        } | undefined;
    }>>;
    approvals: z.ZodOptional<z.ZodArray<z.ZodObject<{
        approverId: z.ZodString;
        approvedAt: z.ZodDate;
        conditions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        approverId: string;
        approvedAt: Date;
        conditions?: string[] | undefined;
    }, {
        approverId: string;
        approvedAt: Date;
        conditions?: string[] | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    operationPlan: {
        type: OperationType;
        id: string;
        createdAt: Date;
        description: string;
        approvalRequired: boolean;
        estimatedDuration: number;
        steps: {
            type: "validation" | "tool" | "artifact" | "approval";
            status: OperationStatus;
            id: string;
            name: string;
            retryCount: number;
            maxRetries: number;
            error?: string | undefined;
            startedAt?: Date | undefined;
            input?: Record<string, any> | undefined;
            output?: Record<string, any> | undefined;
            completedAt?: Date | undefined;
        }[];
        resourceRequirements: {
            network: boolean;
            gpu: boolean;
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
        };
        riskAssessment: {
            level: "low" | "medium" | "high" | "critical";
            factors: string[];
            mitigations?: string[] | undefined;
        };
        dependencies?: string[] | undefined;
    };
    executionOptions?: {
        priority?: OperationPriority | undefined;
        timeout?: number | undefined;
        retryPolicy?: {
            maxRetries: number;
            backoffStrategy: "fixed" | "exponential" | "linear";
            retryDelay: number;
        } | undefined;
        notificationSettings?: {
            onStart: boolean;
            onComplete: boolean;
            onFailure: boolean;
            webhookUrl?: string | undefined;
        } | undefined;
    } | undefined;
    approvals?: {
        approverId: string;
        approvedAt: Date;
        conditions?: string[] | undefined;
    }[] | undefined;
}, {
    operationPlan: {
        type: OperationType;
        id: string;
        createdAt: Date;
        description: string;
        estimatedDuration: number;
        steps: {
            type: "validation" | "tool" | "artifact" | "approval";
            status: OperationStatus;
            id: string;
            name: string;
            error?: string | undefined;
            startedAt?: Date | undefined;
            input?: Record<string, any> | undefined;
            output?: Record<string, any> | undefined;
            completedAt?: Date | undefined;
            retryCount?: number | undefined;
            maxRetries?: number | undefined;
        }[];
        resourceRequirements: {
            estimatedDuration?: number | undefined;
            cpu?: number | undefined;
            memory?: number | undefined;
            storage?: number | undefined;
            network?: boolean | undefined;
            gpu?: boolean | undefined;
        };
        riskAssessment: {
            level: "low" | "medium" | "high" | "critical";
            factors: string[];
            mitigations?: string[] | undefined;
        };
        dependencies?: string[] | undefined;
        approvalRequired?: boolean | undefined;
    };
    executionOptions?: {
        priority?: OperationPriority | undefined;
        timeout?: number | undefined;
        retryPolicy?: {
            maxRetries?: number | undefined;
            backoffStrategy?: "fixed" | "exponential" | "linear" | undefined;
            retryDelay?: number | undefined;
        } | undefined;
        notificationSettings?: {
            onStart?: boolean | undefined;
            onComplete?: boolean | undefined;
            onFailure?: boolean | undefined;
            webhookUrl?: string | undefined;
        } | undefined;
    } | undefined;
    approvals?: {
        approverId: string;
        approvedAt: Date;
        conditions?: string[] | undefined;
    }[] | undefined;
}>;
export type ExecuteOperationRequest = z.infer<typeof ExecuteOperationRequestSchema>;
export declare const OperationStatusResponseSchema: z.ZodObject<{
    operation: z.ZodObject<{
        id: z.ZodString;
        createdAt: z.ZodDate;
        updatedAt: z.ZodOptional<z.ZodDate>;
    } & {
        type: z.ZodNativeEnum<typeof OperationType>;
        status: z.ZodNativeEnum<typeof OperationStatus>;
        priority: z.ZodDefault<z.ZodNativeEnum<typeof OperationPriority>>;
        agentId: z.ZodString;
        userId: z.ZodString;
        plan: z.ZodObject<{
            id: z.ZodString;
            type: z.ZodNativeEnum<typeof OperationType>;
            description: z.ZodString;
            steps: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                type: z.ZodEnum<["tool", "artifact", "validation", "approval"]>;
                status: z.ZodNativeEnum<typeof OperationStatus>;
                input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                error: z.ZodOptional<z.ZodString>;
                startedAt: z.ZodOptional<z.ZodDate>;
                completedAt: z.ZodOptional<z.ZodDate>;
                retryCount: z.ZodDefault<z.ZodNumber>;
                maxRetries: z.ZodDefault<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                type: "validation" | "tool" | "artifact" | "approval";
                status: OperationStatus;
                id: string;
                name: string;
                retryCount: number;
                maxRetries: number;
                error?: string | undefined;
                startedAt?: Date | undefined;
                input?: Record<string, any> | undefined;
                output?: Record<string, any> | undefined;
                completedAt?: Date | undefined;
            }, {
                type: "validation" | "tool" | "artifact" | "approval";
                status: OperationStatus;
                id: string;
                name: string;
                error?: string | undefined;
                startedAt?: Date | undefined;
                input?: Record<string, any> | undefined;
                output?: Record<string, any> | undefined;
                completedAt?: Date | undefined;
                retryCount?: number | undefined;
                maxRetries?: number | undefined;
            }>, "many">;
            dependencies: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            resourceRequirements: z.ZodObject<{
                cpu: z.ZodOptional<z.ZodNumber>;
                memory: z.ZodOptional<z.ZodNumber>;
                storage: z.ZodOptional<z.ZodNumber>;
                network: z.ZodDefault<z.ZodBoolean>;
                gpu: z.ZodDefault<z.ZodBoolean>;
                estimatedDuration: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                network: boolean;
                gpu: boolean;
                estimatedDuration?: number | undefined;
                cpu?: number | undefined;
                memory?: number | undefined;
                storage?: number | undefined;
            }, {
                estimatedDuration?: number | undefined;
                cpu?: number | undefined;
                memory?: number | undefined;
                storage?: number | undefined;
                network?: boolean | undefined;
                gpu?: boolean | undefined;
            }>;
            estimatedDuration: z.ZodNumber;
            riskAssessment: z.ZodObject<{
                level: z.ZodEnum<["low", "medium", "high", "critical"]>;
                factors: z.ZodArray<z.ZodString, "many">;
                mitigations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            }, "strip", z.ZodTypeAny, {
                level: "low" | "medium" | "high" | "critical";
                factors: string[];
                mitigations?: string[] | undefined;
            }, {
                level: "low" | "medium" | "high" | "critical";
                factors: string[];
                mitigations?: string[] | undefined;
            }>;
            approvalRequired: z.ZodDefault<z.ZodBoolean>;
            createdAt: z.ZodDate;
        }, "strip", z.ZodTypeAny, {
            type: OperationType;
            id: string;
            createdAt: Date;
            description: string;
            approvalRequired: boolean;
            estimatedDuration: number;
            steps: {
                type: "validation" | "tool" | "artifact" | "approval";
                status: OperationStatus;
                id: string;
                name: string;
                retryCount: number;
                maxRetries: number;
                error?: string | undefined;
                startedAt?: Date | undefined;
                input?: Record<string, any> | undefined;
                output?: Record<string, any> | undefined;
                completedAt?: Date | undefined;
            }[];
            resourceRequirements: {
                network: boolean;
                gpu: boolean;
                estimatedDuration?: number | undefined;
                cpu?: number | undefined;
                memory?: number | undefined;
                storage?: number | undefined;
            };
            riskAssessment: {
                level: "low" | "medium" | "high" | "critical";
                factors: string[];
                mitigations?: string[] | undefined;
            };
            dependencies?: string[] | undefined;
        }, {
            type: OperationType;
            id: string;
            createdAt: Date;
            description: string;
            estimatedDuration: number;
            steps: {
                type: "validation" | "tool" | "artifact" | "approval";
                status: OperationStatus;
                id: string;
                name: string;
                error?: string | undefined;
                startedAt?: Date | undefined;
                input?: Record<string, any> | undefined;
                output?: Record<string, any> | undefined;
                completedAt?: Date | undefined;
                retryCount?: number | undefined;
                maxRetries?: number | undefined;
            }[];
            resourceRequirements: {
                estimatedDuration?: number | undefined;
                cpu?: number | undefined;
                memory?: number | undefined;
                storage?: number | undefined;
                network?: boolean | undefined;
                gpu?: boolean | undefined;
            };
            riskAssessment: {
                level: "low" | "medium" | "high" | "critical";
                factors: string[];
                mitigations?: string[] | undefined;
            };
            dependencies?: string[] | undefined;
            approvalRequired?: boolean | undefined;
        }>;
        context: z.ZodObject<{
            executionContext: z.ZodObject<{
                agentId: z.ZodString;
                userId: z.ZodString;
                conversationId: z.ZodOptional<z.ZodString>;
                sessionId: z.ZodOptional<z.ZodString>;
                environment: z.ZodDefault<z.ZodEnum<["development", "staging", "production"]>>;
                metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                timeout: z.ZodDefault<z.ZodNumber>;
                resourceLimits: z.ZodObject<{
                    maxMemory: z.ZodDefault<z.ZodNumber>;
                    maxCpu: z.ZodDefault<z.ZodNumber>;
                    maxDuration: z.ZodDefault<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    maxMemory: number;
                    maxCpu: number;
                    maxDuration: number;
                }, {
                    maxMemory?: number | undefined;
                    maxCpu?: number | undefined;
                    maxDuration?: number | undefined;
                }>;
            }, "strip", z.ZodTypeAny, {
                agentId: string;
                userId: string;
                environment: "development" | "staging" | "production";
                timeout: number;
                resourceLimits: {
                    maxMemory: number;
                    maxCpu: number;
                    maxDuration: number;
                };
                metadata?: Record<string, any> | undefined;
                conversationId?: string | undefined;
                sessionId?: string | undefined;
            }, {
                agentId: string;
                userId: string;
                resourceLimits: {
                    maxMemory?: number | undefined;
                    maxCpu?: number | undefined;
                    maxDuration?: number | undefined;
                };
                metadata?: Record<string, any> | undefined;
                conversationId?: string | undefined;
                sessionId?: string | undefined;
                environment?: "development" | "staging" | "production" | undefined;
                timeout?: number | undefined;
            }>;
        }, "strip", z.ZodTypeAny, {
            executionContext: {
                agentId: string;
                userId: string;
                environment: "development" | "staging" | "production";
                timeout: number;
                resourceLimits: {
                    maxMemory: number;
                    maxCpu: number;
                    maxDuration: number;
                };
                metadata?: Record<string, any> | undefined;
                conversationId?: string | undefined;
                sessionId?: string | undefined;
            };
        }, {
            executionContext: {
                agentId: string;
                userId: string;
                resourceLimits: {
                    maxMemory?: number | undefined;
                    maxCpu?: number | undefined;
                    maxDuration?: number | undefined;
                };
                metadata?: Record<string, any> | undefined;
                conversationId?: string | undefined;
                sessionId?: string | undefined;
                environment?: "development" | "staging" | "production" | undefined;
                timeout?: number | undefined;
            };
        }>;
        executionPlan: z.ZodObject<{
            id: z.ZodString;
            type: z.ZodString;
            agentId: z.ZodString;
            steps: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                type: z.ZodString;
                description: z.ZodString;
                estimatedDuration: z.ZodNumber;
                required: z.ZodBoolean;
            }, "strip", z.ZodTypeAny, {
                type: string;
                id: string;
                description: string;
                estimatedDuration: number;
                required: boolean;
            }, {
                type: string;
                id: string;
                description: string;
                estimatedDuration: number;
                required: boolean;
            }>, "many">;
            dependencies: z.ZodArray<z.ZodString, "many">;
            estimatedDuration: z.ZodNumber;
            priority: z.ZodString;
            constraints: z.ZodArray<z.ZodString, "many">;
            metadata: z.ZodObject<{
                generatedBy: z.ZodString;
                basedOnAnalysis: z.ZodDate;
                userPreferences: z.ZodOptional<z.ZodAny>;
                version: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                version: string;
                generatedBy: string;
                basedOnAnalysis: Date;
                userPreferences?: any;
            }, {
                version: string;
                generatedBy: string;
                basedOnAnalysis: Date;
                userPreferences?: any;
            }>;
            created_at: z.ZodDate;
        }, "strip", z.ZodTypeAny, {
            type: string;
            id: string;
            dependencies: string[];
            constraints: string[];
            metadata: {
                version: string;
                generatedBy: string;
                basedOnAnalysis: Date;
                userPreferences?: any;
            };
            agentId: string;
            priority: string;
            estimatedDuration: number;
            steps: {
                type: string;
                id: string;
                description: string;
                estimatedDuration: number;
                required: boolean;
            }[];
            created_at: Date;
        }, {
            type: string;
            id: string;
            dependencies: string[];
            constraints: string[];
            metadata: {
                version: string;
                generatedBy: string;
                basedOnAnalysis: Date;
                userPreferences?: any;
            };
            agentId: string;
            priority: string;
            estimatedDuration: number;
            steps: {
                type: string;
                id: string;
                description: string;
                estimatedDuration: number;
                required: boolean;
            }[];
            created_at: Date;
        }>;
        estimatedDuration: z.ZodNumber;
        currentStep: z.ZodDefault<z.ZodNumber>;
        progress: z.ZodObject<{
            completedSteps: z.ZodNumber;
            totalSteps: z.ZodNumber;
            percentage: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            completedSteps: number;
            totalSteps: number;
            percentage: number;
        }, {
            completedSteps: number;
            totalSteps: number;
            percentage: number;
        }>;
        results: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        error: z.ZodOptional<z.ZodString>;
        startedAt: z.ZodOptional<z.ZodDate>;
        completedAt: z.ZodOptional<z.ZodDate>;
        cancelledAt: z.ZodOptional<z.ZodDate>;
        metadata: z.ZodOptional<z.ZodObject<{
            priority: z.ZodOptional<z.ZodNativeEnum<typeof OperationPriority>>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            environment: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            priority?: OperationPriority | undefined;
            environment?: string | undefined;
            tags?: string[] | undefined;
        }, {
            priority?: OperationPriority | undefined;
            environment?: string | undefined;
            tags?: string[] | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        type: OperationType;
        status: OperationStatus;
        id: string;
        createdAt: Date;
        agentId: string;
        userId: string;
        priority: OperationPriority;
        estimatedDuration: number;
        context: {
            executionContext: {
                agentId: string;
                userId: string;
                environment: "development" | "staging" | "production";
                timeout: number;
                resourceLimits: {
                    maxMemory: number;
                    maxCpu: number;
                    maxDuration: number;
                };
                metadata?: Record<string, any> | undefined;
                conversationId?: string | undefined;
                sessionId?: string | undefined;
            };
        };
        currentStep: number;
        plan: {
            type: OperationType;
            id: string;
            createdAt: Date;
            description: string;
            approvalRequired: boolean;
            estimatedDuration: number;
            steps: {
                type: "validation" | "tool" | "artifact" | "approval";
                status: OperationStatus;
                id: string;
                name: string;
                retryCount: number;
                maxRetries: number;
                error?: string | undefined;
                startedAt?: Date | undefined;
                input?: Record<string, any> | undefined;
                output?: Record<string, any> | undefined;
                completedAt?: Date | undefined;
            }[];
            resourceRequirements: {
                network: boolean;
                gpu: boolean;
                estimatedDuration?: number | undefined;
                cpu?: number | undefined;
                memory?: number | undefined;
                storage?: number | undefined;
            };
            riskAssessment: {
                level: "low" | "medium" | "high" | "critical";
                factors: string[];
                mitigations?: string[] | undefined;
            };
            dependencies?: string[] | undefined;
        };
        executionPlan: {
            type: string;
            id: string;
            dependencies: string[];
            constraints: string[];
            metadata: {
                version: string;
                generatedBy: string;
                basedOnAnalysis: Date;
                userPreferences?: any;
            };
            agentId: string;
            priority: string;
            estimatedDuration: number;
            steps: {
                type: string;
                id: string;
                description: string;
                estimatedDuration: number;
                required: boolean;
            }[];
            created_at: Date;
        };
        progress: {
            completedSteps: number;
            totalSteps: number;
            percentage: number;
        };
        error?: string | undefined;
        updatedAt?: Date | undefined;
        metadata?: {
            priority?: OperationPriority | undefined;
            environment?: string | undefined;
            tags?: string[] | undefined;
        } | undefined;
        startedAt?: Date | undefined;
        completedAt?: Date | undefined;
        results?: Record<string, any> | undefined;
        cancelledAt?: Date | undefined;
    }, {
        type: OperationType;
        status: OperationStatus;
        id: string;
        createdAt: Date;
        agentId: string;
        userId: string;
        estimatedDuration: number;
        context: {
            executionContext: {
                agentId: string;
                userId: string;
                resourceLimits: {
                    maxMemory?: number | undefined;
                    maxCpu?: number | undefined;
                    maxDuration?: number | undefined;
                };
                metadata?: Record<string, any> | undefined;
                conversationId?: string | undefined;
                sessionId?: string | undefined;
                environment?: "development" | "staging" | "production" | undefined;
                timeout?: number | undefined;
            };
        };
        plan: {
            type: OperationType;
            id: string;
            createdAt: Date;
            description: string;
            estimatedDuration: number;
            steps: {
                type: "validation" | "tool" | "artifact" | "approval";
                status: OperationStatus;
                id: string;
                name: string;
                error?: string | undefined;
                startedAt?: Date | undefined;
                input?: Record<string, any> | undefined;
                output?: Record<string, any> | undefined;
                completedAt?: Date | undefined;
                retryCount?: number | undefined;
                maxRetries?: number | undefined;
            }[];
            resourceRequirements: {
                estimatedDuration?: number | undefined;
                cpu?: number | undefined;
                memory?: number | undefined;
                storage?: number | undefined;
                network?: boolean | undefined;
                gpu?: boolean | undefined;
            };
            riskAssessment: {
                level: "low" | "medium" | "high" | "critical";
                factors: string[];
                mitigations?: string[] | undefined;
            };
            dependencies?: string[] | undefined;
            approvalRequired?: boolean | undefined;
        };
        executionPlan: {
            type: string;
            id: string;
            dependencies: string[];
            constraints: string[];
            metadata: {
                version: string;
                generatedBy: string;
                basedOnAnalysis: Date;
                userPreferences?: any;
            };
            agentId: string;
            priority: string;
            estimatedDuration: number;
            steps: {
                type: string;
                id: string;
                description: string;
                estimatedDuration: number;
                required: boolean;
            }[];
            created_at: Date;
        };
        progress: {
            completedSteps: number;
            totalSteps: number;
            percentage: number;
        };
        error?: string | undefined;
        updatedAt?: Date | undefined;
        metadata?: {
            priority?: OperationPriority | undefined;
            environment?: string | undefined;
            tags?: string[] | undefined;
        } | undefined;
        startedAt?: Date | undefined;
        priority?: OperationPriority | undefined;
        completedAt?: Date | undefined;
        currentStep?: number | undefined;
        results?: Record<string, any> | undefined;
        cancelledAt?: Date | undefined;
    }>;
    currentStep: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        type: z.ZodEnum<["tool", "artifact", "validation", "approval"]>;
        status: z.ZodNativeEnum<typeof OperationStatus>;
        input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        output: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        error: z.ZodOptional<z.ZodString>;
        startedAt: z.ZodOptional<z.ZodDate>;
        completedAt: z.ZodOptional<z.ZodDate>;
        retryCount: z.ZodDefault<z.ZodNumber>;
        maxRetries: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        type: "validation" | "tool" | "artifact" | "approval";
        status: OperationStatus;
        id: string;
        name: string;
        retryCount: number;
        maxRetries: number;
        error?: string | undefined;
        startedAt?: Date | undefined;
        input?: Record<string, any> | undefined;
        output?: Record<string, any> | undefined;
        completedAt?: Date | undefined;
    }, {
        type: "validation" | "tool" | "artifact" | "approval";
        status: OperationStatus;
        id: string;
        name: string;
        error?: string | undefined;
        startedAt?: Date | undefined;
        input?: Record<string, any> | undefined;
        output?: Record<string, any> | undefined;
        completedAt?: Date | undefined;
        retryCount?: number | undefined;
        maxRetries?: number | undefined;
    }>>;
    progress: z.ZodObject<{
        completedSteps: z.ZodNumber;
        totalSteps: z.ZodNumber;
        percentage: z.ZodNumber;
        estimatedTimeRemaining: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        completedSteps: number;
        totalSteps: number;
        percentage: number;
        estimatedTimeRemaining?: number | undefined;
    }, {
        completedSteps: number;
        totalSteps: number;
        percentage: number;
        estimatedTimeRemaining?: number | undefined;
    }>;
    logs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        timestamp: z.ZodDate;
        level: z.ZodEnum<["info", "warn", "error", "debug"]>;
        message: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        timestamp: Date;
        level: "error" | "warn" | "info" | "debug";
        metadata?: Record<string, any> | undefined;
    }, {
        message: string;
        timestamp: Date;
        level: "error" | "warn" | "info" | "debug";
        metadata?: Record<string, any> | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    progress: {
        completedSteps: number;
        totalSteps: number;
        percentage: number;
        estimatedTimeRemaining?: number | undefined;
    };
    operation: {
        type: OperationType;
        status: OperationStatus;
        id: string;
        createdAt: Date;
        agentId: string;
        userId: string;
        priority: OperationPriority;
        estimatedDuration: number;
        context: {
            executionContext: {
                agentId: string;
                userId: string;
                environment: "development" | "staging" | "production";
                timeout: number;
                resourceLimits: {
                    maxMemory: number;
                    maxCpu: number;
                    maxDuration: number;
                };
                metadata?: Record<string, any> | undefined;
                conversationId?: string | undefined;
                sessionId?: string | undefined;
            };
        };
        currentStep: number;
        plan: {
            type: OperationType;
            id: string;
            createdAt: Date;
            description: string;
            approvalRequired: boolean;
            estimatedDuration: number;
            steps: {
                type: "validation" | "tool" | "artifact" | "approval";
                status: OperationStatus;
                id: string;
                name: string;
                retryCount: number;
                maxRetries: number;
                error?: string | undefined;
                startedAt?: Date | undefined;
                input?: Record<string, any> | undefined;
                output?: Record<string, any> | undefined;
                completedAt?: Date | undefined;
            }[];
            resourceRequirements: {
                network: boolean;
                gpu: boolean;
                estimatedDuration?: number | undefined;
                cpu?: number | undefined;
                memory?: number | undefined;
                storage?: number | undefined;
            };
            riskAssessment: {
                level: "low" | "medium" | "high" | "critical";
                factors: string[];
                mitigations?: string[] | undefined;
            };
            dependencies?: string[] | undefined;
        };
        executionPlan: {
            type: string;
            id: string;
            dependencies: string[];
            constraints: string[];
            metadata: {
                version: string;
                generatedBy: string;
                basedOnAnalysis: Date;
                userPreferences?: any;
            };
            agentId: string;
            priority: string;
            estimatedDuration: number;
            steps: {
                type: string;
                id: string;
                description: string;
                estimatedDuration: number;
                required: boolean;
            }[];
            created_at: Date;
        };
        progress: {
            completedSteps: number;
            totalSteps: number;
            percentage: number;
        };
        error?: string | undefined;
        updatedAt?: Date | undefined;
        metadata?: {
            priority?: OperationPriority | undefined;
            environment?: string | undefined;
            tags?: string[] | undefined;
        } | undefined;
        startedAt?: Date | undefined;
        completedAt?: Date | undefined;
        results?: Record<string, any> | undefined;
        cancelledAt?: Date | undefined;
    };
    currentStep?: {
        type: "validation" | "tool" | "artifact" | "approval";
        status: OperationStatus;
        id: string;
        name: string;
        retryCount: number;
        maxRetries: number;
        error?: string | undefined;
        startedAt?: Date | undefined;
        input?: Record<string, any> | undefined;
        output?: Record<string, any> | undefined;
        completedAt?: Date | undefined;
    } | undefined;
    logs?: {
        message: string;
        timestamp: Date;
        level: "error" | "warn" | "info" | "debug";
        metadata?: Record<string, any> | undefined;
    }[] | undefined;
}, {
    progress: {
        completedSteps: number;
        totalSteps: number;
        percentage: number;
        estimatedTimeRemaining?: number | undefined;
    };
    operation: {
        type: OperationType;
        status: OperationStatus;
        id: string;
        createdAt: Date;
        agentId: string;
        userId: string;
        estimatedDuration: number;
        context: {
            executionContext: {
                agentId: string;
                userId: string;
                resourceLimits: {
                    maxMemory?: number | undefined;
                    maxCpu?: number | undefined;
                    maxDuration?: number | undefined;
                };
                metadata?: Record<string, any> | undefined;
                conversationId?: string | undefined;
                sessionId?: string | undefined;
                environment?: "development" | "staging" | "production" | undefined;
                timeout?: number | undefined;
            };
        };
        plan: {
            type: OperationType;
            id: string;
            createdAt: Date;
            description: string;
            estimatedDuration: number;
            steps: {
                type: "validation" | "tool" | "artifact" | "approval";
                status: OperationStatus;
                id: string;
                name: string;
                error?: string | undefined;
                startedAt?: Date | undefined;
                input?: Record<string, any> | undefined;
                output?: Record<string, any> | undefined;
                completedAt?: Date | undefined;
                retryCount?: number | undefined;
                maxRetries?: number | undefined;
            }[];
            resourceRequirements: {
                estimatedDuration?: number | undefined;
                cpu?: number | undefined;
                memory?: number | undefined;
                storage?: number | undefined;
                network?: boolean | undefined;
                gpu?: boolean | undefined;
            };
            riskAssessment: {
                level: "low" | "medium" | "high" | "critical";
                factors: string[];
                mitigations?: string[] | undefined;
            };
            dependencies?: string[] | undefined;
            approvalRequired?: boolean | undefined;
        };
        executionPlan: {
            type: string;
            id: string;
            dependencies: string[];
            constraints: string[];
            metadata: {
                version: string;
                generatedBy: string;
                basedOnAnalysis: Date;
                userPreferences?: any;
            };
            agentId: string;
            priority: string;
            estimatedDuration: number;
            steps: {
                type: string;
                id: string;
                description: string;
                estimatedDuration: number;
                required: boolean;
            }[];
            created_at: Date;
        };
        progress: {
            completedSteps: number;
            totalSteps: number;
            percentage: number;
        };
        error?: string | undefined;
        updatedAt?: Date | undefined;
        metadata?: {
            priority?: OperationPriority | undefined;
            environment?: string | undefined;
            tags?: string[] | undefined;
        } | undefined;
        startedAt?: Date | undefined;
        priority?: OperationPriority | undefined;
        completedAt?: Date | undefined;
        currentStep?: number | undefined;
        results?: Record<string, any> | undefined;
        cancelledAt?: Date | undefined;
    };
    currentStep?: {
        type: "validation" | "tool" | "artifact" | "approval";
        status: OperationStatus;
        id: string;
        name: string;
        error?: string | undefined;
        startedAt?: Date | undefined;
        input?: Record<string, any> | undefined;
        output?: Record<string, any> | undefined;
        completedAt?: Date | undefined;
        retryCount?: number | undefined;
        maxRetries?: number | undefined;
    } | undefined;
    logs?: {
        message: string;
        timestamp: Date;
        level: "error" | "warn" | "info" | "debug";
        metadata?: Record<string, any> | undefined;
    }[] | undefined;
}>;
export type OperationStatusResponse = z.infer<typeof OperationStatusResponseSchema>;
export declare enum StepType {
    TOOL = "tool",
    ARTIFACT = "artifact",
    VALIDATION = "validation",
    APPROVAL = "approval",
    DELAY = "delay",
    DECISION = "decision"
}
export declare const RetryPolicySchema: z.ZodObject<{
    maxAttempts: z.ZodDefault<z.ZodNumber>;
    backoffStrategy: z.ZodDefault<z.ZodEnum<["fixed", "exponential", "linear"]>>;
    retryDelay: z.ZodDefault<z.ZodNumber>;
    retryConditions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    maxAttempts: number;
    backoffStrategy: "fixed" | "exponential" | "linear";
    retryDelay: number;
    retryConditions?: string[] | undefined;
}, {
    maxAttempts?: number | undefined;
    backoffStrategy?: "fixed" | "exponential" | "linear" | undefined;
    retryDelay?: number | undefined;
    retryConditions?: string[] | undefined;
}>;
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;
export declare const ValidationStepSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    type: z.ZodLiteral<"validation">;
    validationRules: z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        rule: z.ZodString;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        message: string;
        field: string;
        rule: string;
    }, {
        message: string;
        field: string;
        rule: string;
    }>, "many">;
    required: z.ZodDefault<z.ZodBoolean>;
    timeout: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "validation";
    id: string;
    name: string;
    required: boolean;
    timeout: number;
    validationRules: {
        message: string;
        field: string;
        rule: string;
    }[];
}, {
    type: "validation";
    id: string;
    name: string;
    validationRules: {
        message: string;
        field: string;
        rule: string;
    }[];
    required?: boolean | undefined;
    timeout?: number | undefined;
}>;
export type ValidationStep = z.infer<typeof ValidationStepSchema>;
export declare const StepExecutionResultSchema: z.ZodObject<{
    stepId: z.ZodString;
    status: z.ZodNativeEnum<typeof StepStatus>;
    data: z.ZodRecord<z.ZodString, z.ZodAny>;
    error: z.ZodOptional<z.ZodString>;
    executionTime: z.ZodNumber;
    retryCount: z.ZodDefault<z.ZodNumber>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    status: StepStatus;
    data: Record<string, any>;
    retryCount: number;
    stepId: string;
    executionTime: number;
    error?: string | undefined;
    metadata?: Record<string, any> | undefined;
}, {
    status: StepStatus;
    data: Record<string, any>;
    stepId: string;
    executionTime: number;
    error?: string | undefined;
    metadata?: Record<string, any> | undefined;
    retryCount?: number | undefined;
}>;
export type StepExecutionResult = z.infer<typeof StepExecutionResultSchema>;
//# sourceMappingURL=operation.d.ts.map