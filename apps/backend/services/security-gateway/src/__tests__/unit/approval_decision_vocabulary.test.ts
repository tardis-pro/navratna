/**
 * The decision vocabulary: `approve | approve_with_edits | reject`.
 *
 * WHAT THIS EXISTS TO STOP.
 *
 * The vocabulary used to be two-valued, so the commonest real outcome of
 * reviewing a machine-authored change — approve it, then change it before
 * merging — recorded as a clean `approve`. The approval log then said the
 * proposal was right while the diff said it was nearly right in a specific,
 * repeatable way. That gap is not recoverable afterwards: merged code does not
 * record what it used to say.
 *
 * Adding a third value is the easy half. The dangerous half is that
 * `approve_with_edits` must be treated as APPROVING at every gate. Anywhere a
 * bare `=== 'approve'` survives, an edited approval falls into neither the
 * approved nor the rejected list, and its workflow sits pending forever while
 * its approver believes they decided it. Worse, the read-back path used to
 * collapse anything that was not exactly `'approve'` into `'reject'` — so a
 * correctly stored edited approval would have come back as a refusal and
 * blocked the change its approver had just accepted.
 *
 * The service tests below are therefore about the GATES, not about storage.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  APPROVAL_DECISIONS,
  ApprovalDecisionSchema,
  isApprovingDecision,
  ApprovalStatus,
} from '@uaip/types';
import type { ApprovalRequestedPayload } from '@uaip/types';

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

const db = vi.hoisted(() => {
  const workflows = new Map<string, WorkflowRow>();
  const decisions: DecisionRow[] = [];

  const workflowRepository = {
    findById: vi.fn(async (id: string) => workflows.get(id) ?? null),
    findByOperationId: vi.fn(
      async (operationId: string) =>
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
        status: ApprovalStatus.PENDING,
        requiredApprovers: [],
        operationId: 'op-1',
        id: 'wf-1',
        ...data,
      } as WorkflowRow;
      workflows.set(row.id, row);
      return row;
    }),
    updateApprovalWorkflow: vi.fn(async (id: string, data: Partial<WorkflowRow>) => {
      const row = { ...(workflows.get(id) as WorkflowRow), ...data };
      workflows.set(id, row);
      return row;
    }),
    claimApprovalCode: vi.fn(async () => null),
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

const APPROVER = 'user-approver';
const DIFF = '--- a/auth.ts\n+++ b/auth.ts\n@@\n-  if (token)\n+  if (token && !expired(token))\n';

describe('the decision vocabulary', () => {
  it('offers exactly three values', () => {
    expect([...APPROVAL_DECISIONS]).toEqual(['approve', 'approve_with_edits', 'reject']);
  });

  it('treats an edited approval as approving', () => {
    expect(isApprovingDecision('approve')).toBe(true);
    expect(isApprovingDecision('approve_with_edits')).toBe(true);
    expect(isApprovingDecision('reject')).toBe(false);
  });

  it('treats an unknown or absent decision as not approving', () => {
    // Fail closed: a value we cannot read must never authorise an operation.
    expect(isApprovingDecision('APPROVE')).toBe(false);
    expect(isApprovingDecision('approved')).toBe(false);
    expect(isApprovingDecision(undefined)).toBe(false);
    expect(isApprovingDecision(null)).toBe(false);
  });
});

describe('the edits payload is required exactly when it is meaningful', () => {
  const base = {
    workflowId: '11111111-1111-4111-8111-111111111111',
    approverId: '22222222-2222-4222-8222-222222222222',
    decidedAt: new Date(),
  };

  it('refuses approve_with_edits that cannot say what was edited', () => {
    const result = ApprovalDecisionSchema.safeParse({ ...base, decision: 'approve_with_edits' });

    expect(result.success).toBe(false);
    // The point of the class is the delta. Allowing it without one would
    // reintroduce the original defect in a new spelling.
    expect(JSON.stringify(result)).toContain('requires `edits`');
  });

  it('accepts approve_with_edits carrying a diff', () => {
    const result = ApprovalDecisionSchema.safeParse({
      ...base,
      decision: 'approve_with_edits',
      edits: { diff: DIFF, summary: 'guard against expired tokens' },
    });

    expect(result.success).toBe(true);
  });

  it('refuses an empty diff, which records the claim and not the change', () => {
    const result = ApprovalDecisionSchema.safeParse({
      ...base,
      decision: 'approve_with_edits',
      edits: { diff: '' },
    });

    expect(result.success).toBe(false);
  });

  it('refuses edits attached to a plain approval', () => {
    const result = ApprovalDecisionSchema.safeParse({
      ...base,
      decision: 'approve',
      edits: { diff: DIFF },
    });

    expect(result.success).toBe(false);
  });
});

describe('ApprovalWorkflowService — an edited approval passes every gate', () => {
  let service: InstanceType<typeof ApprovalWorkflowService>;

  const requested = (): ApprovalRequestedPayload => ({
    operationId: 'op-1',
    workflowInstanceId: 'wfi-1',
    stepId: 'step-1',
    stepName: 'Deploy to production',
    userId: 'user-requester',
    operationType: 'deploy',
    description: 'Ship release 4.2',
    riskLevel: 'high',
    timestamp: new Date().toISOString(),
  });

  const onlyWorkflow = (): WorkflowRow => [...db.workflows.values()][0];

  beforeEach(() => {
    db.workflows.clear();
    db.decisions.length = 0;
    process.env.APPROVAL_DEFAULT_APPROVERS = APPROVER;

    service = new ApprovalWorkflowService(
      { publish: vi.fn(async () => undefined) } as never,
      { sendNotification: vi.fn(async () => undefined) } as never,
      { logEvent: vi.fn(async () => undefined) } as never
    );
  });

  const decideWithEdits = async () => {
    await service.handleApprovalRequested(requested());
    return service.processApprovalDecision({
      workflowId: onlyWorkflow().id,
      approverId: APPROVER,
      decision: 'approve_with_edits',
      edits: { diff: DIFF, summary: 'guard against expired tokens' },
      decidedAt: new Date(),
    } as never);
  };

  it('lets the operation proceed rather than blocking it', async () => {
    const status = await decideWithEdits();

    // The regression this pins: the read-back path used to collapse anything
    // that was not exactly 'approve' into 'reject', so this same call would
    // have come back as a refusal of the change its approver had accepted.
    expect(status.canProceed).toBe(true);
    expect(status.isComplete).toBe(true);
  });

  it('clears the approver from pending rather than leaving them there forever', async () => {
    await decideWithEdits();

    const status = await service.getWorkflowStatus(onlyWorkflow().id);

    // The sharpest form of the bug: a bare `=== 'approve'` puts an edited
    // approval in NEITHER the approved nor the rejected list, so the approver
    // stays pending and the workflow waits on someone who already decided.
    expect(status.pendingApprovers).not.toContain(APPROVER);
    expect(status.completedApprovals.map((d) => d.decision)).toContain('approve_with_edits');
  });

  it('stores the diff beside the decision that carried it', async () => {
    await decideWithEdits();

    const [row] = db.decisions;
    expect(row.decision).toBe('approve_with_edits');
    // Not the summary — the summary is the part that survives in someone's
    // memory anyway, and the diff is the part that does not.
    expect((row.metadata?.edits as { diff: string })?.diff).toBe(DIFF);
  });

  it('reads the stored value back unchanged', async () => {
    await decideWithEdits();

    const [stored] = await db.decisionRepository.getApprovalDecisions(onlyWorkflow().id);
    expect(stored.decision).toBe('approve_with_edits');
  });
});
