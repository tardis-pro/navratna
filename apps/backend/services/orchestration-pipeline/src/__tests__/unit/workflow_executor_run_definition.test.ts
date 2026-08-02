import { describe, it, expect, vi, beforeEach } from 'vitest';

const createOperationMock = vi.fn();
const updateSetWhereMock = vi.fn();
const selectRows: unknown[] = [];

vi.mock('@uaip/shared-services', () => ({
  EventBusService: class {},
  OperationRepository: class {
    createOperation = createOperationMock;
  },
  SYSTEM_AGENT_ID: '00000000-0000-0000-0000-000000000001',
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000002',
  getControlDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectRows),
        }),
      }),
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: (predicate: unknown) => {
          updateSetWhereMock(values, predicate);
          return Promise.resolve();
        },
      }),
    }),
  }),
}));

vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

vi.mock('@uaip/shared-services/drizzle/control', () => ({
  workflowDefinitions: { id: 'workflow_definitions.id' },
  operations: { id: 'operations.id' },
}));

import { WorkflowExecutorService } from '../../services/workflow_executor_service.js';

interface EventBusStub {
  subscribe: ReturnType<typeof vi.fn>;
  publishAndWaitForResponse: ReturnType<typeof vi.fn>;
}

function createEventBus(): EventBusStub {
  return {
    subscribe: vi.fn().mockResolvedValue(undefined),
    publishAndWaitForResponse: vi.fn().mockResolvedValue({ stdout: 'ok' }),
  };
}

describe('WorkflowExecutorService.runDefinition', () => {
  beforeEach(() => {
    createOperationMock.mockReset().mockResolvedValue(undefined);
    updateSetWhereMock.mockReset();
    selectRows.length = 0;
  });

  it('is callable from outside the class so an HTTP route can trigger a run on demand', () => {
    const eventBus = createEventBus();
    const service = new WorkflowExecutorService(eventBus as never);

    expect(typeof (service as unknown as Record<string, unknown>).runDefinition).toBe('function');
  });

  it('returns the operation it created so the caller can report the run id', async () => {
    selectRows.push({
      id: 'wf-1',
      name: 'nightly',
      description: null,
      steps: [{ type: 'bash', command: 'echo hi' }],
      agentId: null,
      sessionKey: null,
      model: null,
      delivery: null,
    });

    const eventBus = createEventBus();
    const service = new WorkflowExecutorService(eventBus as never);

    const result = await (
      service as unknown as { runDefinition: (id: string) => Promise<unknown> }
    ).runDefinition('wf-1');

    expect(result).toBeDefined();
    const run = result as { operationId?: string; status?: string; workflowDefinitionId?: string };
    expect(run.operationId).toEqual(expect.any(String));
    expect(run.workflowDefinitionId).toBe('wf-1');
    expect(run.status).toBe('completed');
  });

  it('returns undefined-safe null when the definition does not exist instead of throwing', async () => {
    const eventBus = createEventBus();
    const service = new WorkflowExecutorService(eventBus as never);

    const result = await (
      service as unknown as { runDefinition: (id: string) => Promise<unknown> }
    ).runDefinition('missing');

    expect(result).toBeNull();
    expect(createOperationMock).not.toHaveBeenCalled();
  });
});
