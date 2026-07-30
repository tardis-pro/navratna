import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addReactionToMessage } from '../../discussion_reactions.js';

/**
 * Reactions live in discussion_messages.reactions (emoji -> participantId[]).
 * A read-modify-write of the whole JSONB object loses concurrent reactions, so
 * persistence must be a single atomic statement that merges server-side.
 */

type Row = { reactions: Record<string, string[]> };

const dbStub = {
  executeQuery: vi.fn<(sql: string, params?: unknown[]) => Promise<Row[]>>(),
};

describe('addReactionToMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges via a single atomic statement rather than read-then-write', async () => {
    dbStub.executeQuery.mockResolvedValue([{ reactions: { '👍': ['p1'] } }]);

    await addReactionToMessage(dbStub, 'disc-1', 'msg-1', 'p1', '👍');

    expect(dbStub.executeQuery).toHaveBeenCalledTimes(1);
    const [sql] = dbStub.executeQuery.mock.calls[0];
    expect(sql).toMatch(/update/i);
    expect(sql).toMatch(/jsonb/i);
  });

  it('returns the merged map produced by the database', async () => {
    dbStub.executeQuery.mockResolvedValue([{ reactions: { '🎉': ['p9'], '👍': ['p1'] } }]);

    const result = await addReactionToMessage(dbStub, 'disc-1', 'msg-1', 'p1', '👍');

    expect(result).toEqual({ '🎉': ['p9'], '👍': ['p1'] });
  });

  it('passes the reaction identity as bound parameters, not interpolated SQL', async () => {
    dbStub.executeQuery.mockResolvedValue([{ reactions: { '👍': ['p1'] } }]);

    await addReactionToMessage(dbStub, 'disc-1', 'msg-1', 'p1', '👍');

    const [, params] = dbStub.executeQuery.mock.calls[0];
    expect(params).toEqual(['msg-1', '👍', 'p1', 'disc-1']);
  });

  it('scopes the update to the discussion so a foreign message cannot be mutated', async () => {
    dbStub.executeQuery.mockResolvedValue([{ reactions: { '👍': ['p1'] } }]);

    await addReactionToMessage(dbStub, 'disc-1', 'msg-1', 'p1', '👍');

    const [sql, params] = dbStub.executeQuery.mock.calls[0];
    expect(sql).toMatch(/discussion_id\s*=\s*\$4/);
    expect(params).toContain('disc-1');
  });

  it('throws when the message does not exist in that discussion', async () => {
    dbStub.executeQuery.mockResolvedValue([]);

    await expect(addReactionToMessage(dbStub, 'disc-1', 'missing', 'p1', '👍')).rejects.toThrow(
      /not found/i
    );
  });
});
