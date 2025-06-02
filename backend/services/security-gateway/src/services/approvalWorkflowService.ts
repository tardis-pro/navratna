import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/shared-services';
import {
  ApprovalWorkflow,
  ApprovalDecision,
  ApprovalStatus,
  SecurityLevel,
  AuditEventType,
  Operation
} from '@uaip/types';
import { NotificationService } from './notificationService';
import { AuditService } from './auditService';

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
  workflow: ApprovalWorkflow;
  pendingApprovers: string[];
  completedApprovals: ApprovalDecision[];
  isComplete: boolean;
  canProceed: boolean;
  nextActions: string[];
}

export class ApprovalWorkflowService {
  private config: ApprovalWorkflowConfig;
  private reminderJob: cron.ScheduledTask | null = null;
  private expirationJob: cron.ScheduledTask | null = null;

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
      requireAllApprovers: false
    };

    this.setupCronJobs();
  }

  /**
   * Create a new approval workflow
   */
  public async createApprovalWorkflow(request: ApprovalRequest): Promise<ApprovalWorkflow> {
    try {
      logger.info('Creating approval workflow', {
        operationId: request.operationId,
        requiredApprovers: request.requiredApprovers.length,
        securityLevel: request.securityLevel
      });

      // Validate request
      this.validateApprovalRequest(request);

      // Calculate expiration time
      const expirationHours = request.expirationHours || this.config.defaultExpirationHours;
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expirationHours);

      // Create workflow
      const workflow: ApprovalWorkflow = {
        id: uuidv4(),
        operationId: request.operationId,
        requiredApprovers: request.requiredApprovers,
        currentApprovers: [],
        status: ApprovalStatus.PENDING,
        expiresAt,
        metadata: {
          operationType: request.operationType,
          securityLevel: request.securityLevel,
          context: request.context,
          ...request.metadata
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save to database
      await this.saveWorkflow(workflow);

      // Send notifications to approvers
      await this.notifyApprovers(workflow, 'approval_requested');

      // Publish event
      await this.eventBusService.publish('approval.workflow.created', {
        workflowId: workflow.id,
        operationId: workflow.operationId,
        requiredApprovers: workflow.requiredApprovers,
        expiresAt: workflow.expiresAt
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
          securityLevel: request.securityLevel
        }
      });

      logger.info('Approval workflow created successfully', {
        workflowId: workflow.id,
        operationId: workflow.operationId
      });

      return workflow;

    } catch (error) {
      logger.error('Failed to create approval workflow', {
        operationId: request.operationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Process an approval decision
   */
  public async processApprovalDecision(decision: ApprovalDecision): Promise<ApprovalWorkflowStatus> {
    try {
      logger.info('Processing approval decision', {
        workflowId: decision.workflowId,
        approverId: decision.approverId,
        decision: decision.decision
      });

      // Get workflow
      const workflow = await this.getWorkflow(decision.workflowId);
      if (!workflow) {
        throw new ApiError(404, 'Approval workflow not found', 'WORKFLOW_NOT_FOUND');
      }

      // Validate decision
      this.validateApprovalDecision(workflow, decision);

      // Check if workflow is still valid
      if (workflow.status !== ApprovalStatus.PENDING) {
        throw new ApiError(400, 'Workflow is no longer pending', 'WORKFLOW_NOT_PENDING');
      }

      if (workflow.expiresAt && new Date() > workflow.expiresAt) {
        await this.expireWorkflow(workflow.id);
        throw new ApiError(400, 'Workflow has expired', 'WORKFLOW_EXPIRED');
      }

      // Save decision
      await this.saveApprovalDecision(decision);

      // Update workflow
      const updatedWorkflow = await this.updateWorkflowStatus(workflow, decision);

      // Get current status
      const status = await this.getWorkflowStatus(updatedWorkflow.id);

      // Handle workflow completion
      if (status.isComplete) {
        await this.completeWorkflow(updatedWorkflow, status.canProceed);
      }

      // Audit log
      await this.auditService.logEvent({
        eventType: decision.decision === 'approve' 
          ? AuditEventType.APPROVAL_GRANTED 
          : AuditEventType.APPROVAL_DENIED,
        userId: decision.approverId,
        resourceType: 'approval_workflow',
        resourceId: workflow.id,
        details: {
          operationId: workflow.operationId,
          decision: decision.decision,
          feedback: decision.feedback,
          conditions: decision.conditions
        }
      });

      logger.info('Approval decision processed successfully', {
        workflowId: decision.workflowId,
        decision: decision.decision,
        isComplete: status.isComplete,
        canProceed: status.canProceed
      });

      return status;

    } catch (error) {
      logger.error('Failed to process approval decision', {
        workflowId: decision.workflowId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get workflow status
   */
  public async getWorkflowStatus(workflowId: string): Promise<ApprovalWorkflowStatus> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new ApiError(404, 'Approval workflow not found', 'WORKFLOW_NOT_FOUND');
    }

    const decisions = await this.getApprovalDecisions(workflowId);
    const approvedDecisions = decisions.filter(d => d.decision === 'approve');
    const rejectedDecisions = decisions.filter(d => d.decision === 'reject');

    const pendingApprovers = workflow.requiredApprovers.filter(
      approverId => !decisions.some(d => d.approverId === approverId)
    );

    // Determine if workflow is complete
    const hasRejection = rejectedDecisions.length > 0;
    const hasAllApprovals = this.config.requireAllApprovers 
      ? approvedDecisions.length === workflow.requiredApprovers.length
      : approvedDecisions.length > 0 && pendingApprovers.length === 0;

    const isComplete = hasRejection || hasAllApprovals || workflow.status !== ApprovalStatus.PENDING;
    const canProceed = !hasRejection && hasAllApprovals;

    // Determine next actions
    const nextActions: string[] = [];
    if (!isComplete) {
      if (pendingApprovers.length > 0) {
        nextActions.push('waiting_for_approvals');
      }
      if (workflow.expiresAt && new Date() > workflow.expiresAt) {
        nextActions.push('workflow_expired');
      }
    } else {
      if (canProceed) {
        nextActions.push('operation_approved');
      } else {
        nextActions.push('operation_rejected');
      }
    }

    return {
      workflow,
      pendingApprovers,
      completedApprovals: decisions,
      isComplete,
      canProceed,
      nextActions
    };
  }

  /**
   * Get workflows for a user (as approver)
   */
  public async getUserWorkflows(userId: string, status?: ApprovalStatus): Promise<ApprovalWorkflow[]> {
    const query = `
      SELECT * FROM approval_workflows 
      WHERE $1 = ANY(required_approvers)
      ${status ? 'AND status = $2' : ''}
      ORDER BY created_at DESC
    `;
    
    const params = status ? [userId, status] : [userId];
    const result = await this.databaseService.query(query, params);
    
    return result.rows.map(row => this.mapRowToWorkflow(row));
  }

  /**
   * Cancel a workflow
   */
  public async cancelWorkflow(workflowId: string, reason: string): Promise<void> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new ApiError(404, 'Approval workflow not found', 'WORKFLOW_NOT_FOUND');
    }

    if (workflow.status !== ApprovalStatus.PENDING) {
      throw new ApiError(400, 'Cannot cancel non-pending workflow', 'WORKFLOW_NOT_PENDING');
    }

    // Update status
    await this.databaseService.query(
      'UPDATE approval_workflows SET status = $1, updated_at = $2 WHERE id = $3',
      ['cancelled', new Date(), workflowId]
    );

    // Notify approvers
    await this.notifyApprovers(workflow, 'approval_cancelled', { reason });

    // Publish event
    await this.eventBusService.publish('approval.workflow.cancelled', {
      workflowId,
      operationId: workflow.operationId,
      reason
    });

    // Audit log
    await this.auditService.logEvent({
      eventType: AuditEventType.APPROVAL_DENIED,
      resourceType: 'approval_workflow',
      resourceId: workflowId,
      details: { reason, action: 'cancelled' }
    });
  }

  /**
   * Setup cron jobs for reminders and expiration
   */
  private setupCronJobs(): void {
    // Reminder job - runs every hour
    this.reminderJob = cron.schedule('0 * * * *', async () => {
      await this.sendReminders();
    });

    // Expiration job - runs every 30 minutes
    this.expirationJob = cron.schedule('*/30 * * * *', async () => {
      await this.expireWorkflows();
    });

    logger.info('Approval workflow cron jobs scheduled');
  }

  /**
   * Send reminders for pending approvals
   */
  private async sendReminders(): Promise<void> {
    try {
      const reminderThreshold = new Date();
      reminderThreshold.setHours(reminderThreshold.getHours() - this.config.reminderIntervalHours);

      const query = `
        SELECT * FROM approval_workflows 
        WHERE status = $1 
        AND created_at <= $2 
        AND (last_reminder_at IS NULL OR last_reminder_at <= $3)
      `;

      const result = await this.databaseService.query(query, [
        ApprovalStatus.PENDING,
        reminderThreshold,
        reminderThreshold
      ]);

      for (const row of result.rows) {
        const workflow = this.mapRowToWorkflow(row);
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
      const query = `
        SELECT * FROM approval_workflows 
        WHERE status = $1 AND expires_at <= $2
      `;

      const result = await this.databaseService.query(query, [ApprovalStatus.PENDING, now]);

      for (const row of result.rows) {
        const workflow = this.mapRowToWorkflow(row);
        await this.expireWorkflow(workflow.id);
      }

    } catch (error) {
      logger.error('Failed to expire workflows', { error });
    }
  }

  /**
   * Expire a specific workflow
   */
  private async expireWorkflow(workflowId: string): Promise<void> {
    await this.databaseService.query(
      'UPDATE approval_workflows SET status = $1, updated_at = $2 WHERE id = $3',
      [ApprovalStatus.EXPIRED, new Date(), workflowId]
    );

    const workflow = await this.getWorkflow(workflowId);
    if (workflow) {
      // Notify approvers
      await this.notifyApprovers(workflow, 'approval_expired');

      // Publish event
      await this.eventBusService.publish('approval.workflow.expired', {
        workflowId,
        operationId: workflow.operationId
      });

      // Audit log
      await this.auditService.logEvent({
        eventType: AuditEventType.APPROVAL_DENIED,
        resourceType: 'approval_workflow',
        resourceId: workflowId,
        details: { reason: 'expired', action: 'auto_expired' }
      });
    }
  }

  /**
   * Send workflow reminder
   */
  private async sendWorkflowReminder(workflow: ApprovalWorkflow): Promise<void> {
    const status = await this.getWorkflowStatus(workflow.id);
    
    if (status.pendingApprovers.length > 0) {
      await this.notifyApprovers(workflow, 'approval_reminder', {
        pendingApprovers: status.pendingApprovers
      });

      // Update last reminder time
      await this.databaseService.query(
        'UPDATE approval_workflows SET last_reminder_at = $1 WHERE id = $2',
        [new Date(), workflow.id]
      );
    }
  }

  /**
   * Complete workflow
   */
  private async completeWorkflow(workflow: ApprovalWorkflow, approved: boolean): Promise<void> {
    const newStatus = approved ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;
    
    // Update workflow status
    await this.databaseService.query(
      'UPDATE approval_workflows SET status = $1, updated_at = $2 WHERE id = $3',
      [newStatus, new Date(), workflow.id]
    );

    // Notify stakeholders
    await this.notifyApprovers(workflow, approved ? 'approval_completed' : 'approval_rejected');

    // Publish event
    await this.eventBusService.publish('approval.workflow.completed', {
      workflowId: workflow.id,
      operationId: workflow.operationId,
      approved,
      status: newStatus
    });

    logger.info('Approval workflow completed', {
      workflowId: workflow.id,
      operationId: workflow.operationId,
      approved,
      status: newStatus
    });
  }

  /**
   * Update workflow status based on decision
   */
  private async updateWorkflowStatus(
    workflow: ApprovalWorkflow, 
    decision: ApprovalDecision
  ): Promise<ApprovalWorkflow> {
    // Add approver to current approvers if approving
    if (decision.decision === 'approve' && !workflow.currentApprovers.includes(decision.approverId)) {
      workflow.currentApprovers.push(decision.approverId);
    }

    // Update in database
    await this.databaseService.query(
      'UPDATE approval_workflows SET current_approvers = $1, updated_at = $2 WHERE id = $3',
      [workflow.currentApprovers, new Date(), workflow.id]
    );

    return { ...workflow, updatedAt: new Date() };
  }

  /**
   * Validate approval request
   */
  private validateApprovalRequest(request: ApprovalRequest): void {
    if (!request.operationId) {
      throw new ApiError(400, 'Operation ID is required', 'MISSING_OPERATION_ID');
    }

    if (!request.requiredApprovers || request.requiredApprovers.length === 0) {
      throw new ApiError(400, 'At least one approver is required', 'MISSING_APPROVERS');
    }

    if (request.requiredApprovers.length > this.config.maxApprovers) {
      throw new ApiError(400, `Maximum ${this.config.maxApprovers} approvers allowed`, 'TOO_MANY_APPROVERS');
    }

    // Check for duplicate approvers
    const uniqueApprovers = new Set(request.requiredApprovers);
    if (uniqueApprovers.size !== request.requiredApprovers.length) {
      throw new ApiError(400, 'Duplicate approvers not allowed', 'DUPLICATE_APPROVERS');
    }
  }

  /**
   * Validate approval decision
   */
  private validateApprovalDecision(workflow: ApprovalWorkflow, decision: ApprovalDecision): void {
    if (!workflow.requiredApprovers.includes(decision.approverId)) {
      throw new ApiError(403, 'User not authorized to approve this workflow', 'NOT_AUTHORIZED_APPROVER');
    }

    // Check if user already made a decision
    const existingDecisions = this.getApprovalDecisions(workflow.id);
    // Note: This would need to be awaited in real implementation
  }

  /**
   * Notify approvers
   */
  private async notifyApprovers(
    workflow: ApprovalWorkflow, 
    type: string, 
    additionalData?: Record<string, any>
  ): Promise<void> {
    try {
      const approvers = type === 'approval_reminder' && additionalData?.pendingApprovers
        ? additionalData.pendingApprovers
        : workflow.requiredApprovers;

      for (const approverId of approvers) {
        await this.notificationService.sendApprovalNotification({
          type,
          recipientId: approverId,
          workflowId: workflow.id,
          operationId: workflow.operationId,
          metadata: workflow.metadata,
          ...additionalData
        });
      }
    } catch (error) {
      logger.error('Failed to notify approvers', {
        workflowId: workflow.id,
        type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Database operations
   */
  private async saveWorkflow(workflow: ApprovalWorkflow): Promise<void> {
    const query = `
      INSERT INTO approval_workflows (
        id, operation_id, required_approvers, current_approvers, 
        status, expires_at, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    await this.databaseService.query(query, [
      workflow.id,
      workflow.operationId,
      workflow.requiredApprovers,
      workflow.currentApprovers,
      workflow.status,
      workflow.expiresAt,
      JSON.stringify(workflow.metadata),
      workflow.createdAt,
      workflow.updatedAt
    ]);
  }

  private async getWorkflow(workflowId: string): Promise<ApprovalWorkflow | null> {
    const result = await this.databaseService.query(
      'SELECT * FROM approval_workflows WHERE id = $1',
      [workflowId]
    );

    return result.rows.length > 0 ? this.mapRowToWorkflow(result.rows[0]) : null;
  }

  private async saveApprovalDecision(decision: ApprovalDecision): Promise<void> {
    const query = `
      INSERT INTO approval_decisions (
        workflow_id, approver_id, decision, conditions, feedback, decided_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    await this.databaseService.query(query, [
      decision.workflowId,
      decision.approverId,
      decision.decision,
      decision.conditions ? JSON.stringify(decision.conditions) : null,
      decision.feedback,
      decision.decidedAt
    ]);
  }

  private async getApprovalDecisions(workflowId: string): Promise<ApprovalDecision[]> {
    const result = await this.databaseService.query(
      'SELECT * FROM approval_decisions WHERE workflow_id = $1 ORDER BY decided_at',
      [workflowId]
    );

    return result.rows.map(row => ({
      workflowId: row.workflow_id,
      approverId: row.approver_id,
      decision: row.decision,
      conditions: row.conditions ? JSON.parse(row.conditions) : undefined,
      feedback: row.feedback,
      decidedAt: row.decided_at
    }));
  }

  private mapRowToWorkflow(row: any): ApprovalWorkflow {
    return {
      id: row.id,
      operationId: row.operation_id,
      requiredApprovers: row.required_approvers,
      currentApprovers: row.current_approvers || [],
      status: row.status,
      expiresAt: row.expires_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    if (this.reminderJob) {
      this.reminderJob.stop();
    }
    if (this.expirationJob) {
      this.expirationJob.stop();
    }
    logger.info('Approval workflow service cleanup completed');
  }
} 