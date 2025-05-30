import { z } from 'zod';
import { BaseEntitySchema, UUIDSchema } from './common';
import { ExecutionPlanSchema } from './agent';

// Operation types
export enum OperationType {
  TOOL_EXECUTION = 'tool_execution',
  ARTIFACT_GENERATION = 'artifact_generation',
  HYBRID_WORKFLOW = 'hybrid_workflow',
  ANALYSIS = 'analysis'
}

export enum OperationStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  SUSPENDED = 'suspended',
  PAUSED = 'paused',
  COMPENSATING = 'compensating'
}

export enum OperationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

// New enums and types for orchestration engine
export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  CANCELLED = 'cancelled'
}

export enum OperationEventType {
  OPERATION_STARTED = 'operation_started',
  OPERATION_COMPLETED = 'operation_completed',
  OPERATION_FAILED = 'operation_failed',
  OPERATION_PAUSED = 'operation_paused',
  OPERATION_RESUMED = 'operation_resumed',
  STEP_STARTED = 'step_started',
  STEP_COMPLETED = 'step_completed',
  STEP_FAILED = 'step_failed',
  CHECKPOINT_CREATED = 'checkpoint_created'
}

export enum CheckpointType {
  STATE_SNAPSHOT = 'state_snapshot',
  PROGRESS_MARKER = 'progress_marker',
  ERROR_RECOVERY = 'error_recovery'
}

// Execution context
export const ExecutionContextSchema = z.object({
  agentId: UUIDSchema,
  userId: UUIDSchema,
  conversationId: UUIDSchema.optional(),
  sessionId: UUIDSchema.optional(),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  metadata: z.record(z.any()).optional(),
  timeout: z.number().min(0).default(300000), // 5 minutes default
  resourceLimits: z.object({
    maxMemory: z.number().min(0).default(1024 * 1024 * 1024), // 1GB default
    maxCpu: z.number().min(0).default(2), // 2 CPU cores default
    maxDuration: z.number().min(0).default(3600000) // 1 hour default
  })
});

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

// Resource requirements
export const ResourceRequirementsSchema = z.object({
  cpu: z.number().min(0).optional(),
  memory: z.number().min(0).optional(),
  storage: z.number().min(0).optional(),
  network: z.boolean().default(false),
  gpu: z.boolean().default(false),
  estimatedDuration: z.number().min(0).optional()
});

export type ResourceRequirements = z.infer<typeof ResourceRequirementsSchema>;

// Execution Step (extended from OperationStep)
export const ExecutionStepSchema = z.object({
  id: UUIDSchema,
  name: z.string(),
  type: z.enum(['tool', 'artifact', 'validation', 'approval', 'delay', 'decision']),
  status: z.nativeEnum(StepStatus).default(StepStatus.PENDING),
  input: z.record(z.any()).optional(),
  output: z.record(z.any()).optional(),
  error: z.string().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  retryCount: z.number().min(0).default(0),
  maxRetries: z.number().min(0).default(3),
  timeout: z.number().min(0).default(60000), // 1 minute default
  condition: z.string().optional(), // Conditional execution
  outputMapping: z.record(z.string()).optional(), // Map outputs to variables
  required: z.boolean().default(true), // Whether step failure should fail operation
  metadata: z.record(z.any()).optional(),
  retryPolicy: z.object({
    maxAttempts: z.number().min(0).default(3),
    backoffStrategy: z.enum(['fixed', 'exponential', 'linear']).default('exponential'),
    retryDelay: z.number().min(0).default(1000)
  }).optional()
});

export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

// Operation step (keeping for backward compatibility)
export const OperationStepSchema = z.object({
  id: UUIDSchema,
  name: z.string(),
  type: z.enum(['tool', 'artifact', 'validation', 'approval']),
  status: z.nativeEnum(OperationStatus),
  input: z.record(z.any()).optional(),
  output: z.record(z.any()).optional(),
  error: z.string().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  retryCount: z.number().min(0).default(0),
  maxRetries: z.number().min(0).default(3)
});

export type OperationStep = z.infer<typeof OperationStepSchema>;

// Step dependency
export const StepDependencySchema = z.object({
  stepId: UUIDSchema,
  dependsOn: z.array(UUIDSchema)
});

export type StepDependency = z.infer<typeof StepDependencySchema>;

// Parallel execution policy
export const ParallelExecutionPolicySchema = z.object({
  policy: z.enum(['all_success', 'any_success', 'majority_success']).default('all_success'),
  maxConcurrency: z.number().min(1).default(5),
  timeoutPolicy: z.enum(['wait_all', 'fail_fast']).default('fail_fast')
});

export type ParallelExecutionPolicy = z.infer<typeof ParallelExecutionPolicySchema>;

// Parallel group
export const ParallelGroupSchema = z.object({
  id: UUIDSchema,
  stepIds: z.array(UUIDSchema),
  policy: ParallelExecutionPolicySchema
});

export type ParallelGroup = z.infer<typeof ParallelGroupSchema>;

