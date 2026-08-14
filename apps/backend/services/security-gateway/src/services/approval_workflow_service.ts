import * as cron from 'node-cron';
import { randomInt, randomUUID } from 'node:crypto';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { EventBusService } from '@uaip/infra/event_bus';
import { SecurityService } from '@uaip/shared-services';
import type { ApprovalWorkflow as ApprovalWorkflowEntity } from '@uaip/shared-services';
import {
  ApprovalWorkflow as ApprovalWorkflowType,
  ApprovalDecision,
  ApprovalStatus,
  AuditEventType,
  ApprovalWorkflowConfig,
  ApprovalRequest,
  ApprovalWorkflowStatus,
  SecurityLevel,
} from '@uaip/types';
import type {
  ApprovalDecisionAckEvent,
  ApprovalDecisionChannel,
  ApprovalDecisionSubmittedEvent,
  ApprovalOrchestrationContext,
  ApprovalRequestedPayload,
  ApprovalWorkflowCompletedEvent,
} from '@uaip/types';
import { NotificationService } from './notification_service.js';
import { AuditService } from './audit_service.js';

/** How a terminal decision was reached, carried from the caller to the event. */
interface DecisionChannelContext {
  approvedVia: ApprovalDecisionChannel;
  jid?: string;
}

/**
 * Deliberately vague. Every inbound-decision refusal uses the same wording so a
 * sender cannot probe which codes exist, which are expired, or who is allowed to
 * approve.
 */
const DECISION_REFUSED_MESSAGE = 'That code is not valid for an open approval.';

export class ApprovalWorkflowService {
  private config: ApprovalWorkflowConfig;
  private reminderJob: ReturnType<typeof cron.schedule> | null = null;
  private expirationJob: ReturnType<typeof cron.schedule> | null = null;
  private securityService: SecurityService;

  constructor(
    private eventBusService: EventBusService,
    private notificationService: NotificationService,
    private auditService: AuditService
  ) {
    this.securityService = SecurityService.getInstance();
    this.config = {
      defaultExpirationHours: 24,
      reminderIntervalHours: 4,
      escalationHours: 12,
      maxApprovers: 10,
      requireAllApprovers: false,
    };

    // Don't start cron jobs in constructor - they will be started after database initialization
  }

  /**
   * Start the cron jobs (should be called after database is initialized).
   *
   * Idempotent: more than one ApprovalWorkflowService is constructed per process
   * (the approval and security route modules each hold their own), and starting
   * the expiry sweep twice would double-publish completion events.
   */
  public startCronJobs(): void {
    if (this.reminderJob !== null || this.expirationJob !== null) {
      logger.debug('Approval workflow cron jobs already running, skipping start');
      return;
    }
    this.setupCronJobs();
  }

