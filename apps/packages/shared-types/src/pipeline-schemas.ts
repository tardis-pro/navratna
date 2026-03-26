import { z } from 'zod';

const uuidSchema = z.string();
const timestampSchema = z.string().datetime();

export const resourceLimitsSchema = z.object({
    maxMemory: z.number().int().min(0),
    maxCpu: z.number().min(0),
    maxDuration: z.number().int().min(0),
    maxConcurrency: z.number().int().min(1),
});
export type PipelineResourceLimits = z.infer<typeof resourceLimitsSchema>;

export const retryPolicySchema = z.object({
    maxAttempts: z.number().int().min(0).max(10),
    backoffStrategy: z.enum(['linear', 'exponential', 'custom']),
    baseDelay: z.number().int().min(0),
    maxDelay: z.number().int().min(0),
    retryableErrors: z.array(z.string()).default([]),
});
export type PipelineRetryPolicy = z.infer<typeof retryPolicySchema>;

export const securityContextSchema = z.object({
    userId: z.string(),
    agentId: z.string(),
    permissions: z.array(z.string()),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    requiresApproval: z.boolean(),
    approvalWorkflowId: z.string().optional(),
});
export type PipelineSecurityContextSchema = z.infer<typeof securityContextSchema>;

export const pipelineExecutionContextSchema = z.object({
    resourceLimits: resourceLimitsSchema,
    timeout: z.number().int().min(0),
    retryPolicy: retryPolicySchema,
    priority: z.enum(['low', 'normal', 'high', 'critical']),
    executionMode: z.enum(['synchronous', 'asynchronous', 'streaming']),
});
export type PipelineExecutionContextSchema = z.infer<typeof pipelineExecutionContextSchema>;

export const operationContextSchema = z.object({
    conversationId: uuidSchema,
    sessionId: uuidSchema,
    userRequest: z.string().min(1).max(10000),
    environment: z.enum(['development', 'staging', 'production']),
    constraints: z.record(z.string(), z.any()).default({}),
    securityContext: securityContextSchema,
    executionContext: pipelineExecutionContextSchema,
});
export type PipelineOperationContext = z.infer<typeof operationContextSchema>;

export const stepConfigurationSchema = z.object({
    toolId: z.string().optional(),
    artifactTemplateId: z.string().optional(),
    apiEndpoint: z.string().url().optional(),
    transformFunction: z.string().optional(),
    conditionExpression: z.string().optional(),
    delayDuration: z.number().int().min(0).optional(),
    approvalRequirements: z
        .object({
            requiredApprovers: z.array(uuidSchema),
            minimumApprovals: z.number().int().min(1),
            approvalTimeout: z.number().int().min(0),
            escalationRules: z
                .array(
                    z.object({
                        condition: z.string(),
                        escalateToRoles: z.array(z.string()),
                        delayMinutes: z.number().int().min(0),
                    })
                )
                .default([]),
        })
        .optional(),
    customConfig: z.record(z.string(), z.any()).optional(),
});
export type PipelineStepConfiguration = z.infer<typeof stepConfigurationSchema>;

export const stepConditionSchema = z.object({
    expression: z.string(),
    variables: z.record(z.string(), z.any()).default({}),
    defaultValue: z.boolean(),
});
export type PipelineStepCondition = z.infer<typeof stepConditionSchema>;

export const compensationStepSchema = z.object({
    id: uuidSchema,
    stepId: uuidSchema,
    action: z.enum(['rollback', 'cleanup', 'notify', 'custom']),
    configuration: z.record(z.string(), z.any()).default({}),
});
export type PipelineCompensationStep = z.infer<typeof compensationStepSchema>;

export const pipelineExecutionStepSchema = z.object({
    id: uuidSchema,
    name: z.string().min(1).max(255),
    type: z.enum([
        'tool_call',
        'artifact_generate',
        'api_request',
        'data_transform',
        'condition_check',
        'delay',
        'parallel_group',
        'approval_request',
    ]),
    order: z.number().int().min(0),
    description: z.string().max(1000).default(''),
    configuration: stepConfigurationSchema,
    inputMapping: z.record(z.string(), z.string()).default({}),
    outputMapping: z.record(z.string(), z.string()).default({}),
    condition: stepConditionSchema.optional(),
    timeout: z.number().int().min(0),
    retryPolicy: retryPolicySchema,
    compensation: compensationStepSchema,
});
export type PipelineExecutionStep = z.infer<typeof pipelineExecutionStepSchema>;

export const pipelineStepDependencySchema = z.object({
    stepId: uuidSchema,
    dependsOn: z.array(uuidSchema),
    dependencyType: z.enum(['sequential', 'data', 'resource']),
});
export type PipelineStepDependency = z.infer<typeof pipelineStepDependencySchema>;

export const pipelineParallelGroupSchema = z.object({
    id: uuidSchema,
    stepIds: z.array(uuidSchema).min(2),
    executionPolicy: z.enum(['all_success', 'any_success', 'best_effort']),
    maxConcurrency: z.number().int().min(1),
    failurePolicy: z.enum(['fail_fast', 'continue', 'retry_failed']),
});
export type PipelineParallelGroup = z.infer<typeof pipelineParallelGroupSchema>;

