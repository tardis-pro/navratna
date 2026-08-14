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
  ApprovalPendingError,
  APPROVAL_DECISIONS_STATE_KEY,
  EventMessage,
} from '@uaip/types';
import type {
  ApprovalDecisionRecord,
  EventBusMessage,
  EventBusSubscriptionOptions,
  ExecutionStep,
  OperationResult,
  OperationState,
} from '@uaip/types';
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

const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
type RiskLevel = (typeof RISK_LEVELS)[number];

function toRiskLevel(value: unknown): RiskLevel | undefined {
  return typeof value === 'string' && (RISK_LEVELS as readonly string[]).includes(value)
    ? (value as RiskLevel)
    : undefined;
}

const APPROVAL_VIA = ['web', 'whatsapp', 'api', 'expiry'] as const;
type ApprovalVia = (typeof APPROVAL_VIA)[number];

function toApprovalVia(value: unknown): ApprovalVia | undefined {
  return typeof value === 'string' && (APPROVAL_VIA as readonly string[]).includes(value)
    ? (value as ApprovalVia)
    : undefined;
}

/** The persisted operations row shape, without re-importing the drizzle schema. */
type PersistedOperation = NonNullable<
  Awaited<ReturnType<OperationManagementService['getOperation']>>
>;

interface OperationCommandSubscription {
  eventType: string;
  handler: (event: EventBusMessage) => Promise<void>;
  options?: EventBusSubscriptionOptions;
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
    let savedOperationId: string;
    let workflowInstanceId: string;

    // Setup phase: everything up to (but not including) the workflow run. A
    // failure here has no workflow to suspend or compensate.
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

      savedOperationId = savedOperation.id;
      // Create workflow instance ID
      workflowInstanceId = `wf-${savedOperation.id}-${Date.now()}`;

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