  /**
   * Create a new approval workflow
   */
  public async createApprovalWorkflow(request: ApprovalRequest): Promise<ApprovalWorkflowType> {
    try {
      logger.info('Creating approval workflow', {
        operationId: request.operationId,
        requiredApprovers: request.requiredApprovers.length,
        securityLevel: request.securityLevel,
      });

      // Validate request
      this.validateApprovalRequest(request);

      // Calculate expiration time
      const expirationHours = request.expirationHours || this.config.defaultExpirationHours;
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expirationHours);

      // Create workflow using DatabaseService
      const savedWorkflow = await this.securityService
        .getApprovalWorkflowRepository()
        .createApprovalWorkflow({
          // The workflow id is its own identity, NOT the operation id: one
          // operation can carry several approval steps, and operation ids are
          // not required to be UUIDs while this column is.
          id: randomUUID(),
          operationId: request.operationId,
          requiredApprovers: request.requiredApprovers,
          currentApprovers: [],
          status: ApprovalStatus.PENDING,
          expiresAt,
          metadata: {
            operationType: request.operationType,
            securityLevel: request.securityLevel,
            context: request.context,
            ...request.metadata,
          },
        });

      // Convert to interface format
      const workflow: ApprovalWorkflowType = {
        id: savedWorkflow.id,
        operationId: savedWorkflow.operationId,
        requiredApprovers: savedWorkflow.requiredApprovers,
        currentApprovers: savedWorkflow.currentApprovers,
        status:
          Object.values(ApprovalStatus).find((s) => s === savedWorkflow.status) ??
          ApprovalStatus.PENDING,
        expiresAt: savedWorkflow.expiresAt ?? undefined,
        metadata: savedWorkflow.metadata ?? undefined,
        createdAt: savedWorkflow.createdAt,
        updatedAt: savedWorkflow.updatedAt,
      };

      // Send notifications to approvers
      await this.notifyApprovers(workflow, 'approval_requested');

      // Publish event
      await this.eventBusService.publish('approval.workflow.created', {
        workflowId: workflow.id,
        operationId: workflow.operationId,
        requiredApprovers: workflow.requiredApprovers,
        expiresAt: workflow.expiresAt,
      });

      // Audit log
      await this.auditService.logEvent({
        eventType: AuditEventType.APPROVAL_REQUESTED,
        resourceType: 'approval_workflow',
        resourceId: workflow.id,
        details: {
          operationId: request.operationId,
          operationType: request.operationType,
          requiredApprovers: request.requiredApprovers.length,
          securityLevel: request.securityLevel,
        },
      });

      logger.info('Approval workflow created successfully', {
        workflowId: workflow.id,
        operationId: workflow.operationId,
      });

      return workflow;
    } catch (error) {
      logger.error('Failed to create approval workflow', {
        operationId: request.operationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Process an approval decision
   */
  public async processApprovalDecision(
    decision: ApprovalDecision,
    channel: DecisionChannelContext = { approvedVia: 'web' }
  ): Promise<ApprovalWorkflowStatus> {
    try {
      logger.info('Processing approval decision', {
        workflowId: decision.workflowId,
        approverId: decision.approverId,
        decision: decision.decision,
      });

      // Fail closed: all required decision fields must be present
      if (!decision.workflowId || !decision.approverId || !decision.decision) {
        throw new ApiError(
          400,
          'Required fields missing from approval decision',
          'INVALID_DECISION'
        );
      }

      // Get workflow
      const workflow = await this.getWorkflow(decision.workflowId);
      if (!workflow) {
        throw new ApiError(404, 'Approval workflow not found', 'WORKFLOW_NOT_FOUND');
      }

      // Validate decision
      this.validateApprovalDecision(workflow, decision);

      // Save decision using DatabaseService
      const approvalDecisionRepo = this.securityService.getApprovalDecisionRepository();
      await approvalDecisionRepo.createApprovalDecision({
        // approval_decisions.id is a uuid column — the previous deterministic
        // `decision-<workflow>-<approver>` string could never be inserted.
        id: randomUUID(),
        workflowId: decision.workflowId,
        approverId: decision.approverId,
        decision: decision.decision,
        reason: decision.feedback,
        // "Who approved this, and how" must be answerable from the record alone.
        metadata: {
          approvedVia: channel.approvedVia,
          ...(channel.jid ? { jid: channel.jid } : {}),
        },
      });

      // Update workflow status
      const updatedWorkflow = await this.updateWorkflowStatus(workflow, decision);

      // Fail closed: updated workflow must have an ID to query status
      if (!updatedWorkflow.id) {
        throw new ApiError(500, 'Updated workflow missing ID', 'INVALID_WORKFLOW_STATE');
      }

      // Get current status
      const status = await this.getWorkflowStatus(updatedWorkflow.id);

      // Check if workflow is complete
      if (status.isComplete) {
        await this.completeWorkflow(updatedWorkflow, status.canProceed, {
          approvedVia: channel.approvedVia,
          approvedBy: decision.approverId,
          decidedAt: decision.decidedAt ?? new Date(),
        });
      }

      // Audit log
      await this.auditService.logEvent({
        eventType:
          decision.decision === 'approve'
            ? AuditEventType.APPROVAL_GRANTED
            : AuditEventType.APPROVAL_DENIED,
        resourceType: 'approval_workflow',
        resourceId: workflow.id,
        details: {
          approverId: decision.approverId,
          decision: decision.decision,
          feedback: decision.feedback,
          approvedVia: channel.approvedVia,
          jid: channel.jid,
        },
      });

      logger.info('Approval decision processed successfully', {
        workflowId: decision.workflowId,
        decision: decision.decision,
        isComplete: status.isComplete,
      });

      return status;
    } catch (error) {
      logger.error('Failed to process approval decision', {
        workflowId: decision.workflowId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get workflow status
   */
  public async getWorkflowStatus(workflowId: string): Promise<ApprovalWorkflowStatus> {
    try {
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) {
        throw new ApiError(404, 'Approval workflow not found', 'WORKFLOW_NOT_FOUND');
      }

      const decisions = await this.getApprovalDecisions(workflowId);

      const approvedBy = decisions.filter((d) => d.decision === 'approve').map((d) => d.approverId);

      const rejectedBy = decisions.filter((d) => d.decision === 'reject').map((d) => d.approverId);

      const requiredApprovers = workflow.requiredApprovers ?? [];
      const pendingApprovers = requiredApprovers.filter(
        (approver) => !approvedBy.includes(approver) && !rejectedBy.includes(approver)
      );

      const hasRejection = rejectedBy.length > 0;
      const hasAllApprovals = this.config.requireAllApprovers
        ? pendingApprovers.length === 0
        : approvedBy.length > 0;

      const isComplete =
        hasRejection || hasAllApprovals || workflow.status !== ApprovalStatus.PENDING;
      const canProceed = !hasRejection && hasAllApprovals;

      const nextActions: string[] = [];
      if (!isComplete) {
        nextActions.push(`Waiting for approval from: ${pendingApprovers.join(', ')}`);
      } else if (canProceed) {
        nextActions.push('Workflow approved - operation can proceed');
      } else {
        nextActions.push('Workflow rejected - operation cannot proceed');
      }

      return {
        workflow,
        pendingApprovers,
        completedApprovals: decisions,
        isComplete,
        canProceed,
        nextActions,
      };
    } catch (error) {
      logger.error('Failed to get workflow status', {
        workflowId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get workflows for a user (as approver)
   */
  public async getUserWorkflows(
    userId: string,
    status?: ApprovalStatus
  ): Promise<ApprovalWorkflowType[]> {
    try {
      const repo = this.securityService.getApprovalWorkflowRepository();
      const { workflows } = await repo.findMany({ status });

      const filtered = userId
        ? workflows.filter(
            (w) => w.requiredApprovers?.includes(userId) || w.currentApprovers?.includes(userId)
          )
        : workflows;

      return filtered.map(this.mapEntityToWorkflow);
    } catch (error) {
      logger.error('Failed to get user workflows', {
        userId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Cancel a workflow
   */
  public async cancelWorkflow(workflowId: string, reason: string): Promise<void> {
    try {
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) {
        throw new ApiError(404, 'Approval workflow not found', 'WORKFLOW_NOT_FOUND');
      }

      if (workflow.status !== ApprovalStatus.PENDING) {
        throw new ApiError(400, 'Cannot cancel non-pending workflow', 'WORKFLOW_NOT_PENDING');
      }

      // Update status using DatabaseService
      await this.securityService
        .getApprovalWorkflowRepository()
        .updateApprovalWorkflow(workflowId, {
          status: 'cancelled',
        });

      // Notify approvers
      await this.notifyApprovers(workflow, 'approval_cancelled', { reason });

      // Publish event
      await this.eventBusService.publish('approval.workflow.cancelled', {
        workflowId,
        operationId: workflow.operationId,
        reason,
      });

      // Audit log
      await this.auditService.logEvent({
        eventType: AuditEventType.APPROVAL_DENIED,
        resourceType: 'approval_workflow',
        resourceId: workflowId,
        details: { reason, action: 'cancelled' },
      });
    } catch (error) {
      logger.error('Failed to cancel workflow', {
        workflowId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // ─── Orchestration bridge ─────────────────────────────────────────────────

  /**
   * Handle `approval.requested` from orchestration: mint a one-time code, carry
   * the orchestration coordinates onto the workflow metadata, and notify.
   *
   * Every failure path here ends in a fail-closed
   * `approval.workflow.completed{status:'expired'}` so the suspended operation
   * is released as rejected instead of hanging until someone notices.
   */
  public async handleApprovalRequested(event: ApprovalRequestedPayload): Promise<void> {
    const context: ApprovalOrchestrationContext = {
      operationId: event.operationId,
      workflowInstanceId: event.workflowInstanceId,
      stepId: event.stepId,
    };

    const approvers = ApprovalWorkflowService.readDefaultApprovers();
    if (approvers.length === 0) {
      logger.error(
        'APPROVAL_DEFAULT_APPROVERS is empty — no one can approve. Failing the operation closed.',
        { operationId: event.operationId, stepId: event.stepId }
      );
      await this.failClosed(context, event, 'no_approvers_configured');
      return;
    }

    try {
      const approvalCode = await this.generateApprovalCode();

      await this.createApprovalWorkflow({
        operationId: event.operationId,
        operationType: event.operationType ?? 'operation',
        requiredApprovers: approvers,
        securityLevel: ApprovalWorkflowService.mapRiskToSecurityLevel(event.riskLevel),
        context: { ...context },
        metadata: {
          orchestration: context,
          requestedByUserId: event.userId,
          approvalCode,
          stepName: event.stepName,
          description: event.description,
          riskLevel: event.riskLevel,
        },
      });
    } catch (error) {
      logger.error('Failed to create approval workflow from approval.requested', {
        operationId: event.operationId,
        stepId: event.stepId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      await this.failClosed(context, event, 'workflow_creation_failed');
    }
  }

  /**
   * Handle `approval.decision.submitted` from the WhatsApp channel.
   *
   * Every branch — accepted or refused — publishes `approval.decision.ack` so
   * the admin always gets a reply in chat.
   */
  public async handleDecisionSubmitted(event: ApprovalDecisionSubmittedEvent): Promise<void> {
    try {
      const entity = await this.findWorkflowByCode(event.code);
      if (!entity) {
        logger.warn('Approval decision submitted with an unknown code', { jid: event.jid });
        await this.publishAck(event.jid, false, DECISION_REFUSED_MESSAGE);
        return;
      }

      const workflow = this.mapEntityToWorkflow(entity);
      const metadata = workflow.metadata ?? {};
      const refuse = async (reason: string): Promise<void> => {
        logger.warn('Refusing WhatsApp approval decision', {
          workflowId: workflow.id,
          approverUserId: event.approverUserId,
          jid: event.jid,
          reason,
        });
        await this.publishAck(event.jid, false, DECISION_REFUSED_MESSAGE);
      };

      if (workflow.status !== ApprovalStatus.PENDING) {
        await refuse('workflow_not_pending');
        return;
      }
      if (workflow.expiresAt && new Date() > workflow.expiresAt) {
        await refuse('workflow_expired');
        return;
      }
      if (metadata.codeConsumedAt) {
        await refuse('code_already_consumed');
        return;
      }
      if (!(workflow.requiredApprovers ?? []).includes(event.approverUserId)) {
        await refuse('not_a_required_approver');
        return;
      }
      if (metadata.requestedByUserId === event.approverUserId) {
        await refuse('self_approval');
        return;
      }

      // Consume the code BEFORE applying the decision. Handlers for one event
      // type run concurrently, so this is the only ordering that guarantees a
      // duplicate reply cannot apply the decision twice — the second delivery
      // sees codeConsumedAt and is refused above.
      await this.securityService
        .getApprovalWorkflowRepository()
        .updateApprovalWorkflow(workflow.id!, {
          metadata: {
            ...metadata,
            codeConsumedAt: new Date().toISOString(),
            codeConsumedBy: event.approverUserId,
            codeConsumedJid: event.jid,
          },
        });

      await this.processApprovalDecision(
        {
          workflowId: workflow.id!,
          approverId: event.approverUserId,
          decision: event.approved ? 'approve' : 'reject',
          decidedAt: new Date(),
        },
        { approvedVia: 'whatsapp', jid: event.jid }
      );

      const operationType = String(metadata.operationType ?? 'operation');
      await this.publishAck(
        event.jid,
        true,
        `${event.approved ? 'Approved' : 'Rejected'} ${operationType} (${workflow.operationId}).`
      );
    } catch (error) {
      logger.error('Failed to process submitted approval decision', {
        jid: event.jid,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      await this.publishAck(event.jid, false, DECISION_REFUSED_MESSAGE);
    }
  }

  private static readDefaultApprovers(): string[] {
    return (process.env.APPROVAL_DEFAULT_APPROVERS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }

  private static mapRiskToSecurityLevel(riskLevel: string | undefined): SecurityLevel {
    switch (riskLevel) {
      case 'low':
        return SecurityLevel.LOW;
      case 'high':
        return SecurityLevel.HIGH;
      case 'critical':
        return SecurityLevel.CRITICAL;
      default:
        return SecurityLevel.MEDIUM;
    }
  }

  /**
   * Release a suspended operation as rejected when no approval can ever be
   * collected. A workflow row is still written so the refusal is auditable.
   */
  private async failClosed(
    context: ApprovalOrchestrationContext,
    event: ApprovalRequestedPayload,
    reason: string
  ): Promise<void> {
    let workflowId: string = randomUUID();
    try {
      const saved = await this.securityService
        .getApprovalWorkflowRepository()
        .createApprovalWorkflow({
          id: workflowId,
          operationId: event.operationId,
          requiredApprovers: [],
          currentApprovers: [],
          status: ApprovalStatus.EXPIRED,
          expiresAt: new Date(),
          metadata: { orchestration: context, failureReason: reason, stepName: event.stepName },
        });
      workflowId = saved.id;
    } catch (error) {
      logger.error('Could not persist the fail-closed approval workflow', {
        operationId: event.operationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    try {
      await this.auditService.logEvent({
        eventType: AuditEventType.APPROVAL_DENIED,
        resourceType: 'approval_workflow',
        resourceId: workflowId,
        details: { operationId: event.operationId, reason, action: 'fail_closed' },
      });
    } catch (error) {
      logger.error('Could not audit the fail-closed approval workflow', {
        workflowId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const payload: ApprovalWorkflowCompletedEvent = {
      workflowId,
      status: 'expired',
      approved: false,
      approvedBy: null,
      approvedVia: 'expiry',
      decidedAt: new Date().toISOString(),
      context,
    };
    await this.eventBusService.publish('approval.workflow.completed', payload);
  }

  // ─── One-time approval codes ──────────────────────────────────────────────

  private static readonly CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  private static readonly CODE_LENGTH = 4;
  private static readonly CODE_MAX_ATTEMPTS = 12;

  /**
   * Mint a code that is unique among currently pending workflows. Throws (and so
   * fails the request closed) rather than issuing an ambiguous code.
   */
  private async generateApprovalCode(): Promise<string> {
    const pending = await this.securityService.getApprovalWorkflowRepository().findPending();
    const taken = new Set(
      pending
        .map((w) => w.metadata?.approvalCode)
        .filter((code): code is string => typeof code === 'string')
        .map((code) => code.toUpperCase())
    );

    const alphabet = ApprovalWorkflowService.CODE_ALPHABET;
    for (let attempt = 0; attempt < ApprovalWorkflowService.CODE_MAX_ATTEMPTS; attempt++) {
      let code = '';
      for (let i = 0; i < ApprovalWorkflowService.CODE_LENGTH; i++) {
        code += alphabet[randomInt(alphabet.length)];
      }
      if (!taken.has(code)) return code;
    }

    throw new ApiError(
      500,
      'Could not allocate a unique approval code',
      'APPROVAL_CODE_UNAVAILABLE'
    );
  }

  /**
   * Resolve a one-time code to its workflow.
   *
   * A linear scan of the pending set is deliberate: pending approvals number in
   * the tens, so a dedicated code column plus index would cost a schema change
   * for no measurable gain. Revisit if the pending set ever grows large.
   */
  private async findWorkflowByCode(code: string): Promise<ApprovalWorkflowEntity | null> {
    const wanted = code.trim().toUpperCase();
    if (wanted.length === 0) return null;

    const pending = await this.securityService.getApprovalWorkflowRepository().findPending();
    return (
      pending.find((workflow) => {
        const stored = workflow.metadata?.approvalCode;
        return typeof stored === 'string' && stored.toUpperCase() === wanted;
      }) ?? null
    );
  }

  private async publishAck(jid: string, ok: boolean, message: string): Promise<void> {
    const payload: ApprovalDecisionAckEvent = { jid, ok, message };
    try {
      await this.eventBusService.publish('approval.decision.ack', payload);
    } catch (error) {
      logger.error('Failed to publish approval decision ack', {
        jid,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Setup cron jobs for reminders and expiration
   */
  private setupCronJobs(): void {
    // Send reminders every hour
    this.reminderJob = cron.schedule('0 * * * *', async () => {
      await this.sendReminders();
    });

    // Check for expired workflows every 30 minutes
    this.expirationJob = cron.schedule('*/30 * * * *', async () => {
      await this.expireWorkflows();
    });

    logger.info('Approval workflow cron jobs started');
  }

  /**
   * Send reminders for pending approvals
   */
  private async sendReminders(): Promise<void> {
    try {
      const reminderThreshold = new Date();
      reminderThreshold.setHours(reminderThreshold.getHours() - this.config.reminderIntervalHours);

      const workflows = await this.securityService
        .getApprovalWorkflowRepository()
        .getPendingWorkflowsForReminders();

      logger.info('Sending approval reminders', { count: workflows.length });
      await this.processInBatches(workflows, async (workflowEntity) => {
        const workflow = this.mapEntityToWorkflow(workflowEntity);
        await this.sendWorkflowReminder(workflow);
      });
    } catch (error) {
      logger.error('Failed to send approval reminders', { error });
    }
  }

  /**
   * Expire workflows that have passed their expiration time
   */
  private async expireWorkflows(): Promise<void> {
    try {
      const now = new Date();
      logger.debug('Starting workflow expiration check', { timestamp: now.toISOString() });

      const workflows = await this.securityService
        .getApprovalWorkflowRepository()
        .getExpiredWorkflows();
      logger.debug('Found expired workflows', { count: workflows.length });

      if (workflows.length === 0) {
        logger.debug('No expired workflows found');
        return;
      }

      await this.processInBatches(
        workflows.filter(
          (w): w is typeof w & { id: string } => 'id' in w && typeof w.id === 'string'
        ),
        async (workflowEntity) => {
          try {
            logger.debug('Expiring workflow', { workflowId: workflowEntity.id });
            await this.expireWorkflow(workflowEntity.id);
            logger.info('Successfully expired workflow', { workflowId: workflowEntity.id });
          } catch (workflowError) {
            logger.error('Failed to expire individual workflow', {
              workflowId: workflowEntity.id,
              error:
                workflowError instanceof Error
                  ? {
                      message: workflowError.message,
                      stack: workflowError.stack,
                      name: workflowError.name,
                    }
                  : workflowError,
            });
          }
        }
      );
    } catch (error) {
      logger.error('Failed to expire workflows', {
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
              }
            : error,
        errorType: typeof error,
        errorString: String(error),
      });
    }
  }

  /**
   * Expire a specific workflow
   */
  private async expireWorkflow(workflowId: string): Promise<void> {
    try {
      // Read first: the orchestration context and the one-time code both live in
      // metadata, and the update below rewrites that column.
      const existing = await this.getWorkflow(workflowId);
      if (!existing) {
        logger.warn('Workflow not found during expiration', { workflowId });
        return;
      }

      // The one-time code is cleared on expiry so a late reply cannot land on a
      // dead workflow and so the code returns to the pool.
      const { approvalCode: _expiredCode, ...remainingMetadata } = existing.metadata ?? {};

      const updatedWorkflow = await this.securityService
        .getApprovalWorkflowRepository()
        .updateApprovalWorkflow(workflowId, {
          status: 'expired',
          metadata: remainingMetadata,
        });

      if (!updatedWorkflow) {
        logger.warn('Workflow not found during expiration', { workflowId });
        return;
      }

      const workflow = { ...existing, status: ApprovalStatus.EXPIRED };

      // Notify approvers (don't let notification failures stop the process)
      try {
        await this.notifyApprovers(workflow, 'approval_expired');
      } catch (notificationError) {
        logger.error('Failed to notify approvers of workflow expiration', {
          workflowId,
          error: notificationError instanceof Error ? notificationError.message : notificationError,
        });
      }

      // Publish event (don't let event publishing failures stop the process)
      try {
        // Kept for back-compat with existing subscribers.
        await this.eventBusService.publish('approval.workflow.expired', {
          workflowId,
          operationId: workflow.operationId,
        });

        // The contract event orchestration actually listens on. Without this an
        // expired approval leaves the suspended operation hanging forever.
        await this.publishWorkflowCompleted(workflow, {
          status: 'expired',
          approved: false,
          approvedBy: null,
          approvedVia: 'expiry',
          decidedAt: new Date().toISOString(),
        });
      } catch (eventError) {
        logger.error('Failed to publish workflow expiration event', {
          workflowId,
          error: eventError instanceof Error ? eventError.message : eventError,
        });
      }

      // Audit log (don't let audit failures stop the process)
      try {
        await this.auditService.logEvent({
          eventType: AuditEventType.APPROVAL_DENIED,
          resourceType: 'approval_workflow',
          resourceId: workflowId,
          details: { reason: 'expired', action: 'auto_expired' },
        });
      } catch (auditError) {
        logger.error('Failed to log workflow expiration audit event', {
          workflowId,
          error: auditError instanceof Error ? auditError.message : auditError,
        });
      }

      logger.info('Workflow expired successfully', {
        workflowId,
        operationId: workflow.operationId,
      });
    } catch (error) {
      logger.error('Failed to expire workflow', {
        workflowId,
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
              }
            : error,
      });
      throw error; // Re-throw to be caught by the calling method
    }
  }

  /**
   * Send workflow reminder
   */
  private async sendWorkflowReminder(workflow: ApprovalWorkflowType): Promise<void> {
    if (!workflow.id) {
      logger.error('Cannot send reminder: workflow missing ID');
      return;
    }
    const status = await this.getWorkflowStatus(workflow.id);

    if (status.pendingApprovers.length > 0) {
      await this.notifyApprovers(workflow, 'approval_reminder', {
        pendingApprovers: status.pendingApprovers,
      });

      await this.securityService
        .getApprovalWorkflowRepository()
        .updateApprovalWorkflow(workflow.id, {
          lastReminderAt: new Date(),
        });
    }
  }

  /**
   * Complete workflow
   */
  private async completeWorkflow(
    workflow: ApprovalWorkflowType,
    approved: boolean,
    outcome: { approvedVia: ApprovalDecisionChannel; approvedBy: string | null; decidedAt: Date }
  ): Promise<void> {
    if (!workflow.id) {
      throw new ApiError(500, 'Cannot complete workflow: missing ID', 'INVALID_WORKFLOW_STATE');
    }
    const newStatus = approved ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;

    await this.securityService.getApprovalWorkflowRepository().updateApprovalWorkflow(workflow.id, {
      status: newStatus,
    });

    await this.notifyApprovers(workflow, approved ? 'approval_completed' : 'approval_rejected');

    await this.publishWorkflowCompleted(workflow, {
      status: approved ? 'approved' : 'rejected',
      approved,
      approvedBy: outcome.approvedBy,
      approvedVia: outcome.approvedVia,
      decidedAt: outcome.decidedAt.toISOString(),
    });

    logger.info('Approval workflow completed', {
      workflowId: workflow.id,
      operationId: workflow.operationId,
      approved,
      status: newStatus,
      approvedVia: outcome.approvedVia,
    });
  }

  /**
   * Publish the orchestration-facing completion event. The `context` block is
   * read back out of the workflow metadata that `approval.requested` planted
   * there; without it orchestration cannot resume and ignores the event.
   */
  private async publishWorkflowCompleted(
    workflow: ApprovalWorkflowType,
    outcome: Omit<ApprovalWorkflowCompletedEvent, 'workflowId' | 'context'>
  ): Promise<void> {
    const context = this.readOrchestrationContext(workflow);
    const payload: ApprovalWorkflowCompletedEvent = {
      workflowId: workflow.id!,
      ...outcome,
      ...(context ? { context } : {}),
    };

    await this.eventBusService.publish('approval.workflow.completed', payload);
  }

  private readOrchestrationContext(
    workflow: ApprovalWorkflowType
  ): ApprovalOrchestrationContext | undefined {
    const raw = workflow.metadata?.orchestration as
      | Partial<ApprovalOrchestrationContext>
      | undefined;
    if (
      raw &&
      typeof raw.operationId === 'string' &&
      typeof raw.workflowInstanceId === 'string' &&
      typeof raw.stepId === 'string'
    ) {
      return {
        operationId: raw.operationId,
        workflowInstanceId: raw.workflowInstanceId,
        stepId: raw.stepId,
      };
    }

    logger.warn(
      'Approval workflow has no orchestration context — completion event will be ignored by orchestration',
      {
        workflowId: workflow.id,
        operationId: workflow.operationId,
      }
    );
    return undefined;
  }

  /**
   * Update workflow status based on decision
   */
  private async updateWorkflowStatus(
    workflow: ApprovalWorkflowType,
    decision: ApprovalDecision
  ): Promise<ApprovalWorkflowType> {
    if (!workflow.id) {
      throw new ApiError(500, 'Cannot update workflow: missing ID', 'INVALID_WORKFLOW_STATE');
    }
    const currentApprovers = workflow.currentApprovers ?? [];
    if (
      decision.decision === 'approve' &&
      decision.approverId &&
      !currentApprovers.includes(decision.approverId)
    ) {
      currentApprovers.push(decision.approverId);
    }

    await this.securityService.getApprovalWorkflowRepository().updateApprovalWorkflow(workflow.id, {
      currentApprovers,
    });

    return { ...workflow, currentApprovers, updatedAt: new Date() };
  }

  /**
   * Validation methods
   */
  private validateApprovalRequest(request: ApprovalRequest): void {
    if (!request.operationId) {
      throw new ApiError(400, 'Operation ID is required', 'MISSING_OPERATION_ID');
    }

    if (!request.requiredApprovers || request.requiredApprovers.length === 0) {
      throw new ApiError(400, 'At least one approver is required', 'MISSING_APPROVERS');
    }

    if (request.requiredApprovers.length > this.config.maxApprovers) {
      throw new ApiError(
        400,
        `Too many approvers (max: ${this.config.maxApprovers})`,
        'TOO_MANY_APPROVERS'
      );
    }
  }

  private validateApprovalDecision(
    workflow: ApprovalWorkflowType,
    decision: ApprovalDecision
  ): void {
    if (workflow.status !== ApprovalStatus.PENDING) {
      throw new ApiError(400, 'Workflow is not pending approval', 'WORKFLOW_NOT_PENDING');
    }

    const requiredApprovers = workflow.requiredApprovers ?? [];
    if (!decision.approverId || !requiredApprovers.includes(decision.approverId)) {
      throw new ApiError(
        403,
        'User is not authorized to approve this workflow',
        'UNAUTHORIZED_APPROVER'
      );
    }

    if (workflow.expiresAt && new Date() > workflow.expiresAt) {
      throw new ApiError(400, 'Workflow has expired', 'WORKFLOW_EXPIRED');
    }
  }

  /**
   * Notification helper
   */
  private async notifyApprovers(
    workflow: ApprovalWorkflowType,
    type: string,
    additionalData?: Record<string, unknown>
  ): Promise<void> {
    try {
      const metadata = workflow.metadata ?? {};
      await this.processInBatches(workflow.requiredApprovers ?? [], async (approverId) =>
        this.notificationService.sendNotification({
          type,
          recipient: approverId,
          subject: this.getNotificationSubject(type, workflow),
          message: this.getNotificationMessage(type, workflow),
          data: {
            workflowId: workflow.id,
            operationId: workflow.operationId,
            // Channels that render their own body (WhatsApp) need the real
            // values, not placeholders.
            approvalCode: metadata.approvalCode,
            operationType: metadata.operationType,
            stepName: metadata.stepName,
            description: metadata.description,
            requestedByUserId: metadata.requestedByUserId,
            riskLevel: metadata.riskLevel,
            expiresAt: workflow.expiresAt?.toISOString(),
            ...additionalData,
          },
        })
      );
    } catch (error) {
      logger.error('Failed to send notifications', {
        workflowId: workflow.id,
        type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - notification failure shouldn't break the workflow
    }
  }

  /**
   * Get notification subject based on type
   */
  private getNotificationSubject(type: string, workflow: ApprovalWorkflowType): string {
    const operationType = workflow.metadata?.operationType || 'Operation';

    switch (type) {
      case 'approval_requested':
        return `Approval Required: ${operationType}`;
      case 'approval_reminder':
        return `Reminder: Approval Pending for ${operationType}`;
      case 'approval_completed':
        return `Approval Completed: ${operationType}`;
      case 'approval_rejected':
        return `Approval Rejected: ${operationType}`;
      case 'approval_expired':
        return `Approval Expired: ${operationType}`;
      case 'approval_cancelled':
        return `Approval Cancelled: ${operationType}`;
      default:
        return `Approval Notification: ${operationType}`;
    }
  }

  /**
   * Get notification message based on type
   */
  private getNotificationMessage(type: string, workflow: ApprovalWorkflowType): string {
    const operationType = workflow.metadata?.operationType || 'Operation';
    const securityLevel = workflow.metadata?.securityLevel || 'Unknown';

    switch (type) {
      case 'approval_requested':
        return `A new ${operationType} (Security Level: ${securityLevel}) requires your approval. Operation ID: ${workflow.operationId}`;
      case 'approval_reminder':
        return `Reminder: ${operationType} is still pending your approval. Please review and respond.`;
      case 'approval_completed':
        return `The approval workflow for ${operationType} has been completed and approved.`;
      case 'approval_rejected':
        return `The approval workflow for ${operationType} has been rejected.`;
      case 'approval_expired':
        return `The approval request for ${operationType} has expired without sufficient approvals.`;
      case 'approval_cancelled':
        return `The approval request for ${operationType} has been cancelled.`;
      default:
        return `You have a notification regarding ${operationType}.`;
    }
  }

  /**
   * Database operations
   */
  private async getWorkflow(workflowId: string): Promise<ApprovalWorkflowType | null> {
    const workflowEntity = await this.securityService
      .getApprovalWorkflowRepository()
      .findById(workflowId);

    return workflowEntity ? this.mapEntityToWorkflow(workflowEntity) : null;
  }

  private async getApprovalDecisions(workflowId: string): Promise<ApprovalDecision[]> {
    const decisions = await this.securityService
      .getApprovalDecisionRepository()
      .getApprovalDecisions(workflowId);

    return decisions.map((decision) => {
      const rawDecision = decision.decision;
      const decisionValue: 'approve' | 'reject' = rawDecision === 'approve' ? 'approve' : 'reject';
      return {
        workflowId: decision.workflowId,
        approverId: decision.approverId,
        decision: decisionValue,
        feedback: decision.reason ?? undefined,
        decidedAt: decision.createdAt,
      };
    });
  }

  /**
   * Entity mapping helper
   */
  private mapEntityToWorkflow(entity: ApprovalWorkflowEntity): ApprovalWorkflowType {
    return {
      id: entity.id,
      operationId: entity.operationId,
      requiredApprovers: entity.requiredApprovers,
      currentApprovers: entity.currentApprovers,
      status:
        Object.values(ApprovalStatus).find((s) => s === entity.status) ?? ApprovalStatus.PENDING,
      expiresAt: entity.expiresAt ?? undefined,
      metadata: entity.metadata ?? undefined,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    if (this.reminderJob) {
      this.reminderJob.stop();
      this.reminderJob = null;
    }

    if (this.expirationJob) {
      this.expirationJob.stop();
      this.expirationJob = null;
    }

    logger.info('Approval workflow service cleaned up');
  }

  private static readonly BATCH_SIZE = 10;

  private async processInBatches<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
    for (let i = 0; i < items.length; i += ApprovalWorkflowService.BATCH_SIZE) {
      const batch = items.slice(i, i + ApprovalWorkflowService.BATCH_SIZE);
      await Promise.all(batch.map(fn));
    }
  }
}
