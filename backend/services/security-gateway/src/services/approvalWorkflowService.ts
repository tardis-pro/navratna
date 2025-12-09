import * as cron from 'node-cron';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/shared-services';
import {
  ApprovalWorkflow as ApprovalWorkflowType,
  ApprovalDecision,
  ApprovalStatus,
  SecurityLevel,
  AuditEventType,
  Operation,
} from '@uaip/types';
// Remove TypeORM imports - use DatabaseService instead
import { NotificationService } from './notificationService.js';
import { AuditService } from './auditService.js';

export interface ApprovalWorkflowConfig {
  defaultExpirationHours: number;
  reminderIntervalHours: number;
  escalationHours: number;
  maxApprovers: number;
  requireAllApprovers: boolean;
}

export interface ApprovalRequest {
  operationId: string;
  operationType: string;
  requiredApprovers: string[];
  securityLevel: SecurityLevel;
  context: Record<string, any>;
  expirationHours?: number;
  metadata?: Record<string, any>;
}

export interface ApprovalWorkflowStatus {
  workflow: ApprovalWorkflowType;
  pendingApprovers: string[];
  completedApprovals: ApprovalDecision[];
  isComplete: boolean;
  canProceed: boolean;
  nextActions: string[];
}

export class ApprovalWorkflowService {
  private config: ApprovalWorkflowConfig;
  private reminderJob: ReturnType<typeof cron.schedule> | null = null;
  private expirationJob: ReturnType<typeof cron.schedule> | null = null;

