import { z } from 'zod';

// Base schema components
const uuidSchema = z.string();
const timestampSchema = z.string().datetime();

// Resource Limits Schema
export const resourceLimitsSchema = z.object({
  maxMemory: z.number().int().min(0),
  maxCpu: z.number().min(0),
  maxDuration: z.number().int().min(0),
  maxConcurrency: z.number().int().min(1)
});

// Retry Policy Schema
export const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(0).max(10), 
  backoffStrategy: z.enum(['linear', 'exponential', 'custom']),
  baseDelay: z.number().int().min(0),
  maxDelay: z.number().int().min(0),
  retryableErrors: z.array(z.string()).default([])
});

// Security Context Schema
export const securityContextSchema = z.object({
  userId: z.string(),
  agentId: z.string(),
  permissions: z.array(z.string()),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  requiresApproval: z.boolean(),
  approvalWorkflowId: z.string().optional()
});

// Execution Context Schema
export const executionContextSchema = z.object({
  resourceLimits: resourceLimitsSchema,
  timeout: z.number().int().min(0),
  retryPolicy: retryPolicySchema,
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  executionMode: z.enum(['synchronous', 'asynchronous', 'streaming'])
});

// Operation Context Schema
export const operationContextSchema = z.object({
  conversationId: uuidSchema,
  sessionId: uuidSchema,
  userRequest: z.string().min(1).max(10000),
  environment: z.enum(['development', 'staging', 'production']),
  constraints: z.record(z.string(), z.any()).default({}),
  securityContext: securityContextSchema,
  executionContext: executionContextSchema
});

// Step Configuration Schema
export const stepConfigurationSchema = z.object({
  toolId: z.string().optional(),
  artifactTemplateId: z.string().optional(),
  apiEndpoint: z.string().url().optional(),
  transformFunction: z.string().optional(),
  conditionExpression: z.string().optional(),
  delayDuration: z.number().int().min(0).optional(),
  approvalRequirements: z.object({
    requiredApprovers: z.array(uuidSchema),
    minimumApprovals: z.number().int().min(1),
    approvalTimeout: z.number().int().min(0),
    escalationRules: z.array(z.object({
      condition: z.string(),
      escalateToRoles: z.array(z.string()),
      delayMinutes: z.number().int().min(0)
    })).default([])
  }).optional(),
  customConfig: z.record(z.string(), z.any()).optional()
});

// Step Condition Schema
export const stepConditionSchema = z.object({
  expression: z.string(),
  variables: z.record(z.string(), z.any()).default({}),
  defaultValue: z.boolean()
});

// Compensation Step Schema
export const compensationStepSchema = z.object({
  id: uuidSchema,
  stepId: uuidSchema,
  action: z.enum(['rollback', 'cleanup', 'notify', 'custom']),
  configuration: z.record(z.string(), z.any()).default({})
});

// Execution Step Schema
export const executionStepSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(255),
  type: z.enum([
    'tool_call', 'artifact_generate', 'api_request', 'data_transform',
    'condition_check', 'delay', 'parallel_group', 'approval_request'
  ]),
  order: z.number().int().min(0),
  description: z.string().max(1000).default(''),
  configuration: stepConfigurationSchema,
  inputMapping: z.record(z.string(), z.string()).default({}),
  outputMapping: z.record(z.string(), z.string()).default({}),
  condition: stepConditionSchema.optional(),
  timeout: z.number().int().min(0),
  retryPolicy: retryPolicySchema,
  compensation: compensationStepSchema
});

// Step Dependency Schema
export const stepDependencySchema = z.object({
  stepId: uuidSchema,
  dependsOn: z.array(uuidSchema),
  dependencyType: z.enum(['sequential', 'data', 'resource'])
});

// Parallel Group Schema
export const parallelGroupSchema = z.object({
  id: uuidSchema,
  stepIds: z.array(uuidSchema).min(2),
  executionPolicy: z.enum(['all_success', 'any_success', 'best_effort']),
  maxConcurrency: z.number().int().min(1),
  failurePolicy: z.enum(['fail_fast', 'continue', 'retry_failed'])
});

// Checkpoint Schema
export const checkpointSchema = z.object({
  id: uuidSchema,
  stepId: uuidSchema,
  type: z.enum(['state_snapshot', 'progress_marker', 'recovery_point']),
  data: z.record(z.string(), z.any()).default({}),
  timestamp: timestampSchema
});

// Execution Plan Schema
export const executionPlanSchema = z.object({
  steps: z.array(executionStepSchema).min(1),
  dependencies: z.array(stepDependencySchema).default([]),
  compensationSteps: z.array(compensationStepSchema).default([]),
  parallelGroups: z.array(parallelGroupSchema).default([]),
  checkpoints: z.array(checkpointSchema).default([])
});

// Business Impact Schema
export const businessImpactSchema = z.object({
  category: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  affectedSystems: z.array(z.string()).default([]),
  estimatedUsers: z.number().int().min(0).default(0)
});

