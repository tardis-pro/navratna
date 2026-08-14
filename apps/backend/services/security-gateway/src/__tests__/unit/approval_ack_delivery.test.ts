/**
 * `EventBusService.publish()` only throws for event types containing 'auth' or
 * 'security'; everything else is logged and swallowed. A bus failure therefore
 * used to mean the admin who replied `A 7C3F` heard nothing back, while the
 * approval may well have been applied — silence after authorising a real-world
 * action.
 *
 * The bridge wraps the bus it hands to ApprovalWorkflowService so
 * `approval.decision.ack` gets a bounded retry, gated on a transport probe
 * (the swallowing publish gives no other signal), and an error log naming the
 * jid and the one-time code when it finally gives up.
 */
import type { EventBusMessage } from '@uaip/types';

const { captured, logger } = vi.hoisted(() => ({
  captured: { bus: null as { publish: (...args: unknown[]) => Promise<void> } | null },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@uaip/utils', () => ({ logger }));

vi.mock('../../services/approval_workflow_service.js', () => ({
  ApprovalWorkflowService: class ApprovalWorkflowService {
    constructor(bus: { publish: (...args: unknown[]) => Promise<void> }) {
      captured.bus = bus;
    }
    startCronJobs = vi.fn();
    cleanup = vi.fn(async () => undefined);
    handleApprovalRequested = vi.fn(async () => undefined);
    // Mirrors the real publishAck(): the ack goes out on the injected bus.
    handleDecisionSubmitted = async (event: { jid: string }): Promise<void> => {
      await captured.bus!.publish('approval.decision.ack', {
        jid: event.jid,
        ok: true,
        message: 'Approved deploy (op-1).',
      });
    };
  },
}));
vi.mock('../../services/notification_service.js', () => ({
  NotificationService: vi.fn(function NotificationService() {}),
}));
vi.mock('../../services/audit_service.js', () => ({
  AuditService: vi.fn(function AuditService() {}),
}));

const JID = '919812345678@s.whatsapp.net';

const decision = (): EventBusMessage => ({
  id: 'evt-1',
  type: 'approval.decision.submitted',
  source: 'discussion-orchestration',
  data: {
    code: '7C3F',
    approved: true,
    channel: 'whatsapp',
    jid: JID,
    approverUserId: 'user-approver',
    submittedAt: new Date().toISOString(),
  },
  timestamp: new Date(),
  version: '1.0',
});

type Health = { status: 'healthy' | 'unhealthy' };

/**
 * Fresh module state per test — the bridge holds the service (and therefore the
 * wrapped bus) in a module-level singleton.
 */
async function submitDecision(bus: Record<string, unknown>): Promise<void> {
  vi.resetModules();
  const { subscribeApprovalEvents } = await import('../../services/approval_event_bridge.ts');
  const handlers = new Map<string, (message: EventBusMessage) => Promise<void>>();
  await subscribeApprovalEvents({
    ...bus,
    subscribe: async (type: string, handler: (m: EventBusMessage) => Promise<void>) => {
      handlers.set(type, handler);
    },
  } as never);

  const pending = handlers.get('approval.decision.submitted')!(decision());
  await vi.runAllTimersAsync();
  await pending;
}

describe('approval.decision.ack delivery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logger.error.mockClear();
    logger.info.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes once when the bus is reachable', async () => {
    const publish = vi.fn(async () => undefined);

    await submitDecision({
      publish,
      healthCheck: async (): Promise<Health> => ({ status: 'healthy' }),
    });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(
      'approval.decision.ack',
      expect.objectContaining({ jid: JID, ok: true }),
      undefined
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('retries and succeeds once the bus comes back', async () => {
    const publish = vi.fn(async () => undefined);
    let probes = 0;

    await submitDecision({
      publish,
      healthCheck: async (): Promise<Health> => ({
        status: ++probes < 3 ? 'unhealthy' : 'healthy',
      }),
    });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      'Approval decision ack published after retry',
      expect.objectContaining({ jid: JID, attempt: 3 })
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('gives up after the bounded retry and logs the jid and the approval code', async () => {
    const publish = vi.fn(async () => undefined);

    await submitDecision({
      publish,
      healthCheck: async (): Promise<Health> => ({ status: 'unhealthy' }),
    });

    // Never published: publish() would have swallowed the failure silently.
    expect(publish).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [message, details] = logger.error.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain('APPROVAL ACK UNDELIVERED');
    expect(details).toMatchObject({
      jid: JID,
      approvalCode: '7C3F',
      approverUserId: 'user-approver',
      attempts: 4,
    });
  });

  it('retries a publish that throws, then gives up loudly', async () => {
    const publish = vi.fn(async () => {
      throw new Error('redis stream closed');
    });

    await submitDecision({
      publish,
      healthCheck: async (): Promise<Health> => ({ status: 'healthy' }),
    });

    expect(publish).toHaveBeenCalledTimes(4);
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [, details] = logger.error.mock.calls[0] as [string, Record<string, unknown>];
    expect(details).toMatchObject({ jid: JID, error: 'redis stream closed' });
  });
});
