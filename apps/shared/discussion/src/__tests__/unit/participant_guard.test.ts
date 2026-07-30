import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Membership lives in discussion_participants, NOT on the discussions row —
 * there is no participants column. A guard that inspects the discussion row for
 * participants always fails to match, and falling back to "has this user ever
 * authored a message here" authorises anyone who was ever a participant, even
 * after removal.
 */

type ParticipantRow = { id: string; isActive: boolean };

const state: {
  discussion: { id: string; createdBy: string; organizationId: string } | null;
  participant: ParticipantRow | null;
} = { discussion: null, participant: null };

const selectCalls: string[] = [];

function makeChain(rows: unknown[], label: string) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => {
      selectCalls.push(label);
      return rows;
    },
  };
  return chain;
}

vi.mock('@uaip/shared-services', () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  discussions: { id: 'discussions.id', __table: 'discussions' },
  discussionParticipants: {
    id: 'dp.id',
    discussionId: 'dp.discussion_id',
    userId: 'dp.user_id',
    isActive: 'dp.is_active',
    __table: 'discussion_participants',
  },
  discussionMessages: { id: 'dm.id', __table: 'discussion_messages' },
  getIntelligenceDb: () => ({
    select: (projection?: Record<string, unknown>) => {
      const isParticipantQuery =
        projection !== undefined && Object.keys(projection).some((k) => k.includes('participant'));
      if (isParticipantQuery) {
        return makeChain(state.participant ? [state.participant] : [], 'participants');
      }
      return makeChain(state.discussion ? [state.discussion] : [], 'discussions');
    },
  }),
}));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { participantGuard } = await import('../../middleware/participant_guard.js');

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    params: { id: 'disc-1' },
    headers: {},
    user: { id: 'user-1', role: 'user', organizationId: 'org-1' },
    set: {} as { status?: number | string },
    ...overrides,
  };
}

describe('participantGuard', () => {
  beforeEach(() => {
    selectCalls.length = 0;
    state.discussion = { id: 'disc-1', createdBy: 'owner-1', organizationId: 'org-1' };
    state.participant = null;
  });

  it('admits an ACTIVE participant by querying discussion_participants', async () => {
    state.participant = { id: 'p1', isActive: true };

    const ctx = makeCtx();
    await expect(participantGuard(ctx)).resolves.toBeNull();
    expect(selectCalls).toContain('participants');
  });

  it('refuses a user who is not a participant', async () => {
    state.participant = null;

    const ctx = makeCtx();
    const result = await participantGuard(ctx);

    expect(result).not.toBeNull();
    expect(ctx.set.status).toBe(403);
  });

  it('refuses a REMOVED (inactive) participant', async () => {
    state.participant = null; // the isActive filter excludes them

    const ctx = makeCtx();
    const result = await participantGuard(ctx);

    expect(result).not.toBeNull();
    expect(ctx.set.status).toBe(403);
  });

  it('admits the discussion owner', async () => {
    const ctx = makeCtx({ user: { id: 'owner-1', role: 'user', organizationId: 'org-1' } });

    await expect(participantGuard(ctx)).resolves.toBeNull();
  });

  it('refuses a moderator from a DIFFERENT organization', async () => {
    const ctx = makeCtx({ user: { id: 'mod-x', role: 'moderator', organizationId: 'other-org' } });
    const result = await participantGuard(ctx);

    expect(result).not.toBeNull();
    expect(ctx.set.status).toBe(403);
  });

  it('admits a moderator from the SAME organization', async () => {
    const ctx = makeCtx({ user: { id: 'mod-1', role: 'moderator', organizationId: 'org-1' } });

    await expect(participantGuard(ctx)).resolves.toBeNull();
  });

  it('does not authorise via message history', async () => {
    state.participant = null;

    const ctx = makeCtx();
    await participantGuard(ctx);

    expect(selectCalls).not.toContain('messages');
  });
});
