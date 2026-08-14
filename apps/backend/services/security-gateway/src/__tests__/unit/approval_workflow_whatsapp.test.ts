import { ApprovalStatus } from '@uaip/types';
import type {
  ApprovalDecisionAckEvent,
  ApprovalDecisionSubmittedEvent,
  ApprovalRequestedPayload,
  ApprovalWorkflowCompletedEvent,
} from '@uaip/types';

type WorkflowRow = {
  id: string;
  operationId: string;
  requiredApprovers: string[];
  currentApprovers: string[];
  status: string;
  expiresAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type DecisionRow = {
  id: string;
  workflowId: string;
  approverId: string;
  decision: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

// In-memory stand-ins for the two Drizzle repositories. Hoisted so the
// `@uaip/shared-services` factory below can close over them.
const db = vi.hoisted(() => {
  const workflows = new Map<string, WorkflowRow>();
  const decisions: DecisionRow[] = [];

  const workflowRepository = {
    findById: vi.fn(async (id: string) => workflows.get(id) ?? null),
    findByOperationId: vi.fn(async (operationId: string) =>
      [...workflows.values()].find((w) => w.operationId === operationId) ?? null
    ),
    findPending: vi.fn(async () =>
      [...workflows.values()].filter((w) => w.status === ApprovalStatus.PENDING)
    ),
    findMany: vi.fn(async () => ({ workflows: [...workflows.values()], total: workflows.size })),
    getExpiredWorkflows: vi.fn(async () => []),
    createApprovalWorkflow: vi.fn(async (data: Partial<WorkflowRow>) => {
      const row: WorkflowRow = {
        currentApprovers: [],
        expiresAt: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      } as WorkflowRow;
      workflows.set(row.id, row);
      return row;
    }),
    updateApprovalWorkflow: vi.fn(async (id: string, patch: Partial<WorkflowRow>) => {
      const row = workflows.get(id);
      if (!row) return null;
      Object.assign(row, patch, { updatedAt: new Date() });
      return row;
    }),
  };

  const decisionRepository = {
    createApprovalDecision: vi.fn(async (data: DecisionRow) => {
      decisions.push(data);
      return data;
    }),
    getApprovalDecisions: vi.fn(async (workflowId: string) =>
      decisions
        .filter((d) => d.workflowId === workflowId)
        .map((d) => ({ ...d, reason: d.reason ?? null, createdAt: new Date() }))
    ),
  };

  return { workflows, decisions, workflowRepository, decisionRepository };
});

vi.mock('@uaip/shared-services', () => ({
  SecurityService: {
    getInstance: () => ({
      getApprovalWorkflowRepository: () => db.workflowRepository,
      getApprovalDecisionRepository: () => db.decisionRepository,
    }),
  },
}));

const { ApprovalWorkflowService } = await import('../../services/approval_workflow_service.ts');

const CODE_ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
const REFUSAL = 'That code is not valid for an open approval.';

describe('ApprovalWorkflowService — orchestration bridge and WhatsApp decisions', () => {
  let publish: ReturnType<typeof vi.fn>;
  let sendNotification: ReturnType<typeof vi.fn>;
  let service: InstanceType<typeof ApprovalWorkflowService>;

  const requestedEvent = (
    overrides: Partial<ApprovalRequestedPayload> = {}
  ): ApprovalRequestedPayload => ({
    operationId: 'op-1',
    workflowInstanceId: 'wfi-1',
    stepId: 'step-1',
    stepName: 'Deploy to production',
    userId: 'user-requester',
    operationType: 'deploy',
    description: 'Ship release 4.2',
    riskLevel: 'high',
    timestamp: new Date().toISOString(),
    ...overrides,
  });

  const submitted = (
    overrides: Partial<ApprovalDecisionSubmittedEvent> = {}
  ): ApprovalDecisionSubmittedEvent => ({
    code: 'ZZZZ',
    approved: true,
    channel: 'whatsapp',
    jid: '919812345678@s.whatsapp.net',
    approverUserId: 'user-approver',
    submittedAt: new Date().toISOString(),
    ...overrides,
  });

  const published = <T>(eventType: string): T[] =>
    publish.mock.calls.filter((call) => call[0] === eventType).map((call) => call[1] as T);

  const codeOf = (workflow: WorkflowRow): string => String(workflow.metadata?.approvalCode);
  const onlyWorkflow = (): WorkflowRow => [...db.workflows.values()][0];

  beforeEach(() => {
    db.workflows.clear();
    db.decisions.length = 0;
    publish = vi.fn(async () => undefined);
    sendNotification = vi.fn(async () => undefined);
    process.env.APPROVAL_DEFAULT_APPROVERS = 'user-approver,user-second';

    service = new ApprovalWorkflowService(
      { publish } as never,
      { sendNotification } as never,
      { logEvent: vi.fn(async () => undefined) } as never
    );
  });

  afterEach(() => {
    delete process.env.APPROVAL_DEFAULT_APPROVERS;
  });

  it('carries the orchestration context and a one-time code onto the workflow', async () => {
    await service.handleApprovalRequested(requestedEvent());

    const workflow = onlyWorkflow();
    expect(workflow.metadata?.orchestration).toEqual({
      operationId: 'op-1',
      workflowInstanceId: 'wfi-1',
      stepId: 'step-1',
    });
    expect(workflow.metadata?.requestedByUserId).toBe('user-requester');
    expect(codeOf(workflow)).toMatch(CODE_ALPHABET);
    expect(workflow.requiredApprovers).toEqual(['user-approver', 'user-second']);
  });

  it('fails closed when no approvers are configured', async () => {
    process.env.APPROVAL_DEFAULT_APPROVERS = '';

    await service.handleApprovalRequested(requestedEvent());

    const [completed] = published<ApprovalWorkflowCompletedEvent>('approval.workflow.completed');
    expect(completed).toMatchObject({
      status: 'expired',
      approved: false,
      approvedBy: null,
      approvedVia: 'expiry',
      context: { operationId: 'op-1', workflowInstanceId: 'wfi-1', stepId: 'step-1' },
    });
  });

  it('approves via an inbound WhatsApp decision and echoes the orchestration context', async () => {
    await service.handleApprovalRequested(requestedEvent());
    const workflow = onlyWorkflow();

    await service.handleDecisionSubmitted(submitted({ code: codeOf(workflow) }));

    const [completed] = published<ApprovalWorkflowCompletedEvent>('approval.workflow.completed');
    expect(completed).toMatchObject({
      workflowId: workflow.id,
      status: 'approved',
      approved: true,
      approvedBy: 'user-approver',
      approvedVia: 'whatsapp',
      context: { operationId: 'op-1', workflowInstanceId: 'wfi-1', stepId: 'step-1' },
    });
    expect(typeof completed.decidedAt).toBe('string');

    const [ack] = published<ApprovalDecisionAckEvent>('approval.decision.ack');
    expect(ack).toMatchObject({ jid: '919812345678@s.whatsapp.net', ok: true });

    // The channel must be answerable from the audit trail alone.
    expect(db.decisions[0].metadata).toMatchObject({
      approvedVia: 'whatsapp',
      jid: '919812345678@s.whatsapp.net',
    });
  });

  it('refuses a second reply carrying an already-consumed code', async () => {
    await service.handleApprovalRequested(requestedEvent());
    const code = codeOf(onlyWorkflow());

    await service.handleDecisionSubmitted(submitted({ code }));

    const applyDecision = vi.spyOn(service, 'processApprovalDecision');
    await service.handleDecisionSubmitted(
      submitted({ code, approved: false, approverUserId: 'user-second' })
    );

    expect(applyDecision).not.toHaveBeenCalled();
    const acks = published<ApprovalDecisionAckEvent>('approval.decision.ack');
    expect(acks.at(-1)).toEqual({
      jid: '919812345678@s.whatsapp.net',
      ok: false,
      message: REFUSAL,
    });
  });

  it('does not cross-apply a code onto another pending workflow', async () => {
    await service.handleApprovalRequested(requestedEvent());
    await service.handleApprovalRequested(
      requestedEvent({ operationId: 'op-2', workflowInstanceId: 'wfi-2', stepId: 'step-2' })
    );

    const [first, second] = [...db.workflows.values()];
    await service.handleDecisionSubmitted(submitted({ code: codeOf(first) }));

    const completed = published<ApprovalWorkflowCompletedEvent>('approval.workflow.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].workflowId).toBe(first.id);
    expect(db.workflows.get(second.id)?.status).toBe(ApprovalStatus.PENDING);
    expect(db.workflows.get(second.id)?.metadata?.codeConsumedAt).toBeUndefined();
  });

  it('refuses a decision from a user who is not a required approver', async () => {
    await service.handleApprovalRequested(requestedEvent());
    const code = codeOf(onlyWorkflow());

    await service.handleDecisionSubmitted(submitted({ code, approverUserId: 'user-outsider' }));

    expect(published('approval.workflow.completed')).toHaveLength(0);
    expect(published<ApprovalDecisionAckEvent>('approval.decision.ack').at(-1)).toMatchObject({
      ok: false,
      message: REFUSAL,
    });
  });

  it('refuses self-approval by the requesting principal', async () => {
    process.env.APPROVAL_DEFAULT_APPROVERS = 'user-requester';
    await service.handleApprovalRequested(requestedEvent());
    const code = codeOf(onlyWorkflow());

    await service.handleDecisionSubmitted(submitted({ code, approverUserId: 'user-requester' }));

    expect(published('approval.workflow.completed')).toHaveLength(0);
    expect(published<ApprovalDecisionAckEvent>('approval.decision.ack').at(-1)).toMatchObject({
      ok: false,
      message: REFUSAL,
    });
  });

  it('answers an unknown code with the same wording as a refused known code', async () => {
    await service.handleApprovalRequested(requestedEvent());
    const code = codeOf(onlyWorkflow());

    await service.handleDecisionSubmitted(submitted({ code: 'QQQQ' }));
    await service.handleDecisionSubmitted(submitted({ code, approverUserId: 'user-outsider' }));

    const acks = published<ApprovalDecisionAckEvent>('approval.decision.ack');
    expect(acks[0].ok).toBe(false);
    expect(acks[0].message).toBe(REFUSAL);
    // Identical wording, so the reply cannot be used to probe which codes exist.
    expect(acks[0].message).toBe(acks[1].message);
  });

  it('publishes a fail-closed completion when a workflow expires', async () => {
    await service.handleApprovalRequested(requestedEvent());
    const workflow = onlyWorkflow();

    await (
      service as unknown as { expireWorkflow(id: string): Promise<void> }
    ).expireWorkflow(workflow.id);

    const [completed] = published<ApprovalWorkflowCompletedEvent>('approval.workflow.completed');
    expect(completed).toMatchObject({
      workflowId: workflow.id,
      status: 'expired',
      approved: false,
      approvedBy: null,
      approvedVia: 'expiry',
      context: { operationId: 'op-1', workflowInstanceId: 'wfi-1', stepId: 'step-1' },
    });
    // Back-compat event is still emitted.
    expect(published('approval.workflow.expired')).toHaveLength(1);
    // The one-time code is released on expiry.
    expect(db.workflows.get(workflow.id)?.metadata?.approvalCode).toBeUndefined();
  });

  it('gives two approval steps on the same operation distinct workflow ids', async () => {
    await service.handleApprovalRequested(requestedEvent({ stepId: 'step-1' }));
    await service.handleApprovalRequested(requestedEvent({ stepId: 'step-2' }));

    const rows = [...db.workflows.values()];
    expect(rows).toHaveLength(2);
    expect(rows[0].operationId).toBe(rows[1].operationId);
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows[0].id).not.toBe('op-1');
  });

  it('schedules the expiry sweep only once however often it is started', async () => {
    const jobs = service as unknown as { expirationJob: unknown; reminderJob: unknown };

    service.startCronJobs();
    const firstHandle = jobs.expirationJob;
    service.startCronJobs();

    expect(firstHandle).not.toBeNull();
    // Same handle: a second start did not schedule a second sweep, which would
    // double-publish every completion event.
    expect(jobs.expirationJob).toBe(firstHandle);

    await service.cleanup();
    expect(jobs.expirationJob).toBeNull();
  });

  afterAll(async () => {
    await service.cleanup();
  });
});
