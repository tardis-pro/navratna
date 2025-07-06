/**
 * Workflow Orchestrator
 * Manages the overall workflow execution and coordination
 */

import { EventEmitter } from 'events';
import {
  Operation,
  OperationStatus,
  WorkflowInstance,
  OperationState,
  StepResult,
  ExecutionStep,
  StepStatus,
  OperationResult,
  OperationEventType,
  Checkpoint,
  CheckpointType,
  OperationMetrics
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { StateManagerService, EventBusService } from '@uaip/shared-services';
import { StepExecutionManager, StepExecutionContext } from './StepExecutionManager';

export class WorkflowOrchestrator extends EventEmitter {
  private activeWorkflows = new Map<string, WorkflowInstance>();
  private workflowTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private stateManagerService: StateManagerService,
    private eventBusService: EventBusService,
    private stepExecutionManager: StepExecutionManager
  ) {
    super();
    this.setupEventListeners();
  }

  async orchestrateWorkflow(
    operation: Operation,
    workflowId: string,
    initialState?: OperationState
  ): Promise<OperationResult> {
    const workflow: WorkflowInstance = {
      id: workflowId,
      operationId: operation.id,
      status: OperationStatus.PENDING,
      startTime: Date.now(),
      currentStepIndex: 0,
      executionContext: operation.context.executionContext,
      state: initialState || {
        operationId: operation.id,
        completedSteps: [],
        failedSteps: [],
        variables: {},
        checkpoints: [],
        lastUpdated: new Date()
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      completedSteps: [],
      stepResults: [],
      context: operation.context || {},
      retryCount: 0
    };

    this.activeWorkflows.set(workflowId, workflow);

    try {
      // Set operation timeout
      if (operation.timeout) {
        this.setWorkflowTimeout(workflow, operation.timeout);
      }

      // Update status to running
      workflow.status = OperationStatus.RUNNING;
      await this.updateWorkflowState(workflow);

      // Execute steps
      const result = await this.executeWorkflowSteps(operation, workflow);

      // Update final status
      workflow.status = OperationStatus.COMPLETED;
      workflow.endTime = Date.now();
      workflow.error = undefined;

      await this.updateWorkflowState(workflow);
      this.clearWorkflowTimeout(workflowId);

      return result;
    } catch (error) {
      workflow.status = OperationStatus.FAILED;
      workflow.endTime = Date.now();
      workflow.error = error.message;

      await this.updateWorkflowState(workflow);
      this.clearWorkflowTimeout(workflowId);

      throw error;
    } finally {
      this.activeWorkflows.delete(workflowId);
    }
  }

  private async executeWorkflowSteps(
    operation: Operation,
    workflow: WorkflowInstance
  ): Promise<OperationResult> {
    const executionOrder = this.determineExecutionOrder(operation.steps || []);
    const stepResultsMap = new Map<string, StepResult>();

    for (const stepGroup of executionOrder) {
      // Execute steps in parallel within each group
      const groupPromises = stepGroup.map(step => 
        this.executeWorkflowStep(step, operation, workflow, stepResultsMap)
      );

      const results = await Promise.allSettled(groupPromises);

      // Check for failures
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        throw new Error(`Step execution failed: ${failures[0].reason}`);
      }

      // Update completed steps
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const stepResult = result.value;
          stepResultsMap.set(stepResult.stepId || '', stepResult);
          workflow.stepResults.push(stepResult);
          if (stepResult.stepId) {
            workflow.completedSteps.push(stepResult.stepId);
          }
        }
      }

      // Create checkpoint after each group
      await this.createCheckpoint(workflow, operation);
    }

    return {
      operationId: operation.id || '',
      status: OperationStatus.COMPLETED,
      result: Object.fromEntries(stepResultsMap),
      metrics: this.calculateMetrics(workflow),
      completedAt: new Date()
    };
  }

  private async executeWorkflowStep(
    step: ExecutionStep,
    operation: Operation,
    workflow: WorkflowInstance,
    previousResults: Map<string, StepResult>
  ): Promise<StepResult> {
    try {
      workflow.state.currentStep = step.id;
      await this.updateWorkflowState(workflow);

      const context: StepExecutionContext = {
        operationId: operation.id || '',
        workflowInstanceId: workflow.id,
        previousResults,
        globalContext: workflow.context || {}
      };

      const result = await this.stepExecutionManager.executeStep(step, context);

      // Emit step completed event
      await this.eventBusService.publish('operation.step.completed', {
        operationId: operation.id,
        workflowId: workflow.id,
        stepId: step.id,
        result
      });

      return result;
    } catch (error) {
      // Emit step failed event
      await this.eventBusService.publish('operation.step.failed', {
        operationId: operation.id,
        workflowId: workflow.id,
        stepId: step.id,
        error: error.message
      });

      throw error;
    }
  }

  private determineExecutionOrder(steps: ExecutionStep[]): ExecutionStep[][] {
    const groups: ExecutionStep[][] = [];
    const completed = new Set<string>();
    const remaining = new Set(steps);

    while (remaining.size > 0) {
      const currentGroup: ExecutionStep[] = [];

      for (const step of remaining) {
        // Check if all dependencies are completed
        const canExecute = !step.dependsOn || 
          step.dependsOn.every(depId => completed.has(depId));

        if (canExecute) {
          currentGroup.push(step);
        }
      }

      if (currentGroup.length === 0) {
        throw new Error('Circular dependency detected in workflow steps');
      }

      // Remove executed steps from remaining
      for (const step of currentGroup) {
        remaining.delete(step);
        completed.add(step.id);
      }

      groups.push(currentGroup);
    }

    return groups;
  }

  private async createCheckpoint(
    workflow: WorkflowInstance,
    operation: Operation
  ): Promise<void> {
    const checkpoint: Checkpoint = {
      id: `cp-${workflow.id}-${Date.now()}`,
      stepId: workflow.state.currentStep || 'workflow',
      type: CheckpointType.PROGRESS_MARKER,
      data: {
        operationState: {
          operationId: workflow.operationId,
          status: workflow.status,
          variables: workflow.executionContext || {},
          error: undefined,
          metadata: {}
        },
        timestamp: new Date(),
        version: '1.0'
      },
      timestamp: new Date()
    };

    await this.stateManagerService.saveCheckpoint(operation.id, checkpoint);
  }

  private async updateWorkflowState(workflow: WorkflowInstance): Promise<void> {
    const state: OperationState = {
      operationId: workflow.operationId,
      workflowInstanceId: workflow.id,
      status: workflow.status,
      completedSteps: workflow.completedSteps || [],
      variables: workflow.executionContext || {},
      error: workflow.error,
      startedAt: workflow.startTime ? new Date(workflow.startTime) : undefined,
      completedAt: workflow.endTime ? new Date(workflow.endTime) : undefined,
      lastUpdated: new Date()
    };

    await this.stateManagerService.updateOperationState(workflow.operationId, state);

    // Emit state update event
    await this.eventBusService.publish('operation.state.updated', {
      operationId: workflow.operationId,
      workflowId: workflow.id,
      state
    });
  }

  private setWorkflowTimeout(workflow: WorkflowInstance, timeout: number): void {
    const timer = setTimeout(() => {
      this.emit('workflow:timeout', {
        workflowId: workflow.id,
        operationId: workflow.operationId,
        timeout
      });

      // Force fail the workflow
      workflow.status = OperationStatus.FAILED;
      workflow.error = 'Operation timeout exceeded';
      this.updateWorkflowState(workflow);
    }, timeout);

    this.workflowTimeouts.set(workflow.id, timer);
  }

  private clearWorkflowTimeout(workflowId: string): void {
    const timeout = this.workflowTimeouts.get(workflowId);
    if (timeout) {
      clearTimeout(timeout);
      this.workflowTimeouts.delete(workflowId);
    }
  }

  private aggregateResults(
    stepResults: Map<string, StepResult>,
    operation: Operation
  ): any {
    // Simple aggregation - can be customized based on operation type
    const outputs: Record<string, any> = {};
    
    for (const [stepId, result] of stepResults) {
      const step = operation.steps.find(s => s.id === stepId);
      if (step && result.output) {
        outputs[step.name] = result.output;
      }
    }

    return outputs;
  }

  private calculateMetrics(workflow: WorkflowInstance): OperationMetrics {
    const duration = workflow.endTime 
      ? workflow.endTime - workflow.startTime
      : Date.now() - workflow.startTime;

    let totalStepTime = 0;
    let resourceUsage: any = {};

    for (const result of workflow.stepResults.values()) {
      if (result.metrics) {
        totalStepTime += result.metrics.executionTime || 0;
        if (result.metrics.resourceUsage) {
          // Aggregate resource usage
          Object.assign(resourceUsage, result.metrics.resourceUsage);
        }
      }
    }

    return {
      executionTime: duration,
      totalExecutionTime: duration,
      stepExecutionTime: totalStepTime,
      resourceUsage,
      stepMetrics: [],
      throughput: 0,
      errorRate: 0
    };
  }

  private setupEventListeners(): void {
    // Listen to step execution events
    this.stepExecutionManager.on('step:started', (event) => {
      logger.debug('Step started', event);
    });

    this.stepExecutionManager.on('step:completed', (event) => {
      logger.debug('Step completed', event);
    });

    this.stepExecutionManager.on('step:failed', (event) => {
      logger.error('Step failed', event);
    });

    this.stepExecutionManager.on('step:timeout', (event) => {
      logger.error('Step timeout', event);
    });
  }

  public async pauseWorkflow(workflowId: string): Promise<void> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    workflow.status = OperationStatus.PAUSED;
    await this.updateWorkflowState(workflow);
    this.clearWorkflowTimeout(workflowId);
  }

  public async resumeWorkflow(workflowId: string, checkpointId?: string): Promise<void> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (checkpointId) {
      // Restore from checkpoint
      const checkpoint = await this.stateManagerService.loadCheckpoint(workflow.operationId, checkpointId);
      if (checkpoint) {
        workflow.completedSteps = checkpoint.data.operationState.completedSteps || [];
        workflow.executionContext = checkpoint.data.operationState.variables || {};
      }
    }

    workflow.status = OperationStatus.RUNNING;
    await this.updateWorkflowState(workflow);
  }

  public cleanup(): void {
    // Clear all timeouts
    for (const timeout of this.workflowTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.workflowTimeouts.clear();
    this.activeWorkflows.clear();
    this.stepExecutionManager.cleanup();
  }
}