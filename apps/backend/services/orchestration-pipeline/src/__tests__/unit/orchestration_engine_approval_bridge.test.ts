/**
 * Suspend/resume bridge for approval steps.
 *
 * This is a security boundary: an operation may only continue past an approval
 * gate when an attributed decision arrived on `approval.workflow.completed`.
 * Every malformed / unattributed / duplicate event must leave the operation
 * SUSPENDED. The approval gate itself is the REAL StepExecutorService here —
 * stubbing it would test the mock, not the boundary.
 */
import { OperationStatus, OperationType } from '@uaip/types';
import type { Operation } from '@uaip/types';
import { StepExecutorService } from '@uaip/shared-services';

import { OrchestrationEngine } from '../../orchestration_engine';

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const APPROVAL_STEP_ID = 'step-2';
const APPROVAL_STEP_NAME = 'deploy approval';

interface PublishedEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Mirrors StateManagerService: updateOperationState refuses a state it never
 * initialized, applies only currentStep/completedSteps/failedSteps/variables,
 * and shallow-merges variables. The JSON round-trip mirrors the Redis/jsonb hop
 * — anything not JSON-serialisable does not survive a suspension.
 */
function createStateManager() {
  const states = new Map<string, Record<string, unknown>>();
  const store = (operationId: string, state: unknown) => {
    states.set(operationId, JSON.parse(JSON.stringify(state)));
  };

  return {
    states,
    initializeOperationState: vi.fn(async (operationId: string, state: unknown) => {
      store(operationId, state);
    }),
    updateOperationState: vi.fn(async (operationId: string, updates: Record<string, unknown>) => {
      const current = states.get(operationId);
      if (!current) {
        throw new Error(`Operation state not found for ${operationId}`);
      }
      store(operationId, {
        ...current,
        ...(updates.currentStep ? { currentStep: updates.currentStep } : {}),
        ...(updates.completedSteps ? { completedSteps: updates.completedSteps } : {}),
        ...(updates.failedSteps ? { failedSteps: updates.failedSteps } : {}),
        ...(updates.variables
          ? {
              variables: {
                ...((current.variables as Record<string, unknown>) ?? {}),
                ...(updates.variables as Record<string, unknown>),
              },
            }
          : {}),
        lastUpdated: new Date(),
      });
    }),
    getState: vi.fn(async (operationId: string) => states.get(operationId) ?? null),
    getOperationState: vi.fn(async (operationId: string) => states.get(operationId) ?? null),
    saveCheckpoint: vi.fn().mockResolvedValue(undefined),
  };
}

function createOperationManagement() {
  const rows = new Map<string, Record<string, unknown>>();

  return {
    rows,
    createOperation: vi.fn(async (data: Record<string, unknown>) => {
      const row = { ...data, createdAt: new Date(), updatedAt: new Date() };
      rows.set(String(row.id), row);
      return row;
    }),
    getOperation: vi.fn(async (operationId: string) => rows.get(operationId) ?? null),
    updateOperation: vi.fn(async (operationId: string, updates: Record<string, unknown>) => {
      const row = rows.get(operationId);
      if (!row) return null;
      Object.assign(row, updates);
      return row;
    }),
    findStaleOperations: vi.fn(async () => []),
  };
}

function createHarness() {
  const published: PublishedEvent[] = [];
  const subscriptions = new Map<string, (event: unknown) => Promise<void>>();

  const eventBus = {
    publish: vi.fn(async (type: string, data: Record<string, unknown>) => {
      published.push({ type, data });
    }),
    subscribe: vi.fn(async (type: string, handler: (event: unknown) => Promise<void>) => {
      subscriptions.set(type, handler);
    }),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };

  // Real approval gate; the other step types are stubbed so we can count runs.
  const realExecutor = new StepExecutorService();
  const stepExecutor = {
    executeApprovalStep: vi.fn(
      async (step: never, input: Record<string, unknown>, signal: AbortSignal) =>
        realExecutor.executeApprovalStep(step, input, signal)
    ),
    executeTool: vi.fn(async () => ({ ticket: 'T-1' })),
    executeAgentAction: vi.fn(async () => ({ ok: true })),
  };

  const stateManager = createStateManager();
  const operationManagement = createOperationManagement();

  const engine = new OrchestrationEngine(
    {} as never,
    eventBus as never,
    stateManager as never,
    {
      releaseResources: vi.fn().mockResolvedValue(undefined),
      allocateResources: vi.fn().mockResolvedValue(undefined),
      checkAvailability: vi.fn().mockResolvedValue({ available: true }),
      getUsage: vi.fn().mockResolvedValue({ cpu: 0, memory: 0, network: 0 }),
    } as never,
    stepExecutor as never,
    { compensate: vi.fn() } as never,
    operationManagement as never
  );

  return { engine, eventBus, published, subscriptions, stepExecutor, stateManager, operationManagement };
}

