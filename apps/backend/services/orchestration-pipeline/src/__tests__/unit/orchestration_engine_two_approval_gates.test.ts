/**
 * Two approval gates in one workflow.
 *
 * A single gate only proves the engine can suspend once. The dangerous case is
 * the second gate: `resumeApprovedOperation` re-orchestrates from the persisted
 * row, so the resume must be able to (a) skip everything that already ran,
 * (b) run the steps between the gates exactly once, and (c) suspend AGAIN just
 * as cleanly as the first execution did.
 *
 * Re-running a completed step repeats its real-world side effect, so these
 * tests count executor invocations per step id rather than trusting the final
 * status.
 *
 * Workflow shape (strictly sequential via dependsOn):
 *   step-1 (tool) -> gate-1 (approval) -> step-mid (tool) -> gate-2 (approval)
 */
import { APPROVAL_DECISIONS_STATE_KEY, OperationStatus, OperationType } from '@uaip/types';
import type { ExecutionStep, Operation } from '@uaip/types';
import { StepExecutorService } from '@uaip/shared-services';

import { OrchestrationEngine } from '../../orchestration_engine';

const OPERATION_ID = '44444444-4444-4444-8444-444444444444';
const AGENT_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '66666666-6666-4666-8666-666666666666';

const GATE_ONE_ID = 'gate-1';
const GATE_ONE_NAME = 'staging approval';
const GATE_TWO_ID = 'gate-2';
const GATE_TWO_NAME = 'production approval';
const MID_STEP_ID = 'step-mid';

interface PublishedEvent {
  type: string;
  data: Record<string, unknown>;
}

/** Mirrors StateManagerService, including the JSON round-trip through Redis/jsonb. */
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

  // Per-step invocation logs: the only way to prove a completed step did not
  // repeat its side effect across two separate resumes.
  const approvalCalls: string[] = [];
  const toolCalls: string[] = [];

  // Real approval gate; the tool steps are stubbed so their runs can be counted.
  const realExecutor = new StepExecutorService();
  const stepExecutor = {
    executeApprovalStep: vi.fn(
      async (step: ExecutionStep, input: Record<string, unknown>, signal: AbortSignal) => {
        approvalCalls.push(step.id ?? '');
        return realExecutor.executeApprovalStep(step, input, signal);
      }
    ),
    executeTool: vi.fn(async (step: ExecutionStep) => {
      toolCalls.push(step.id ?? '');
      return step.id === 'step-1' ? { ticket: 'T-1' } : { deployId: 'D-9' };
    }),
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

  return {
    engine,
    published,
    subscriptions,
    stepExecutor,
    approvalCalls,
    toolCalls,
    stateManager,
    operationManagement,
  };
}