export const pipelineCheckpointSchema = z.object({
    id: uuidSchema,
    stepId: uuidSchema,
    type: z.enum(['state_snapshot', 'progress_marker', 'recovery_point']),
    data: z.record(z.string(), z.any()).default({}),
    timestamp: timestampSchema,
});
export type PipelineCheckpoint = z.infer<typeof pipelineCheckpointSchema>;

export const pipelineExecutionPlanSchema = z.object({
    steps: z.array(pipelineExecutionStepSchema).min(1),
    dependencies: z.array(pipelineStepDependencySchema).default([]),
    compensationSteps: z.array(compensationStepSchema).default([]),
    parallelGroups: z.array(pipelineParallelGroupSchema).default([]),
    checkpoints: z.array(pipelineCheckpointSchema).default([]),
});
export type PipelineExecutionPlan = z.infer<typeof pipelineExecutionPlanSchema>;

export const businessImpactSchema = z.object({
    category: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    affectedSystems: z.array(z.string()).default([]),
    estimatedUsers: z.number().int().min(0).default(0),
});
export type PipelineBusinessImpact = z.infer<typeof businessImpactSchema>;

export const operationMetadataSchema = z.object({
    version: z.string(),
    source: z.string(),
    tags: z.array(z.string()).default([]),
    priority: z.enum(['low', 'normal', 'high', 'critical']),
    estimatedCost: z.number().min(0).default(0),
    actualCost: z.number().min(0).optional(),
    businessImpact: businessImpactSchema,
});
export type PipelineOperationMetadata = z.infer<typeof operationMetadataSchema>;

export const apiOperationSchema = z.object({
    id: uuidSchema,
    type: z.enum([
        'tool_execution',
        'artifact_generation',
        'hybrid_workflow',
        'approval_workflow',
        'composite_operation',
    ]),
    status: z.enum([
        'queued',
        'running',
        'paused',
        'completed',
        'failed',
        'cancelled',
        'waiting_approval',
        'compensating',
    ]),
    agentId: uuidSchema,
    userId: uuidSchema,
    name: z.string().min(1).max(255),
    description: z.string().max(1000).default(''),
    context: operationContextSchema,
    executionPlan: pipelineExecutionPlanSchema,
    results: z.record(z.string(), z.any()).optional(),
    metadata: operationMetadataSchema,
    createdAt: timestampSchema,
    startedAt: timestampSchema.optional(),
    completedAt: timestampSchema.optional(),
    estimatedDuration: z.number().int().min(0).optional(),
    actualDuration: z.number().int().min(0).optional(),
});
export type ApiOperation = z.infer<typeof apiOperationSchema>;

export const executeOperationRequestSchema = z.object({
    operation: z.object({
        type: z.enum([
            'tool_execution',
            'artifact_generation',
            'hybrid_workflow',
            'approval_workflow',
            'composite_operation',
        ]),
        agentId: uuidSchema,
        userId: uuidSchema,
        name: z.string().min(1).max(255),
        description: z.string().max(1000).default(''),
        context: operationContextSchema,
        executionPlan: pipelineExecutionPlanSchema,
        metadata: operationMetadataSchema,
    }),
});
export type ApiExecuteOperationRequest = z.infer<typeof executeOperationRequestSchema>;

export const pauseOperationRequestSchema = z.object({
    reason: z.string().min(1).max(500),
    createCheckpoint: z.boolean().default(true),
});
export type ApiPauseOperationRequest = z.infer<typeof pauseOperationRequestSchema>;

export const resumeOperationRequestSchema = z.object({
    checkpointId: z.string().optional(),
    modifiedSteps: z.array(pipelineExecutionStepSchema).default([]),
});
export type ApiResumeOperationRequest = z.infer<typeof resumeOperationRequestSchema>;

export const cancelOperationRequestSchema = z.object({
    reason: z.string().min(1).max(500),
    compensate: z.boolean().default(true),
    force: z.boolean().default(false),
});
export type ApiCancelOperationRequest = z.infer<typeof cancelOperationRequestSchema>;

export const operationStatusResponseSchema = z.object({
    operation: apiOperationSchema,
    currentStep: pipelineExecutionStepSchema.optional(),
    progress: z.object({
        completedSteps: z.number().int().min(0),
        totalSteps: z.number().int().min(0),
        percentage: z.number().min(0).max(100),
    }),
    metrics: z.object({
        startTime: timestampSchema.optional(),
        endTime: timestampSchema.optional(),
        duration: z.number().int().min(0).optional(),
        resourceUsage: z
            .object({
                memory: z.number().min(0),
                cpu: z.number().min(0),
            })
            .optional(),
    }),
});
export type ApiOperationStatusResponse = z.infer<typeof operationStatusResponseSchema>;

export const validateParameter = (parameterDefinition: z.ZodTypeAny, value: unknown) => {
    try {
        return {
            isValid: true,
            value: parameterDefinition.parse(value),
            errors: [] as string[],
        };
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return {
                isValid: false,
                value: null,
                errors: error.issues.map((issue) => issue.message) as string[],
            };
        }
        return {
            isValid: false,
            value: null,
            errors: ['Unknown validation error'] as string[],
        };
    }
};
