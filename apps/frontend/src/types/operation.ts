/**
 * Frontend Operation Types
 * This file re-exports shared operation types and provides frontend-specific extensions
 */

// Re-export shared operation types
export type {
  Operation,
  OperationType,
  OperationStatus,
  OperationPriority,
  OperationStep,
  ExecutionStep,
  ExecutionContext,
  ExecutionPlan,
  OperationPlan,
  StepResult,
  OperationState,
  WorkflowInstance,
  OperationEvent,
  OperationEventType,
  Checkpoint,
  CheckpointType,
  CompensationAction,
  OperationError,
  ResourceUsage,
  StepMetrics,
  OperationMetrics,
  OperationResult,
  ExecuteOperationRequest,
  OperationStatusResponse,
  StepStatus,
  StepType,
  RetryPolicy,
  ValidationStep,
  StepExecutionResult,
  ParallelExecutionPolicy,
  FailurePolicy,
  ResourceRequirements,
} from '@uaip/types';

// Frontend-specific extensions
export interface UIOperationExtensions {
  progress?: number;
  startTime?: Date;
  endTime?: Date;
}