function buildTwoGateOperation(): Operation {
  const steps = [
    { id: 'step-1', name: 'prepare release', type: 'tool-execution', toolId: 'noop', input: {} },
    {
      id: GATE_ONE_ID,
      name: GATE_ONE_NAME,
      type: 'approval',
      input: { ticket: '$.step-1.ticket' },
      dependsOn: ['step-1'],
      metadata: { riskLevel: 'medium' },
    },
    {
      // Non-approval step BETWEEN the gates: exercises step-skipping on the
      // second resume, where it must already be complete.
      id: MID_STEP_ID,
      name: 'deploy to staging',
      type: 'tool-execution',
      toolId: 'noop',
      input: { ticket: '$.step-1.ticket' },
      dependsOn: [GATE_ONE_ID],
    },
    {
      id: GATE_TWO_ID,
      name: GATE_TWO_NAME,
      type: 'approval',
      // Resolves from a step that ran during the FIRST resume — proves results
      // produced after one suspension survive the next one.
      input: { deployId: `$.${MID_STEP_ID}.deployId` },
      dependsOn: [MID_STEP_ID],
      metadata: { riskLevel: 'critical' },
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
    plan: { description: 'Two-stage production release', dependencies: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Operation;
}

function decisionEvent(stepId: string, overrides: Record<string, unknown> = {}) {
  return {
    data: {
      workflowId: `approval-wf-${stepId}`,
      status: 'approved',
      approved: true,
      approvedBy: stepId === GATE_ONE_ID ? 'alice' : 'bob',
      approvedVia: 'whatsapp',
      decidedAt: '2026-01-01T00:00:00.000Z',
      context: {
        operationId: OPERATION_ID,
        workflowInstanceId: 'wf-instance-1',
        stepId,
      },
      ...overrides,
    },
  };
}

describe('OrchestrationEngine with two approval gates in one workflow', () => {
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
  const approvalDecisions = () => {
    const state = harness.stateManager.states.get(OPERATION_ID) as
      | { variables?: Record<string, unknown> }
      | undefined;
    return state?.variables?.[APPROVAL_DECISIONS_STATE_KEY] as
      | Record<string, { approved: boolean; approvedBy: string | null }>
      | undefined;
  };

  it('suspends at the first gate and requests approval for that gate only', async () => {
    const workflowInstanceId = await harness.engine.executeOperation(buildTwoGateOperation());

    expect(row().status).toBe(OperationStatus.SUSPENDED);
    expect(eventsOfType('operation.failed')).toHaveLength(0);

    const requested = eventsOfType('approval.requested');
    expect(requested).toHaveLength(1);
    expect(requested[0].data).toMatchObject({
      operationId: OPERATION_ID,
      workflowInstanceId,
      stepId: GATE_ONE_ID,
      stepName: GATE_ONE_NAME,
      riskLevel: 'medium',
    });

    // Only step-1 and gate-1 have been attempted; nothing past gate-1 ran.
    expect(harness.toolCalls).toEqual(['step-1']);
    expect(harness.approvalCalls).toEqual([GATE_ONE_ID]);
  });

  it('re-suspends at the second gate after the first decision, without replaying work', async () => {
    await harness.engine.executeOperation(buildTwoGateOperation());
    harness.published.length = 0;

    await approvalHandler(decisionEvent(GATE_ONE_ID));

    // Suspended again — at gate 2 this time, not failed and not completed.
    expect(row().status).toBe(OperationStatus.SUSPENDED);
    expect(eventsOfType('operation.failed')).toHaveLength(0);
    expect(eventsOfType('operation.completed')).toHaveLength(0);
    expect(eventsOfType('operation.resumed')).toHaveLength(1);

    const suspended = eventsOfType('operation.suspended');
    expect(suspended).toHaveLength(1);
    expect(suspended[0].data).toMatchObject({
      operationId: OPERATION_ID,
      stepId: GATE_TWO_ID,
      reason: 'approval_required',
    });

    const requested = eventsOfType('approval.requested');
    expect(requested).toHaveLength(1);
    expect(requested[0].data).toMatchObject({
      operationId: OPERATION_ID,
      stepId: GATE_TWO_ID,
      stepName: GATE_TWO_NAME,
      agentId: AGENT_ID,
      userId: USER_ID,
      riskLevel: 'critical',
    });

    // step-1 must NOT have re-run; the intermediate step ran exactly once.
    expect(harness.toolCalls).toEqual(['step-1', MID_STEP_ID]);
    // gate-1 ran twice (pending, then decided); gate-2 reached its gate once.
    expect(harness.approvalCalls).toEqual([GATE_ONE_ID, GATE_ONE_ID, GATE_TWO_ID]);

    // The operation is now pending the SECOND gate, not the first.
    expect(row().metadata).toMatchObject({
      pendingApproval: { stepId: GATE_TWO_ID, stepName: GATE_TWO_NAME },
    });
  });

  it('completes after the second decision, running each step exactly once', async () => {
    await harness.engine.executeOperation(buildTwoGateOperation());
    await approvalHandler(decisionEvent(GATE_ONE_ID));
    harness.published.length = 0;

    await approvalHandler(decisionEvent(GATE_TWO_ID));

    expect(row().status).toBe(OperationStatus.COMPLETED);
    expect(eventsOfType('operation.failed')).toHaveLength(0);

    const completed = eventsOfType('operation.completed');
    expect(completed).toHaveLength(1);
    const result = completed[0].data.result as {
      result: Record<string, { output: Record<string, unknown> }>;
    };
    expect(result.result[GATE_ONE_ID].output).toMatchObject({
      approved: true,
      approvalResult: 'approved',
      approvedBy: 'alice',
    });
    expect(result.result[GATE_TWO_ID].output).toMatchObject({
      approved: true,
      approvalResult: 'approved',
      approvedBy: 'bob',
    });
    // Results produced before each suspension are still in the final payload.
    expect(result.result['step-1'].output).toMatchObject({ ticket: 'T-1' });
    expect(result.result[MID_STEP_ID].output).toMatchObject({ deployId: 'D-9' });

    // The whole point: two resumes, and every real-world step ran once.
    expect(harness.toolCalls).toEqual(['step-1', MID_STEP_ID]);
    expect(harness.approvalCalls).toEqual([
      GATE_ONE_ID,
      GATE_ONE_ID,
      GATE_TWO_ID,
      GATE_TWO_ID,
    ]);

    expect((row().metadata as Record<string, unknown>).pendingApproval).toBeUndefined();
  });

  it('rehydrates step results produced during the first resume into the second gate', async () => {
    await harness.engine.executeOperation(buildTwoGateOperation());
    await approvalHandler(decisionEvent(GATE_ONE_ID));

    await approvalHandler(decisionEvent(GATE_TWO_ID));

    // step-mid ran during resume #1 and its output survived suspension #2.
    const gateTwoDecidedInput = harness.stepExecutor.executeApprovalStep.mock.calls.at(-1)?.[1];
    expect(gateTwoDecidedInput).toMatchObject({
      deployId: 'D-9',
      approved: true,
      approvedBy: 'bob',
    });
  });

  it('records both decisions independently in operation state', async () => {
    await harness.engine.executeOperation(buildTwoGateOperation());
    await approvalHandler(decisionEvent(GATE_ONE_ID));
    await approvalHandler(decisionEvent(GATE_TWO_ID));

    expect(approvalDecisions()).toMatchObject({
      [GATE_ONE_ID]: { approved: true, approvedBy: 'alice' },
      [GATE_TWO_ID]: { approved: true, approvedBy: 'bob' },
    });
  });

  describe('second gate rejected', () => {
    const rejectGateTwo = () =>
      approvalHandler(
        decisionEvent(GATE_TWO_ID, {
          status: 'rejected',
          approved: false,
          approvedBy: 'bob',
          approvedVia: 'web',
        })
      );

    it('fails the operation without re-running any completed step', async () => {
      await harness.engine.executeOperation(buildTwoGateOperation());
      await approvalHandler(decisionEvent(GATE_ONE_ID));
      harness.published.length = 0;

      await rejectGateTwo();

      expect(row().status).toBe(OperationStatus.FAILED);
      expect(row().error).toContain('Approval rejected by bob');

      const failed = eventsOfType('operation.failed');
      expect(failed).toHaveLength(1);
      expect(failed[0].data.error).toContain('Approval rejected by bob');
      expect(eventsOfType('operation.completed')).toHaveLength(0);

      // Rejection at gate 2 must not replay step-1, gate-1 or step-mid.
      expect(harness.toolCalls).toEqual(['step-1', MID_STEP_ID]);
      expect(harness.approvalCalls).toEqual([
        GATE_ONE_ID,
        GATE_ONE_ID,
        GATE_TWO_ID,
        GATE_TWO_ID,
      ]);
    });

    it("leaves gate 1's approved decision untouched", async () => {
      await harness.engine.executeOperation(buildTwoGateOperation());
      await approvalHandler(decisionEvent(GATE_ONE_ID));

      await rejectGateTwo();

      expect(approvalDecisions()).toMatchObject({
        [GATE_ONE_ID]: { approved: true, approvedBy: 'alice' },
        [GATE_TWO_ID]: { approved: false, approvedBy: 'bob' },
      });

      const state = harness.stateManager.states.get(OPERATION_ID) as {
        completedSteps?: string[];
      };
      expect(state.completedSteps).toEqual(
        expect.arrayContaining(['step-1', GATE_ONE_ID, MID_STEP_ID])
      );
      expect(state.completedSteps).not.toContain(GATE_TWO_ID);
    });

    it('ignores a late approval for gate 2 once the operation has failed', async () => {
      await harness.engine.executeOperation(buildTwoGateOperation());
      await approvalHandler(decisionEvent(GATE_ONE_ID));
      await rejectGateTwo();
      const callsAfterFailure = harness.approvalCalls.length;
      harness.published.length = 0;

      await approvalHandler(decisionEvent(GATE_TWO_ID));

      expect(row().status).toBe(OperationStatus.FAILED);
      expect(harness.approvalCalls).toHaveLength(callsAfterFailure);
      expect(eventsOfType('operation.resumed')).toHaveLength(0);
    });
  });
});
