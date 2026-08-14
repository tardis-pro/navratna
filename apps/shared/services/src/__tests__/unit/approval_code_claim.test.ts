import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/**
 * The one-time approval code is the anti-replay control on a channel that
 * authorises real-world actions. Handlers for one event type run in parallel and
 * BullMQ retries a failed job, so "read the row, check codeConsumedAt, write it
 * back" can be won twice. The claim must therefore be a single conditional
 * UPDATE, and the guards must live in the predicate rather than in the caller.
 */

type Row = {
  id: string;
  operationId: string;
  status: string;
  expiresAt: Date | null;
  metadata: Record<string, unknown> | null;
  updatedAt: Date;
};

const dialect = new PgDialect();

const { mocks } = vi.hoisted(() => ({
  mocks: {
    rows: [] as unknown[],
    updateCalls: 0,
    selectCalls: 0,
    lastPredicate: '',
    lastPredicateParams: [] as unknown[],
    lastMetadataSql: '',
    lastMetadataParams: [] as unknown[],
    lastSetKeys: [] as string[],
  },
}));

/** Drops the `"approval_workflows".` qualifier so clauses read as written. */
const unqualified = (predicate: string): string =>
  predicate.replaceAll('"approval_workflows".', '');

/**
 * Applies the claim to an in-memory row, but only enforces the guards the
 * rendered predicate actually asks for. Drop a clause from the WHERE and this
 * matcher stops enforcing it too — which is what makes the "already consumed"
 * and "expired" cases below fail instead of silently passing against a mock
 * that ignores the predicate.
 */
const matchesPredicate = (rawPredicate: string, params: unknown[], row: Row): boolean => {
  const predicate = unqualified(rawPredicate);
  if (/"id"\s*=\s*\$\d/.test(predicate) && row.id !== params[0]) return false;
  if (/"status"\s*=\s*\$\d/.test(predicate) && row.status !== 'pending') return false;
  if (
    /"metadata"->>'codeConsumedAt'\s+is\s+null/i.test(predicate) &&
    row.metadata?.codeConsumedAt != null
  ) {
    return false;
  }
  if (
    /"expires_at"\s+is\s+null\s+or\s+"expires_at"\s*>\s*now\(\)/i.test(predicate) &&
    row.expiresAt !== null &&
    row.expiresAt.getTime() <= Date.now()
  ) {
    return false;
  }
  return true;
};

vi.mock('../../database/drizzle/clients/index', () => ({
  getControlDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            mocks.selectCalls += 1;
            return mocks.rows;
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.lastSetKeys = Object.keys(values);
        const metadata = dialect.sqlToQuery(values.metadata as SQL);
        mocks.lastMetadataSql = metadata.sql;
        mocks.lastMetadataParams = metadata.params;
        return {
          where: (condition: SQL) => {
            mocks.updateCalls += 1;
            const rendered = dialect.sqlToQuery(condition);
            mocks.lastPredicate = rendered.sql;
            mocks.lastPredicateParams = rendered.params;
            return {
              returning: async () => {
                const patch = JSON.parse(String(mocks.lastMetadataParams[0])) as Record<
                  string,
                  unknown
                >;
                return (mocks.rows as Row[])
                  .filter((row) => matchesPredicate(rendered.sql, rendered.params, row))
                  .map((row) => {
                    // `||` on jsonb is a top-level merge, which is exactly a
                    // spread of the patch over the stored object.
                    row.metadata = { ...(row.metadata ?? {}), ...patch };
                    row.updatedAt = new Date();
                    return row;
                  });
              },
            };
          },
        };
      },
    }),
  }),
}));

const { ApprovalWorkflowRepository } = await import('../../database/repositories/security_repository');

const workflowRow = (overrides: Partial<Row> = {}): Row => ({
  id: 'wf-1',
  operationId: 'op-1',
  status: 'pending',
  expiresAt: new Date(Date.now() + 3_600_000),
  metadata: {
    orchestration: { operationId: 'op-1', workflowInstanceId: 'wfi-1', stepId: 'step-1' },
    approvalCode: 'A2K9',
    requestedByUserId: 'user-requester',
    operationType: 'deploy',
  },
  updatedAt: new Date(0),
  ...overrides,
});

const claim = { consumedAt: new Date('2026-08-14T12:00:00.000Z'), consumedBy: 'user-approver', consumedJid: '919812345678@s.whatsapp.net' };

const repository = () => new ApprovalWorkflowRepository();

beforeEach(() => {
  mocks.rows = [];
  mocks.updateCalls = 0;
  mocks.selectCalls = 0;
  mocks.lastPredicate = '';
  mocks.lastPredicateParams = [];
  mocks.lastMetadataSql = '';
  mocks.lastMetadataParams = [];
  mocks.lastSetKeys = [];
});

