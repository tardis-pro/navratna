import { Elysia, t } from 'elysia';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { withRequiredAuth, withOperatorGuard } from '@uaip/middleware';
import { SecurityService } from '@uaip/shared-services';
import { AuditService } from '../services/audit_service.js';
import { getSharedApprovalWorkflowService } from '../services/approval_event_bridge.js';
import { ApprovalStatus, SecurityLevel, AuditEventType } from '@uaip/types';
import { getAuthUser } from './context_helpers.js';

let auditServiceSingleton: AuditService | null = null;

// The ApprovalWorkflowService is NOT constructed here. The bridge owns the one
// instance for the process — it is the one whose expiry/reminder crons run, and
// a second instance would double-run that sweep.
async function getServices() {
  if (!auditServiceSingleton) auditServiceSingleton = new AuditService();
  return {
    auditService: auditServiceSingleton,
    approvalWorkflowService: await getSharedApprovalWorkflowService(),
  };
}

const createWorkflowSchema = z.object({
  operationId: z.string(),
  operationType: z.string(),
  requiredApprovers: z.array(z.string()).min(1).max(10),
  securityLevel: z.nativeEnum(SecurityLevel),
  context: z.record(z.any()),
  expirationHours: z.number().min(1).max(168).optional(),
  metadata: z.record(z.any()).optional(),
});

const approvalDecisionSchema = z.object({
  workflowId: z.string(),
  decision: z.enum(['approve', 'reject']),
  conditions: z.array(z.string()).optional(),
  feedback: z.string().max(1000).optional(),
});

