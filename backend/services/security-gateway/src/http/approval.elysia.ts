import { z } from 'zod';
import { logger } from '@uaip/utils';
import { withRequiredAuth, withOperatorGuard } from './middleware/auth.plugin.js';
import { AuditService } from '../services/auditService.js';
import { ApprovalWorkflowService } from '../services/approvalWorkflowService.js';
import { DatabaseService, EventBusService } from '@uaip/shared-services';
import { NotificationService } from '../services/notificationService.js';
import { ApprovalStatus, SecurityLevel, AuditEventType } from '@uaip/types';

// Lazy service setup (keeps routing file self-contained)
let databaseService: DatabaseService | null = null;
let auditService: AuditService | null = null;
let notificationService: NotificationService | null = null;
let approvalWorkflowService: ApprovalWorkflowService | null = null;

async function getServices() {
  if (!databaseService) {
    databaseService = new DatabaseService();
    await databaseService.initialize();
    auditService = new AuditService();
    notificationService = new NotificationService();
    const eventBusService = new EventBusService(
      { url: process.env.RABBITMQ_URL || 'amqp://localhost:5672', serviceName: 'security-gateway' },
      logger
    );
    approvalWorkflowService = new ApprovalWorkflowService(
      databaseService,
      eventBusService,
      notificationService,
      auditService
    );
  }
  return { databaseService, auditService: auditService!, notificationService: notificationService!, approvalWorkflowService: approvalWorkflowService! };
}

const createWorkflowSchema = z.object({
  operationId: z.string(),
  operationType: z.string(),
  requiredApprovers: z.array(z.string()).min(1).max(10),
  securityLevel: z.nativeEnum(SecurityLevel),
  context: z.record(z.any()),
  expirationHours: z.number().min(1).max(168).optional(),
  metadata: z.record(z.any()).optional()
});

