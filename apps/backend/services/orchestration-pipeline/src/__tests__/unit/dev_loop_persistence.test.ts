import { describe, it, expect, vi, beforeEach } from 'vitest';

const createOperationMock = vi.fn().mockResolvedValue({ id: 'generated-by-db' });
const whereMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@uaip/shared-services', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@uaip/shared-services');
  return {
    ...actual,
    OperationRepository: class {
      createOperation = createOperationMock;
    },
    getControlDb: () => ({
      update: () => ({ set: () => ({ where: whereMock }) }),
    }),
  };
});

describe('DevLoopOrchestrator operation persistence', () => {
  beforeEach(() => {
    createOperationMock.mockClear();
    whereMock.mockClear();
  });

  it('persists the operation under the loop id so later status updates can match it', async () => {
    const { DevLoopOrchestrator } = await import('../../services/dev_loop_orchestrator.js');

    const orchestrator = new DevLoopOrchestrator({
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
    } as never);

    const state = {
      id: '33333333-3333-4333-8333-333333333333',
      status: 'running',
      currentStage: 'ingest',
      config: { epicTitle: 'demo epic' },
    };

    const persist = Reflect.get(orchestrator, 'persistOperation') as (
      s: unknown,
      by: string
    ) => Promise<void>;
    await persist.call(orchestrator, state, 'user-1');

    expect(createOperationMock).toHaveBeenCalledTimes(1);
    const [insert] = createOperationMock.mock.calls[0] as [{ id?: string }];
    expect(insert.id).toBe(state.id);
  });

  it('never writes boardCredentials into the operation row', async () => {
    const { DevLoopOrchestrator } = await import('../../services/dev_loop_orchestrator.js');

    const orchestrator = new DevLoopOrchestrator({
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
    } as never);

    const state = {
      id: '44444444-4444-4444-8444-444444444444',
      status: 'running',
      currentStage: 'ingest',
      config: {
        epicTitle: 'demo epic',
        repoUrl: 'https://github.com/acme/repo',
        boardType: 'jira',
        boardCredentials: { apiToken: 'SUPER_SECRET_TOKEN', email: 'bot@acme.dev' },
      },
    };

    const persist = Reflect.get(orchestrator, 'persistOperation') as (
      s: unknown,
      by: string
    ) => Promise<void>;
    await persist.call(orchestrator, state, 'user-1');

    const [insert] = createOperationMock.mock.calls[0] as [Record<string, unknown>];
    expect(JSON.stringify(insert)).not.toContain('SUPER_SECRET_TOKEN');
    expect(JSON.stringify(insert)).not.toContain('boardCredentials');
  });
});
