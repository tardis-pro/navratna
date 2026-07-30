import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enforceParticipantCapacity } from '../../participant_capacity_cas.js';

/**
 * maxParticipants is checked by reading the roster and then inserting, so two
 * instances can both see room and both add. The cap is therefore re-checked in
 * the database after the insert: rows past the cap are deactivated again.
 */

const dbStub = {
  executeQuery: vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>(),
};

describe('enforceParticipantCapacity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ranks active rows in SQL rather than trusting a prior read', async () => {
    dbStub.executeQuery.mockResolvedValue([]);

    await enforceParticipantCapacity(dbStub, 'd1', 5, 'dp-9');

    const [sql, params] = dbStub.executeQuery.mock.calls[0];
    expect(sql).toMatch(/row_number\(\)\s+over/i);
    expect(sql).toMatch(/is_active\s*=\s*true/i);
    expect(sql).toMatch(/position\s*>\s*\$2/i);
    expect(params).toEqual(['d1', 5, 'dp-9']);
  });

  it('admits the participant when it lands within the cap', async () => {
    dbStub.executeQuery.mockResolvedValue([]);

    await expect(enforceParticipantCapacity(dbStub, 'd1', 5, 'dp-3')).resolves.toBe(true);
  });

  it('rejects the participant when it exceeded the cap', async () => {
    dbStub.executeQuery.mockResolvedValue([{ id: 'dp-9' }]);

    await expect(enforceParticipantCapacity(dbStub, 'd1', 5, 'dp-9')).resolves.toBe(false);
  });

  it('only ever deactivates the row it was asked about', async () => {
    dbStub.executeQuery.mockResolvedValue([{ id: 'dp-9' }]);

    await enforceParticipantCapacity(dbStub, 'd1', 5, 'dp-9');

    const [sql] = dbStub.executeQuery.mock.calls[0];
    // Without this predicate a late arrival would evict every over-cap row,
    // including participants another instance legitimately admitted.
    expect(sql).toMatch(/dp\.id\s*=\s*\$3/i);
  });
});