  constructor(
    private databaseService: DatabaseService,
    private eventBusService: EventBusService,
    private notificationService: NotificationService,
    private auditService: AuditService
  ) {
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
   * Start the cron jobs (should be called after database is initialized)
   */
  public startCronJobs(): void {
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
      const savedWorkflow = await this.databaseService.security
        .getApprovalWorkflowRepository()
        .createApprovalWorkflow({
          id: request.operationId,
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
        status: savedWorkflow.status as ApprovalStatus,
        expiresAt: savedWorkflow.expiresAt,
        metadata: savedWorkflow.metadata,
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
    decision: ApprovalDecision
  ): Promise<ApprovalWorkflowStatus> {
    try {
      logger.info('Processing approval decision', {
        workflowId: decision.workflowId,
        approverId: decision.approverId,
        decision: decision.decision,
      });

      // Get workflow
      const workflow = await this.getWorkflow(decision.workflowId);
      if (!workflow) {
        throw new ApiError(404, 'Approval workflow not found', 'WORKFLOW_NOT_FOUND');
      }

      // Validate decision
      this.validateApprovalDecision(workflow, decision);

      // Save decision using DatabaseService
      const approvalDecisionRepo = this.databaseService.security.getApprovalDecisionRepository();
      await approvalDecisionRepo.createApprovalDecision({
        id: `decision-${decision.workflowId}-${decision.approverId}`,
        workflowId: decision.workflowId,
        approverId: decision.approverId,
        decision: decision.decision,
        conditions: decision.conditions,
        feedback: decision.feedback,
        decidedAt: decision.decidedAt,
      });

      // Update workflow status
      const updatedWorkflow = await this.updateWorkflowStatus(workflow, decision);

      // Get current status
      const status = await this.getWorkflowStatus(updatedWorkflow.id);

      // Check if workflow is complete
      if (status.isComplete) {
        await this.completeWorkflow(updatedWorkflow, status.canProceed);
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

      const pendingApprovers = workflow.requiredApprovers.filter(
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
      const workflows = await this.databaseService.security
        .getApprovalWorkflowRepository()
        .getUserApprovalWorkflows(userId, status);

      return workflows.map(this.mapEntityToWorkflow);
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
      await this.databaseService.security
        .getApprovalWorkflowRepository()
        .updateApprovalWorkflow(workflowId, {
          status: 'cancelled' as any,
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

      const workflows = await this.databaseService.security
        .getApprovalWorkflowRepository()
        .getPendingWorkflowsForReminders(reminderThreshold);

      for (const workflowEntity of workflows) {
        const workflow = this.mapEntityToWorkflow(workflowEntity);
        await this.sendWorkflowReminder(workflow);
      }
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

      const workflows = await this.databaseService.security
        .getApprovalWorkflowRepository()
        .getExpiredWorkflows();
      logger.debug('Found expired workflows', { count: workflows.length });

      if (workflows.length === 0) {
        logger.debug('No expired workflows found');
        return;
      }

      for (const workflowEntity of workflows) {
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
          // Continue with other workflows even if one fails
        }
      }
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
      // Update workflow status to expired
      const updatedWorkflow = await this.databaseService.security
        .getApprovalWorkflowRepository()
        .updateApprovalWorkflow(workflowId, {
          status: 'expired' as any,
        });

      if (!updatedWorkflow) {
        logger.warn('Workflow not found during expiration', { workflowId });
        return;
      }

      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) {
        logger.warn('Could not retrieve workflow after expiration update', { workflowId });
        return;
      }

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
        await this.eventBusService.publish('approval.workflow.expired', {
          workflowId,
          operationId: workflow.operationId,
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
    const status = await this.getWorkflowStatus(workflow.id);

    if (status.pendingApprovers.length > 0) {
      await this.notifyApprovers(workflow, 'approval_reminder', {
        pendingApprovers: status.pendingApprovers,
      });

      // Update last reminder time
      await this.databaseService.security
        .getApprovalWorkflowRepository()
        .updateApprovalWorkflow(workflow.id, {
          lastReminderAt: new Date(),
        });
    }
  }

  /**
   * Complete workflow
   */
  private async completeWorkflow(workflow: ApprovalWorkflowType, approved: boolean): Promise<void> {
    const newStatus = approved ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;

    // Update workflow status
    await this.databaseService.security
      .getApprovalWorkflowRepository()
      .updateApprovalWorkflow(workflow.id, {
        status: newStatus as any,
      });

    // Notify stakeholders
    await this.notifyApprovers(workflow, approved ? 'approval_completed' : 'approval_rejected');

    // Publish event
    await this.eventBusService.publish('approval.workflow.completed', {
      workflowId: workflow.id,
      operationId: workflow.operationId,
      approved,
      status: newStatus,
    });

    logger.info('Approval workflow completed', {
      workflowId: workflow.id,
      operationId: workflow.operationId,
      approved,
      status: newStatus,
    });
  }

  /**
   * Update workflow status based on decision
   */
  private async updateWorkflowStatus(
    workflow: ApprovalWorkflowType,
    decision: ApprovalDecision
  ): Promise<ApprovalWorkflowType> {
    // Add approver to current approvers if approving
    if (
      decision.decision === 'approve' &&
      !workflow.currentApprovers.includes(decision.approverId)
    ) {
      workflow.currentApprovers.push(decision.approverId);
    }

    // Update in database
    await this.databaseService.security
      .getApprovalWorkflowRepository()
      .updateApprovalWorkflow(workflow.id, {
        currentApprovers: workflow.currentApprovers,
      });

    return { ...workflow, updatedAt: new Date() };
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

    if (!workflow.requiredApprovers.includes(decision.approverId)) {
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
    additionalData?: Record<string, any>
  ): Promise<void> {
    try {
      // Send notifications to each approver individually
      for (const approverId of workflow.requiredApprovers) {
        await this.notificationService.sendNotification({
          type,
          recipient: approverId,
          subject: this.getNotificationSubject(type, workflow),
          message: this.getNotificationMessage(type, workflow),
          data: {
            workflowId: workflow.id,
            operationId: workflow.operationId,
            ...additionalData,
          },
        });
      }
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
   * Database operations using TypeORM
   */
  private async getWorkflow(workflowId: string): Promise<ApprovalWorkflowType | null> {
    const workflowEntity = await this.databaseService.security
      .getApprovalWorkflowRepository()
      .findById(workflowId);

    return workflowEntity ? this.mapEntityToWorkflow(workflowEntity) : null;
  }

  private async getApprovalDecisions(workflowId: string): Promise<ApprovalDecision[]> {
    const decisions = await this.databaseService.security
      .getApprovalDecisionRepository()
      .getApprovalDecisions(workflowId);

    return decisions.map((decision) => ({
      workflowId: decision.workflowId,
      approverId: decision.approverId,
      decision: decision.decision,
      conditions: decision.conditions,
      feedback: decision.feedback,
      decidedAt: decision.decidedAt,
    }));
  }

  /**
   * Entity mapping helper
   */
  private mapEntityToWorkflow(entity: any): ApprovalWorkflowType {
    return {
      id: entity.id,
      operationId: entity.operationId,
      requiredApprovers: entity.requiredApprovers,
      currentApprovers: entity.currentApprovers,
      status: entity.status as ApprovalStatus,
      expiresAt: entity.expiresAt,
      metadata: entity.metadata,
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
}
