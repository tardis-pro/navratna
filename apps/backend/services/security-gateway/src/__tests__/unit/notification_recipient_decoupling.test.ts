/**
 * WhatsApp addresses the approver from WHATSAPP_APPROVER_ALLOWLIST and never
 * reads the `users` record — `sendWhatsAppNotification` takes `_recipient` and
 * ignores it. So the WhatsApp channel must NOT be gated on the users lookup.
 *
 * Gating it there is a quiet, total failure: an approver who is provisioned in
 * the allowlist but has no `users` row would lose the PRIMARY approval channel,
 * nobody would be notified, and the operation would hang until the expiry sweep
 * rejected it. Fail-closed is correct for sending mail to an address we cannot
 * verify; it is not correct for a channel that never needed the address.
 */
import type { ApprovalNotification } from '@uaip/types';

const { selectUsers, sendMail, publish, logger } = vi.hoisted(() => ({
  selectUsers: vi.fn(),
  sendMail: vi.fn(async () => ({ messageId: 'ok' })),
  publish: vi.fn(async () => undefined),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  getControlDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => selectUsers() }) }) }),
  }),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

vi.mock('@uaip/shared-services/drizzle/control', () => ({
  users: { id: 'id', email: 'email', firstName: 'first_name', lastName: 'last_name' },
}));

vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));

vi.mock('@uaip/utils', () => ({
  logger,
  ExternalServiceError: class ExternalServiceError extends Error {},
}));

vi.mock('@uaip/config', () => ({
  config: {
    email: { from: 'noreply@navratna.test', smtp: { host: 'smtp.test', port: 587, secure: false } },
    frontend: { baseUrl: 'http://localhost:3000' },
    notifications: { enabled: true, whatsapp: { enabled: true } },
  },
}));

vi.mock('../../services/whatsapp_approver_allowlist.js', () => ({
  resolveApproverJid: (userId: string) =>
    userId === 'allowlisted-but-not-a-user' ? '919812345678@s.whatsapp.net' : null,
}));

const { NotificationService } = await import('../../services/notification_service.ts');

const notification = (recipientId: string): ApprovalNotification => ({
  type: 'approval_requested',
  recipientId,
  workflowId: 'wf-1',
  operationId: 'op-1',
  metadata: { operationType: 'deploy', approvalCode: '7C3F' },
});

describe('NotificationService — channels that do not need the users record', () => {
  const bus = { publish } as unknown as ConstructorParameters<typeof NotificationService>[0];

  beforeEach(() => {
    selectUsers.mockReset();
    sendMail.mockClear();
    publish.mockClear();
    logger.error.mockClear();
  });

  it('still sends over WhatsApp when the recipient has no users row', async () => {
    selectUsers.mockResolvedValue([]);

    await new NotificationService(bus).sendApprovalNotification(
      notification('allowlisted-but-not-a-user')
    );

    const whatsapp = publish.mock.calls.filter(
      ([eventType]) => eventType === 'notification.whatsapp.send'
    );
    expect(whatsapp).toHaveLength(1);

    // and the record-based channel is still correctly suppressed
    expect(sendMail).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('SKIPPED'),
      expect.objectContaining({ recipientId: 'allowlisted-but-not-a-user' })
    );
  });

  it('still sends over WhatsApp when the users lookup itself throws', async () => {
    selectUsers.mockRejectedValue(new Error('control plane unreachable'));

    await new NotificationService(bus).sendApprovalNotification(
      notification('allowlisted-but-not-a-user')
    );

    expect(
      publish.mock.calls.filter(([eventType]) => eventType === 'notification.whatsapp.send')
    ).toHaveLength(1);
  });

  it('sends over both channels when the recipient does resolve', async () => {
    selectUsers.mockResolvedValue([
      {
        id: 'allowlisted-but-not-a-user',
        email: 'ada@navratna.test',
        firstName: 'Ada',
        lastName: 'Lovelace',
      },
    ]);

    await new NotificationService(bus).sendApprovalNotification(
      notification('allowlisted-but-not-a-user')
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(
      publish.mock.calls.filter(([eventType]) => eventType === 'notification.whatsapp.send')
    ).toHaveLength(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not invent a recipient for the unresolved case', async () => {
    selectUsers.mockResolvedValue([]);

    await new NotificationService(bus).sendApprovalNotification(
      notification('allowlisted-but-not-a-user')
    );

    expect(JSON.stringify(publish.mock.calls)).not.toContain('example.com');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('example.com');
  });
});
