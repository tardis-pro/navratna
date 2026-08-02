/**
 * Refactored Orchestration Engine
 * Coordinates workflow execution using modular components
 */

import { EventEmitter } from 'events';
import {
  Operation,
  OperationType,
  OperationStatus,
  OperationError,
  EventMessage,
} from '@uaip/types';
import type { EventBusMessage } from '@uaip/types';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/event_bus';
import {
  StateManagerService,
  ResourceManagerService,
  StepExecutorService,
  CompensationService,
  OperationManagementService,
} from '@uaip/shared-services';

import { OperationValidator } from './engine/operation_validator.js';
import { StepExecutionManager } from './engine/step_execution_manager.js';
import { WorkflowOrchestrator } from './engine/workflow_orchestrator.js';
import {
  SetupProjectWorkspaceInput,
  SetupProjectWorkspaceWorkflow,
} from './workflows/setup_project_workspace_workflow.js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isEventMessage(v: unknown): v is EventMessage {
  return isRecord(v);
}

function isSetupProjectWorkspaceInput(v: unknown): v is SetupProjectWorkspaceInput {
  return isRecord(v) && typeof v['projectId'] === 'string' && typeof v['userId'] === 'string';
}

interface OperationCommandSubscription {
  eventType: string;
  handler: (event: EventBusMessage) => Promise<void>;
}

export class OrchestrationEngine extends EventEmitter {
  private validator: OperationValidator;
  private stepExecutionManager: StepExecutionManager;
  private workflowOrchestrator: WorkflowOrchestrator;
  private setupProjectWorkspaceWorkflow: SetupProjectWorkspaceWorkflow;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private commandSubscriptions: OperationCommandSubscription[] = [];

  constructor(
    private databaseService: DatabaseService,
    private eventBusService: EventBusService,
    private stateManagerService: StateManagerService,
    private resourceManagerService: ResourceManagerService,
    private stepExecutorService: StepExecutorService,
    private compensationService: CompensationService,
    private operationManagementService: OperationManagementService
  ) {
    super();

    // Initialize components
    this.validator = new OperationValidator();
    this.stepExecutionManager = new StepExecutionManager(
      stepExecutorService,
      resourceManagerService
    );
    this.workflowOrchestrator = new WorkflowOrchestrator(
      stateManagerService,
      eventBusService,
      this.stepExecutionManager
    );

    this.setupProjectWorkspaceWorkflow = new SetupProjectWorkspaceWorkflow(eventBusService);

    // Set up event listeners
    this.setupEventListeners();

    // Set up cleanup tasks
    this.setupCleanupTasks();
  }

  /**
   * Execute an operation with full orchestration
   */
  private buildOperationInsert(operation: Operation) {
    if (!operation.id) throw new OperationError('Operation ID is required', 'VALIDATION_ERROR');
    if (!operation.type) throw new OperationError('Operation type is required', 'VALIDATION_ERROR');
    if (!operation.status) throw new OperationError('Operation status is required', 'VALIDATION_ERROR');
    if (!operation.agentId) throw new OperationError('Agent ID is required', 'VALIDATION_ERROR');
    if (!operation.userId) throw new OperationError('User ID is required', 'VALIDATION_ERROR');
    if (!operation.executionPlan) throw new OperationError('Operation execution plan is required', 'VALIDATION_ERROR');

    return {
      id: operation.id,
      type: String(operation.type),
      status: operation.status,
      priority: operation.priority,
      agentId: operation.agentId,
      userId: operation.userId,
      name: operation.plan?.description ?? '',
      description: operation.plan?.description,
      executionPlan: operation.executionPlan,
      context: operation.context,
      result: operation.results,
      error: operation.error,
      startedAt: operation.startedAt,
      completedAt: operation.completedAt,
      estimatedDuration: operation.estimatedDuration,
      progress: operation.progress?.percentage != null ? operation.progress.percentage.toString() : undefined,
      currentStep: operation.currentStep,
      totalSteps: operation.progress?.totalSteps,
      dependencies: operation.plan?.dependencies ?? [],
      metadata: operation.metadata,
      timeoutDuration: operation.timeout,
      tags: operation.metadata?.tags ?? [],
    }
  }

