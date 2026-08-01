import { oauthStates } from '../../database/drizzle/schemas/control_schema';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    selectRows: [] as unknown[],
    deleteReturns: [] as unknown[],
    deletePredicateColumns: [] as string[],
    deleteCalls: 0,
    selectCalls: 0,
  },
}));

/**
 * Walks Drizzle's nested `queryChunks` to recover the columns a predicate names.
 * A mock that ignores the WHERE would let the expiry condition be deleted and
 * still pass, which is exactly the class of bug under test.
 */
const collectPredicateColumns = (node: unknown, found: string[] = []): string[] => {
  if (!node || typeof node !== 'object') return found;
  const candidate = node as { name?: unknown; columnType?: unknown; queryChunks?: unknown };
  if (typeof candidate.name === 'string' && typeof candidate.columnType === 'string') {
    found.push(candidate.name);
  }
  if (Array.isArray(candidate.queryChunks)) {
    for (const chunk of candidate.queryChunks) collectPredicateColumns(chunk, found);
  }
  return found;
};

vi.mock('../../database/drizzle/clients/index', () => ({
  getControlDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            mocks.selectCalls += 1;
            return mocks.selectRows;
          },
        }),
      }),
    }),
    insert: () => ({ values: () => ({ returning: async () => [{ state: 'generated' }] }) }),
    delete: (table: unknown) => ({
      where: (condition: unknown) => {
        if (table === oauthStates) {
          mocks.deleteCalls += 1;
          mocks.deletePredicateColumns = collectPredicateColumns(condition);
        }
        return {
          returning: async () => {
            const claimed = mocks.deleteReturns;
            // A second claimant must find nothing left: the row is gone after the
            // first DELETE ... RETURNING wins.
            mocks.deleteReturns = [];
            return claimed;
          },
          then: (resolve: (value: unknown) => unknown) => resolve(undefined),
        };
      },
    }),
  }),
}));

const { OAuthService } = await import('../../services/o_auth_service');

const stateRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'state-row-1',
  state: 'abc123',
  providerId: 'provider-1',
  userId: 'user-1',
  redirectUrl: 'https://api.example.com/callback',
  expiresAt: new Date(Date.now() + 60_000),
  metadata: { intent: 'connect_integration' },
  ...overrides,
});

const service = () => OAuthService.getInstance();

beforeEach(() => {
  mocks.selectRows = [];
  mocks.deleteReturns = [];
  mocks.deletePredicateColumns = [];
  mocks.deleteCalls = 0;
  mocks.selectCalls = 0;
});

describe('verifyAndConsumeOAuthState', () => {
  it('returns the state it claimed', async () => {
    mocks.deleteReturns = [stateRow()];

    const claimed = await service().verifyAndConsumeOAuthState('abc123');

    expect(claimed?.state).toBe('abc123');
  });

  it('claims the state in a single conditional delete, not read-then-delete', async () => {
    mocks.deleteReturns = [stateRow()];

    await service().verifyAndConsumeOAuthState('abc123');

    expect(mocks.deleteCalls).toBe(1);
    expect(
      mocks.selectCalls,
      'a separate read before the delete leaves a window for a second callback to claim the same state'
    ).toBe(0);
  });

  it('lets only ONE of two concurrent callbacks claim the same state', async () => {
    mocks.deleteReturns = [stateRow()];

    const [first, second] = await Promise.all([
      service().verifyAndConsumeOAuthState('abc123'),
      service().verifyAndConsumeOAuthState('abc123'),
    ]);

    const winners = [first, second].filter((claim) => claim !== null);
    expect(winners).toHaveLength(1);
  });

  it('refuses an expired state', async () => {
    mocks.deleteReturns = [];

    await expect(service().verifyAndConsumeOAuthState('abc123')).resolves.toBeNull();
  });

  it('enforces expiry inside the claim predicate, not after the read', async () => {
    mocks.deleteReturns = [stateRow()];

    await service().verifyAndConsumeOAuthState('abc123');

    expect(mocks.deletePredicateColumns).toEqual(
      expect.arrayContaining(['state', 'expires_at'])
    );
  });

  it('returns null for an unknown state', async () => {
    mocks.deleteReturns = [];

    await expect(service().verifyAndConsumeOAuthState('nope')).resolves.toBeNull();
  });
});