function buildOperation(): Operation {
  const steps = [
    {
      id: 'step-1',
      name: 'prepare release',
      type: 'tool-execution',
      toolId: 'noop',
      input: {},
    },
    {
      id: APPROVAL_STEP_ID,
      name: APPROVAL_STEP_NAME,
      type: 'approval',
      // Proves step results rehydrate across the suspension: this resolves from
      // step-1's output, which ran before the operation was suspended.
      input: { ticket: '$.step-1.ticket' },
      dependsOn: ['step-1'],
      metadata: { riskLevel: 'high' },
    },
  ];

  return {
    id: OPERATION_ID,
    type: OperationType.TOOL_EXECUTION,
    status: OperationStatus.PENDING,
    agentId: AGENT_ID,
    userId: USER_ID,
    steps,
    executionPlan: { steps },
    context: {},
    plan: { description: 'Deploy to production', dependencies: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Operation;
}

function decisionEvent(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      workflowId: 'approval-wf-1',
      status: 'approved',
      approved: true,
      approvedBy: 'user-1',
      approvedVia: 'whatsapp',
      decidedAt: '2026-01-01T00:00:00.000Z',
      context: {
        operationId: OPERATION_ID,
        workflowInstanceId: 'wf-instance-1',
        stepId: APPROVAL_STEP_ID,
      },
      ...overrides,
    },
  };
}

