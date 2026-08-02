import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OperationStatus, OperationType } from '@uaip/types';
import type { Operation } from '@uaip/types';

import { OrchestrationEngine } from '../../orchestration_engine.js';

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

interface StateManagerStub {
  initializeOperationState: ReturnType<typeof vi.fn>;
  updateOperationState: ReturnType<typeof vi.fn>;
  getOperationState: ReturnType<typeof vi.fn>;
  saveCheckpoint: ReturnType<typeof vi.fn>;
}

/**
 * Mirrors the real StateManagerService contract: updateOperationState refuses to
 * write a state that was never initialized (state_manager_service.ts:153).
 */
function createStateManager(): StateManagerStub {
  const states = new Map<string, unknown>();
  return {
    initializeOperationState: vi.fn(async (operationId: string, state: unknown) => {
      states.set(operationId, state);
    }),
    updateOperationState: vi.fn(async (operationId: string, state: unknown) => {
      if (!states.has(operationId)) {
        throw new Error(`Operation state not found for ${operationId}`);
      }
      states.set(operationId, state);
    }),
    getOperationState: vi.fn(async (operationId: string) => states.get(operationId) ?? null),
    saveCheckpoint: vi.fn().mockResolvedValue(undefined),
  };
}

function createEngine(stateManager: StateManagerStub): OrchestrationEngine {
  const eventBus = {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };
  const operationManagement = {
    createOperation: vi.fn(async () => ({ id: OPERATION_ID })),
    updateOperation: vi.fn().mockResolvedValue(undefined),
  };

  return new OrchestrationEngine(
    {} as never,
    eventBus as never,
    stateManager as never,
    {
      releaseResources: vi.fn().mockResolvedValue(undefined),
      allocateResources: vi.fn().mockResolvedValue(undefined),
      checkAvailability: vi.fn().mockResolvedValue(true),
      getUsage: vi.fn().mockResolvedValue({ cpu: 0, memory: 0 }),
    } as never,
    {
      executeStep: vi.fn().mockResolvedValue({ success: true }),
      executeTool: vi.fn().mockResolvedValue({ success: true, data: {} }),
      executeAgentAction: vi.fn().mockResolvedValue({ success: true, data: {} }),
      executeApprovalStep: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as never,
    { compensate: vi.fn() } as never,
    operationManagement as never
  );
}

function buildOperation(): Operation {
  return {
    id: OPERATION_ID,
    type: OperationType.TOOL_EXECUTION,
    status: OperationStatus.PENDING,
    agentId: AGENT_ID,
    userId: USER_ID,
    executionPlan: { steps: [] },
    context: {},
    steps: [
      {
        id: 'step-1',
        name: 'noop tool step',
        type: 'tool-execution',
        toolId: 'noop',
        input: {},
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Operation;
}

describe('OrchestrationEngine operation state lifecycle', () => {
  let stateManager: StateManagerStub;

  beforeEach(() => {
    stateManager = createStateManager();
  });

  it('initializes operation state before the workflow orchestrator updates it', async () => {
    const engine = createEngine(stateManager);

    await engine.executeOperation(buildOperation());

    expect(stateManager.initializeOperationState).toHaveBeenCalledTimes(1);
    const [initializedId] = stateManager.initializeOperationState.mock.calls[0] as [string, unknown];
    expect(initializedId).toBe(OPERATION_ID);
  });

  it('does not throw "Operation state not found" when executing an operation', async () => {
    const engine = createEngine(stateManager);

    await expect(engine.executeOperation(buildOperation())).resolves.toBeDefined();
  });

  it('initializes state before the first updateOperationState call', async () => {
    const callOrder: string[] = [];
    stateManager.initializeOperationState.mockImplementation(async () => {
      callOrder.push('initialize');
    });
    stateManager.updateOperationState.mockImplementation(async () => {
      callOrder.push('update');
    });

    const engine = createEngine(stateManager);
    await engine.executeOperation(buildOperation());

    expect(callOrder[0]).toBe('initialize');
  });
});
