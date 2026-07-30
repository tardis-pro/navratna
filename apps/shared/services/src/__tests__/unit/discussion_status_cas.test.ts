import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compareAndSetDiscussionStatus } from '../../discussion_status_cas.js';

/**
 * The per-process mutex cannot serialize two Fly machines. The status write
 * must therefore be conditional on the source state in SQL, so a second writer
 * that lost the race matches no row and is told the transition is stale.
 */

const dbStub = {
  executeQuery: vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>(),
};

describe('compareAndSetDiscussionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constrains the UPDATE on the allowed source states', async () => {
    dbStub.executeQuery.mockResolvedValue([{ id: 'd1', status: 'paused' }]);

    await compareAndSetDiscussionStatus(dbStub, 'd1', 'paused', ['active']);

    const [sql, params] = dbStub.executeQuery.mock.calls[0];
    // The WHERE clause itself must constrain status; asserting the SQL merely
    // "contains status" passes even for an unconditional update-by-id.
    const where = sql.slice(sql.toUpperCase().indexOf('WHERE'));
    expect(where).toMatch(/status\s*=\s*ANY/i);
    expect(where).toMatch(/\$3/);
    expect(params).toEqual(['d1', 'paused', ['active']]);
  });

  it('reports success when a row was updated', async () => {
    dbStub.executeQuery.mockResolvedValue([{ id: 'd1', status: 'paused' }]);

    await expect(
      compareAndSetDiscussionStatus(dbStub, 'd1', 'paused', ['active'])
    ).resolves.toEqual({ updated: true, status: 'paused' });
  });

  it('reports failure when another writer already moved the row', async () => {
    dbStub.executeQuery.mockResolvedValue([]);

    await expect(
      compareAndSetDiscussionStatus(dbStub, 'd1', 'paused', ['active'])
    ).resolves.toEqual({ updated: false });
  });
});