// Failure policy
export const FailurePolicySchema = z.object({
  onStepFailure: z.enum(['fail_immediately', 'continue', 'compensate']).default('fail_immediately'),
  compensationRequired: z.boolean().default(true),
  retryPolicy: z.object({
    maxAttempts: z.number().min(0).default(3),
    backoffStrategy: z.enum(['fixed', 'exponential', 'linear']).default('exponential'),
    retryDelay: z.number().min(0).default(1000)
  }).optional()
});

export type FailurePolicy = z.infer<typeof FailurePolicySchema>;

// // Execution plan
// export const ExecutionPlanSchema = z.object({
//   steps: z.array(ExecutionStepSchema),
//   dependencies: z.array(StepDependencySchema),
//   parallelGroups: z.array(ParallelGroupSchema).default([]),
//   failurePolicy: FailurePolicySchema.optional()
// });

// export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

// Operation plan
export const OperationPlanSchema = z.object({
  id: UUIDSchema,
  type: z.nativeEnum(OperationType),
  description: z.string(),
  steps: z.array(OperationStepSchema),
  dependencies: z.array(UUIDSchema).optional(),
  resourceRequirements: ResourceRequirementsSchema,
  estimatedDuration: z.number().min(0),
  riskAssessment: z.object({
    level: z.enum(['low', 'medium', 'high', 'critical']),
    factors: z.array(z.string()),
    mitigations: z.array(z.string()).optional()
  }),
  approvalRequired: z.boolean().default(false),
  createdAt: z.date()
});

export type OperationPlan = z.infer<typeof OperationPlanSchema>;

// Step result
export const StepResultSchema = z.object({
  stepId: UUIDSchema,
  status: z.nativeEnum(StepStatus),
  data: z.record(z.any()).default({}),
  error: z.string().optional(),
  executionTime: z.number().min(0).optional(),
  metadata: z.record(z.any()).optional()
});

export type StepResult = z.infer<typeof StepResultSchema>;

// Operation state
export const OperationStateSchema = z.object({
  operationId: UUIDSchema,
  status: z.nativeEnum(OperationStatus).optional(),
  currentStep: UUIDSchema.optional(),
  completedSteps: z.array(UUIDSchema).default([]),
  failedSteps: z.array(UUIDSchema).default([]),
  variables: z.record(z.any()).default({}),
  checkpoints: z.array(UUIDSchema).default([]),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  lastUpdated: z.date(),
  metadata: z.record(z.any()).optional(),
  error: z.string().optional(),
  result: z.record(z.any()).optional()
});

export type OperationState = z.infer<typeof OperationStateSchema>;

// Workflow instance
export const WorkflowInstanceSchema = z.object({
  id: UUIDSchema,
  operationId: UUIDSchema,
  status: z.nativeEnum(OperationStatus),
  currentStepIndex: z.number().min(0).default(0),
  executionContext: ExecutionContextSchema,
  state: OperationStateSchema,
  createdAt: z.date(),
  updatedAt: z.date()
});

export type WorkflowInstance = z.infer<typeof WorkflowInstanceSchema>;

// Operation event
export const OperationEventSchema = z.object({
  operationId: UUIDSchema,
  eventType: z.nativeEnum(OperationEventType),
  data: z.record(z.any()),
  timestamp: z.date(),
  source: z.string()
});

export type OperationEvent = z.infer<typeof OperationEventSchema>;

