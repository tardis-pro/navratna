import { EventBusService } from '@uaip/infra/event_bus';
import { logger } from '@uaip/utils';
import type { ApprovalDecisionSubmittedEvent, ApprovalRequestedPayload } from '@uaip/types';
import { ApprovalWorkflowService } from './approval_workflow_service.js';
import { NotificationService } from './notification_service.js';
import { AuditService } from './audit_service.js';

/**
 * The feature-owned ApprovalWorkflowService.
 *
 * The approval and security route modules each build their own instance for
 * request handling; this one owns the background work — the expiry/reminder
 * crons and the two event subscriptions — so exactly one cron pair runs per
 * process.
 */
let approvalWorkflowService: ApprovalWorkflowService | null = null;

function getApprovalWorkflowService(bus: EventBusService): ApprovalWorkflowService {
  if (!approvalWorkflowService) {
    approvalWorkflowService = new ApprovalWorkflowService(
      bus,
      new NotificationService(bus),
      new AuditService()
    );
  }
  return approvalWorkflowService;
}

function isApprovalRequestedEvent(value: unknown): value is ApprovalRequestedPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'operationId' in value &&
    typeof value.operationId === 'string' &&
    'workflowInstanceId' in value &&
    typeof value.workflowInstanceId === 'string' &&
    'stepId' in value &&
    typeof value.stepId === 'string'
  );
}

function isApprovalDecisionSubmittedEvent(value: unknown): value is ApprovalDecisionSubmittedEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'string' &&
    'approved' in value &&
    typeof value.approved === 'boolean' &&
    'jid' in value &&
    typeof value.jid === 'string' &&
    'approverUserId' in value &&
    typeof value.approverUserId === 'string'
  );
}

/**
 * Start the approval expiry/reminder crons. Without this the expiry sweep never
 * runs and an unanswered approval suspends its operation forever.
 */
export function startApprovalCronJobs(bus: EventBusService): void {
  getApprovalWorkflowService(bus).startCronJobs();
}

export async function stopApprovalCronJobs(): Promise<void> {
  if (approvalWorkflowService === null) return;
  await approvalWorkflowService.cleanup();
  approvalWorkflowService = null;
}

export async function subscribeApprovalEvents(bus: EventBusService): Promise<void> {
  const service = getApprovalWorkflowService(bus);

  await bus.subscribe(
    'approval.requested',
    async (message) => {
      try {
        if (!isApprovalRequestedEvent(message.data)) {
          logger.warn('Received malformed approval.requested event', { data: message.data });
          return;
        }
        await service.handleApprovalRequested(message.data);
      } catch (error) {
        logger.error('Error handling approval.requested', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    { queue: 'security-gateway-approval-requested', durable: true, autoAck: true }
  );

  await bus.subscribe(
    'approval.decision.submitted',
    async (message) => {
      try {
        if (!isApprovalDecisionSubmittedEvent(message.data)) {
          logger.warn('Received malformed approval.decision.submitted event', {
            data: message.data,
          });
          return;
        }
        await service.handleDecisionSubmitted(message.data);
      } catch (error) {
        logger.error('Error handling approval.decision.submitted', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    { queue: 'security-gateway-approval-decision', durable: true, autoAck: true }
  );

  logger.info('security-gateway approval event subscriptions registered');
}
