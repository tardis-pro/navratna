export interface Operation {
  id: string;
  type: OperationType;
  status: OperationStatus;
  agentId: string;
  userId: string;
  name: string;
  description: string;
  context: OperationContext;
  executionPlan: ExecutionPlan;
  results?: OperationResult;
  metadata: OperationMetadata;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedDuration?: number;
  actualDuration?: number;
}

export enum OperationType {
  TOOL_EXECUTION = 'tool_execution',
  ARTIFACT_GENERATION = 'artifact_generation',
  HYBRID_WORKFLOW = 'hybrid_workflow',
  APPROVAL_WORKFLOW = 'approval_workflow',
  COMPOSITE_OPERATION = 'composite_operation'
}

export enum OperationStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  WAITING_APPROVAL = 'waiting_approval',
  COMPENSATING = 'compensating'
}

export interface OperationContext {
  conversationId: string;
  sessionId: string;
  userRequest: string;
  environment: string;
  constraints: Record<string, any>;
  securityContext: SecurityContext;
  executionContext: ExecutionContext;
}

export interface SecurityContext {
  userId: string;
  agentId: string;
  permissions: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresApproval: boolean;
  approvalWorkflowId?: string;
}

export interface ExecutionContext {
  resourceLimits: ResourceLimits;
  timeout: number;
  retryPolicy: RetryPolicy;
  priority: ExecutionPriority;
  executionMode: ExecutionMode;
}

export interface ResourceLimits {
  maxMemory: number;
  maxCpu: number;
  maxDuration: number;
  maxConcurrency: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential' | 'custom';
  baseDelay: number;
  maxDelay: number;
  retryableErrors: string[];
}

export enum ExecutionPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ExecutionMode {
  SYNCHRONOUS = 'synchronous',
  ASYNCHRONOUS = 'asynchronous',
  STREAMING = 'streaming'
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
  dependencies: StepDependency[];
  compensationSteps: CompensationStep[];
  parallelGroups: ParallelGroup[];
  checkpoints: Checkpoint[];
}

export interface ExecutionStep {
  id: string;
  name: string;
  type: StepType;
  order: number;
  description: string;
  configuration: StepConfiguration;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
  condition?: StepCondition;
  timeout: number;
  retryPolicy: RetryPolicy;
  compensation: CompensationStep;
}

export enum StepType {
  TOOL_CALL = 'tool_call',
  ARTIFACT_GENERATE = 'artifact_generate',
  API_REQUEST = 'api_request',
  DATA_TRANSFORM = 'data_transform',
  CONDITION_CHECK = 'condition_check',
  DELAY = 'delay',
  PARALLEL_GROUP = 'parallel_group',
  APPROVAL_REQUEST = 'approval_request'
}

export interface StepConfiguration {
  toolId?: string;
  artifactTemplateId?: string;
  apiEndpoint?: string;
  transformFunction?: string;
  conditionExpression?: string;
  delayDuration?: number;
  approvalRequirements?: ApprovalRequirements;
  customConfig?: Record<string, any>;
}

export interface StepCondition {
  expression: string;
  variables: Record<string, any>;
  defaultValue: boolean;
}

export interface StepDependency {
  stepId: string;
  dependsOn: string[];
  dependencyType: 'sequential' | 'data' | 'resource';
}

export interface CompensationStep {
  id: string;
  stepId: string;
  action: CompensationAction;
  configuration: Record<string, any>;
}

export enum CompensationAction {
  ROLLBACK = 'rollback',
  CLEANUP = 'cleanup',
  NOTIFY = 'notify',
  CUSTOM = 'custom'
}

export interface ParallelGroup {
  id: string;
  stepIds: string[];
  executionPolicy: ParallelExecutionPolicy;
  maxConcurrency: number;
  failurePolicy: FailurePolicy;
}

export enum ParallelExecutionPolicy {
  ALL_SUCCESS = 'all_success',
  ANY_SUCCESS = 'any_success',
  BEST_EFFORT = 'best_effort'
}

export enum FailurePolicy {
  FAIL_FAST = 'fail_fast',
  CONTINUE = 'continue',
  RETRY_FAILED = 'retry_failed'
}

export interface Checkpoint {
  id: string;
  stepId: string;
  type: CheckpointType;
  data: Record<string, any>;
  timestamp: Date;
}

export enum CheckpointType {
  STATE_SNAPSHOT = 'state_snapshot',
  PROGRESS_MARKER = 'progress_marker',
  RECOVERY_POINT = 'recovery_point'
}

export interface OperationResult {
  status: OperationStatus;
  data: Record<string, any>;
  artifacts: OperationArtifact[];
  metrics: OperationMetrics;
  errors: OperationError[];
  stepResults: StepResult[];
}

export interface OperationArtifact {
  id: string;
  type: string;
  name: string;
  description: string;
  location: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface OperationMetrics {
  executionTime: number;
  resourceUsage: ResourceUsage;
  stepMetrics: StepMetrics[];
  performanceIndicators: Record<string, number>;
}

export interface ResourceUsage {
  cpuTime: number;
  memoryPeak: number;
  networkBytes: number;
  storageBytes: number;
}

export interface StepMetrics {
  stepId: string;
  executionTime: number;
  attempts: number;
  resourceUsage: ResourceUsage;
}

export interface OperationError {
  stepId?: string;
  errorType: string;
  message: string;
  details: Record<string, any>;
  timestamp: Date;
  recoverable: boolean;
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  data: Record<string, any>;
  errors: OperationError[];
  startTime: Date;
  endTime: Date;
  attempts: number;
}

export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  COMPENSATED = 'compensated'
}

export interface OperationMetadata {
  version: string;
  source: string;
  tags: string[];
  priority: ExecutionPriority;
  estimatedCost: number;
  actualCost?: number;
  businessImpact: BusinessImpact;
}

export interface BusinessImpact {
  category: string;
  severity: 'low' | 'medium' | 'high';
  affectedSystems: string[];
  estimatedUsers: number;
}

export interface ApprovalRequirements {
  requiredApprovers: string[];
  minimumApprovals: number;
  approvalTimeout: number;
  escalationRules: EscalationRule[];
}

export interface EscalationRule {
  condition: string;
  escalateToRoles: string[];
  delayMinutes: number;
}

// State Management Types
export interface OperationState {
  operationId: string;
  currentStep?: string;
  completedSteps: string[];
  failedSteps: string[];
  variables: Record<string, any>;
  checkpoints: Checkpoint[];
  lastUpdated: Date;
}

export interface WorkflowInstance {
  id: string;
  operationId: string;
  status: OperationStatus;
  currentStepIndex: number;
  executionContext: ExecutionContext;
  state: OperationState;
  createdAt: Date;
  updatedAt: Date;
}

// Event Types for State Changes
export interface OperationEvent {
  operationId: string;
  eventType: OperationEventType;
  data: Record<string, any>;
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
  APPROVAL_REQUESTED = 'approval_requested',
  APPROVAL_RECEIVED = 'approval_received'
} 