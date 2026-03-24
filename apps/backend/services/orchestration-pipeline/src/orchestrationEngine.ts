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
import { EventBusService } from '@uaip/infra/eventBus';
import {
  StateManagerService,
  ResourceManagerService,
  StepExecutorService,
  CompensationService,
  OperationManagementService,
} from '@uaip/shared-services';

import { OperationValidator } from './engine/OperationValidator.js';
import { StepExecutionManager } from './engine/StepExecutionManager.js';
import { WorkflowOrchestrator } from './engine/WorkflowOrchestrator.js';
import {
  SetupProjectWorkspaceInput,
  SetupProjectWorkspaceWorkflow,
} from './workflows/setup-project-workspace.workflow.js';

export class OrchestrationEngine extends EventEmitter {
  private validator: OperationValidator;
  private stepExecutionManager: StepExecutionManager;
  private workflowOrchestrator: WorkflowOrchestrator;
  private setupProjectWorkspaceWorkflow: SetupProjectWorkspaceWorkflow;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

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
      const savedOperation = await this.operationManagementService.createOperation(operation);
      logger.info('Operation persisted to database', { operationId: savedOperation.id });

      // Create workflow instance ID
      const workflowInstanceId = `wf-${savedOperation.id}-${Date.now()}`;

      // Emit operation started event
      await this.eventBusService.publish('operation.started', {
        operationId: savedOperation.id,
        workflowInstanceId,
        type: operation.type,
        agentId: operation.agentId,
        timestamp: new Date(),
      });

      // Execute workflow
      const result = await this.workflowOrchestrator.orchestrateWorkflow(
        savedOperation,
        workflowInstanceId
      );

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

    const savedOperation = await this.operationManagementService.createOperation(operation);
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
    const fromTopLevel = (
      operation as unknown as { workspaceSetupInput?: SetupProjectWorkspaceInput }
    ).workspaceSetupInput;
    if (fromTopLevel) return fromTopLevel;

    const fromContext = (
      operation.context as unknown as {
        workspaceSetupInput?: SetupProjectWorkspaceInput;
      }
    )?.workspaceSetupInput;
    if (fromContext) return fromContext;

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

    // Subscribe to external events
    this.subscribeToExternalEvents();
  }

  /**
   * Subscribe to external events via event bus
   */
  private async subscribeToExternalEvents(): Promise<void> {
    // Subscribe to operation commands
    await this.eventBusService.subscribe(
      'operation.command.pause',
      async (event: EventBusMessage) => {
        const data = event.data as EventMessage;
        await this.pauseOperation(data.operationId!, data.reason);
      }
    );

    await this.eventBusService.subscribe(
      'operation.command.resume',
      async (event: EventBusMessage) => {
        const data = event.data as EventMessage;
        await this.resumeOperation(data.operationId!, data.checkpointId);
      }
    );

    await this.eventBusService.subscribe(
      'operation.command.cancel',
      async (event: EventBusMessage) => {
        const data = event.data as EventMessage;
        await this.cancelOperation(
          data.operationId!,
          data.reason,
          data.compensate as boolean,
          data.force as boolean
        );
      }
    );
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

    // Clean up components
    this.workflowOrchestrator.cleanup();

    // Remove all listeners
    this.removeAllListeners();

    logger.info('Orchestration engine shutdown complete');
  }
}