  public async executeOperation(operation: Operation): Promise<string> {
    const startTime = Date.now();

    try {
      logger.info('Starting operation execution', {
        operationId: operation.id,
        type: operation.type,
        agentId: operation.agentId,
        priority: operation.metadata?.priority,
      });

      if (operation.type === OperationType.SETUP_PROJECT_WORKSPACE) {
        return await this.executeSetupProjectWorkspaceOperation(operation, startTime);
      }

      // Validate operation
      await this.validator.validateOperation(operation);

      // Persist operation to database
      const savedOperation = await this.operationManagementService.createOperation(
        this.buildOperationInsert(operation)
      );
      logger.info('Operation persisted to database', { operationId: savedOperation.id });

      // Create workflow instance ID
      const workflowInstanceId = `wf-${savedOperation.id}-${Date.now()}`;

      // The orchestrator's very first act is updateOperationState, which refuses to
      // write a state it never saw created. Seed it here or every execution dies on
      // "Operation state not found".
      await this.stateManagerService.initializeOperationState(savedOperation.id, {
        operationId: savedOperation.id,
        workflowInstanceId,
        status: OperationStatus.RUNNING,
        completedSteps: [],
        failedSteps: [],
        variables: operation.context ?? {},
        checkpoints: [],
        startedAt: new Date(),
        lastUpdated: new Date(),
      });

      // Emit operation started event
      await this.eventBusService.publish('operation.started', {
        operationId: savedOperation.id,
        workflowInstanceId,
        type: operation.type,
        agentId: operation.agentId,
        timestamp: new Date(),
      });

      // Execute workflow
      const result = await this.workflowOrchestrator.orchestrateWorkflow(operation, workflowInstanceId);

      // Update operation status
      await this.operationManagementService.updateOperation(savedOperation.id, {
        status: OperationStatus.COMPLETED,
        result,
        completedAt: new Date(),
      });

      // Emit operation completed event
      await this.eventBusService.publish('operation.completed', {
        operationId: savedOperation.id,
        workflowInstanceId,
        result,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      });

      logger.info('Operation completed successfully', {
        operationId: savedOperation.id,
        workflowInstanceId,
        duration: Date.now() - startTime,
      });

      return workflowInstanceId;
    } catch (error) {
      logger.error('Operation execution failed', {
        operationId: operation.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Emit operation failed event
      await this.eventBusService.publish('operation.failed', {
        operationId: operation.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });

      throw error;
    }
  }

  private async executeSetupProjectWorkspaceOperation(
    operation: Operation,
    startTime: number
  ): Promise<string> {
    const input = this.extractSetupProjectWorkspaceInput(operation);

    const savedOperation = await this.operationManagementService.createOperation(
      this.buildOperationInsert(operation)
    );
    logger.info('Operation persisted to database', { operationId: savedOperation.id });

    const workflowInstanceId = `wf-${savedOperation.id}-${Date.now()}`;

    await this.eventBusService.publish('operation.started', {
      operationId: savedOperation.id,
      workflowInstanceId,
      type: operation.type,
      agentId: operation.agentId,
      timestamp: new Date(),
    });

    const result = await this.setupProjectWorkspaceWorkflow.execute(input);

    const terminalStatus =
      result.status === 'failed' ? OperationStatus.FAILED : OperationStatus.COMPLETED;
    const update: Record<string, unknown> = {
      status: terminalStatus,
      result,
      completedAt: new Date(),
    };
    if (terminalStatus === OperationStatus.FAILED) {
      update.error = 'Workspace setup failed';
    }

    await this.operationManagementService.updateOperation(savedOperation.id, update);

    if (terminalStatus === OperationStatus.FAILED) {
      await this.eventBusService.publish('operation.failed', {
        operationId: savedOperation.id,
        error: 'Workspace setup failed',
        timestamp: new Date(),
      });
      throw new OperationError('Workspace setup failed', 'WORKSPACE_SETUP_FAILED');
    }

    await this.eventBusService.publish('operation.completed', {
      operationId: savedOperation.id,
      workflowInstanceId,
      result,
      duration: Date.now() - startTime,
      timestamp: new Date(),
    });

    logger.info('SETUP_PROJECT_WORKSPACE operation completed', {
      operationId: savedOperation.id,
      workflowInstanceId,
      duration: Date.now() - startTime,
    });

    return workflowInstanceId;
  }

  private extractSetupProjectWorkspaceInput(operation: Operation): SetupProjectWorkspaceInput {
    const operationRecord = operation as unknown as Record<string, unknown>;
    const fromTopLevel = operationRecord['workspaceSetupInput'];
    if (isSetupProjectWorkspaceInput(fromTopLevel)) return fromTopLevel;

    const ctx = operation.context;
    const fromContext = isRecord(ctx) ? (ctx as unknown as Record<string, unknown>)['workspaceSetupInput'] : undefined;
    if (isSetupProjectWorkspaceInput(fromContext)) return fromContext;

    throw new OperationError('Missing workspace setup input', 'VALIDATION_ERROR');
  }

  /**
   * Get operation status
   */
  public async getOperationStatus(operationId: string): Promise<Record<string, unknown>> {
    try {
      const operation = await this.operationManagementService.getOperation(operationId);
      if (!operation) {
        throw new OperationError('Operation not found', 'NOT_FOUND');
      }

      const state = await this.stateManagerService.getState(operationId);

      return {
        operationId,
        status: operation.status,
        type: operation.type,
        agentId: operation.agentId,
        createdAt: operation.createdAt,
        completedAt: operation.completedAt,
        currentStep: state?.currentStep,
        completedSteps: state?.completedSteps || [],
        error: state?.error,
        result: operation.result,
      };
    } catch (error) {
      logger.error('Failed to get operation status', {
        operationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Pause an operation
   */
  public async pauseOperation(operationId: string, reason?: string): Promise<void> {
    try {
      logger.info('Pausing operation', { operationId, reason });

      const operation = await this.operationManagementService.getOperation(operationId);
      if (!operation) {
        throw new OperationError('Operation not found', 'NOT_FOUND');
      }

      if (operation.status !== OperationStatus.RUNNING) {
        throw new OperationError(
          `Cannot pause operation in ${operation.status} status`,
          'INVALID_STATUS'
        );
      }

      // Find active workflow
      const state = await this.stateManagerService.getState(operationId);
      if (state?.workflowInstanceId) {
        await this.workflowOrchestrator.pauseWorkflow(state.workflowInstanceId);
      }

      // Update operation status
      await this.operationManagementService.updateOperation(operationId, {
        status: OperationStatus.PAUSED,
        metadata: { ...operation.metadata, pauseReason: reason },
      });

      // Emit paused event
      await this.eventBusService.publish('operation.paused', {
        operationId,
        reason,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Failed to pause operation', {
        operationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Resume a paused operation
   */
  public async resumeOperation(operationId: string, checkpointId?: string): Promise<void> {
    try {
      logger.info('Resuming operation', { operationId, checkpointId });

      const operation = await this.operationManagementService.getOperation(operationId);
      if (!operation) {
        throw new OperationError('Operation not found', 'NOT_FOUND');
      }

      if (operation.status !== OperationStatus.PAUSED) {
        throw new OperationError(
          `Cannot resume operation in ${operation.status} status`,
          'INVALID_STATUS'
        );
      }

      // Find workflow instance
      const state = await this.stateManagerService.getState(operationId);
      if (state?.workflowInstanceId) {
        await this.workflowOrchestrator.resumeWorkflow(state.workflowInstanceId, checkpointId);
      }

      // Update operation status
      await this.operationManagementService.updateOperation(operationId, {
        status: OperationStatus.RUNNING,
      });

      // Emit resumed event
      await this.eventBusService.publish('operation.resumed', {
        operationId,
        checkpointId,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Failed to resume operation', {
        operationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Cancel an operation with optional compensation
   */
  public async cancelOperation(
    operationId: string,
    reason: string,
    compensate: boolean = true,
    force: boolean = false
  ): Promise<void> {
    try {
      logger.info('Cancelling operation', {
        operationId,
        reason,
        compensate,
        force,
      });

      const operation = await this.operationManagementService.getOperation(operationId);
      if (!operation) {
        throw new OperationError('Operation not found', 'NOT_FOUND');
      }

      // Check if operation can be cancelled
      if (
        !force &&
        [OperationStatus.COMPLETED, OperationStatus.FAILED].includes(operation.status)
      ) {
        throw new OperationError(
          `Cannot cancel operation in ${operation.status} status`,
          'INVALID_STATUS'
        );
      }

      // Run compensation if requested
      if (compensate && operation.status === OperationStatus.RUNNING) {
        const state = await this.stateManagerService.getState(operationId);
        if (state?.completedSteps && state.completedSteps.length > 0) {
          await this.compensationService.compensate(operationId, state.completedSteps);
        }
      }

      // Update operation status
      await this.operationManagementService.updateOperation(operationId, {
        status: OperationStatus.CANCELLED,
        metadata: { ...operation.metadata, cancelReason: reason },
        completedAt: new Date(),
      });

      // Emit cancelled event
      await this.eventBusService.publish('operation.cancelled', {
        operationId,
        reason,
        compensated: compensate,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Failed to cancel operation', {
        operationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen to workflow events
    this.workflowOrchestrator.on('workflow:timeout', async (event) => {
      logger.error('Workflow timeout', event);
      await this.handleWorkflowTimeout(event);
    });

    // Listen to step execution events
    this.stepExecutionManager.on('step:failed', async (event) => {
      logger.error('Step execution failed', event);
      await this.handleStepFailure(event);
    });

  }

  /**
   * Subscribes the operation command consumers. Kept out of the constructor so the
   * caller can await it — an unawaited subscribe inside a constructor surfaces as an
   * unhandled rejection and leaves the engine silently deaf to pause/resume/cancel.
   */
  public async initialize(): Promise<void> {
    if (this.commandSubscriptions.length > 0) return;

    const subscriptions: OperationCommandSubscription[] = [
      {
        eventType: 'operation.command.pause',
        handler: async (event: EventBusMessage) => {
          if (!isEventMessage(event.data)) return;
          await this.pauseOperation(event.data.operationId!, event.data.reason);
        },
      },
      {
        eventType: 'operation.command.resume',
        handler: async (event: EventBusMessage) => {
          if (!isEventMessage(event.data)) return;
          await this.resumeOperation(event.data.operationId!, event.data.checkpointId);
        },
      },
      {
        eventType: 'operation.command.cancel',
        handler: async (event: EventBusMessage) => {
          if (!isEventMessage(event.data)) return;
          await this.cancelOperation(
            event.data.operationId!,
            event.data.reason ?? '',
            typeof event.data.compensate === 'boolean' ? event.data.compensate : false,
            typeof event.data.force === 'boolean' ? event.data.force : false
          );
        },
      },
    ];

    for (const subscription of subscriptions) {
      // oxlint-disable-next-line no-await-in-loop -- subscriptions must register in order
      await this.eventBusService.subscribe(subscription.eventType, subscription.handler);
      this.commandSubscriptions.push(subscription);
    }

    logger.info('Orchestration engine subscribed to operation commands', {
      eventTypes: subscriptions.map((s) => s.eventType),
    });
  }

  /**
   * Handle workflow timeout
   */
  private async handleWorkflowTimeout(event: { operationId: string }): Promise<void> {
    await this.cancelOperation(event.operationId, 'Workflow timeout exceeded', true, true);
  }

  /**
   * Handle step failure
   */
  private async handleStepFailure(event: {
    operationId: string;
    stepId: string;
    error: string;
  }): Promise<void> {
    // Log failure details
    logger.error('Step failure details', {
      operationId: event.operationId,
      stepId: event.stepId,
      error: event.error,
    });

    // Could trigger compensation or retry logic here
  }

  /**
   * Set up cleanup tasks
   */
  private setupCleanupTasks(): void {
    // Clean up stale operations periodically
    this.cleanupInterval = setInterval(async () => {
      if (this.isShuttingDown) return;

      try {
        await this.cleanupStaleOperations();
      } catch (error) {
        logger.error('Cleanup task failed', error);
      }
    }, config.orchestration?.cleanupIntervalMs || 300000); // 5 minutes
  }

  /**
   * Clean up stale operations
   */
  private async cleanupStaleOperations(): Promise<void> {
    const staleThreshold =
      Date.now() - (config.orchestration?.staleOperationThresholdMs || 86400000); // 24 hours

    const staleOperations = await this.operationManagementService.findStaleOperations(
      new Date(staleThreshold)
    );

    for (const operation of staleOperations) {
      if (!operation.id) continue;
      logger.warn('Cleaning up stale operation', { operationId: operation.id });
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      await this.cancelOperation(operation.id, 'Operation stale - automatic cleanup', false, true);
    }
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down orchestration engine');
    this.isShuttingDown = true;

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    for (const subscription of this.commandSubscriptions) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- unsubscribes must complete before teardown continues
        await this.eventBusService.unsubscribe(subscription.eventType, subscription.handler);
      } catch (error) {
        logger.warn('Failed to unsubscribe operation command consumer', {
          eventType: subscription.eventType,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.commandSubscriptions = [];

    // Clean up components
    this.workflowOrchestrator.cleanup();

    // Remove all listeners
    this.removeAllListeners();

    logger.info('Orchestration engine shutdown complete');
  }
}
