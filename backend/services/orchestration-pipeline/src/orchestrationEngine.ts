import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  Operation,
  OperationStatus,
  ExecutionStep,
  StepStatus,
  StepResult,
  OperationResult,
  WorkflowInstance,
  OperationState,
  OperationEvent,
  OperationEventType,
  Checkpoint,
  CheckpointType,
  CompensationAction,
  ParallelExecutionPolicy,
  FailurePolicy,
  OperationError,
  OperationMetrics,
  ResourceUsage,
  StepMetrics
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { 
  DatabaseService,
  EventBusService,
  StateManagerService,
  ResourceManagerService,
  StepExecutorService,
  CompensationService
} from '@uaip/shared-services';

export class OrchestrationEngine extends EventEmitter {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private stateManagerService: StateManagerService;
  private resourceManagerService: ResourceManagerService;
  private stepExecutorService: StepExecutorService;
  private compensationService: CompensationService;
  private activeOperations = new Map<string, WorkflowInstance>();
  private operationTimeouts = new Map<string, NodeJS.Timeout>();
  private stepTimeouts = new Map<string, NodeJS.Timeout>();
  private isShuttingDown = false;

  constructor(
    databaseService: DatabaseService,
    eventBusService: EventBusService,
    stateManagerService: StateManagerService,
    resourceManagerService: ResourceManagerService,
    stepExecutorService: StepExecutorService,
    compensationService: CompensationService
  ) {
    super();
    this.databaseService = databaseService;
    this.eventBusService = eventBusService;
    this.stateManagerService = stateManagerService;
    this.resourceManagerService = resourceManagerService;
    this.stepExecutorService = stepExecutorService;
    this.compensationService = compensationService;

    // Set up event listeners
    this.setupEventListeners();
    
    // Set up cleanup intervals
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
        priority: operation.metadata?.priority
      });

      // Validate operation
      await this.validateOperation(operation);

      // Check resource availability
      const resourceCheck = await this.resourceManagerService.checkResourceAvailability(
        operation.context.executionContext.resourceLimits
      );
      
      if (!resourceCheck.available) {
        throw new Error(`Insufficient resources: ${resourceCheck.reason}`);
      }

      // Allocate resources
      const resourceAllocation = await this.resourceManagerService.allocateResources(
        operation.id,
        operation.context.executionContext.resourceLimits
      );

      // Create workflow instance
      const workflowInstance = await this.createWorkflowInstance(operation);
      this.activeOperations.set(operation.id, workflowInstance);

      // Set operation timeout
      this.setOperationTimeout(operation);

      // Start execution
      await this.startOperationExecution(workflowInstance);

      logger.info('Operation queued for execution', {
        operationId: operation.id,
        workflowInstanceId: workflowInstance.id,
        estimatedDuration: operation.estimatedDuration
      });

      return workflowInstance.id;

    } catch (error) {
      logger.error('Failed to execute operation', {
        operationId: operation.id,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      });

      await this.handleOperationFailure(operation.id, error);
      throw error;
    }
  }

  /**
   * Pause an operation
   */
  public async pauseOperation(operationId: string, reason?: string): Promise<void> {
    try {
      const workflowInstance = this.activeOperations.get(operationId);
      if (!workflowInstance) {
        throw new Error(`Operation ${operationId} not found or not active`);
      }

      logger.info('Pausing operation', { operationId, reason });

      // Create checkpoint before pausing
      await this.createCheckpoint(operationId, CheckpointType.STATE_SNAPSHOT);

      // Update status
      workflowInstance.status = OperationStatus.PAUSED;
      await this.stateManagerService.updateOperationState(operationId, {
        status: OperationStatus.PAUSED,
        metadata: { pauseReason: reason, pausedAt: new Date() }
      });

      // Clear timeouts
      this.clearOperationTimeout(operationId);

      // Emit event
      await this.emitOperationEvent(operationId, OperationEventType.OPERATION_PAUSED, {
        reason,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Failed to pause operation', { operationId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Resume a paused operation
   */
  public async resumeOperation(operationId: string, checkpointId?: string): Promise<void> {
    try {
      const workflowInstance = this.activeOperations.get(operationId);
      if (!workflowInstance) {
        throw new Error(`Operation ${operationId} not found`);
      }

      if (workflowInstance.status !== OperationStatus.PAUSED) {
        throw new Error(`Operation ${operationId} is not paused`);
      }

      logger.info('Resuming operation', { operationId, checkpointId });

      // Restore from checkpoint if specified
      if (checkpointId) {
        await this.restoreFromCheckpoint(operationId, checkpointId);
      }

      // Update status
      workflowInstance.status = OperationStatus.RUNNING;
      await this.stateManagerService.updateOperationState(operationId, {
        status: OperationStatus.RUNNING,
        metadata: { resumedAt: new Date() }
      });

      // Resume execution
      await this.continueOperationExecution(workflowInstance);

      // Emit event
      await this.emitOperationEvent(operationId, OperationEventType.OPERATION_RESUMED, {
        checkpointId,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Failed to resume operation', { operationId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Cancel an operation
   */
  public async cancelOperation(
    operationId: string, 
    reason: string, 
    compensate: boolean = true,
    force: boolean = false
  ): Promise<void> {
    try {
      const workflowInstance = this.activeOperations.get(operationId);
      if (!workflowInstance) {
        throw new Error(`Operation ${operationId} not found or not active`);
      }

      logger.info('Cancelling operation', { operationId, reason, compensate, force });

      // Clear timeouts
      this.clearOperationTimeout(operationId);

      // Stop current step execution if force is true
      if (force) {
        await this.stepExecutorService.forceStopStep(operationId);
      }

      // Update status
      workflowInstance.status = OperationStatus.CANCELLED;
      await this.stateManagerService.updateOperationState(operationId, {
        status: OperationStatus.CANCELLED,
        metadata: { 
          cancelReason: reason, 
          cancelledAt: new Date(),
          compensationRequested: compensate 
        }
      });

      // Run compensation if requested
      if (compensate) {
        await this.runCompensation(workflowInstance, reason);
      }

      // Clean up resources
      await this.resourceManagerService.releaseResources(operationId);

      // Remove from active operations
      this.activeOperations.delete(operationId);

      // Emit event
      await this.emitOperationEvent(operationId, OperationEventType.OPERATION_FAILED, {
        reason: `Cancelled: ${reason}`,
        compensated: compensate,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Failed to cancel operation', { operationId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get operation status and progress
   */
  public async getOperationStatus(operationId: string): Promise<{
    operation: Operation;
    status: OperationStatus;
    progress: {
      currentStep?: string;
      completedSteps: number;
      totalSteps: number;
      percentage: number;
    };
    metrics: OperationMetrics;
    errors: OperationError[];
  }> {
    try {
      const operation = await this.databaseService.getOperation(operationId);
      if (!operation) {
        throw new Error(`Operation ${operationId} not found`);
      }

      const state = await this.stateManagerService.getOperationState(operationId);
      const workflowInstance = this.activeOperations.get(operationId);

      const totalSteps = operation.executionPlan.steps.length;
      const completedSteps = state?.completedSteps.length || 0;
      const percentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

      const metrics = await this.calculateOperationMetrics(operationId);
      const errors = await this.getOperationErrors(operationId);

      return {
        operation,
        status: workflowInstance?.status || operation.status,
        progress: {
          currentStep: state?.currentStep,
          completedSteps,
          totalSteps,
          percentage
        },
        metrics,
        errors
      };

    } catch (error) {
      logger.error('Failed to get operation status', { operationId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Create a checkpoint for an operation
   */
  public async createCheckpoint(
    operationId: string,
    type: CheckpointType,
    stepId?: string
  ): Promise<string> {
    try {
      const state = await this.stateManagerService.getOperationState(operationId);
      if (!state) {
        throw new Error(`Operation state not found for ${operationId}`);
      }

      const checkpoint: Checkpoint = {
        id: uuidv4(),
        stepId: stepId || state.currentStep || '',
        type,
        data: {
          operationState: state,
          timestamp: new Date(),
          version: '1.0'
        },
        timestamp: new Date()
      };

      await this.stateManagerService.saveCheckpoint(operationId, checkpoint);

      logger.info('Checkpoint created', {
        operationId,
        checkpointId: checkpoint.id,
        type,
        stepId
      });

      // Emit event
      await this.emitOperationEvent(operationId, OperationEventType.CHECKPOINT_CREATED, {
        checkpointId: checkpoint.id,
        type,
        stepId
      });

      return checkpoint.id;

    } catch (error) {
      logger.error('Failed to create checkpoint', { operationId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Private Methods
   */

  private async validateOperation(operation: Operation): Promise<void> {
    // Validate execution plan
    if (!operation.executionPlan.steps || operation.executionPlan.steps.length === 0) {
      throw new Error('Operation execution plan must contain at least one step');
    }

    // Validate step dependencies
    const stepIds = new Set(operation.executionPlan.steps.map((step: any) => step.id));
    for (const dependency of operation.executionPlan.dependencies) {
      if (typeof dependency === 'string') {
        // Simple string dependency format
        if (!stepIds.has(dependency)) {
          throw new Error(`Step dependency references unknown step: ${dependency}`);
        }
      } else if (dependency && typeof dependency === 'object') {
        // Object dependency format
        const stepId = (dependency as any).stepId;
        const dependsOn = (dependency as any).dependsOn || [];
        
        if (!stepIds.has(stepId)) {
          throw new Error(`Step dependency references unknown step: ${stepId}`);
        }
        for (const depId of dependsOn) {
          if (!stepIds.has(depId)) {
            throw new Error(`Step dependency references unknown dependency: ${depId}`);
          }
        }
      }
    }

    // Validate resource limits
    const limits = operation.context.executionContext.resourceLimits;
    if (limits.maxMemory <= 0 || limits.maxCpu <= 0 || limits.maxDuration <= 0) {
      throw new Error('Resource limits must be positive values');
    }

    // Validate timeouts
    const executionConfig = config.getExecutionConfig();
    if (operation.context.executionContext.timeout > executionConfig.operationTimeoutMax) {
      throw new Error(`Operation timeout exceeds maximum allowed: ${executionConfig.operationTimeoutMax}ms`);
    }
  }

  private async createWorkflowInstance(operation: Operation): Promise<WorkflowInstance> {
    const workflowInstance: WorkflowInstance = {
      id: uuidv4(),
      operationId: operation.id,
      status: OperationStatus.QUEUED,
      currentStepIndex: 0,
      executionContext: operation.context.executionContext,
      state: {
        operationId: operation.id,
        completedSteps: [],
        failedSteps: [],
        variables: {},
        checkpoints: [],
        lastUpdated: new Date()
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Save to database
    await this.databaseService.createWorkflowInstance(workflowInstance);
    
    // Initialize state
    await this.stateManagerService.initializeOperationState(operation.id, workflowInstance.state);

    return workflowInstance;
  }

  private async startOperationExecution(workflowInstance: WorkflowInstance): Promise<void> {
    try {
      // Update status to running
      workflowInstance.status = OperationStatus.RUNNING;
      workflowInstance.updatedAt = new Date();

      await this.stateManagerService.updateOperationState(workflowInstance.operationId, {
        status: OperationStatus.RUNNING,
        startedAt: new Date()
      });

      // Emit operation started event
      await this.emitOperationEvent(
        workflowInstance.operationId,
        OperationEventType.OPERATION_STARTED,
        { workflowInstanceId: workflowInstance.id }
      );

      // Start executing steps
      await this.continueOperationExecution(workflowInstance);

    } catch (error) {
      logger.error('Failed to start operation execution', {
        operationId: workflowInstance.operationId,
        error: error instanceof Error ? error.message : String(error)
      });
      await this.handleOperationFailure(workflowInstance.operationId, error);
    }
  }

  private async continueOperationExecution(workflowInstance: WorkflowInstance): Promise<void> {
    try {
      const operation = await this.databaseService.getOperation(workflowInstance.operationId);
      if (!operation) {
        throw new Error(`Operation ${workflowInstance.operationId} not found`);
      }

      const nextSteps = await this.getNextExecutableSteps(operation, workflowInstance);
      
      if (nextSteps.length === 0) {
        // No more steps to execute - check if operation is complete
        await this.checkOperationCompletion(workflowInstance);
        return;
      }

      // Execute next steps
      await this.executeSteps(operation, workflowInstance, nextSteps);

    } catch (error) {
      logger.error('Failed to continue operation execution', {
        operationId: workflowInstance.operationId,
        error: error instanceof Error ? error.message : String(error)
      });
      await this.handleOperationFailure(workflowInstance.operationId, error);
    }
  }

  private async getNextExecutableSteps(
    operation: Operation,
    workflowInstance: WorkflowInstance
  ): Promise<any[]> {
    const { steps, dependencies } = operation.executionPlan;
    const parallelGroups = (operation.executionPlan as any).parallelGroups || [];
    const { completedSteps, failedSteps } = workflowInstance.state;
    
    const executableSteps: any[] = [];
    const completedStepIds = new Set(completedSteps);
    const failedStepIds = new Set(failedSteps);

    // Find steps that can be executed
    for (const step of steps) {
      // Skip if already completed or failed
      if (completedStepIds.has(step.id) || failedStepIds.has(step.id)) {
        continue;
      }

      // Check if all dependencies are satisfied
      const stepDependencies = dependencies.filter((dep: any) => {
        if (typeof dep === 'string') return false;
        return dep.stepId === step.id;
      });
      const canExecute = stepDependencies.every((dep: any) =>
        dep.dependsOn.every((depId: string) => completedStepIds.has(depId))
      );

      if (canExecute) {
        // Check step condition if present
        const stepCondition = (step as any).condition;
        if (stepCondition) {
          const conditionResult = await this.evaluateStepCondition(stepCondition, workflowInstance.state.variables);
          if (!conditionResult) {
            continue;
          }
        }

        executableSteps.push(step);
      }
    }

    // Handle parallel groups
    const filteredSteps = this.filterStepsForParallelExecution(executableSteps, parallelGroups);
    
    return filteredSteps;
  }

  private async executeSteps(
    operation: Operation,
    workflowInstance: WorkflowInstance,
    steps: any[]
  ): Promise<void> {
    const parallelGroups = (operation.executionPlan as any).parallelGroups || [];
    
    // Group steps by parallel execution requirements
    const stepGroups = this.groupStepsForExecution(steps, parallelGroups);
    
    for (const stepGroup of stepGroups) {
      if (stepGroup.length === 1) {
        // Execute single step
        await this.executeSingleStep(operation, workflowInstance, stepGroup[0]);
      } else {
        // Execute steps in parallel
        await this.executeStepsInParallel(operation, workflowInstance, stepGroup);
      }
    }
  }

  private async executeSingleStep(
    operation: Operation,
    workflowInstance: WorkflowInstance,
    step: any
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('Executing step', {
        operationId: workflowInstance.operationId,
        stepId: step.id,
        stepName: step.name,
        stepType: step.type
      });

      // Update current step
      workflowInstance.state.currentStep = step.id;
      await this.stateManagerService.updateOperationState(workflowInstance.operationId, {
        currentStep: step.id
      });

      // Set step timeout
      this.setStepTimeout(workflowInstance.operationId, step);

      // Emit step started event
      await this.emitOperationEvent(
        workflowInstance.operationId,
        OperationEventType.STEP_STARTED,
        { stepId: step.id, stepName: step.name }
      );

      // Execute the step
      const stepResult = await this.stepExecutorService.executeStep(
        step,
        workflowInstance.state.variables,
        operation.context
      );

      // Clear step timeout
      this.clearStepTimeout(workflowInstance.operationId, step.id);

      // Process step result
      await this.processStepResult(workflowInstance, step, stepResult, startTime);

      // Create progress checkpoint
      if (step.type !== 'delay') {
        await this.createCheckpoint(
          workflowInstance.operationId,
          CheckpointType.PROGRESS_MARKER,
          step.id
        );
      }

      // Continue execution
      await this.continueOperationExecution(workflowInstance);

    } catch (error) {
      // Clear step timeout
      this.clearStepTimeout(workflowInstance.operationId, step.id);

      await this.handleStepFailure(workflowInstance, step, error, startTime);
    }
  }

  private async executeStepsInParallel(
    operation: Operation,
    workflowInstance: WorkflowInstance,
    steps: any[]
  ): Promise<void> {
    logger.info('Executing steps in parallel', {
      operationId: workflowInstance.operationId,
      stepCount: steps.length,
      stepIds: steps.map(s => s.id)
    });

    const parallelGroups = (operation.executionPlan as any).parallelGroups || [];
    const parallelGroup = parallelGroups.find((group: any) =>
      steps.every(step => group.stepIds.includes(step.id))
    );

    if (!parallelGroup) {
      throw new Error('Parallel group configuration not found for steps');
    }

    const stepPromises = steps.map(step =>
      this.executeSingleStep(operation, workflowInstance, step).catch(error => ({
        stepId: step.id,
        error
      }))
    );

    const results = await Promise.allSettled(stepPromises);
    
    // Process parallel execution results based on policy
    await this.processParallelExecutionResults(
      workflowInstance,
      steps,
      results,
      parallelGroup
    );
  }

  private async processStepResult(
    workflowInstance: WorkflowInstance,
    step: any,
    result: StepResult,
    startTime: number
  ): Promise<void> {
    const duration = Date.now() - startTime;

    // Update step result in database
    await this.databaseService.saveStepResult(workflowInstance.operationId, result);

    if (result.status === StepStatus.COMPLETED) {
      // Add to completed steps
      workflowInstance.state.completedSteps.push(step.id);
      
      // Update variables with step output
      if (step.outputMapping) {
        for (const [outputKey, variableName] of Object.entries(step.outputMapping)) {
          if (result.data && typeof result.data === 'object' && outputKey in result.data) {
            workflowInstance.state.variables[variableName as string] = (result.data as any)[outputKey];
          }
        }
      }

      logger.info('Step completed successfully', {
        operationId: workflowInstance.operationId,
        stepId: step.id,
        duration
      });

      // Emit step completed event
      await this.emitOperationEvent(
        workflowInstance.operationId,
        OperationEventType.STEP_COMPLETED,
        { 
          stepId: step.id,
          stepName: step.name,
          duration,
          result: result.data
        }
      );

    } else {
      await this.handleStepFailure(workflowInstance, step, new Error('Step failed'), startTime);
    }

    // Update state
    workflowInstance.state.lastUpdated = new Date();
    await this.stateManagerService.updateOperationState(workflowInstance.operationId, workflowInstance.state);
  }

  private async handleStepFailure(
    workflowInstance: WorkflowInstance,
    step: any,
    error: any,
    startTime: number
  ): Promise<void> {
    const duration = Date.now() - startTime;

    logger.error('Step execution failed', {
      operationId: workflowInstance.operationId,
      stepId: step.id,
      stepName: step.name,
      error: error instanceof Error ? error.message : String(error),
      duration
    });

    // Add to failed steps
    workflowInstance.state.failedSteps.push(step.id);

    // Check retry policy
    const shouldRetry = await this.shouldRetryStep(step, workflowInstance.operationId, error);
    
    if (shouldRetry) {
      logger.info('Retrying step', {
        operationId: workflowInstance.operationId,
        stepId: step.id
      });

      // Remove from failed steps for retry
      workflowInstance.state.failedSteps = workflowInstance.state.failedSteps.filter((id: string) => id !== step.id);
      
      // Schedule retry with backoff
      await this.scheduleStepRetry(workflowInstance, step);
      return;
    }

    // Emit step failed event
    await this.emitOperationEvent(
      workflowInstance.operationId,
      OperationEventType.STEP_FAILED,
      {
        stepId: step.id,
        stepName: step.name,
        error: error instanceof Error ? error.message : String(error),
        duration
      }
    );

    // Check if operation should fail
    const shouldFailOperation = await this.shouldFailOperation(workflowInstance, step);
    
    if (shouldFailOperation) {
      await this.handleOperationFailure(workflowInstance.operationId, error);
    } else {
      // Continue with remaining steps
      await this.continueOperationExecution(workflowInstance);
    }
  }

  private async handleOperationFailure(operationId: string, error: any): Promise<void> {
    try {
      logger.error('Operation failed', { operationId, error: error instanceof Error ? error.message : String(error) });

      const workflowInstance = this.activeOperations.get(operationId);
      if (workflowInstance) {
        workflowInstance.status = OperationStatus.FAILED;
        
        // Run compensation
        await this.runCompensation(workflowInstance, error instanceof Error ? error.message : String(error));
        
        // Clean up resources
        await this.resourceManagerService.releaseResources(operationId);
        
        // Remove from active operations
        this.activeOperations.delete(operationId);
      }

      // Update state
      await this.stateManagerService.updateOperationState(operationId, {
        status: OperationStatus.FAILED,
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error)
      });

      // Clear timeouts
      this.clearOperationTimeout(operationId);

      // Emit event
      await this.emitOperationEvent(operationId, OperationEventType.OPERATION_FAILED, {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      });

    } catch (cleanupError) {
      logger.error('Failed to handle operation failure', {
        operationId,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      });
    }
  }

  private async runCompensation(workflowInstance: WorkflowInstance, reason: string): Promise<void> {
    try {
      logger.info('Running compensation', {
        operationId: workflowInstance.operationId,
        reason
      });

      workflowInstance.status = OperationStatus.COMPENSATING;
      await this.stateManagerService.updateOperationState(workflowInstance.operationId, {
        status: OperationStatus.COMPENSATING
      });

      await this.compensationService.runCompensation(
        workflowInstance.operationId,
        workflowInstance.state.completedSteps,
        reason
      );

    } catch (error) {
      logger.error('Compensation failed', {
        operationId: workflowInstance.operationId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async checkOperationCompletion(workflowInstance: WorkflowInstance): Promise<void> {
    const operation = await this.databaseService.getOperation(workflowInstance.operationId);
    if (!operation) {
      throw new Error(`Operation ${workflowInstance.operationId} not found`);
    }

    const totalSteps = operation.executionPlan.steps.length;
    const completedSteps = workflowInstance.state.completedSteps.length;
    const failedSteps = workflowInstance.state.failedSteps.length;

    if (completedSteps + failedSteps >= totalSteps) {
      // Operation is complete
      workflowInstance.status = OperationStatus.COMPLETED;
      
      // Generate operation result
      const operationResult = await this.generateOperationResult(workflowInstance);
      
      // Update database
      await this.databaseService.updateOperationResult(workflowInstance.operationId, operationResult);
      
      // Update state
      await this.stateManagerService.updateOperationState(workflowInstance.operationId, {
        status: OperationStatus.COMPLETED,
        completedAt: new Date(),
        result: operationResult
      });

      // Clean up resources
      await this.resourceManagerService.releaseResources(workflowInstance.operationId);

      // Remove from active operations
      this.activeOperations.delete(workflowInstance.operationId);

      // Clear timeouts
      this.clearOperationTimeout(workflowInstance.operationId);

      // Emit completion event
      await this.emitOperationEvent(
        workflowInstance.operationId,
        OperationEventType.OPERATION_COMPLETED,
        { result: operationResult }
      );

      logger.info('Operation completed', {
        operationId: workflowInstance.operationId,
        completedSteps,
        failedSteps,
        totalSteps
      });
    }
  }

  private setupEventListeners(): void {
    // Handle graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
  }

  private setupCleanupTasks(): void {
    const executionConfig = config.getExecutionConfig();
    
    // Cleanup orphaned operations
    setInterval(async () => {
      try {
        await this.cleanupOrphanedOperations();
      } catch (error) {
        logger.error('Failed to cleanup orphaned operations', { error: error instanceof Error ? error.message : String(error) });
      }
    }, executionConfig.cleanupOrphanedOperationsInterval);
  }

  private async gracefulShutdown(): Promise<void> {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    logger.info('Graceful shutdown initiated');

    try {
      // Pause all active operations
      for (const [operationId, workflowInstance] of this.activeOperations) {
        try {
          await this.pauseOperation(operationId, 'System shutdown');
        } catch (error) {
          logger.error('Failed to pause operation during shutdown', { operationId, error: error instanceof Error ? error.message : String(error) });
        }
      }

      // Clear all timeouts
      for (const timeout of this.operationTimeouts.values()) {
        clearTimeout(timeout);
      }
      for (const timeout of this.stepTimeouts.values()) {
        clearTimeout(timeout);
      }

      logger.info('Graceful shutdown completed');
    } catch (error) {
      logger.error('Error during graceful shutdown', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Utility methods (continuing with the rest of the implementation...)
  
  private setOperationTimeout(operation: Operation): void {
    const timeout = setTimeout(async () => {
      try {
        await this.cancelOperation(
          operation.id,
          'Operation timeout exceeded',
          true,
          false
        );
      } catch (error) {
        logger.error('Failed to handle operation timeout', {
          operationId: operation.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, operation.context.executionContext.timeout);

    this.operationTimeouts.set(operation.id, timeout);
  }

  private clearOperationTimeout(operationId: string): void {
    const timeout = this.operationTimeouts.get(operationId);
    if (timeout) {
      clearTimeout(timeout);
      this.operationTimeouts.delete(operationId);
    }
  }

  private setStepTimeout(operationId: string, step: any): void {
    const timeoutKey = `${operationId}:${step.id}`;
    const timeout = setTimeout(async () => {
      try {
        await this.stepExecutorService.cancelStep(operationId, step.id, 'Step timeout exceeded');
      } catch (error) {
        logger.error('Failed to handle step timeout', {
          operationId,
          stepId: step.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, step.timeout);

    this.stepTimeouts.set(timeoutKey, timeout);
  }

  private clearStepTimeout(operationId: string, stepId: string): void {
    const timeoutKey = `${operationId}:${stepId}`;
    const timeout = this.stepTimeouts.get(timeoutKey);
    if (timeout) {
      clearTimeout(timeout);
      this.stepTimeouts.delete(timeoutKey);
    }
  }

  private async emitOperationEvent(
    operationId: string,
    eventType: OperationEventType,
    data: any
  ): Promise<void> {
    const event: OperationEvent = {
      operationId,
      eventType,
      data,
      timestamp: new Date(),
      source: 'orchestration-engine'
    };

    await this.eventBusService.publishEvent('operation.event', event);
  }

  // Missing methods that are called but not defined
  private async restoreFromCheckpoint(operationId: string, checkpointId: string): Promise<void> {
    const restoredState = await this.stateManagerService.restoreFromCheckpoint(operationId, checkpointId);
    const workflowInstance = this.activeOperations.get(operationId);
    if (workflowInstance) {
      workflowInstance.state = restoredState;
    }
  }

  private async calculateOperationMetrics(operationId: string): Promise<OperationMetrics> {
    // Basic implementation - in production, this would calculate real metrics
    return {
      executionTime: 0,
      resourceUsage: { cpu: 0, memory: 0, network: 0 },
      stepMetrics: [],
      throughput: 0,
      errorRate: 0
    };
  }

  private async getOperationErrors(operationId: string): Promise<OperationError[]> {
    // Basic implementation - in production, this would fetch real errors
    return [];
  }

  private async evaluateStepCondition(condition: string, variables: Record<string, any>): Promise<boolean> {
    // Simple condition evaluation - in production, use a proper expression evaluator
    try {
      // This is a simplified implementation
      return true;
    } catch (error) {
      logger.warn('Failed to evaluate step condition', { condition, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  private filterStepsForParallelExecution(steps: any[], parallelGroups: any[]): any[] {
    // Simple implementation - in production, implement proper parallel filtering
    return steps;
  }

  private groupStepsForExecution(steps: any[], parallelGroups: any[]): any[][] {
    // Simple implementation - group steps that can run in parallel
    return steps.map(step => [step]);
  }

  private async processParallelExecutionResults(
    workflowInstance: WorkflowInstance,
    steps: any[],
    results: PromiseSettledResult<any>[],
    parallelGroup: any
  ): Promise<void> {
    // Process results from parallel execution
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const step = steps[i];
      
      if (result.status === 'rejected') {
        await this.handleStepFailure(workflowInstance, step, result.reason, Date.now());
      }
    }
  }

  private async shouldRetryStep(step: any, operationId: string, error: any): Promise<boolean> {
    // Simple retry logic - in production, implement sophisticated retry policies
    const retryCount = step.metadata?.retryCount || 0;
    const maxRetries = step.retryPolicy?.maxAttempts || 3;
    return retryCount < maxRetries;
  }

  private async scheduleStepRetry(workflowInstance: WorkflowInstance, step: any): Promise<void> {
    // Schedule step retry with backoff
    const retryCount = step.metadata?.retryCount || 0;
    const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
    
    setTimeout(async () => {
      step.metadata = { ...step.metadata, retryCount: retryCount + 1 };
      await this.executeSingleStep(
        await this.databaseService.getOperation(workflowInstance.operationId),
        workflowInstance,
        step
      );
    }, delay);
  }

  private async shouldFailOperation(workflowInstance: WorkflowInstance, step: any): Promise<boolean> {
    // Determine if operation should fail based on step failure
    return step.required === true;
  }

  private async generateOperationResult(workflowInstance: WorkflowInstance): Promise<OperationResult> {
    return {
      operationId: workflowInstance.operationId,
      status: workflowInstance.status,
      result: workflowInstance.state.variables,
      metrics: await this.calculateOperationMetrics(workflowInstance.operationId),
      completedAt: new Date()
    };
  }

  private async cleanupOrphanedOperations(): Promise<void> {
    // Clean up operations that have been running too long or are orphaned
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    for (const [operationId, workflowInstance] of this.activeOperations) {
      if (workflowInstance.createdAt.getTime() < cutoffTime) {
        logger.warn('Cleaning up orphaned operation', { operationId });
        await this.cancelOperation(operationId, 'Orphaned operation cleanup', false, true);
      }
    }
  }

  // Additional utility methods would continue here...
  // This is a comprehensive foundation for the orchestration engine
} 