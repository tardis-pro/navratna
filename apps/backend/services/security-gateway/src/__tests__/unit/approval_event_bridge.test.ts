import type { EventBusMessage } from '@uaip/types';

const stubs = vi.hoisted(() => ({
  handleApprovalRequested: vi.fn(async () => undefined),
  handleDecisionSubmitted: vi.fn(async () => undefined),
  startCronJobs: vi.fn(),
  cleanup: vi.fn(async () => undefined),
}));

vi.mock('../../services/approval_workflow_service.js', () => ({
  ApprovalWorkflowService: class {
    handleApprovalRequested = stubs.handleApprovalRequested;
    handleDecisionSubmitted = stubs.handleDecisionSubmitted;
    startCronJobs = stubs.startCronJobs;
    cleanup = stubs.cleanup;
  },
}));
vi.mock('../../services/notification_service.js', () => ({
  NotificationService: vi.fn(function NotificationService() {}),
}));
vi.mock('../../services/audit_service.js', () => ({
  AuditService: vi.fn(function AuditService() {}),
}));

const { subscribeApprovalEvents } = await import('../../services/approval_event_bridge.ts');

/** The shape the event bus actually hands a subscriber. */
const envelope = (type: string, data: unknown): EventBusMessage => ({
  id: 'evt-1',
  type,
  source: 'orchestration-pipeline',
  data,
  timestamp: new Date(),
  version: '1.0',
});

describe('subscribeApprovalEvents', () => {
  const handlers = new Map<string, (message: EventBusMessage) => Promise<void>>();
  const bus = {
    subscribe: vi.fn(async (type: string, handler: (m: EventBusMessage) => Promise<void>) => {
      handlers.set(type, handler);
    }),
  };

  beforeAll(async () => {
    await subscribeApprovalEvents(bus as never);
  });

  it('subscribes to both contract event types', () => {
    expect([...handlers.keys()]).toEqual(
      expect.arrayContaining(['approval.requested', 'approval.decision.submitted'])
    );
  });

  it('unwraps the envelope and passes the payload to the service', async () => {
    const payload = {
      operationId: 'op-1',
      workflowInstanceId: 'wfi-1',
      stepId: 'step-1',
      stepName: 'Deploy to production',
      userId: 'user-requester',
      operationType: 'deploy',
      riskLevel: 'high',
      timestamp: new Date().toISOString(),
    };

    await handlers.get('approval.requested')!(envelope('approval.requested', payload));

    expect(stubs.handleApprovalRequested).toHaveBeenCalledWith(payload);
  });

  it('rejects an envelope whose data is not an approval.requested payload', async () => {
    stubs.handleApprovalRequested.mockClear();

    // The legacy `approval.workflow.created` shape — no orchestration coordinates.
    await handlers.get('approval.requested')!(
      envelope('approval.requested', {
        workflowId: 'wf-1',
        operationId: 'op-1',
        requiredApprovers: ['user-approver'],
      })
    );

    expect(stubs.handleApprovalRequested).not.toHaveBeenCalled();
  });

  it('unwraps a submitted decision envelope', async () => {
    const payload = {
      code: 'K7QM',
      approved: true,
      channel: 'whatsapp',
      jid: '919812345678@s.whatsapp.net',
      approverUserId: 'user-approver',
      submittedAt: new Date().toISOString(),
    };

    await handlers.get('approval.decision.submitted')!(
      envelope('approval.decision.submitted', payload)
    );

    expect(stubs.handleDecisionSubmitted).toHaveBeenCalledWith(payload);
  });
});
