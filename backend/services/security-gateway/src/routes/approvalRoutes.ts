import express, { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { validateRequest } from '@uaip/middleware';
import { authMiddleware, requireOperator } from '@uaip/middleware';
import { ApprovalWorkflowService } from '../services/approvalWorkflowService.js';
import { AuditService } from '../services/auditService.js';
import { DatabaseService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/shared-services';
import { NotificationService } from '../services/notificationService.js';
import {
  ApprovalDecision,
  ApprovalStatus,
  SecurityLevel,
  AuditEventType
} from '@uaip/types';
import { config } from '@uaip/config';

const router: Router = express.Router();

// Initialize services
const databaseService = new DatabaseService();
const eventBusService = new EventBusService(
  {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    serviceName: 'security-gateway'
  },
  logger
);
const notificationService = new NotificationService();
const auditService = new AuditService(databaseService);
const approvalWorkflowService = new ApprovalWorkflowService(
  databaseService,
  eventBusService,
  notificationService,
  auditService
);

// Validation schemas using Zod
const createWorkflowSchema = z.object({
  operationId: z.string().uuid(),
  operationType: z.string(),
  requiredApprovers: z.array(z.string().uuid()).min(1).max(10),
  securityLevel: z.nativeEnum(SecurityLevel),
  context: z.record(z.any()),
  expirationHours: z.number().min(1).max(168).optional(), // Max 1 week
  metadata: z.record(z.any()).optional()
});

const approvalDecisionSchema = z.object({
  workflowId: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  conditions: z.array(z.string()).optional(),
  feedback: z.string().max(1000).optional()
});

const queryWorkflowsSchema = z.object({
  status: z.nativeEnum(ApprovalStatus).optional(),
  operationType: z.string().optional(),
  securityLevel: z.nativeEnum(SecurityLevel).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0)
});

/**
 * POST /api/v1/approvals/workflows
 * Create a new approval workflow
 */
router.post('/workflows',
  authMiddleware,
  requireOperator,
  validateRequest({ body: createWorkflowSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('Creating approval workflow', {
        operationId: req.body.operationId,
        operationType: req.body.operationType,
        // @ts-ignore
        userId: req.user?.id
      });

      const workflow = await approvalWorkflowService.createApprovalWorkflow({
        operationId: req.body.operationId,
        operationType: req.body.operationType,
        requiredApprovers: req.body.requiredApprovers,
        securityLevel: req.body.securityLevel,
        context: req.body.context,
        expirationHours: req.body.expirationHours,
        metadata: {
          ...req.body.metadata,
          // @ts-ignore
          createdBy: req.user?.id,
          createdAt: new Date().toISOString()
        }
      });

      // Audit log
      await auditService.logEvent({
        eventType: AuditEventType.APPROVAL_REQUESTED,
        // @ts-ignore
        userId: req.user?.id,
        resourceType: 'approval_workflow',
        resourceId: workflow.id,
        details: {
          operationId: req.body.operationId,
          operationType: req.body.operationType,
          requiredApprovers: req.body.requiredApprovers.length,
          securityLevel: req.body.securityLevel
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        riskLevel: req.body.securityLevel
      });

      res.status(201).json({
        success: true,
        data: {
          workflow,
          approvalUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/approvals/${workflow.id}`
        },
        message: 'Approval workflow created successfully'
      });

    } catch (error) {
      logger.error('Failed to create approval workflow', {
        operationId: req.body.operationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }
);

/**
 * POST /api/v1/approvals/:workflowId/decisions
 * Submit an approval decision
 */
router.post('/:workflowId/decisions',
  authMiddleware,
  validateRequest({ body: approvalDecisionSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { workflowId } = req.params;
      const { decision, conditions, feedback } = req.body;

      logger.info('Processing approval decision', {
        workflowId,
        decision,
        // @ts-ignore
        approverId: req.user?.id
      });

      const approvalDecision: ApprovalDecision = {
        workflowId,
        // @ts-ignore
        approverId: req.user!.id,
        decision,
        conditions,
        feedback,
        decidedAt: new Date()
      };

      const status = await approvalWorkflowService.processApprovalDecision(approvalDecision);

      // Audit log
      await auditService.logEvent({
        eventType: decision === 'approve' 
          ? AuditEventType.APPROVAL_GRANTED 
          : AuditEventType.APPROVAL_DENIED,
        // @ts-ignore
        userId: req.user?.id,
        resourceType: 'approval_workflow',
        resourceId: workflowId,
        details: {
          decision,
          conditions,
          feedback,
          workflowStatus: status.isComplete ? 'completed' : 'pending',
          canProceed: status.canProceed
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        riskLevel: decision === 'reject' ? SecurityLevel.MEDIUM : SecurityLevel.LOW
      });

      res.json({
        success: true,
        data: {
          decision: approvalDecision,
          status,
          message: status.isComplete 
            ? (status.canProceed ? 'Operation approved and can proceed' : 'Operation rejected')
            : 'Decision recorded, waiting for additional approvals'
        },
        message: 'Approval decision processed successfully'
      });

    } catch (error) {
      logger.error('Failed to process approval decision', {
        workflowId: req.params.workflowId,
        decision: req.body.decision,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }
);

/**
 * GET /api/v1/approvals/:workflowId
 * Get approval workflow details and status
 */
router.get('/:workflowId',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { workflowId } = req.params;

      logger.debug('Getting approval workflow status', {
        workflowId,
        // @ts-ignore
        userId: req.user?.id
      });

      const status = await approvalWorkflowService.getWorkflowStatus(workflowId);

      // Check if user is authorized to view this workflow
      // @ts-ignore
      const isAuthorized = status.workflow.requiredApprovers.includes(req.user!.id) ||
                          // @ts-ignore
                          status.workflow.metadata?.createdBy === req.user!.id ||
                          // @ts-ignore
                          req.user!.role === 'admin' ||
                          // @ts-ignore
                          req.user!.role === 'security-admin';

      if (!isAuthorized) {
        throw new ApiError(403, 'Not authorized to view this approval workflow', 'UNAUTHORIZED_ACCESS');
      }

      res.json({
        success: true,
        data: status,
        message: 'Approval workflow status retrieved successfully'
      });

    } catch (error) {
      logger.error('Failed to get approval workflow status', {
        workflowId: req.params.workflowId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }
);

/**
 * GET /api/v1/approvals/workflows
 * Get approval workflows (for current user or all if admin)
 */
router.get('/workflows',
  authMiddleware,
  validateRequest({ query: queryWorkflowsSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, operationType, securityLevel, startDate, endDate, limit, offset } = req.query;

      logger.debug('Querying approval workflows', {
        // @ts-ignore
        userId: req.user?.id,
        status,
        operationType,
        limit,
        offset
      });

      let workflows;

      // Admins can see all workflows, others only see their own
      // @ts-ignore
      if (req.user!.role === 'admin' || req.user!.role === 'security-admin') {
        // Get all workflows with filters
        workflows = await approvalWorkflowService.getUserWorkflows(
          '', // Empty string to get all
          status as ApprovalStatus
        );
      } else {
        // Get workflows where user is an approver
        workflows = await approvalWorkflowService.getUserWorkflows(
          // @ts-ignore
          req.user!.id,
          status as ApprovalStatus
        );
      }

      // Apply additional filters
      let filteredWorkflows = workflows;

      if (operationType) {
        filteredWorkflows = filteredWorkflows.filter(w => 
          w.metadata?.operationType === operationType
        );
      }

      if (securityLevel) {
        filteredWorkflows = filteredWorkflows.filter(w => 
          w.metadata?.securityLevel === securityLevel
        );
      }

      if (startDate) {
        const start = new Date(startDate as string);
        filteredWorkflows = filteredWorkflows.filter(w => 
          w.createdAt >= start
        );
      }

      if (endDate) {
        const end = new Date(endDate as string);
        filteredWorkflows = filteredWorkflows.filter(w => 
          w.createdAt <= end
        );
      }

      // Apply pagination
      const total = filteredWorkflows.length;
      const paginatedWorkflows = filteredWorkflows.slice(
        Number(offset),
        Number(offset) + Number(limit)
      );

      res.json({
        success: true,
        data: {
          workflows: paginatedWorkflows,
          pagination: {
            total,
            limit: Number(limit),
            offset: Number(offset),
            hasMore: Number(offset) + Number(limit) < total
          }
        },
        message: 'Approval workflows retrieved successfully'
      });

    } catch (error) {
      logger.error('Failed to query approval workflows', {
        // @ts-ignore
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }
);

/**
 * GET /api/v1/approvals/pending
 * Get pending approvals for current user
 */
router.get('/pending',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.debug('Getting pending approvals', {
        // @ts-ignore
        userId: req.user?.id
      });

      const pendingWorkflows = await approvalWorkflowService.getUserWorkflows(
        // @ts-ignore
        req.user!.id,
        ApprovalStatus.PENDING
      );

      // Get detailed status for each workflow
      const workflowsWithStatus = await Promise.all(
        pendingWorkflows.map(async (workflow) => {
          const status = await approvalWorkflowService.getWorkflowStatus(workflow.id);
          return {
            workflow,
            status,
            // @ts-ignore
            isPendingForUser: status.pendingApprovers.includes(req.user!.id),
            urgency: workflow ? calculateUrgency(workflow) : 50 // Default medium urgency as number
          };
        })
      );

      // Filter to only workflows pending for this user
      const userPendingWorkflows = workflowsWithStatus.filter(w => w.isPendingForUser);

      // Sort by urgency (most urgent first)
      userPendingWorkflows.sort((a, b) => b.urgency - a.urgency);

      res.json({
        success: true,
        data: {
          pendingApprovals: userPendingWorkflows,
          count: userPendingWorkflows.length,
          summary: {
            critical: userPendingWorkflows.filter(w => w.workflow.metadata?.securityLevel === SecurityLevel.CRITICAL).length,
            high: userPendingWorkflows.filter(w => w.workflow.metadata?.securityLevel === SecurityLevel.HIGH).length,
            medium: userPendingWorkflows.filter(w => w.workflow.metadata?.securityLevel === SecurityLevel.MEDIUM).length,
            low: userPendingWorkflows.filter(w => w.workflow.metadata?.securityLevel === SecurityLevel.LOW).length
          }
        },
        message: 'Pending approvals retrieved successfully'
      });

    } catch (error) {
      logger.error('Failed to get pending approvals', {
        // @ts-ignore
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }
);

/**
 * POST /api/v1/approvals/:workflowId/cancel
 * Cancel an approval workflow
 */
router.post('/:workflowId/cancel',
  authMiddleware,
  requireOperator,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { workflowId } = req.params;
      const { reason } = req.body;

      logger.info('Cancelling approval workflow', {
        workflowId,
        reason,
        // @ts-ignore
        userId: req.user?.id
      });

      if (!reason || reason.trim().length === 0) {
        throw new ApiError(400, 'Cancellation reason is required', 'MISSING_REASON');
      }

      await approvalWorkflowService.cancelWorkflow(workflowId, reason);

      // Audit log
      await auditService.logEvent({
        eventType: AuditEventType.APPROVAL_DENIED,
        // @ts-ignore
        userId: req.user?.id,
        resourceType: 'approval_workflow',
        resourceId: workflowId,
        details: {
          action: 'cancelled',
          reason,
          // @ts-ignore
          cancelledBy: req.user?.id
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        riskLevel: SecurityLevel.MEDIUM
      });

      res.json({
        success: true,
        message: 'Approval workflow cancelled successfully'
      });

    } catch (error) {
      logger.error('Failed to cancel approval workflow', {
        workflowId: req.params.workflowId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }
);

/**
 * GET /api/v1/approvals/stats
 * Get approval statistics
 */
router.get('/stats',
  authMiddleware,
  requireOperator,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { days = 30 } = req.query;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - Number(days));

      logger.debug('Getting approval statistics', {
        days,
        // @ts-ignore
        userId: req.user?.id
      });

      // Get all workflows in the time period
      const allWorkflows = await approvalWorkflowService.getUserWorkflows(''); // Get all

      const filteredWorkflows = allWorkflows.filter(w => w.createdAt >= startDate);

      // Calculate statistics
      const stats = {
        total: filteredWorkflows.length,
        byStatus: {
          pending: filteredWorkflows.filter(w => w.status === ApprovalStatus.PENDING).length,
          approved: filteredWorkflows.filter(w => w.status === ApprovalStatus.APPROVED).length,
          rejected: filteredWorkflows.filter(w => w.status === ApprovalStatus.REJECTED).length,
          expired: filteredWorkflows.filter(w => w.status === ApprovalStatus.EXPIRED).length
        },
        bySecurityLevel: {
          critical: filteredWorkflows.filter(w => w.metadata?.securityLevel === SecurityLevel.CRITICAL).length,
          high: filteredWorkflows.filter(w => w.metadata?.securityLevel === SecurityLevel.HIGH).length,
          medium: filteredWorkflows.filter(w => w.metadata?.securityLevel === SecurityLevel.MEDIUM).length,
          low: filteredWorkflows.filter(w => w.metadata?.securityLevel === SecurityLevel.LOW).length
        },
        averageApprovalTime: filteredWorkflows.length > 0 ? calculateAverageApprovalTime(filteredWorkflows) : 0
      };

      res.json({
        success: true,
        data: {
          stats,
          period: {
            days: Number(days),
            startDate,
            endDate: new Date()
          }
        },
        message: 'Approval statistics retrieved successfully'
      });

    } catch (error) {
      logger.error('Failed to get approval statistics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }
);

/**
 * Helper functions
 */
function calculateUrgency(workflow: any): number {
  let urgency = 0;

  // Security level urgency
  switch (workflow.metadata?.securityLevel) {
    case SecurityLevel.CRITICAL:
      urgency += 100;
      break;
    case SecurityLevel.HIGH:
      urgency += 75;
      break;
    case SecurityLevel.MEDIUM:
      urgency += 50;
      break;
    case SecurityLevel.LOW:
      urgency += 25;
      break;
  }

  // Time-based urgency (closer to expiration = higher urgency)
  if (workflow.expiresAt) {
    const now = new Date();
    const expiresAt = new Date(workflow.expiresAt);
    const timeLeft = expiresAt.getTime() - now.getTime();
    const hoursLeft = timeLeft / (1000 * 60 * 60);

    if (hoursLeft < 1) {
      urgency += 50; // Expires in less than 1 hour
    } else if (hoursLeft < 4) {
      urgency += 30; // Expires in less than 4 hours
    } else if (hoursLeft < 12) {
      urgency += 15; // Expires in less than 12 hours
    }
  }

  // Age-based urgency (older requests are more urgent)
  const age = Date.now() - new Date(workflow.createdAt).getTime();
  const hoursOld = age / (1000 * 60 * 60);
  urgency += Math.min(25, hoursOld * 2); // Up to 25 points for age

  return urgency;
}

function calculateAverageApprovalTime(workflows: any[]): number {
  const completedWorkflows = workflows.filter(w => 
    w.status === ApprovalStatus.APPROVED || w.status === ApprovalStatus.REJECTED
  );

  if (completedWorkflows.length === 0) return 0;

  const totalTime = completedWorkflows.reduce((sum, workflow) => {
    const created = new Date(workflow.createdAt).getTime();
    const updated = new Date(workflow.updatedAt).getTime();
    return sum + (updated - created);
  }, 0);

  // Return average time in hours
  return (totalTime / completedWorkflows.length) / (1000 * 60 * 60);
}

export default router; 