import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('../../services/jira_sync_service.js', () => ({
  onJiraStatusChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@uaip/infra', () => ({
  EventBusService: { getInstance: () => ({ publish: vi.fn().mockResolvedValue(undefined) }) },
}));

const { routeJiraWebhookEventMock } = vi.hoisted(() => ({
  routeJiraWebhookEventMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/jira_webhook_service.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/jira_webhook_service.js')>(
    '../../services/jira_webhook_service.js'
  );
  return {
    validateJiraWebhook: actual.validateJiraWebhook,
    routeJiraWebhookEvent: routeJiraWebhookEventMock,
  };
});

import { registerJiraWebhookRoutes } from '../../routes/jira_webhook_routes.js';

const SECRET = 'jira-test-secret';

/**
 * Jira signs the exact bytes it sent. This body deliberately uses spacing that
 * JSON.stringify would not reproduce, so any handler that re-serialises the
 * parsed object computes a different HMAC and rejects a legitimate delivery.
 */
const RAW_BODY = JSON.stringify(
  {
    webhookEvent: 'issue_created',
    timestamp: 1700000000000,
    user: { accountId: 'acc-1', displayName: 'Tester' },
    issue: {
      id: '1',
      key: 'PM-1',
      fields: {
        summary: 'hello',
        status: { name: 'To Do', id: '1' },
        issuetype: { name: 'Task' },
        priority: { name: 'High' },
        assignee: null,
        labels: [],
      },
    },
  },
  null,
  2
);

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

describe('Jira webhook signature verification', () => {
  beforeEach(() => {
    process.env.JIRA_WEBHOOK_SECRET = SECRET;
    routeJiraWebhookEventMock.mockClear();
  });

  it('accepts a delivery whose HMAC covers the exact bytes Jira sent', async () => {
    const app = registerJiraWebhookRoutes();

    const response = await app.handle(
      new Request('http://localhost/api/v1/webhooks/jira', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature': sign(RAW_BODY),
        },
        body: RAW_BODY,
      })
    );

    expect(response.status).toBe(200);
  });

  it('rejects a delivery signed with the wrong secret', async () => {
    const app = registerJiraWebhookRoutes();
    const wrongSignature = createHmac('sha256', 'not-the-secret').update(RAW_BODY).digest('hex');

    const response = await app.handle(
      new Request('http://localhost/api/v1/webhooks/jira', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature': wrongSignature,
        },
        body: RAW_BODY,
      })
    );

    expect(response.status).toBe(401);
  });
});
