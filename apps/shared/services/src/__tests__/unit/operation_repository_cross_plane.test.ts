import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testDouble } from '../test_double.js';

/**
 * `operations` lives in the CONTROL plane but carries `agentId`, which is owned by
 * the INTELLIGENCE plane. There is no DB-level FK across planes, so a write with a
 * bogus agentId silently creates an orphaned row unless CrossPlaneGuard is invoked.
 */

const insertedRows: unknown[] = [];

const controlDbStub = {
  insert: vi.fn(() => ({
    values: vi.fn((data: unknown) => ({
      returning: vi.fn(async () => {
        insertedRows.push(data);
        return [data];
      }),
    })),
  })),
};

const intelligencePoolStub = {
  query: vi.fn(),
};

vi.mock('../../database/drizzle/clients/index', async () => {
  const actual = await vi.importActual<
    typeof import('../../database/drizzle/clients/index')
  >('../../database/drizzle/clients/index');
  return {
    ...actual,
    getControlDb: () => controlDbStub,
    getIntelligencePool: () => intelligencePoolStub,
  };
});

const { OperationRepository } = await import('../../database/repositories/operation_repository');

type NewOperationLike = Parameters<OperationRepositoryInstance['createOperation']>[0];
type OperationRepositoryInstance = InstanceType<typeof OperationRepository>;

function operationPayload(agentId: string) {
  return testDouble<NewOperationLike>({
    agentId,
    userId: 'user-1',
    type: 'analysis',
    status: 'pending',
  });
}

describe('OperationRepository cross-plane integrity', () => {
  let repo: OperationRepositoryInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    insertedRows.length = 0;
    repo = new OperationRepository();
  });

  it('rejects an operation whose agentId does not exist in the intelligence plane', async () => {
    intelligencePoolStub.query.mockResolvedValue({ rows: [] });

    await expect(repo.createOperation(operationPayload('missing-agent'))).rejects.toMatchObject({
      code: 'CROSS_PLANE_FK_VIOLATION',
    });

    expect(insertedRows).toHaveLength(0);
  });

  it('inserts the operation when the referenced agent exists', async () => {
    intelligencePoolStub.query.mockResolvedValue({ rows: [{ id: 'agent-1' }] });

    await repo.createOperation(operationPayload('agent-1'));

    expect(intelligencePoolStub.query).toHaveBeenCalled();
    expect(insertedRows).toHaveLength(1);
  });

  it('verifies the agent BEFORE writing, not after', async () => {
    intelligencePoolStub.query.mockResolvedValue({ rows: [] });

    await expect(repo.createOperation(operationPayload('missing-agent'))).rejects.toThrow();

    expect(controlDbStub.insert).not.toHaveBeenCalled();
  });
});