const queryWorkflowsSchema = z.object({
  status: z.nativeEnum(ApprovalStatus).optional(),
  operationType: z.string().optional(),
  securityLevel: z.nativeEnum(SecurityLevel).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

type WorkflowMetadata = {
  securityLevel?: string;
  operationType?: string;
  createdBy?: string;
  [key: string]: unknown;
};

type WorkflowRecord = {
  metadata?: WorkflowMetadata;
  expiresAt?: string | Date;
  createdAt?: string | Date;
  id?: string;
  [key: string]: unknown;
};

type ApprovalWorkflowEntry = {
  status?: ApprovalStatus;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
  operationId?: string;
  requiredApprovers?: string[];
  currentApprovers?: string[];
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
};

function calculateUrgency(workflow: WorkflowRecord): number {
  let urgency = 0;
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
  if (workflow.expiresAt) {
    const hoursLeft = (new Date(workflow.expiresAt).getTime() - Date.now()) / 3600000;
    if (hoursLeft < 1) urgency += 50;
    else if (hoursLeft < 4) urgency += 30;
    else if (hoursLeft < 12) urgency += 15;
  }
  const hoursOld = workflow.createdAt
    ? (Date.now() - new Date(workflow.createdAt).getTime()) / 3600000
    : 0;
  urgency += Math.min(25, hoursOld * 2);
  return urgency;
}

const ErrorSchema = t.Object({ error: t.String(), message: t.Optional(t.String()) });
const ValidationErrorSchema = t.Object({ error: t.String(), details: t.Optional(t.Any()) });

/**
 * Claim the exclusive right to decide a workflow.
 *
 * `processApprovalDecision()` validates check-then-act, so two concurrent web
 * decisions — or a web decision racing a WhatsApp reply — could both pass
 * validation and both complete the workflow, resuming the suspended operation
 * twice. `claimApprovalCode()` is the atomic conditional UPDATE the WhatsApp
 * path already uses (pending AND unclaimed AND unexpired, decided by the
 * database in one statement), so the web path goes through the same gate rather
 * than growing a second mechanism.
 *
 * Reusing the *code* claim is exact rather than approximate: `requireAllApprovers`
 * is false, so the first decision of either kind completes the workflow — there
 * is only ever one decision slot to claim, whichever channel it arrives on.
 *
 * MUST be called only after the caller is authorised: claiming first would let
 * anyone burn the slot and lock the real approver out of their own approval.
 */
async function claimDecisionSlot(workflowId: string, approverId: string): Promise<boolean> {
  const claimed = await SecurityService.getInstance()
    .getApprovalWorkflowRepository()
    .claimApprovalCode(workflowId, { consumedAt: new Date(), consumedBy: approverId });
  return claimed !== null;
}

export function registerApprovalRoutes() {
  return new Elysia().group('/api/v1/approvals', (app) => withRequiredAuth(app)
    .group('', (g) => withOperatorGuard(g)
      .post('/workflows', async (ctx) => {
        const user = getAuthUser(ctx);
        const { body, set, request, headers } = ctx;
        const parsed = createWorkflowSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { error: 'Validation Error', details: parsed.error.flatten() };
        }
        try {
          const { approvalWorkflowService, auditService } = await getServices();
          const workflow = await approvalWorkflowService.createApprovalWorkflow({
            operationId: parsed.data.operationId,
            operationType: parsed.data.operationType,
            requiredApprovers: parsed.data.requiredApprovers,
            securityLevel: parsed.data.securityLevel,
            context: parsed.data.context,
            expirationHours: parsed.data.expirationHours,
            metadata: {
              ...parsed.data.metadata,
              createdBy: user.id,
              createdAt: new Date().toISOString(),
            },
          });
          await auditService.logEvent({
            eventType: AuditEventType.APPROVAL_REQUESTED,
            userId: user.id,
            resourceType: 'approval_workflow',
            resourceId: workflow.id,
            details: {
              operationId: parsed.data.operationId,
              operationType: parsed.data.operationType,
              requiredApprovers: parsed.data.requiredApprovers.length,
              securityLevel: parsed.data.securityLevel,
            },
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: headers['user-agent'],
            riskLevel: parsed.data.securityLevel,
          });
          set.status = 201;
          return {
            success: true,
            data: {
              workflow,
              approvalUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/approvals/${workflow.id}`,
            },
            message: 'Approval workflow created successfully',
          };
        } catch (error) {
          logger.error('Failed to create approval workflow', { error });
          set.status = 500;
          return {
            error: 'Internal Server Error',
            message: 'Failed to create approval workflow',
          };
        }
      }, {
        body: t.Object({
          operationId: t.String(),
          operationType: t.String(),
          requiredApprovers: t.Array(t.String()),
          securityLevel: t.String(),
          context: t.Any(),
          expirationHours: t.Optional(t.Number()),
          metadata: t.Optional(t.Any()),
        }),
        response: {
          201: t.Object({
            success: t.Literal(true),
            data: t.Object({
              workflow: t.Any(),
              approvalUrl: t.String(),
            }),
            message: t.String(),
          }),
          400: ValidationErrorSchema,
          500: ErrorSchema,
        },
      })
      .get('/stats', async (ctx) => {
        const { set, query } = ctx;
        try {
          const days = Number(query.days ?? 30);
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - days);
          const { approvalWorkflowService } = await getServices();
          const all = await approvalWorkflowService.getUserWorkflows('');
          const filtered = all.filter((w) => w.createdAt && w.createdAt >= startDate);
          const stats = {
            total: filtered.length,
            byStatus: {
              pending: filtered.filter((w) => w.status === ApprovalStatus.PENDING).length,
              approved: filtered.filter((w) => w.status === ApprovalStatus.APPROVED).length,
              rejected: filtered.filter((w) => w.status === ApprovalStatus.REJECTED).length,
              expired: filtered.filter((w) => w.status === ApprovalStatus.EXPIRED).length,
            },
            bySecurityLevel: {
              critical: filtered.filter(
                (w) => w.metadata?.securityLevel === SecurityLevel.CRITICAL
              ).length,
              high: filtered.filter((w) => w.metadata?.securityLevel === SecurityLevel.HIGH)
                .length,
              medium: filtered.filter((w) => w.metadata?.securityLevel === SecurityLevel.MEDIUM)
                .length,
              low: filtered.filter((w) => w.metadata?.securityLevel === SecurityLevel.LOW)
                .length,
            },
          };
          return {
            success: true,
            data: { stats, period: { days, startDate, endDate: new Date() } },
            message: 'Approval statistics retrieved successfully',
          };
        } catch {
          set.status = 500;
          return {
            error: 'Internal Server Error',
            message: 'Failed to get approval statistics',
          };
        }
      }, {
        response: {
          200: t.Object({
            success: t.Literal(true),
            data: t.Object({
              stats: t.Any(),
              period: t.Object({
                days: t.Number(),
                startDate: t.Any(),
                endDate: t.Any(),
              }),
            }),
            message: t.String(),
          }),
          500: ErrorSchema,
        },
      })
    )
    .get('/workflows', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set, query } = ctx;
      const parsed = queryWorkflowsSchema.safeParse(query);
      if (!parsed.success) {
        set.status = 400;
        return { error: 'Validation Error', details: parsed.error.flatten() };
      }
      try {
        const { approvalWorkflowService } = await getServices();
        let workflows: ApprovalWorkflowEntry[];
        const role = (user.role || '').toLowerCase();
        if (role === 'admin' || role === 'security_admin' || role === 'security-admin') {
          workflows = await approvalWorkflowService.getUserWorkflows('', parsed.data.status);
        } else {
          workflows = await approvalWorkflowService.getUserWorkflows(
            user.id,
            parsed.data.status
          );
        }
        let filtered = workflows;
        const { operationType, securityLevel, startDate, endDate, limit, offset } = parsed.data;
        if (operationType)
          filtered = filtered.filter((w) => w.metadata?.operationType === operationType);
        if (securityLevel)
          filtered = filtered.filter((w) => w.metadata?.securityLevel === securityLevel);
        if (startDate) filtered = filtered.filter((w) => w.createdAt && w.createdAt >= new Date(startDate));
        if (endDate) filtered = filtered.filter((w) => w.createdAt && w.createdAt <= new Date(endDate));
        const total = filtered.length;
        const page = filtered.slice(Number(offset), Number(offset) + Number(limit));
        return {
          success: true,
          data: {
            workflows: page,
            pagination: {
              total,
              limit: Number(limit),
              offset: Number(offset),
              hasMore: Number(offset) + Number(limit) < total,
            },
          },
          message: 'Approval workflows retrieved successfully',
        };
      } catch {
        set.status = 500;
        return { error: 'Internal Server Error', message: 'Failed to query workflows' };
      }
    }, {
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            workflows: t.Any(),
            pagination: t.Object({
              total: t.Number(),
              limit: t.Number(),
              offset: t.Number(),
              hasMore: t.Boolean(),
            }),
          }),
          message: t.String(),
        }),
        400: ValidationErrorSchema,
        500: ErrorSchema,
      },
    })
    .get('/pending', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set } = ctx;
      try {
        const { approvalWorkflowService } = await getServices();
        const pending = await approvalWorkflowService.getUserWorkflows(
          user.id,
          ApprovalStatus.PENDING
        ).catch((err: Error) => { logger.error('getUserWorkflows failed in /pending', { error: err.message, stack: err.stack }); throw err; });
        const detailed = await Promise.all(
          pending
            .filter((wf): wf is ApprovalWorkflowEntry & { id: string } => typeof wf.id === 'string')
            .map(async (wf) => {
            const status = await approvalWorkflowService!.getWorkflowStatus(wf.id);
            return {
              workflow: wf,
              status,
              isPendingForUser: status.pendingApprovers.includes(user.id),
              urgency: calculateUrgency(wf),
            };
          })
        );
        const userPending = detailed
          .filter((w) => w.isPendingForUser)
          .sort((a, b) => b.urgency - a.urgency);
        return {
          success: true,
          data: {
            pendingApprovals: userPending,
            count: userPending.length,
            summary: {
              critical: userPending.filter(
                (w) => w.workflow.metadata?.securityLevel === SecurityLevel.CRITICAL
              ).length,
              high: userPending.filter(
                (w) => w.workflow.metadata?.securityLevel === SecurityLevel.HIGH
              ).length,
              medium: userPending.filter(
                (w) => w.workflow.metadata?.securityLevel === SecurityLevel.MEDIUM
              ).length,
              low: userPending.filter(
                (w) => w.workflow.metadata?.securityLevel === SecurityLevel.LOW
              ).length,
            },
          },
          message: 'Pending approvals retrieved successfully',
        };
      } catch {
        set.status = 500;
        return { error: 'Internal Server Error', message: 'Failed to get pending approvals' };
      }
    }, {
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            pendingApprovals: t.Any(),
            count: t.Number(),
            summary: t.Object({
              critical: t.Number(),
              high: t.Number(),
              medium: t.Number(),
              low: t.Number(),
            }),
          }),
          message: t.String(),
        }),
        500: ErrorSchema,
      },
    })
  
    .group('', (g) => withOperatorGuard(g).post(
      '/:workflowId/cancel',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params, request, headers } = ctx;
        const ctxBody = typeof ctx === 'object' && ctx !== null && 'body' in ctx ? ctx.body : undefined;
        const reason = typeof ctxBody === 'object' && ctxBody !== null && 'reason' in ctxBody ? String(ctxBody.reason) : undefined;
        try {
          const workflowId = params.workflowId;
          if (!reason || !reason.trim()) {
            set.status = 400;
            return { error: 'Cancellation reason is required' };
          }
          const { approvalWorkflowService, auditService } = await getServices();
          await approvalWorkflowService.cancelWorkflow(workflowId, reason);
          await auditService.logEvent({
            eventType: AuditEventType.APPROVAL_DENIED,
            userId: user.id,
            resourceType: 'approval_workflow',
            resourceId: workflowId,
            details: { action: 'cancelled', reason, cancelledBy: user.id },
            ipAddress: request.headers.get('x-forwarded-for') || '',
            userAgent: headers['user-agent'],
            riskLevel: SecurityLevel.MEDIUM,
          });
          return { success: true, message: 'Approval workflow cancelled successfully' };
        } catch {
          set.status = 500;
          return {
            error: 'Internal Server Error',
            message: 'Failed to cancel approval workflow',
          };
        }
      },
      {
        body: t.Object({ reason: t.String() }),
        response: {
          200: t.Object({ success: t.Literal(true), message: t.String() }),
          400: t.Object({ error: t.String() }),
          500: ErrorSchema,
        },
      }
    )
    )
    .get('/:workflowId', async (ctx) => {
      const user = getAuthUser(ctx);
      const { set, params } = ctx;
      try {
        const workflowId = params.workflowId;
        if (!workflowId || workflowId.length < 10) {
          set.status = 400;
          return { error: 'Invalid workflow ID format' };
        }
        const { approvalWorkflowService } = await getServices();
        const status = await approvalWorkflowService.getWorkflowStatus(workflowId);
        const role = (user.role || '').toLowerCase();
        const requiredApprovers = status.workflow.requiredApprovers ?? [];
        const isAuthorized =
          requiredApprovers.includes(user.id) ||
          status.workflow.metadata?.createdBy === user.id ||
          role === 'admin' ||
          role === 'security-admin' ||
          role === 'security_admin';
        if (!isAuthorized) {
          set.status = 403;
          return { error: 'Not authorized to view this workflow' };
        }
        return {
          success: true,
          data: { status, workflow: status.workflow },
          message: 'Approval workflow status retrieved successfully',
        };
      } catch {
        set.status = 500;
        return { error: 'Internal Server Error', message: 'Failed to get workflow' };
      }
    }, {
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({ status: t.Any(), workflow: t.Any() }),
          message: t.String(),
        }),
        400: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        500: ErrorSchema,
      },
    })
    .post('/:workflowId/decisions', async (ctx) => {
      const user = getAuthUser(ctx);
      const { params, set, body, request, headers } = ctx;
      const parsed = approvalDecisionSchema.safeParse({
        ...(typeof body === 'object' && body !== null ? body : {}),
        workflowId: params.workflowId,
      });
      if (!parsed.success) {
        set.status = 400;
        return { error: 'Validation Error', details: parsed.error.flatten() };
      }
      try {
        const { approvalWorkflowService, auditService } = await getServices();

        // Authorise BEFORE claiming — see claimDecisionSlot().
        const { workflow } = await approvalWorkflowService.getWorkflowStatus(
          parsed.data.workflowId
        );
        const requiredApprovers = workflow.requiredApprovers ?? [];
        if (!requiredApprovers.includes(user.id)) {
          set.status = 403;
          return { error: 'Not authorized to decide this workflow' };
        }
        if (workflow.metadata?.requestedByUserId === user.id) {
          set.status = 403;
          return { error: 'Requester cannot approve their own operation' };
        }

        if (!(await claimDecisionSlot(parsed.data.workflowId, user.id))) {
          set.status = 409;
          return { error: 'This approval has already been decided, expired, or is not pending' };
        }

        const decisionInput = {
          workflowId: parsed.data.workflowId,
          approverId: user.id,
          decision: parsed.data.decision,
          conditions: parsed.data.conditions,
          feedback: parsed.data.feedback,
          decidedAt: new Date(),
        };
        const status = await approvalWorkflowService.processApprovalDecision(decisionInput);
        await auditService.logEvent({
          eventType:
            parsed.data.decision === 'approve'
              ? AuditEventType.APPROVAL_GRANTED
              : AuditEventType.APPROVAL_DENIED,
          userId: user.id,
          resourceType: 'approval_workflow',
          resourceId: parsed.data.workflowId,
          details: {
            decision: parsed.data.decision,
            conditions: parsed.data.conditions,
            feedback: parsed.data.feedback,
            workflowStatus: status.isComplete ? 'completed' : 'pending',
            canProceed: status.canProceed,
          },
          ipAddress: request.headers.get('x-forwarded-for') || '',
          userAgent: headers['user-agent'],
          riskLevel: parsed.data.decision === 'reject' ? SecurityLevel.MEDIUM : SecurityLevel.LOW,
        });
        return {
          success: true,
          data: {
            decision: decisionInput,
            status,
            message: status.isComplete
              ? status.canProceed
                ? 'Operation approved and can proceed'
                : 'Operation rejected'
              : 'Decision recorded, waiting for additional approvals',
          },
          message: 'Approval decision processed successfully',
        };
      } catch {
        set.status = 500;
        return {
          error: 'Internal Server Error',
          message: 'Failed to process approval decision',
        };
      }
    }, {
      body: t.Object({
        decision: t.Union([t.Literal('approve'), t.Literal('reject')]),
        conditions: t.Optional(t.Array(t.String())),
        feedback: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Object({
            decision: t.Any(),
            status: t.Any(),
            message: t.String(),
          }),
          message: t.String(),
        }),
        400: ValidationErrorSchema,
        403: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
        500: ErrorSchema,
      },
    })
  );

}

export default registerApprovalRoutes;
