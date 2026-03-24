import type { ExecutionStep, StepStatus, Actor, Tenant } from '@uaip/types';

// Orchestration Pipeline Contract
export interface OrchestrationPipeline {
  createExecutionPlan(request: CreateExecutionPlanRequest): Promise<ExecutionPlan>;
  executePlan(planId: string, context: ExecutionContext): Promise<ExecutionResult>;
  pauseExecution(executionId: string, reason?: string): Promise<void>;
  resumeExecution(executionId: string): Promise<void>;
  cancelExecution(executionId: string, reason?: string): Promise<void>;
  getExecutionStatus(executionId: string): Promise<ExecutionStatus>;
}

export interface CreateExecutionPlanRequest {
  operationType: string;
  agentId: string;
  userId: string;
  steps: Array<{
    type: ExecutionStep['type'];
    name: string;
    parameters?: Record<string, unknown>;
    dependsOn?: string[];
    condition?: string;
    timeout?: number;
  }>;
  metadata?: Record<string, unknown>;
}

export interface ExecutionPlan {
  id: string;
  steps: ExecutionStep[];
  dependencies: StepDependency[];
  parallelGroups: ParallelGroup[];
}

export interface StepDependency {
  stepId: string;
  dependsOn: string[];
  dependencyType: 'sequential' | 'data' | 'resource';
}

export interface ParallelGroup {
  id: string;
  stepIds: string[];
  executionPolicy: 'all_success' | 'any_success' | 'best_effort';
  maxConcurrency: number;
}

export interface ExecutionContext {
  operationId: string;
  variables: Record<string, unknown>;
  actor: Actor;
  tenant: Tenant;
  correlationId?: string;
}

export interface ExecutionResult {
  success: boolean;
  results: Map<string, StepResult>;
  duration: number;
  error?: string;
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  output?: Record<string, unknown>;
  error?: string;
  executionTime: number;
}

export interface ExecutionStatus {
  id: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  currentStep?: string;
  progress: {
    completedSteps: number;
    totalSteps: number;
    percentage: number;
  };
  startedAt?: string;
  completedAt?: string;
}

// Step Executor Contract
export interface StepExecutor {
  executeStep(step: ExecutionStep, context: ExecutionContext): Promise<StepResult>;
  validateStep(step: ExecutionStep): Promise<boolean>;
  compensationStep?: CompensationHandler;
}

export interface CompensationHandler {
  compensate(step: ExecutionStep, context: ExecutionContext): Promise<void>;
}

// Workflow Orchestrator Contract
export interface WorkflowOrchestrator {
  startWorkflow(workflowId: string, input: Record<string, unknown>): Promise<string>;
  submitTask(workflowId: string, task: WorkflowTask): Promise<WorkflowTaskResult>;
  getWorkflowState(workflowId: string): Promise<WorkflowState>;
  subscribeToEvents(workflowId: string, handler: WorkflowEventHandler): void;
}

export interface WorkflowTask {
  id: string;
  type: string;
  input: Record<string, unknown>;
  priority?: number;
}

export interface WorkflowTaskResult {
  taskId: string;
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

export interface WorkflowState {
  workflowId: string;
  status: string;
  currentTasks: string[];
  completedTasks: string[];
  failedTasks: string[];
}

export type WorkflowEventHandler = (event: WorkflowEvent) => Promise<void>;

export interface WorkflowEvent {
  type:
    | 'task_started'
    | 'task_completed'
    | 'task_failed'
    | 'workflow_completed'
    | 'workflow_failed';
  workflowId: string;
  taskId?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}
