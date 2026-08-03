import { describe, it, expect, vi } from 'vitest';
import { resolveRespondingAgents } from '@uaip/agent-intelligence-core';

const PRIMARY = 'aaaaaaa1-0000-4000-8000-000000000001';
const MENTIONED_A = 'bbbbbbb1-0000-4000-8000-000000000002';
const MENTIONED_B = 'ccccccc1-0000-4000-8000-000000000003';
const FORBIDDEN = 'ddddddd1-0000-4000-8000-000000000004';

describe('resolveRespondingAgents', () => {
  it('falls back to the addressed agent when nobody is mentioned', async () => {
    const canAccess = vi.fn();

    await expect(resolveRespondingAgents([], PRIMARY, canAccess)).resolves.toEqual([PRIMARY]);
    // A 1:1 chat must not pay for an authorization round trip it does not need.
    expect(canAccess).not.toHaveBeenCalled();
  });

  it('fans out to every mentioned agent the caller may reach', async () => {
    const canAccess = vi.fn().mockResolvedValue(true);

    await expect(
      resolveRespondingAgents([MENTIONED_A, MENTIONED_B], PRIMARY, canAccess)
    ).resolves.toEqual([MENTIONED_A, MENTIONED_B]);
  });

  it('drops a mention the caller is not assigned', async () => {
    const canAccess = vi.fn(async (id: string) => id !== FORBIDDEN);

    const responders = await resolveRespondingAgents(
      [MENTIONED_A, FORBIDDEN],
      PRIMARY,
      canAccess
    );

    // Mentioned ids come from the client. Without this check a user could summon
    // any agent in the system by typing its id, defeating per-user agent scoping.
    expect(responders).toEqual([MENTIONED_A]);
    expect(responders).not.toContain(FORBIDDEN);
  });

  it('falls back rather than answering with nobody when every mention is denied', async () => {
    const canAccess = vi.fn().mockResolvedValue(false);

    await expect(resolveRespondingAgents([FORBIDDEN], PRIMARY, canAccess)).resolves.toEqual([
      PRIMARY,
    ]);
  });

  it('answers once per agent when the same agent is mentioned twice', async () => {
    const canAccess = vi.fn().mockResolvedValue(true);

    const responders = await resolveRespondingAgents(
      [MENTIONED_A, MENTIONED_A],
      PRIMARY,
      canAccess
    );

    // Two rows for one agent would violate the (turn, agent) uniqueness index and
    // abort the whole transaction, losing every reply in the turn.
    expect(responders).toEqual([MENTIONED_A]);
  });

  it('ignores blank ids rather than treating them as an agent', async () => {
    const canAccess = vi.fn().mockResolvedValue(true);

    await expect(resolveRespondingAgents(['', '  '], PRIMARY, canAccess)).resolves.toEqual([
      PRIMARY,
    ]);
  });
});
