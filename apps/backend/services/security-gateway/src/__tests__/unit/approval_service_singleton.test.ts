/**
 * Three ApprovalWorkflowService instances used to exist per process: one in
 * approval_elysia, one in security_elysia, and the bridge's. Only the bridge's
 * starts the expiry/reminder crons, so the arrangement was correct by
 * convention only — an edit that started crons in either route module would
 * double-run the expiry sweep and expire approvals twice.
 *
 * These tests pin the fix: both route modules take their instance from the
 * bridge, and the bridge hands out exactly one.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_ID = 'wf-0123456789';

const { sharedService, getSharedApprovalWorkflowService, securityGatewayCtorArgs } = vi.hoisted(
  () => {
    const instance = {
      getWorkflowStatus: vi.fn(async () => ({
        workflow: { id: 'wf-0123456789', requiredApprovers: [], metadata: {} },
        pendingApprovers: [],
      })),
    };
    return {
      sharedService: instance,
      getSharedApprovalWorkflowService: vi.fn(async () => instance),
      securityGatewayCtorArgs: [] as unknown[],
    };
  }
);

vi.mock('../../services/approval_event_bridge.js', () => ({ getSharedApprovalWorkflowService }));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  AuthenticationError: class AuthenticationError extends Error {},
}));

vi.mock('@uaip/middleware', () => {
  const attachUser = (app: {
    derive: (fn: () => unknown) => unknown;
  }): unknown =>
    app.derive(() => ({
      user: {
        id: USER_ID,
        email: 'approver@example.com',
        role: 'admin',
        permissions: [],
        sessionId: 'session-1',
      },
    }));

  return {
    withRequiredAuth: attachUser,
    withOperatorGuard: (app: unknown) => app,
    withAdminGuard: (app: unknown) => app,
  };
});

vi.mock('../../services/audit_service.js', () => ({
  AuditService: class AuditService {
    logEvent = vi.fn(async () => undefined);
    logSecurityEvent = vi.fn(async () => undefined);
  },
}));

vi.mock('@uaip/shared-services', () => ({
  SecurityService: { getInstance: () => ({}) },
  AuditService: { getInstance: () => ({}) },
}));

// Captures the ApprovalWorkflowService that security_elysia hands downstream —
// that argument is the only externally visible trace of which instance it uses.
vi.mock('../../services/security_gateway_service.js', () => ({
  SecurityGatewayService: class SecurityGatewayService {
    constructor(...args: unknown[]) {
      securityGatewayCtorArgs.push(...args);
    }
    assessRisk = vi.fn(async () => ({ score: 1, overallRisk: 'low' }));
  },
}));

const { registerApprovalRoutes } = await import('../../http/approval_elysia.ts');
const { registerSecurityRoutes } = await import('../../http/security_elysia.ts');

describe('the ApprovalWorkflowService is a single process-wide instance', () => {
  it('approval_elysia serves its routes from the bridge instance', async () => {
    const app = registerApprovalRoutes();

    const response = await app.handle(
      new Request(`http://localhost/api/v1/approvals/${WORKFLOW_ID}`, { method: 'GET' })
    );

    expect(response.status).toBe(200);
    expect(getSharedApprovalWorkflowService).toHaveBeenCalled();
    expect(sharedService.getWorkflowStatus).toHaveBeenCalledWith(WORKFLOW_ID);
  });

  it('security_elysia builds SecurityGatewayService on the same bridge instance', async () => {
    const app = registerSecurityRoutes();

    const response = await app.handle(
      new Request('http://localhost/api/v1/security/assess-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationType: 'READ', resourceType: 'DATA' }),
      })
    );

    expect(response.status).toBe(200);
    expect(securityGatewayCtorArgs[0]).toBe(sharedService);
  });

  it('neither route module constructs an ApprovalWorkflowService of its own', async () => {
    const { readFile } = await import('node:fs/promises');
    const here = new URL('.', import.meta.url);

    const sources = await Promise.all(
      ['approval_elysia.ts', 'security_elysia.ts'].map((module) =>
        readFile(new URL(`../../http/${module}`, here), 'utf8')
      )
    );

    for (const source of sources) {
      expect(source).not.toContain('new ApprovalWorkflowService(');
      expect(source).toContain('getSharedApprovalWorkflowService');
    }
  });
});
