/**
 * The WhatsApp reply path claims the decision slot with an atomic conditional
 * UPDATE, but the web path called processApprovalDecision() directly — and its
 * validation is check-then-act. Two concurrent web decisions, or a web decision
 * racing a WhatsApp reply, could therefore both pass validation and both
 * complete the workflow, resuming the suspended operation twice.
 *
 * The web path now goes through the same claim. Authorisation stays AHEAD of it:
 * claiming first would let anyone burn the slot and lock the real approver out.
 */

const APPROVER_ID = '11111111-1111-4111-8111-111111111111';
const REQUESTER_ID = '22222222-2222-4222-8222-222222222222';
const WORKFLOW_ID = 'wf-0123456789';

const { workflow, claimApprovalCode, processApprovalDecision, currentUserId } = vi.hoisted(() => ({
  workflow: {
    value: {
      id: 'wf-0123456789',
      requiredApprovers: ['11111111-1111-4111-8111-111111111111'],
      metadata: { requestedByUserId: '22222222-2222-4222-8222-222222222222' },
    },
  },
  claimApprovalCode: vi.fn(),
  processApprovalDecision: vi.fn(async () => ({ isComplete: true, canProceed: true })),
  currentUserId: { value: '11111111-1111-4111-8111-111111111111' },
}));

vi.mock('../../services/approval_event_bridge.js', () => ({
  getSharedApprovalWorkflowService: async () => ({
    getWorkflowStatus: async () => ({ workflow: workflow.value }),
    processApprovalDecision,
  }),
}));

vi.mock('@uaip/shared-services', () => ({
  SecurityService: {
    getInstance: () => ({
      getApprovalWorkflowRepository: () => ({ claimApprovalCode }),
    }),
  },
}));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  AuthenticationError: class AuthenticationError extends Error {},
}));

vi.mock('@uaip/middleware', () => ({
  withRequiredAuth: (app: { derive: (fn: () => unknown) => unknown }) =>
    app.derive(() => ({
      user: {
        id: currentUserId.value,
        email: 'approver@example.com',
        role: 'user',
        permissions: [],
        sessionId: 'session-1',
      },
    })),
  withOperatorGuard: (app: unknown) => app,
}));

vi.mock('../../services/audit_service.js', () => ({
  AuditService: class AuditService {
    logEvent = vi.fn(async () => undefined);
  },
}));

const { registerApprovalRoutes } = await import('../../http/approval_elysia.ts');

const decide = async (): Promise<{ status: number; body: unknown }> => {
  const response = await registerApprovalRoutes().handle(
    new Request(`http://localhost/api/v1/approvals/${WORKFLOW_ID}/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    })
  );
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: response.status, body };
};

describe('POST /api/v1/approvals/:workflowId/decisions — single-decision claim', () => {
  beforeEach(() => {
    claimApprovalCode.mockReset();
    processApprovalDecision.mockClear();
    currentUserId.value = APPROVER_ID;
    workflow.value = {
      id: WORKFLOW_ID,
      requiredApprovers: [APPROVER_ID],
      metadata: { requestedByUserId: REQUESTER_ID },
    };
  });

  it('claims the slot before applying the decision', async () => {
    claimApprovalCode.mockResolvedValue({ id: WORKFLOW_ID });

    const res = await decide();

    expect(res.status).toBe(200);
    expect(claimApprovalCode).toHaveBeenCalledWith(
      WORKFLOW_ID,
      expect.objectContaining({ consumedBy: APPROVER_ID })
    );
    expect(processApprovalDecision).toHaveBeenCalledTimes(1);
  });

  it('refuses with 409 when another decision already holds the claim', async () => {
    claimApprovalCode.mockResolvedValue(null);

    const res = await decide();

    expect(res.status).toBe(409);
    expect(processApprovalDecision).not.toHaveBeenCalled();
  });

  it('refuses a non-approver with 403 and never burns the claim', async () => {
    workflow.value = { ...workflow.value, requiredApprovers: [REQUESTER_ID] };

    const res = await decide();

    expect(res.status).toBe(403);
    expect(claimApprovalCode).not.toHaveBeenCalled();
    expect(processApprovalDecision).not.toHaveBeenCalled();
  });

  it('refuses self-approval with 403 and never burns the claim', async () => {
    currentUserId.value = REQUESTER_ID;
    workflow.value = { ...workflow.value, requiredApprovers: [REQUESTER_ID] };

    const res = await decide();

    expect(res.status).toBe(403);
    expect(claimApprovalCode).not.toHaveBeenCalled();
  });
});