describe('ApprovalWorkflowRepository.claimApprovalCode', () => {
  it('returns the row it claimed', async () => {
    mocks.rows = [workflowRow()];

    const claimed = await repository().claimApprovalCode('wf-1', claim);

    expect(claimed?.id).toBe('wf-1');
    expect(claimed?.metadata).toMatchObject({
      codeConsumedAt: '2026-08-14T12:00:00.000Z',
      codeConsumedBy: 'user-approver',
      codeConsumedJid: '919812345678@s.whatsapp.net',
    });
  });

  it('claims in a single conditional update, not read-then-write', async () => {
    mocks.rows = [workflowRow()];

    await repository().claimApprovalCode('wf-1', claim);

    expect(mocks.updateCalls).toBe(1);
    expect(
      mocks.selectCalls,
      'a read before the update reopens the window two concurrent deliveries race through'
    ).toBe(0);
  });

  it('guards id, pending status, unconsumed code and expiry inside the predicate', async () => {
    mocks.rows = [workflowRow()];

    await repository().claimApprovalCode('wf-1', claim);

    const predicate = unqualified(mocks.lastPredicate);
    expect(predicate).toMatch(/"id"\s*=\s*\$1/);
    expect(predicate).toMatch(/"status"\s*=\s*\$2/);
    expect(predicate).toMatch(/"metadata"->>'codeConsumedAt' is null/);
    expect(predicate).toMatch(/"expires_at" is null or "expires_at" > now\(\)/);
    expect(mocks.lastPredicateParams).toEqual(['wf-1', 'pending']);
  });

  it('returns null and mutates nothing when the code was already consumed', async () => {
    const row = workflowRow({
      metadata: {
        ...workflowRow().metadata,
        codeConsumedAt: '2026-08-14T11:00:00.000Z',
        codeConsumedBy: 'user-first',
      },
    });
    mocks.rows = [row];

    const claimed = await repository().claimApprovalCode('wf-1', claim);

    expect(claimed).toBeNull();
    expect(row.metadata).toMatchObject({
      codeConsumedAt: '2026-08-14T11:00:00.000Z',
      codeConsumedBy: 'user-first',
    });
    expect(row.metadata?.codeConsumedJid).toBeUndefined();
  });

  it('refuses an expired workflow even when the code is unconsumed', async () => {
    const row = workflowRow({ expiresAt: new Date(Date.now() - 1_000) });
    mocks.rows = [row];

    const claimed = await repository().claimApprovalCode('wf-1', claim);

    expect(claimed).toBeNull();
    expect(row.metadata?.codeConsumedAt).toBeUndefined();
  });

  it('refuses a workflow that is no longer pending', async () => {
    const row = workflowRow({ status: 'approved' });
    mocks.rows = [row];

    await expect(repository().claimApprovalCode('wf-1', claim)).resolves.toBeNull();
    expect(row.metadata?.codeConsumedAt).toBeUndefined();
  });

  it('merges into metadata in SQL and preserves every other key', async () => {
    mocks.rows = [workflowRow()];

    const claimed = await repository().claimApprovalCode('wf-1', claim);

    // The merge happens in SQL — a read-modify-write of the whole object would
    // clobber whatever a concurrent writer put in another key.
    expect(mocks.lastMetadataSql).toMatch(
      /coalesce\("approval_workflows"\."metadata", '\{\}'::jsonb\) \|\| \$1::jsonb/
    );
    // The payload carries the claim and nothing else. If it ever carried
    // `orchestration` or `approvalCode` the write would be a stale whole-object
    // copy wearing a merge's clothes.
    expect(Object.keys(JSON.parse(String(mocks.lastMetadataParams[0]))).sort()).toEqual([
      'codeConsumedAt',
      'codeConsumedBy',
      'codeConsumedJid',
    ]);

    expect(claimed?.metadata).toEqual({
      orchestration: { operationId: 'op-1', workflowInstanceId: 'wfi-1', stepId: 'step-1' },
      approvalCode: 'A2K9',
      requestedByUserId: 'user-requester',
      operationType: 'deploy',
      codeConsumedAt: '2026-08-14T12:00:00.000Z',
      codeConsumedBy: 'user-approver',
      codeConsumedJid: '919812345678@s.whatsapp.net',
    });
  });

  it('omits the jid from the patch when the channel did not supply one', async () => {
    mocks.rows = [workflowRow()];

    await repository().claimApprovalCode('wf-1', {
      consumedAt: claim.consumedAt,
      consumedBy: 'user-approver',
    });

    expect(Object.keys(JSON.parse(String(mocks.lastMetadataParams[0]))).sort()).toEqual([
      'codeConsumedAt',
      'codeConsumedBy',
    ]);
  });
});
