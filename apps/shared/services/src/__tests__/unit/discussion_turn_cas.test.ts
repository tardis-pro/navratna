import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compareAndSetDiscussionTurn } from '../../discussion_turn_cas.js';

/**
 * Two instances can both read turn N, both pick a next speaker and both write —
 * one silently overwrites the other and the room sees two turn events. The
 * advance must therefore be conditional on the turn number it observed.
 */

const dbStub = {
  executeQuery: vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>(),
};

const nextTurn = {
  participantId: 'p2',
  startedAt: new Date('2026-01-01T00:00:00Z'),
  turnNumber: 4,
};

describe('compareAndSetDiscussionTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constrains the UPDATE on the observed turn number', async () => {
    dbStub.executeQuery.mockResolvedValue([{ id: 'd1' }]);

    await compareAndSetDiscussionTurn(dbStub, 'd1', 3, nextTurn);

    const [sql, params] = dbStub.executeQuery.mock.calls[0];
    const where = sql.slice(sql.toUpperCase().indexOf('WHERE'));
    expect(where).toMatch(/turnNumber/);
    expect(where).toMatch(/\$2/);
    expect(params?.[0]).toBe('d1');
    expect(params?.[1]).toBe(3);
  });

  it('reports success when this writer won the advance', async () => {
    dbStub.executeQuery.mockResolvedValue([{ id: 'd1' }]);

    await expect(compareAndSetDiscussionTurn(dbStub, 'd1', 3, nextTurn)).resolves.toBe(true);
  });

  it('reports failure when another writer already advanced the turn', async () => {
    dbStub.executeQuery.mockResolvedValue([]);

    await expect(compareAndSetDiscussionTurn(dbStub, 'd1', 3, nextTurn)).resolves.toBe(false);
  });

  it('matches a not-yet-started turn by passing null, not by dropping the predicate', async () => {
    dbStub.executeQuery.mockResolvedValue([{ id: 'd1' }]);

    await compareAndSetDiscussionTurn(dbStub, 'd1', undefined, nextTurn);

    const [sql, params] = dbStub.executeQuery.mock.calls[0];
    const where = sql.slice(sql.toUpperCase().indexOf('WHERE'));
    // IS NOT DISTINCT FROM, not `=`: a plain equality against NULL is never
    // true, so the very first advance would match no row and never happen.
    expect(where).toMatch(/IS NOT DISTINCT FROM/i);
    expect(params?.[1]).toBeNull();
  });
});
