import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `user_agent_assignments` lives in the CONTROL plane but `agentId` is owned by
 * the INTELLIGENCE plane. There is deliberately no DB-level FK on agentId, so
 * `assignMany` must call CrossPlaneGuard.verifyMany against the intelligence
 * pool BEFORE inserting — otherwise a bogus agent id silently becomes a grant.
 */

const { mocks } = vi.hoisted(() => ({
  mocks: {
    selectRows: [] as unknown[],
    insertedValues: [] as unknown[],
    deleteResult: { rowCount: 0 },
    verifyMany: vi.fn(),
  },
}));

const selectAfterWhere = () => ({
  limit: vi.fn(async () => mocks.selectRows),
  then: (onFulfilled: (rows: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(mocks.selectRows).then(onFulfilled, onRejected),
});

const controlDbStub = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => selectAfterWhere()),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn((rows: unknown[]) => {
      mocks.insertedValues.push(...rows);
      return {
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => rows),
        })),
      };
    }),
  })),
  delete: vi.fn(() => ({
    where: vi.fn(async () => mocks.deleteResult),
  })),
};

const getControlDbMock = vi.fn(() => controlDbStub);

const intelligencePoolStub = {
  query: vi.fn(),
};

vi.mock('../../database/drizzle/clients/index', async () => {
  const actual = await vi.importActual<
    typeof import('../../database/drizzle/clients/index')
  >('../../database/drizzle/clients/index');
  return {
    ...actual,
    getControlDb: getControlDbMock,
    getIntelligencePool: () => intelligencePoolStub,
    CrossPlaneGuard: {
      verify: vi.fn(),
      verifyMany: mocks.verifyMany,
    },
  };
});

const { UserAgentAssignmentRepository } = await import(
  '../../database/repositories/user_agent_assignment_repository'
);

const USER_ID = '22222222-2222-4222-8222-222222222222';
const ORG_ID = '33333333-3333-4333-8333-333333333333';
const AGENT_A = '44444444-4444-4444-8444-444444444444';
const AGENT_B = '55555555-5555-4555-8555-555555555555';

type RepositoryInstance = InstanceType<typeof UserAgentAssignmentRepository>;

describe('UserAgentAssignmentRepository', () => {
  let repo: RepositoryInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectRows = [];
    mocks.insertedValues = [];
    mocks.deleteResult = { rowCount: 0 };
    mocks.verifyMany.mockResolvedValue(undefined);
    repo = new UserAgentAssignmentRepository();
  });

  it('findAgentIdsForUser returns a bare array of agent ids', async () => {
    mocks.selectRows = [{ agentId: AGENT_A }, { agentId: AGENT_B }];

    const ids = await repo.findAgentIdsForUser(USER_ID, ORG_ID);

    expect(ids).toEqual([AGENT_A, AGENT_B]);
  });

  it('assignMany returns empty and performs no query for an empty agentIds array', async () => {
    const rows = await repo.assignMany({
      userId: USER_ID,
      organizationId: ORG_ID,
      agentIds: [],
    });

    expect(rows).toEqual([]);
    expect(getControlDbMock).not.toHaveBeenCalled();
    expect(controlDbStub.insert).not.toHaveBeenCalled();
    expect(mocks.verifyMany).not.toHaveBeenCalled();
  });

  it('assignMany verifies agent ids against the intelligence plane before inserting', async () => {
    await repo.assignMany({
      userId: USER_ID,
      organizationId: ORG_ID,
      agentIds: [AGENT_A, AGENT_B],
    });

    expect(mocks.verifyMany).toHaveBeenCalledWith(
      intelligencePoolStub,
      'agents',
      [AGENT_A, AGENT_B],
      'agent'
    );

    const verifyOrder = mocks.verifyMany.mock.invocationCallOrder[0];
    const insertOrder = controlDbStub.insert.mock.invocationCallOrder[0];
    expect(verifyOrder).toBeLessThan(insertOrder);
  });

  it('assignMany propagates CROSS_PLANE_FK_VIOLATION when an agent does not exist', async () => {
    mocks.verifyMany.mockRejectedValue(
      Object.assign(new Error('Cross-plane references not found: agent'), {
        code: 'CROSS_PLANE_FK_VIOLATION',
        entityName: 'agent',
        missing: [AGENT_B],
      })
    );

    await expect(
      repo.assignMany({
        userId: USER_ID,
        organizationId: ORG_ID,
        agentIds: [AGENT_A, AGENT_B],
      })
    ).rejects.toMatchObject({ code: 'CROSS_PLANE_FK_VIOLATION' });

    expect(controlDbStub.insert).not.toHaveBeenCalled();
  });

  it('assignMany de-duplicates agent ids', async () => {
    await repo.assignMany({
      userId: USER_ID,
      organizationId: ORG_ID,
      agentIds: [AGENT_A, AGENT_A, AGENT_B],
    });

    expect(mocks.verifyMany).toHaveBeenCalledWith(
      intelligencePoolStub,
      'agents',
      [AGENT_A, AGENT_B],
      'agent'
    );
    expect(mocks.insertedValues).toHaveLength(2);
    expect(mocks.insertedValues).toMatchObject([{ agentId: AGENT_A }, { agentId: AGENT_B }]);
  });

  it('hasAssignment returns false when no row matches', async () => {
    mocks.selectRows = [];

    const exists = await repo.hasAssignment(USER_ID, AGENT_A, ORG_ID);

    expect(exists).toBe(false);
  });
});
