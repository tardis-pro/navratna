import type { ApprovalNotification, WhatsAppNotificationSendEvent } from '@uaip/types';

// The WhatsApp channel is off unless configured, and NotificationService reads
// the flag once at construction — so the config module is stubbed rather than
// driven through process.env after the fact.
vi.mock('@uaip/config', () => ({
  config: {
    email: {},
    frontend: { baseUrl: 'http://localhost:3000' },
    notifications: {
      enabled: true,
      whatsapp: { enabled: true },
    },
  },
}));

const { NotificationService } = await import('../../services/notification_service.ts');

describe('NotificationService — whatsapp channel', () => {
  let publish: ReturnType<typeof vi.fn>;

  const notification = (overrides: Partial<ApprovalNotification> = {}): ApprovalNotification => ({
    type: 'approval_requested',
    recipientId: 'user-abc',
    workflowId: 'wf-1',
    operationId: 'op-1',
    metadata: {
      approvalCode: 'K7QM',
      operationType: 'deploy',
      stepName: 'Deploy to production',
      requestedByUserId: 'user-requester',
      riskLevel: 'high',
      expiresAt: '2026-08-15T09:30:00.000Z',
    },
    ...overrides,
  });

  const sent = (): WhatsAppNotificationSendEvent[] =>
    publish.mock.calls
      .filter((call) => call[0] === 'notification.whatsapp.send')
      .map((call) => call[1] as WhatsAppNotificationSendEvent);

  beforeEach(() => {
    publish = vi.fn(async () => undefined);
    process.env.WHATSAPP_APPROVER_ALLOWLIST = '+91 98123-45678:user-abc,919800000000@S.WhatsApp.net:user-def';
  });

  afterEach(() => {
    delete process.env.WHATSAPP_APPROVER_ALLOWLIST;
  });

  it('publishes notification.whatsapp.send with a normalised JID and the code in the body', async () => {
    const service = new NotificationService({ publish } as never);

    await service.sendApprovalNotification(notification());

    const [event] = sent();
    expect(event.to).toBe('919812345678@s.whatsapp.net');
    expect(event.correlationId).toBe('wf-1');
    expect(event.text).toContain('K7QM');
    expect(event.text).toContain('Deploy to production');
    expect(event.text).toContain('user-requester');
    expect(event.text).toContain('A K7QM');
    expect(event.text).toContain('R K7QM');
    // The real deadline, not a hardcoded duration.
    expect(event.text).toContain(new Date('2026-08-15T09:30:00.000Z').toLocaleString());
  });

  it('lowercases the domain of an already-qualified JID', async () => {
    const service = new NotificationService({ publish } as never);

    await service.sendApprovalNotification(notification({ recipientId: 'user-def' }));

    expect(sent()[0].to).toBe('919800000000@s.whatsapp.net');
  });

  it('publishes nothing for a userId that is not in the allowlist', async () => {
    const service = new NotificationService({ publish } as never);

    await service.sendApprovalNotification(notification({ recipientId: 'user-unmapped' }));

    expect(sent()).toHaveLength(0);
  });

  it('publishes nothing when the allowlist is unset', async () => {
    delete process.env.WHATSAPP_APPROVER_ALLOWLIST;
    const service = new NotificationService({ publish } as never);

    await service.sendApprovalNotification(notification());

    expect(sent()).toHaveLength(0);
  });
});