// Operation Metadata Schema
export const operationMetadataSchema = z.object({
  version: z.string(),
  source: z.string(),
  tags: z.array(z.string()).default([]),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  estimatedCost: z.number().min(0).default(0),
  actualCost: z.number().min(0).optional(),
  businessImpact: businessImpactSchema
});

// Operation Schema
export const operationSchema = z.object({
  id: uuidSchema,
  type: z.enum([
    'tool_execution', 'artifact_generation', 'hybrid_workflow',
    'approval_workflow', 'composite_operation'
  ]),
  status: z.enum([
    'queued', 'running', 'paused', 'completed', 'failed',
    'cancelled', 'waiting_approval', 'compensating'
  ]),
  agentId: uuidSchema,
  userId: uuidSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(1000).default(''),
  context: operationContextSchema,
  executionPlan: executionPlanSchema,
  results: z.record(z.string(), z.any()).optional(),
  metadata: operationMetadataSchema,
  createdAt: timestampSchema,
  startedAt: timestampSchema.optional(),
  completedAt: timestampSchema.optional(),
  estimatedDuration: z.number().int().min(0).optional(),
  actualDuration: z.number().int().min(0).optional()
});

// API Request Schemas

// Execute Operation Request
export const executeOperationRequestSchema = z.object({
  operation: z.object({
    type: z.enum([
      'tool_execution', 'artifact_generation', 'hybrid_workflow',
      'approval_workflow', 'composite_operation'
    ]),
    agentId: uuidSchema,
    userId: uuidSchema,
    name: z.string().min(1).max(255),
    description: z.string().max(1000).default(''),
    context: operationContextSchema,
    executionPlan: executionPlanSchema,
    metadata: operationMetadataSchema
  })
});

// Pause Operation Request
export const pauseOperationRequestSchema = z.object({
  reason: z.string().min(1).max(500),
  createCheckpoint: z.boolean().default(true)
});

// Resume Operation Request
export const resumeOperationRequestSchema = z.object({
  checkpointId: z.string().optional(),
  modifiedSteps: z.array(executionStepSchema).default([])
});

// Cancel Operation Request
export const cancelOperationRequestSchema = z.object({
  reason: z.string().min(1).max(500),
  compensate: z.boolean().default(true),
  force: z.boolean().default(false)
});

// Get Operation Status Response
export const operationStatusResponseSchema = z.object({
  operation: operationSchema,
  currentStep: executionStepSchema.optional(),
  progress: z.object({
    completedSteps: z.number().int().min(0),
    totalSteps: z.number().int().min(0),
    percentage: z.number().min(0).max(100)
  }),
  metrics: z.object({
    startTime: timestampSchema.optional(),
    endTime: timestampSchema.optional(),
    duration: z.number().int().min(0).optional(),
    resourceUsage: z.object({
      memory: z.number().min(0),
      cpu: z.number().min(0)
    }).optional()
  })
});

// Validation helper functions
export const validateParameter = (parameterDefinition: z.ZodTypeAny, value: any) => {
  try {
    return {
      isValid: true,
      value: parameterDefinition.parse(value),
      errors: []
    };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        value: null,
        errors: error.issues.map((issue: z.ZodIssue) => issue.message)
      };
    }
    return {
      isValid: false,
      value: null,
      errors: ['Unknown validation error']
    };
  }
};

// Type exports for TypeScript
export type ResourceLimits = z.infer<typeof resourceLimitsSchema>;
export type RetryPolicy = z.infer<typeof retryPolicySchema>;
export type SecurityContext = z.infer<typeof securityContextSchema>;
export type ExecutionContext = z.infer<typeof executionContextSchema>;
export type OperationContext = z.infer<typeof operationContextSchema>;
export type StepConfiguration = z.infer<typeof stepConfigurationSchema>;
export type StepCondition = z.infer<typeof stepConditionSchema>;
export type CompensationStep = z.infer<typeof compensationStepSchema>;
export type ExecutionStep = z.infer<typeof executionStepSchema>;
export type StepDependency = z.infer<typeof stepDependencySchema>;
export type ParallelGroup = z.infer<typeof parallelGroupSchema>;
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type ExecutionPlan = z.infer<typeof executionPlanSchema>;
export type BusinessImpact = z.infer<typeof businessImpactSchema>;
export type OperationMetadata = z.infer<typeof operationMetadataSchema>;
export type Operation = z.infer<typeof operationSchema>;
export type ExecuteOperationRequest = z.infer<typeof executeOperationRequestSchema>;
export type PauseOperationRequest = z.infer<typeof pauseOperationRequestSchema>;
export type ResumeOperationRequest = z.infer<typeof resumeOperationRequestSchema>;
export type CancelOperationRequest = z.infer<typeof cancelOperationRequestSchema>;
export type OperationStatusResponse = z.infer<typeof operationStatusResponseSchema>; 