    return this.runWorkflow(operation, savedOperationId, workflowInstanceId, startTime);
  }

  /**
   * Runs the workflow and applies the terminal bookkeeping. Shared by the first
   * execution and by an approval resume so both agree on what COMPLETED,
   * SUSPENDED and FAILED mean — a workflow may hold several approval gates, so
   * a resume must be able to suspend again just as cleanly.
   */
  private async runWorkflow(
    operation: Operation,
    operationId: string,
    workflowInstanceId: string,
    startTime: number,
    initialState?: OperationState
  ): Promise<string> {
    try {
      const result = await this.workflowOrchestrator.orchestrateWorkflow(
        operation,
        workflowInstanceId,
        initialState
      );

      await this.completeOperation(operationId, workflowInstanceId, result, startTime);
      return workflowInstanceId;
    } catch (error) {
      if (error instanceof ApprovalPendingError) {
        await this.suspendForApproval(operation, operationId, workflowInstanceId, error);
        // A suspension is NOT a failure. The caller gets the workflow instance
        // id back; the operation is now awaiting an external approval decision
        // which arrives on `approval.workflow.completed` and drives
        // resumeApprovedOperation(). Rethrowing here would surface a pending
        // approval to the API caller as a 500.
        return workflowInstanceId;
      }

      await this.failOperation(operationId, workflowInstanceId, error);
      throw error;
    }
  }

  private async completeOperation(
    operationId: string,
    workflowInstanceId: string,
    result: OperationResult,
    startTime: number
  ): Promise<void> {
    await this.operationManagementService.updateOperation(operationId, {
      status: OperationStatus.COMPLETED,
      result,
      completedAt: new Date(),
    });

    await this.eventBusService.publish('operation.completed', {
      operationId,
      workflowInstanceId,
      result,
      duration: Date.now() - startTime,
      timestamp: new Date(),
    });

    logger.info('Operation completed successfully', {
      operationId,
      workflowInstanceId,
      duration: Date.now() - startTime,
    });
  }

  private async failOperation(
    operationId: string,
    workflowInstanceId: string,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Operation execution failed', {
      operationId,
      workflowInstanceId,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });

    await this.operationManagementService.updateOperation(operationId, {
      status: OperationStatus.FAILED,
      error: message,
      completedAt: new Date(),
    });

    await this.eventBusService.publish('operation.failed', {
      operationId,
      workflowInstanceId,
      error: message,
      timestamp: new Date(),
    });
  }

  /**
   * An approval step reached the gate with no decision. Persist enough to
   * resume later and ask the security-gateway for a decision. Deliberately
   * does NOT publish `operation.failed`.
   */
  private async suspendForApproval(
    operation: Operation,
    operationId: string,
    workflowInstanceId: string,
    error: ApprovalPendingError
  ): Promise<void> {
    const requestedAt = new Date().toISOString();

    logger.info('Operation suspended awaiting approval', {
      operationId,
      workflowInstanceId,
      stepId: error.stepId,
    });

    await this.operationManagementService.updateOperation(operationId, {
      status: OperationStatus.SUSPENDED,
      metadata: {
        ...operation.metadata,
        pendingApproval: {
          stepId: error.stepId,
          stepName: error.stepName,
          workflowInstanceId,
          requestedAt,
        },
      },
    });

    await this.eventBusService.publish('operation.suspended', {
      operationId,
      workflowInstanceId,
      stepId: error.stepId,
      reason: 'approval_required',
      timestamp: requestedAt,
    });

    const riskLevel = this.resolveRiskLevel(operation, error.stepId);

    await this.eventBusService.publish('approval.requested', {
      operationId,
      workflowInstanceId,
      stepId: error.stepId,
      stepName: error.stepName,
      agentId: operation.agentId,
      userId: operation.userId,
      operationType: operation.type,
      description: operation.plan?.description || error.stepName,
      ...(riskLevel ? { riskLevel } : {}),
      timestamp: requestedAt,
    });
  }

  private resolveRiskLevel(operation: Operation, stepId: string): RiskLevel | undefined {
    const step = (operation.steps ?? []).find((s) => s.id === stepId);
    const fromStep = toRiskLevel(step?.metadata?.riskLevel);
    if (fromStep) return fromStep;

    const metadata = operation.metadata as Record<string, unknown> | undefined;
    return toRiskLevel(metadata?.riskLevel);
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

      if (
        operation.status !== OperationStatus.PAUSED &&
        operation.status !== OperationStatus.SUSPENDED
      ) {
        throw new OperationError(
          `Cannot resume operation in ${operation.status} status`,
          'INVALID_STATUS'
        );
      }

      // A SUSPENDED operation has no in-memory workflow left to un-pause — the
      // orchestrator drops it on suspension — so resumeWorkflow() would only
      // throw NotFoundError. Re-orchestrate from persisted state instead.
      if (operation.status === OperationStatus.SUSPENDED) {
        await this.resumeApprovedOperation(operationId);
        return;
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
   * Resume an operation that was SUSPENDED at an approval gate.
   *
   * The in-memory workflow is gone by now (WorkflowOrchestrator deletes it in a
   * `finally`), so this does NOT resume a live promise — it re-orchestrates the
   * operation from its persisted row + state. Steps already in
   * `state.completedSteps` are skipped by the orchestrator, so nothing re-runs.
   */
  public async resumeApprovedOperation(operationId: string): Promise<void> {
    const startTime = Date.now();

    const row = await this.operationManagementService.getOperation(operationId);
    if (!row) {
      throw new OperationError('Operation not found', 'NOT_FOUND');
    }

    // Idempotency guard: a duplicate `approval.workflow.completed` (bus retry,
    // second WhatsApp reply) must never re-run a workflow that already resumed.
    if (row.status !== OperationStatus.SUSPENDED) {
      logger.warn('Ignoring approval resume for an operation not awaiting approval', {
        operationId,
        status: row.status,
      });
      return;
    }

    const state = await this.stateManagerService.getState(operationId);
    const metadata = isRecord(row.metadata) ? { ...row.metadata } : {};
    const pendingApproval = isRecord(metadata.pendingApproval)
      ? metadata.pendingApproval
      : undefined;
    const workflowInstanceId =
      state?.workflowInstanceId ??
      (typeof pendingApproval?.workflowInstanceId === 'string'
        ? pendingApproval.workflowInstanceId
        : `wf-${operationId}-${Date.now()}`);

    // The approval has been answered — the operation is no longer pending one.
    delete metadata.pendingApproval;

    const operation = this.reconstructOperation(row);

    await this.operationManagementService.updateOperation(operationId, {
      status: OperationStatus.RUNNING,
      metadata,
    });

    await this.eventBusService.publish('operation.resumed', {
      operationId,
      workflowInstanceId,
      timestamp: new Date(),
    });

    try {
      await this.runWorkflow(
        operation,
        operationId,
        workflowInstanceId,
        startTime,
        state ?? undefined
      );
    } catch (error) {
      // runWorkflow already marked the operation FAILED and published
      // `operation.failed` (this is the rejection path). Swallow: the caller is
      // an event consumer and a rethrow would only trigger a bus retry of an
      // operation that is already terminal.
      logger.error('Resumed operation failed', {
        operationId,
        workflowInstanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Rebuild an executable Operation from its persisted row.
   *
   * NOTE: the `operations` table has no `steps` column — `buildOperationInsert`
   * only persists `executionPlan`. The single producer (operation_routes)
   * writes the same ExecutionStep[] into both, so `executionPlan.steps` is the
   * authoritative step list on resume.
   */
  private reconstructOperation(row: PersistedOperation): Operation {
    const executionPlan = isRecord(row.executionPlan) ? row.executionPlan : {};
    const steps = Array.isArray(executionPlan.steps)
      ? (executionPlan.steps as ExecutionStep[])
      : [];

    return {
      id: row.id,
      type: row.type,
      status: OperationStatus.RUNNING,
      priority: row.priority,
      agentId: row.agentId,
      userId: row.userId,
      steps,
      executionPlan: row.executionPlan,
      context: row.context ?? {},
      plan: {
        description: row.description ?? '',
        dependencies: row.dependencies ?? [],
      },
      metadata: row.metadata ?? {},
      timeout: row.timeoutDuration ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as unknown as Operation;
  }

  /**
   * Consumes `approval.workflow.completed` from the security-gateway.
   *
   * Fail-closed: anything malformed is logged and dropped — never approved.
   * Both approve and reject take the SAME resume path so that
   * `executeApprovalStep` stays the single source of truth for the decision
   * semantics (a rejection re-runs the gate, which throws APPROVAL_REJECTED and
   * lands on the normal failure path).
   */
  private async handleApprovalWorkflowCompleted(event: EventBusMessage): Promise<void> {
    try {
      const payload = isRecord(event?.data) ? event.data : isRecord(event) ? event : null;
      if (!payload) {
        logger.warn('Ignoring approval.workflow.completed with no payload');
        return;
      }

      const context = payload.context;
      if (!isRecord(context)) {
        logger.warn('Ignoring approval.workflow.completed without a context block', {
          workflowId: payload.workflowId,
        });
        return;
      }

      const operationId = context.operationId;
      const stepId = context.stepId;
      if (typeof operationId !== 'string' || !operationId) {
        logger.warn('Ignoring approval.workflow.completed with a malformed operationId', {
          workflowId: payload.workflowId,
        });
        return;
      }
      if (typeof stepId !== 'string' || !stepId) {
        logger.warn('Ignoring approval.workflow.completed with a malformed stepId', {
          operationId,
        });
        return;
      }

      if (payload.approved !== true && payload.approved !== false) {
        logger.warn('Ignoring approval.workflow.completed with a non-boolean decision', {
          operationId,
          stepId,
        });
        return;
      }

      const approved = payload.approved;
      const approvedBy =
        typeof payload.approvedBy === 'string' && payload.approvedBy ? payload.approvedBy : null;

      if (approved && !approvedBy) {
        // Security event: an approval with no attributable principal is exactly
        // what the fail-closed gate exists to stop. Drop it; stay SUSPENDED.
        logger.warn('SECURITY: refusing an unattributed approval decision', {
          operationId,
          stepId,
          workflowId: payload.workflowId,
        });
        return;
      }

      const decision: ApprovalDecisionRecord = {
        approved,
        approvedBy,
        approvedVia:
          toApprovalVia(payload.approvedVia) ?? (payload.status === 'expired' ? 'expiry' : 'api'),
        decidedAt:
          typeof payload.decidedAt === 'string' ? payload.decidedAt : new Date().toISOString(),
      };

      const state = await this.stateManagerService.getState(operationId);
      if (!state) {
        logger.warn('Ignoring approval decision for an operation with no persisted state', {
          operationId,
          stepId,
        });
        return;
      }

      const existing = isRecord(state.variables?.[APPROVAL_DECISIONS_STATE_KEY])
        ? state.variables[APPROVAL_DECISIONS_STATE_KEY]
        : {};

      await this.stateManagerService.updateOperationState(operationId, {
        variables: {
          [APPROVAL_DECISIONS_STATE_KEY]: { ...existing, [stepId]: decision },
        },
      });

      logger.info('Approval decision recorded', {
        operationId,
        stepId,
        approved,
        approvedVia: decision.approvedVia,
      });

      await this.resumeApprovedOperation(operationId);
    } catch (error) {
      logger.error('Failed to process approval.workflow.completed', {
        error: error instanceof Error ? error.message : String(error),
      });
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
      {
        // Cross-service: published by the security-gateway approval workflow.
        eventType: 'approval.workflow.completed',
        handler: async (event: EventBusMessage) => {
          await this.handleApprovalWorkflowCompleted(event);
        },
        options: { queue: 'orchestration-approval-decisions', durable: true, autoAck: true },
      },
    ];

    for (const subscription of subscriptions) {
      // oxlint-disable-next-line no-await-in-loop -- subscriptions must register in order
      await this.eventBusService.subscribe(
        subscription.eventType,
        subscription.handler,
        subscription.options
      );
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
