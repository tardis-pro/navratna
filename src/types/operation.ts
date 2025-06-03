export enum OperationStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  CANCELLED = 'cancelled'
}

export interface ExecutionStep {
  id: string;
  name: string;
  type: string;
  status: StepStatus;
  config?: Record<string, any>;
  result?: any;
  error?: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
  dependencies: any[];
  parallelGroups?: any[];
}

export interface ExecutionContext {
  agentId: string;
  userId: string;
  environment: 'development' | 'staging' | 'production';
  timeout: number;
  resourceLimits: {
    maxMemory: number;
    maxCpu: number;
    maxDuration: number;
  };
}

export interface OperationContext {
  discussionId?: string;
  parameters?: Record<string, any>;
  executionContext: ExecutionContext;
}

export interface Operation {
  id: string;
  type: string;
  agentId: string;
  status: OperationStatus;
  executionPlan: ExecutionPlan;
  context?: OperationContext;
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedDuration?: number;
  actualDuration?: number;
  priority?: number;
  metadata?: Record<string, any>;
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  data?: any;
  error?: string;
  metrics?: {
    duration: number;
    memoryUsed: number;
    cpuUsed: number;
  };
}

export interface OperationResult {
  operationId: string;
  status: OperationStatus;
  result: any;
  metrics: OperationMetrics;
  completedAt: Date;
}

export interface OperationMetrics {
  executionTime: number;
  resourceUsage: ResourceUsage;
  stepMetrics: StepMetrics[];
  throughput: number;
  errorRate: number;
}

export interface ResourceUsage {
  cpu: number;
  memory: number;
  network: number;
}

export interface StepMetrics {
  stepId: string;
  duration: number;
  resourceUsage: ResourceUsage;
  success: boolean;
}

export interface OperationError {
  code: string;
  message: string;
  stepId?: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface WorkflowInstance {
  id?: string;
  operationId?: string;
  status: OperationStatus;
  currentStepIndex: number;
  executionContext: ExecutionContext;
  state?: OperationState;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperationState {
  operationId: string;
  currentStep?: string;
  completedSteps: string[];
  failedSteps: string[];
  variables: Record<string, any>;
  checkpoints: Checkpoint[];
  lastUpdated: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
  metadata?: Record<string, any>;
}

export interface Checkpoint {
  id?: string;
  stepId: string;
  type: CheckpointType;
  data: {
    operationState: OperationState;
    timestamp: Date;
    version: string;
  };
  timestamp: Date;
}

export enum CheckpointType {
  STATE_SNAPSHOT = 'state_snapshot',
  PROGRESS_MARKER = 'progress_marker',
  ERROR_RECOVERY = 'error_recovery',
  USER_INITIATED = 'user_initiated'
}

export interface CompensationAction {
  id: string;
  stepId: string;
  action: string;
  parameters: Record<string, any>;
  executedAt?: Date;
  result?: any;
  error?: string;
}

export enum ParallelExecutionPolicy {
  ALL_SUCCESS = 'all_success',
  ANY_SUCCESS = 'any_success',
  MAJORITY_SUCCESS = 'majority_success',
  BEST_EFFORT = 'best_effort'
}

export enum FailurePolicy {
  FAIL_FAST = 'fail_fast',
  CONTINUE_ON_ERROR = 'continue_on_error',
  RETRY_WITH_BACKOFF = 'retry_with_backoff',
  COMPENSATE_AND_FAIL = 'compensate_and_fail'
}

export interface OperationEvent {
  operationId: string;
  eventType: OperationEventType;
  data: any;
  timestamp: Date;
  source: string;
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
  CHECKPOINT_CREATED = 'checkpoint_created',
  COMPENSATION_EXECUTED = 'compensation_executed'
} 