// Checkpoint
export const CheckpointSchema = z.object({
  id: UUIDSchema,
  stepId: UUIDSchema,
  type: z.nativeEnum(CheckpointType),
  data: z.object({
    operationState: OperationStateSchema,
    timestamp: z.date(),
    version: z.string()
  }),
  timestamp: z.date()
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

// Compensation action
export const CompensationActionSchema = z.object({
  id: UUIDSchema,
  stepId: UUIDSchema,
  action: z.enum(['undo', 'cleanup', 'notify']),
  parameters: z.record(z.any()).optional(),
  timeout: z.number().min(0).default(30000)
});

export type CompensationAction = z.infer<typeof CompensationActionSchema>;

// Operation error
export const OperationErrorSchema = z.object({
  id: UUIDSchema,
  operationId: UUIDSchema,
  stepId: UUIDSchema.optional(),
  errorType: z.enum(['validation', 'execution', 'timeout', 'resource', 'system']),
  message: z.string(),
  code: z.string().optional(),
  details: z.record(z.any()).optional(),
  timestamp: z.date(),
  resolved: z.boolean().default(false)
});

export type OperationError = z.infer<typeof OperationErrorSchema>;

// Resource usage
export const ResourceUsageSchema = z.object({
  cpu: z.number().min(0),
  memory: z.number().min(0),
  network: z.number().min(0)
});

export type ResourceUsage = z.infer<typeof ResourceUsageSchema>;

// Step metrics
export const StepMetricsSchema = z.object({
  stepId: UUIDSchema,
  executionTime: z.number().min(0),
  resourceUsage: ResourceUsageSchema,
  retryCount: z.number().min(0),
  errorCount: z.number().min(0)
});

export type StepMetrics = z.infer<typeof StepMetricsSchema>;

// Operation metrics
export const OperationMetricsSchema = z.object({
  executionTime: z.number().min(0),
  resourceUsage: ResourceUsageSchema,
  stepMetrics: z.array(StepMetricsSchema),
  throughput: z.number().min(0),
  errorRate: z.number().min(0).max(1)
});

export type OperationMetrics = z.infer<typeof OperationMetricsSchema>;

// Operation result
export const OperationResultSchema = z.object({
  operationId: UUIDSchema,
  status: z.nativeEnum(OperationStatus),
  result: z.record(z.any()),
  metrics: OperationMetricsSchema,
  completedAt: z.date()
});

export type OperationResult = z.infer<typeof OperationResultSchema>;

// Main operation entity (updated)
export const OperationSchema = BaseEntitySchema.extend({
  type: z.nativeEnum(OperationType),
  status: z.nativeEnum(OperationStatus),
  priority: z.nativeEnum(OperationPriority).default(OperationPriority.MEDIUM),
  agentId: UUIDSchema,
  userId: UUIDSchema,
  plan: OperationPlanSchema,
  context: z.object({
    executionContext: ExecutionContextSchema
  }),
  executionPlan: ExecutionPlanSchema,
  estimatedDuration: z.number().min(0),
  currentStep: z.number().min(0).default(0),
  progress: z.object({
    completedSteps: z.number().min(0),
    totalSteps: z.number().min(0),
    percentage: z.number().min(0).max(100)
  }),
  results: z.record(z.any()).optional(),
  error: z.string().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  cancelledAt: z.date().optional(),
  metadata: z.object({
    priority: z.nativeEnum(OperationPriority).optional(),
    tags: z.array(z.string()).optional(),
    environment: z.string().optional()
  }).optional()
});

export type Operation = z.infer<typeof OperationSchema>;

// Operation execution request
export const ExecuteOperationRequestSchema = z.object({
  operationPlan: OperationPlanSchema,
  executionOptions: z.object({
    priority: z.nativeEnum(OperationPriority).optional(),
    timeout: z.number().min(0).optional(),
    retryPolicy: z.object({
      maxRetries: z.number().min(0).default(3),
      backoffStrategy: z.enum(['fixed', 'exponential', 'linear']).default('exponential'),
      retryDelay: z.number().min(0).default(1000)
    }).optional(),
    notificationSettings: z.object({
      onStart: z.boolean().default(false),
      onComplete: z.boolean().default(true),
      onFailure: z.boolean().default(true),
      webhookUrl: z.string().url().optional()
    }).optional()
  }).optional(),
  approvals: z.array(z.object({
    approverId: UUIDSchema,
    approvedAt: z.date(),
    conditions: z.array(z.string()).optional()
  })).optional()
});

export type ExecuteOperationRequest = z.infer<typeof ExecuteOperationRequestSchema>;

// Operation status response
export const OperationStatusResponseSchema = z.object({
  operation: OperationSchema,
  currentStep: OperationStepSchema.optional(),
  progress: z.object({
    completedSteps: z.number(),
    totalSteps: z.number(),
    percentage: z.number(),
    estimatedTimeRemaining: z.number().optional()
  }),
  logs: z.array(z.object({
    timestamp: z.date(),
    level: z.enum(['info', 'warn', 'error', 'debug']),
    message: z.string(),
    metadata: z.record(z.any()).optional()
  })).optional()
});

export type OperationStatusResponse = z.infer<typeof OperationStatusResponseSchema>;

// Step types
export enum StepType {
  TOOL = 'tool',
  ARTIFACT = 'artifact',
  VALIDATION = 'validation',
  APPROVAL = 'approval',
  DELAY = 'delay',
  DECISION = 'decision'
}

// Retry policy
export const RetryPolicySchema = z.object({
  maxAttempts: z.number().min(0).default(3),
  backoffStrategy: z.enum(['fixed', 'exponential', 'linear']).default('exponential'),
  retryDelay: z.number().min(0).default(1000),
  retryConditions: z.array(z.string()).optional()
});

export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

// Validation step
export const ValidationStepSchema = z.object({
  id: UUIDSchema,
  name: z.string(),
  type: z.literal('validation'),
  validationRules: z.array(z.object({
    field: z.string(),
    rule: z.string(),
    message: z.string()
  })),
  required: z.boolean().default(true),
  timeout: z.number().min(0).default(30000)
});

export type ValidationStep = z.infer<typeof ValidationStepSchema>;

// Step execution result
export const StepExecutionResultSchema = z.object({
  stepId: UUIDSchema,
  status: z.nativeEnum(StepStatus),
  data: z.record(z.any()),
  error: z.string().optional(),
  executionTime: z.number().min(0),
  retryCount: z.number().min(0).default(0),
  metadata: z.record(z.any()).optional()
});

export type StepExecutionResult = z.infer<typeof StepExecutionResultSchema>; 