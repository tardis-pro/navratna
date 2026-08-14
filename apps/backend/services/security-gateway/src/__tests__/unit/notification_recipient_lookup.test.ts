/**
 * getRecipientDetails() used to return a fabricated recipient for EVERY id:
 * `user-<id>@example.com`, `User <id>`, `+1234567890`. The email channel is on
 * by default, so every approval email went to an address that does not exist —
 * a live data-integrity bug, not a stub.
 *
 * The replacement reads the control-plane `users` table and fails CLOSED: an id
 * that does not resolve skips the notification entirely rather than inventing an
 * address to send to.
 */
import type { ApprovalNotification } from '@uaip/types';

const { selectUsers, filters, sendMail, logger } = vi.hoisted(() => ({
  selectUsers: vi.fn(),
  filters: [] as unknown[],
  sendMail: vi.fn(async () => ({ messageId: 'ok' })),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// The narrow drizzle subpaths, matching the service: importing the
// `@uaip/shared-services` barrel here would pull the HTTP middleware stack into
// a leaf service's import graph.
vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  getControlDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => selectUsers() }),
      }),
    }),
  }),
  eq: (column: unknown, value: unknown) => {
    filters.push({ column, value });
    return { column, value };
  },
}));

vi.mock('@uaip/shared-services/drizzle/control', () => ({
  users: { id: 'id', email: 'email', firstName: 'first_name', lastName: 'last_name' },
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

vi.mock('@uaip/utils', () => ({
  logger,
  ExternalServiceError: class ExternalServiceError extends Error {},
}));

vi.mock('@uaip/config', () => ({
  config: {
    email: { from: 'noreply@navratna.test', smtp: { host: 'smtp.test', port: 587, secure: false } },
    frontend: { baseUrl: 'http://localhost:3000' },
    notifications: { enabled: true, whatsapp: { enabled: false } },
  },
}));

const { NotificationService } = await import('../../services/notification_service.ts');

const notification = (overrides: Partial<ApprovalNotification> = {}): ApprovalNotification => ({
  type: 'approval_requested',
  recipientId: '11111111-1111-4111-8111-111111111111',
  workflowId: 'wf-1',
  operationId: 'op-1',
  metadata: { operationType: 'deploy' },
  ...overrides,
});

describe('NotificationService — recipient resolution', () => {
  beforeEach(() => {
    selectUsers.mockReset();
    filters.length = 0;
    sendMail.mockClear();
    logger.error.mockClear();
  });

  it('emails the address on the real user record', async () => {
    selectUsers.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'ada@navratna.test',
        firstName: 'Ada',
        lastName: 'Lovelace',
      },
    ]);

    await new NotificationService().sendApprovalNotification(notification());

    expect(filters).toEqual([
      { column: 'id', value: '11111111-1111-4111-8111-111111111111' },
    ]);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const [mail] = sendMail.mock.calls[0] as [{ to: string; html: string }];
    expect(mail.to).toBe('ada@navratna.test');
    expect(mail.html).toContain('Ada Lovelace');
  });

  it('falls back to the email address when the user has no name', async () => {
    selectUsers.mockResolvedValue([
      { id: 'u-2', email: 'nameless@navratna.test', firstName: null, lastName: null },
    ]);

    await new NotificationService().sendApprovalNotification(notification());

    const [mail] = sendMail.mock.calls[0] as [{ to: string; html: string }];
    expect(mail.to).toBe('nameless@navratna.test');
    expect(mail.html).toContain('nameless@navratna.test');
  });

  it('skips the notification when the recipient does not resolve, and never synthesises one', async () => {
    selectUsers.mockResolvedValue([]);

    await new NotificationService().sendApprovalNotification(notification({ recipientId: 'ghost' }));

    expect(sendMail).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('SKIPPED'),
      expect.objectContaining({ recipientId: 'ghost' })
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('example.com');
  });

  it('skips the notification when the lookup itself fails', async () => {
    selectUsers.mockRejectedValue(new Error('control plane unreachable'));

    await new NotificationService().sendApprovalNotification(notification());

    expect(sendMail).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('SKIPPED'),
      expect.objectContaining({ recipientId: '11111111-1111-4111-8111-111111111111' })
    );
  });
});