describe('OrchestrationEngine approval suspend/resume bridge', () => {
  let harness: ReturnType<typeof createHarness>;
  let approvalHandler: (event: unknown) => Promise<void>;

  beforeEach(async () => {
    harness = createHarness();
    await harness.engine.initialize();
    const handler = harness.subscriptions.get('approval.workflow.completed');
    if (!handler) throw new Error('engine did not subscribe to approval.workflow.completed');
    approvalHandler = handler;
  });

  afterEach(async () => {
    await harness.engine.shutdown();
  });

  const row = () => harness.operationManagement.rows.get(OPERATION_ID) as Record<string, unknown>;
  const eventsOfType = (type: string) => harness.published.filter((e) => e.type === type);

  describe('suspension', () => {
    it('suspends the operation instead of failing it when no decision exists', async () => {
      const workflowInstanceId = await harness.engine.executeOperation(buildOperation());

      expect(workflowInstanceId).toEqual(expect.stringContaining(`wf-${OPERATION_ID}`));
      expect(row().status).toBe(OperationStatus.SUSPENDED);
      expect(eventsOfType('operation.failed')).toHaveLength(0);

      const suspended = eventsOfType('operation.suspended');
      expect(suspended).toHaveLength(1);
      expect(suspended[0].data).toMatchObject({
        operationId: OPERATION_ID,
        workflowInstanceId,
        stepId: APPROVAL_STEP_ID,
        reason: 'approval_required',
      });
    });

    it('publishes approval.requested with the full approval context', async () => {
      const workflowInstanceId = await harness.engine.executeOperation(buildOperation());

      const requested = eventsOfType('approval.requested');
      expect(requested).toHaveLength(1);
      expect(requested[0].data).toMatchObject({
        operationId: OPERATION_ID,
        workflowInstanceId,
        stepId: APPROVAL_STEP_ID,
        stepName: APPROVAL_STEP_NAME,
        agentId: AGENT_ID,
        userId: USER_ID,
        operationType: OperationType.TOOL_EXECUTION,
        description: 'Deploy to production',
        riskLevel: 'high',
      });
      expect(typeof requested[0].data.timestamp).toBe('string');
    });

    it('records the pending approval on the operation so it can be resumed', async () => {
      await harness.engine.executeOperation(buildOperation());

      expect(row().metadata).toMatchObject({
        pendingApproval: {
          stepId: APPROVAL_STEP_ID,
          stepName: APPROVAL_STEP_NAME,
        },
      });
    });
  });

  describe('approved decision', () => {
    it('resumes and lets the approval step return an attributed approval', async () => {
      await harness.engine.executeOperation(buildOperation());
      harness.published.length = 0;

      await approvalHandler(decisionEvent());

      expect(row().status).toBe(OperationStatus.COMPLETED);

      const completed = eventsOfType('operation.completed');
      expect(completed).toHaveLength(1);
      const result = completed[0].data.result as {
        result: Record<string, { output: Record<string, unknown> }>;
      };
      expect(result.result[APPROVAL_STEP_ID].output).toMatchObject({
        approved: true,
        approvalResult: 'approved',
        approvedBy: 'user-1',
      });
      expect(eventsOfType('operation.resumed')).toHaveLength(1);
      expect(eventsOfType('operation.failed')).toHaveLength(0);
    });

    it('clears metadata.pendingApproval once resumed', async () => {
      await harness.engine.executeOperation(buildOperation());

      await approvalHandler(decisionEvent());

      expect((row().metadata as Record<string, unknown>).pendingApproval).toBeUndefined();
    });

    it('does not re-execute steps already in completedSteps', async () => {
      await harness.engine.executeOperation(buildOperation());
      expect(harness.stepExecutor.executeTool).toHaveBeenCalledTimes(1);

      await approvalHandler(decisionEvent());

      // step-1 ran before the suspension; its side effects already happened.
      expect(harness.stepExecutor.executeTool).toHaveBeenCalledTimes(1);
      expect(harness.stepExecutor.executeApprovalStep).toHaveBeenCalledTimes(2);
    });

    it('rehydrates prior step results so $.stepId.foo still resolves after a resume', async () => {
      await harness.engine.executeOperation(buildOperation());

      await approvalHandler(decisionEvent());

      const resumedInput = harness.stepExecutor.executeApprovalStep.mock.calls[1][1];
      expect(resumedInput).toMatchObject({ ticket: 'T-1', approved: true, approvedBy: 'user-1' });
    });
  });

  describe('rejected decision', () => {
    it('fails the operation with an APPROVAL_REJECTED-derived error', async () => {
      await harness.engine.executeOperation(buildOperation());
      harness.published.length = 0;

      await approvalHandler(
        decisionEvent({
          status: 'rejected',
          approved: false,
          approvedBy: 'user-9',
          approvedVia: 'web',
        })
      );

      expect(row().status).toBe(OperationStatus.FAILED);
      expect(row().error).toContain('Approval rejected by user-9');

      const failed = eventsOfType('operation.failed');
      expect(failed).toHaveLength(1);
      expect(failed[0].data.error).toContain('Approval rejected by user-9');
      expect(eventsOfType('operation.completed')).toHaveLength(0);
    });

    it('treats an expired workflow exactly like a rejection', async () => {
      await harness.engine.executeOperation(buildOperation());
      harness.published.length = 0;

      await approvalHandler(
        decisionEvent({
          status: 'expired',
          approved: false,
          approvedBy: null,
          approvedVia: 'expiry',
        })
      );

      expect(row().status).toBe(OperationStatus.FAILED);
      expect(row().error).toContain('Approval rejected');
      expect(eventsOfType('operation.failed')).toHaveLength(1);
      expect(eventsOfType('operation.completed')).toHaveLength(0);
    });
  });

  describe('fail-closed handling of bad events', () => {
    const expectStillSuspended = () => {
      expect(row().status).toBe(OperationStatus.SUSPENDED);
      expect(eventsOfType('operation.resumed')).toHaveLength(0);
      expect(harness.stepExecutor.executeApprovalStep).toHaveBeenCalledTimes(1);
    };

    it('ignores an event with no context block', async () => {
      await harness.engine.executeOperation(buildOperation());
      harness.published.length = 0;

      await approvalHandler({ data: { workflowId: 'approval-wf-1', approved: true, approvedBy: 'x' } });

      expectStillSuspended();
    });

    it('ignores an event whose context is missing the stepId', async () => {
      await harness.engine.executeOperation(buildOperation());
      harness.published.length = 0;

      await approvalHandler(
        decisionEvent({ context: { operationId: OPERATION_ID, workflowInstanceId: 'wf-instance-1' } })
      );

      expectStillSuspended();
    });

    it('ignores an event whose context is missing the operationId', async () => {
      await harness.engine.executeOperation(buildOperation());
      harness.published.length = 0;

      await approvalHandler(decisionEvent({ context: { stepId: APPROVAL_STEP_ID } }));

      expectStillSuspended();
    });

    it('refuses an approval with no attributed approver', async () => {
      await harness.engine.executeOperation(buildOperation());
      harness.published.length = 0;

      await approvalHandler(decisionEvent({ approved: true, approvedBy: null }));

      expectStillSuspended();
    });

    it('refuses an approval whose approvedBy is an empty string', async () => {
      await harness.engine.executeOperation(buildOperation());
      harness.published.length = 0;

      await approvalHandler(decisionEvent({ approved: true, approvedBy: '' }));

      expectStillSuspended();
    });

    it('ignores an event with a non-boolean decision', async () => {
      await harness.engine.executeOperation(buildOperation());
      harness.published.length = 0;

      await approvalHandler(decisionEvent({ approved: 'yes' }));

      expectStillSuspended();
    });
  });

  describe('idempotency', () => {
    it('treats a duplicate approval.workflow.completed as a no-op', async () => {
      await harness.engine.executeOperation(buildOperation());

      await approvalHandler(decisionEvent());
      expect(row().status).toBe(OperationStatus.COMPLETED);
      const callsAfterFirst = harness.stepExecutor.executeApprovalStep.mock.calls.length;
      harness.published.length = 0;

      await approvalHandler(decisionEvent());

      expect(row().status).toBe(OperationStatus.COMPLETED);
      expect(harness.stepExecutor.executeApprovalStep.mock.calls.length).toBe(callsAfterFirst);
      expect(harness.stepExecutor.executeTool).toHaveBeenCalledTimes(1);
      expect(eventsOfType('operation.resumed')).toHaveLength(0);
      expect(eventsOfType('operation.completed')).toHaveLength(0);
    });

    it('does not resume an operation that already failed on rejection', async () => {
      await harness.engine.executeOperation(buildOperation());
      await approvalHandler(decisionEvent({ approved: false, approvedBy: 'user-9' }));
      expect(row().status).toBe(OperationStatus.FAILED);
      harness.published.length = 0;

      await approvalHandler(decisionEvent());

      expect(row().status).toBe(OperationStatus.FAILED);
      expect(eventsOfType('operation.resumed')).toHaveLength(0);
    });
  });
});