const approvalDecisionSchema = z.object({
  workflowId: z.string(),
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

function calculateUrgency(workflow: any): number {
  let urgency = 0;
  switch (workflow.metadata?.securityLevel) {
    case SecurityLevel.CRITICAL: urgency += 100; break;
    case SecurityLevel.HIGH: urgency += 75; break;
    case SecurityLevel.MEDIUM: urgency += 50; break;
    case SecurityLevel.LOW: urgency += 25; break;
  }
  if (workflow.expiresAt) {
    const hoursLeft = (new Date(workflow.expiresAt).getTime() - Date.now()) / 3600000;
    if (hoursLeft < 1) urgency += 50; else if (hoursLeft < 4) urgency += 30; else if (hoursLeft < 12) urgency += 15;
  }
  const hoursOld = (Date.now() - new Date(workflow.createdAt).getTime()) / 3600000;
  urgency += Math.min(25, hoursOld * 2);
  return urgency;
}

export function registerApprovalRoutes(app: any): any {
  return app.group('/api/v1/approvals', (app: any) => withRequiredAuth(app)
    // Create workflow (operator)
    .group('', (g: any) => withOperatorGuard(g)
      .post('/workflows', async ({ body, set, user, request, headers }) => {
        const parsed = createWorkflowSchema.safeParse(body);
        if (!parsed.success) { set.status = 400; return { error: 'Validation Error', details: parsed.error.flatten() }; }
        try {
          const { approvalWorkflowService, auditService } = await getServices();
          const workflow = await approvalWorkflowService.createApprovalWorkflow({
            operationId: parsed.data.operationId,
            operationType: parsed.data.operationType,
            requiredApprovers: parsed.data.requiredApprovers,
            securityLevel: parsed.data.securityLevel,
            context: parsed.data.context,
            expirationHours: parsed.data.expirationHours,
            metadata: { ...parsed.data.metadata, createdBy: user!.id, createdAt: new Date().toISOString() }
          });
          await auditService.logEvent({
            eventType: AuditEventType.APPROVAL_REQUESTED,
            userId: user!.id,
            resourceType: 'approval_workflow',
            resourceId: workflow.id,
            details: {
              operationId: parsed.data.operationId,
              operationType: parsed.data.operationType,
              requiredApprovers: parsed.data.requiredApprovers.length,
              securityLevel: parsed.data.securityLevel
            },
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: headers['user-agent'],
            riskLevel: parsed.data.securityLevel as any
          });
          set.status = 201;
          return { success: true, data: { workflow, approvalUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/approvals/${workflow.id}` }, message: 'Approval workflow created successfully' };
        } catch (error) {
          logger.error('Failed to create approval workflow', { error });
          set.status = 500;
          return { error: 'Internal Server Error', message: 'Failed to create approval workflow' };
        }
      })
      // Stats (operator)
      .get('/stats', async ({ set, query, user }) => {
        try {
          const days = Number((query as any).days ?? 30);
          const startDate = new Date(); startDate.setDate(startDate.getDate() - days);
          const { approvalWorkflowService } = await getServices();
          const all = await approvalWorkflowService.getUserWorkflows('');
          const filtered = all.filter((w: any) => w.createdAt >= startDate);
          const stats = {
            total: filtered.length,
            byStatus: {
              pending: filtered.filter((w: any) => w.status === ApprovalStatus.PENDING).length,
              approved: filtered.filter((w: any) => w.status === ApprovalStatus.APPROVED).length,
              rejected: filtered.filter((w: any) => w.status === ApprovalStatus.REJECTED).length,
              expired: filtered.filter((w: any) => w.status === ApprovalStatus.EXPIRED).length
            },
            bySecurityLevel: {
              critical: filtered.filter((w: any) => w.metadata?.securityLevel === SecurityLevel.CRITICAL).length,
              high: filtered.filter((w: any) => w.metadata?.securityLevel === SecurityLevel.HIGH).length,
              medium: filtered.filter((w: any) => w.metadata?.securityLevel === SecurityLevel.MEDIUM).length,
              low: filtered.filter((w: any) => w.metadata?.securityLevel === SecurityLevel.LOW).length
            }
          };
          return { success: true, data: { stats, period: { days, startDate, endDate: new Date() } }, message: 'Approval statistics retrieved successfully' };
        } catch (error) {
          set.status = 500;
          return { error: 'Internal Server Error', message: 'Failed to get approval statistics' };
        }
      })
    )

    // Query workflows (auth)
    .get('/workflows', async ({ set, user, query }) => {
      const parsed = queryWorkflowsSchema.safeParse(query);
      if (!parsed.success) { set.status = 400; return { error: 'Validation Error', details: parsed.error.flatten() }; }
      try {
        const { approvalWorkflowService } = await getServices();
        let workflows: any[];
        const role = (user!.role || '').toLowerCase();
        if (role === 'admin' || role === 'security_admin' || role === 'security-admin') {
          workflows = await approvalWorkflowService.getUserWorkflows('', parsed.data.status as any);
        } else {
          workflows = await approvalWorkflowService.getUserWorkflows(user!.id, parsed.data.status as any);
        }
        let filtered = workflows;
        const { operationType, securityLevel, startDate, endDate, limit, offset } = parsed.data as any;
        if (operationType) filtered = filtered.filter((w: any) => w.metadata?.operationType === operationType);
        if (securityLevel) filtered = filtered.filter((w: any) => w.metadata?.securityLevel === securityLevel);
        if (startDate) filtered = filtered.filter((w: any) => w.createdAt >= new Date(startDate));
        if (endDate) filtered = filtered.filter((w: any) => w.createdAt <= new Date(endDate));
        const total = filtered.length;
        const page = filtered.slice(Number(offset), Number(offset) + Number(limit));
        return { success: true, data: { workflows: page, pagination: { total, limit: Number(limit), offset: Number(offset), hasMore: Number(offset) + Number(limit) < total } }, message: 'Approval workflows retrieved successfully' };
      } catch (error) {
        set.status = 500;
        return { error: 'Internal Server Error', message: 'Failed to query workflows' };
      }
    })

    // Pending approvals for current user
    .get('/pending', async ({ set, user }) => {
      try {
        const { approvalWorkflowService } = await getServices();
        const pending = await approvalWorkflowService.getUserWorkflows(user!.id, ApprovalStatus.PENDING);
        const detailed = await Promise.all(pending.map(async (wf: any) => {
          const status = await approvalWorkflowService!.getWorkflowStatus(wf.id);
          return { workflow: wf, status, isPendingForUser: status.pendingApprovers.includes(user!.id), urgency: calculateUrgency(wf) };
        }));
        const userPending = detailed.filter((w: any) => w.isPendingForUser).sort((a: any, b: any) => b.urgency - a.urgency);
        return { success: true, data: { pendingApprovals: userPending, count: userPending.length, summary: {
          critical: userPending.filter((w: any) => w.workflow.metadata?.securityLevel === SecurityLevel.CRITICAL).length,
          high: userPending.filter((w: any) => w.workflow.metadata?.securityLevel === SecurityLevel.HIGH).length,
          medium: userPending.filter((w: any) => w.workflow.metadata?.securityLevel === SecurityLevel.MEDIUM).length,
          low: userPending.filter((w: any) => w.workflow.metadata?.securityLevel === SecurityLevel.LOW).length
        } }, message: 'Pending approvals retrieved successfully' };
      } catch (error) {
        set.status = 500;
        return { error: 'Internal Server Error', message: 'Failed to get pending approvals' };
      }
    })

    // Cancel workflow (operator)
    .group('', (g: any) => withOperatorGuard(g)
      .post('/:workflowId/cancel', async ({ set, params, body, user, request, headers }) => {
        try {
          const workflowId = (params as any).workflowId as string;
          const reason = (body as any)?.reason as string | undefined;
          if (!reason || !reason.trim()) { set.status = 400; return { error: 'Cancellation reason is required' }; }
          const { approvalWorkflowService, auditService } = await getServices();
          await approvalWorkflowService.cancelWorkflow(workflowId, reason);
          await auditService.logEvent({
            eventType: AuditEventType.APPROVAL_DENIED,
            userId: user!.id,
            resourceType: 'approval_workflow',
            resourceId: workflowId,
            details: { action: 'cancelled', reason, cancelledBy: user!.id },
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: headers['user-agent'],
            riskLevel: SecurityLevel.MEDIUM as any
          });
          return { success: true, message: 'Approval workflow cancelled successfully' };
        } catch (error) {
          set.status = 500;
          return { error: 'Internal Server Error', message: 'Failed to cancel approval workflow' };
        }
      })
    )

    // Workflow details
    .get('/:workflowId', async ({ set, params, user }) => {
      try {
        const workflowId = (params as any).workflowId as string;
        if (!workflowId || workflowId.length < 10) { set.status = 400; return { error: 'Invalid workflow ID format' }; }
        const { approvalWorkflowService } = await getServices();
        const status = await approvalWorkflowService.getWorkflowStatus(workflowId);
        const role = (user!.role || '').toLowerCase();
        const isAuthorized = status.workflow.requiredApprovers.includes(user!.id) ||
          status.workflow.metadata?.createdBy === user!.id ||
          role === 'admin' || role === 'security-admin' || role === 'security_admin';
        if (!isAuthorized) { set.status = 403; return { error: 'Not authorized to view this workflow' }; }
        return { success: true, data: { status, workflow: status.workflow }, message: 'Approval workflow status retrieved successfully' };
      } catch (error) {
        set.status = 500;
        return { error: 'Internal Server Error', message: 'Failed to get workflow' };
      }
    })

    // Approval decision
    .post('/:workflowId/decisions', async ({ set, params, body, user, request, headers }) => {
      const parsed = approvalDecisionSchema.safeParse({ ...(body as any), workflowId: (params as any).workflowId });
      if (!parsed.success) { set.status = 400; return { error: 'Validation Error', details: parsed.error.flatten() }; }
      try {
        const { approvalWorkflowService, auditService } = await getServices();
        const decisionInput = {
          workflowId: parsed.data.workflowId,
          approverId: user!.id,
          decision: parsed.data.decision,
          conditions: parsed.data.conditions,
          feedback: parsed.data.feedback,
          decidedAt: new Date()
        } as any;
        const status = await approvalWorkflowService.processApprovalDecision(decisionInput);
        await auditService.logEvent({
          eventType: parsed.data.decision === 'approve' ? AuditEventType.APPROVAL_GRANTED : AuditEventType.APPROVAL_DENIED,
          userId: user!.id,
          resourceType: 'approval_workflow',
          resourceId: parsed.data.workflowId,
          details: { decision: parsed.data.decision, conditions: parsed.data.conditions, feedback: parsed.data.feedback, workflowStatus: status.isComplete ? 'completed' : 'pending', canProceed: status.canProceed },
          ipAddress: request.headers.get('x-forwarded-for') || '',
          userAgent: headers['user-agent'],
          riskLevel: parsed.data.decision === 'reject' ? SecurityLevel.MEDIUM as any : SecurityLevel.LOW as any
        });
        return { success: true, data: { decision: decisionInput, status, message: status.isComplete ? (status.canProceed ? 'Operation approved and can proceed' : 'Operation rejected') : 'Decision recorded, waiting for additional approvals' }, message: 'Approval decision processed successfully' };
      } catch (error) {
        set.status = 500;
        return { error: 'Internal Server Error', message: 'Failed to process approval decision' };
      }
    })
  );
}

export default registerApprovalRoutes;

