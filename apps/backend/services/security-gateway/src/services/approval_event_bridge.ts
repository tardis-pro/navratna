import { AsyncLocalStorage } from 'node:async_hooks';
import { EventBusService } from '@uaip/infra/event_bus';
import { logger } from '@uaip/utils';
import type { ApprovalDecisionSubmittedEvent, ApprovalRequestedPayload } from '@uaip/types';
import { ApprovalWorkflowService } from './approval_workflow_service.js';
import { NotificationService } from './notification_service.js';
import { AuditService } from './audit_service.js';

const ACK_EVENT = 'approval.decision.ack';
/** 4 attempts with 250/500/1000 ms backoff — bounded at ~1.75 s per ack. */
const ACK_MAX_ATTEMPTS = 4;
const ACK_BASE_DELAY_MS = 250;

/**
 * The one ApprovalWorkflowService for this process.
 *
 * It owns the background work — the expiry/reminder crons and the two event
 * subscriptions — and the route modules share it through
 * `getSharedApprovalWorkflowService()`. A second instance is not a "harmless
 * duplicate": whichever one starts crons double-runs the expiry sweep.
 */
let approvalWorkflowService: ApprovalWorkflowService | null = null;

/**
 * Correlates an in-flight decision with the ack its handling publishes.
 *
 * The ack payload is `{ jid, ok, message }` — it carries no workflow id — and
 * the publish happens several frames deep inside ApprovalWorkflowService, so
 * the one-time code (1:1 with the workflow) is carried down here instead. An
 * AsyncLocalStorage rather than a module variable because handlers for one
 * event type run concurrently.
 */
const decisionContext = new AsyncLocalStorage<{ code: string; approverUserId: string }>();

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Probe the transport. `publish()` swallows failures for every event type that
 * is not auth/security-related, so this PING is the only pre-publish signal
 * available that the ack has anywhere to go.
 */
async function busIsReachable(bus: EventBusService): Promise<boolean> {
  // Test doubles pass a bare `{ publish }`; a missing probe counts as reachable.
  if (typeof bus.healthCheck !== 'function') return true;
  try {
    return (await bus.healthCheck()).status === 'healthy';
  } catch {
    return false;
  }
}

/**
 * Publish the decision ack with a bounded retry.
 *
 * Silence after authorising a real-world action is the worst outcome this
 * feature has, so an ack that never lands is logged at error with the jid and
 * the approval code rather than disappearing into a debug line.
 */
async function publishAckWithRetry(
  bus: EventBusService,
  data: unknown,
  options?: Parameters<EventBusService['publish']>[2]
): Promise<void> {
  const context = decisionContext.getStore();
  const jid =
    typeof data === 'object' && data !== null && 'jid' in data && typeof data.jid === 'string'
      ? data.jid
      : 'unknown';
  let lastError = 'event bus unreachable';

  // oxlint-disable no-await-in-loop -- a retry with backoff is sequential by
  // definition; the attempts cannot be collected into a Promise.all().
  for (let attempt = 1; attempt <= ACK_MAX_ATTEMPTS; attempt++) {
    if (await busIsReachable(bus)) {
      try {
        await bus.publish(ACK_EVENT, data, options);
        if (attempt > 1) {
          logger.info('Approval decision ack published after retry', { jid, attempt });
        }
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    if (attempt < ACK_MAX_ATTEMPTS) {
      await sleep(ACK_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  // oxlint-enable no-await-in-loop

  logger.error('APPROVAL ACK UNDELIVERED — the approver replied and will hear nothing back', {
    event: ACK_EVENT,
    jid,
    approvalCode: context?.code ?? 'unknown',
    approverUserId: context?.approverUserId ?? 'unknown',
    attempts: ACK_MAX_ATTEMPTS,
    error: lastError,
  });
}

/**
 * Wrap the bus so `approval.decision.ack` publishes get the retry above.
 *
 * ApprovalWorkflowService publishes the ack through the bus it was constructed
 * with, so the instance handed to it here is the only place the retry can be
 * attached. Every other event type passes straight through.
 */
function withAckRetry(bus: EventBusService): EventBusService {
  return new Proxy(bus, {
    get(target, property) {
      if (property === 'publish') {
        const publish: EventBusService['publish'] = async (eventType, data, options) => {
          if (eventType !== ACK_EVENT) return target.publish(eventType, data, options);
          return publishAckWithRetry(target, data, options);
        };
        return publish;
      }
      const value = Reflect.get(target, property);
      // Bind to the real instance: `this` must never be the proxy, or a method
      // reading its own state would resolve it back through this trap.
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function getApprovalWorkflowService(bus: EventBusService): ApprovalWorkflowService {
  if (!approvalWorkflowService) {
    approvalWorkflowService = new ApprovalWorkflowService(
      withAckRetry(bus),
      new NotificationService(bus),
      new AuditService()
    );
  }
  return approvalWorkflowService;
}

/**
 * Resolve the process event bus the way the route modules used to resolve it
 * themselves, so they can drop their own construction.
 */
async function resolveEventBus(): Promise<EventBusService> {
  try {
    return EventBusService.getInstance();
  } catch {
    const { config } = await import('@uaip/config');
    return EventBusService.getInstance({ ...config, serviceName: 'navratna-gateway' }, logger);
  }
}

/**
 * The shared ApprovalWorkflowService. Route modules MUST use this instead of
 * constructing their own — see the singleton's comment above.
 */
export async function getSharedApprovalWorkflowService(
  bus?: EventBusService
): Promise<ApprovalWorkflowService> {
  return getApprovalWorkflowService(bus ?? (await resolveEventBus()));
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
        const decision = message.data;
        await decisionContext.run(
          { code: decision.code, approverUserId: decision.approverUserId },
          () => service.handleDecisionSubmitted(decision)
        );
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
