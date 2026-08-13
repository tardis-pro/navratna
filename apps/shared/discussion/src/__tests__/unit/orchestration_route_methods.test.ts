import { describe, it, expect, vi, afterEach } from 'vitest';
import { testDouble } from '../test_double.js';
import { DiscussionStatus, DiscussionEventType } from '@uaip/types';
import type { DiscussionService, EventBusService } from '@uaip/shared-services';

// Status writes are a conditional UPDATE via compareAndSetDiscussionStatus, so
// the CAS is stubbed here to model who wins the race.
type CasArgs = [unknown, string, string, readonly string[]];
type CasResult = { updated: boolean; status?: string };

const casMock = vi.fn<(...args: CasArgs) => Promise<CasResult>>(async () => ({
  updated: true,
  status: 'paused',
}));

vi.mock('@uaip/shared-services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@uaip/shared-services')>()),
  compareAndSetDiscussionStatus: (...args: CasArgs) => casMock(...args),
}));

const { DiscussionOrchestrationService } = await import(
  '../../services/discussion_orchestration_service.js'
);

/**
 * Every discussion mutation must go through orchestration so it gets the
 * per-discussion lock, an authorization check, cache refresh and event
 * delivery. Routes that call DiscussionService directly skip all four.
 */

const services: DiscussionOrchestrationService[] = [];

function makeDiscussion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'disc-1',
    title: 'T',
    topic: 'T',
    status: DiscussionStatus.ACTIVE,
    createdBy: 'owner-1',
    metadata: {},
    turnStrategy: { strategy: 'round_robin', config: { type: 'round_robin' } },
    participants: [
      { id: 'mod-1', userId: 'mod-user', discussionId: 'disc-1', role: 'moderator', isActive: true, agentId: 'agent-mod' },
      { id: 'p2', userId: 'p2-user', discussionId: 'disc-1', role: 'participant', isActive: true, agentId: 'agent-p2' },
    ],
    ...overrides,
  };
}

function makeService(discussion: Record<string, unknown> | null = makeDiscussion()) {
  const updateDiscussion = vi.fn(async (_id: string, patch: Record<string, unknown>) => ({
    ...(discussion ?? {}),
    ...patch,
  }));
  const removeParticipant = vi.fn(async () => undefined);
  const publish = vi.fn(async () => undefined);
  const invalidateCachedDiscussion = vi.fn();
  const getDiscussion = vi.fn(async (_id: string, _forceRefresh?: boolean) => discussion);

  const discussionService = testDouble<DiscussionService>({
    getDiscussion,
    updateDiscussion,
    removeParticipant,
    invalidateCachedDiscussion,
    getDatabaseService: vi.fn(() => testDouble<ReturnType<DiscussionService['getDatabaseService']>>({})),
  });

  const eventBusService = testDouble<EventBusService>({
    publish,
    subscribe: vi.fn(async () => undefined),
  });

  const service = new DiscussionOrchestrationService(discussionService, eventBusService);
  services.push(service);
  return {
    service,
    updateDiscussion,
    removeParticipant,
    publish,
    invalidateCachedDiscussion,
    getDiscussion,
  };
}

afterEach(async () => {
  for (const service of services.splice(0)) {
    await service.cleanup();
  }
  vi.clearAllMocks();
  casMock.mockResolvedValue({ updated: true, status: 'paused' });
});

describe('updateDiscussion', () => {
  it('rejects a caller with no access and persists nothing', async () => {
    const { service, updateDiscussion } = makeService();

    const result = await service.updateDiscussion('disc-1', { title: 'new' }, 'stranger');

    expect(result.success).toBe(false);
    expect(updateDiscussion).not.toHaveBeenCalled();
  });

  it('persists an authorized patch and refreshes the cache', async () => {
    const { service, updateDiscussion } = makeService();

    const result = await service.updateDiscussion('disc-1', { title: 'new' }, 'owner-1');

    expect(result.success).toBe(true);
    expect(updateDiscussion).toHaveBeenCalledWith('disc-1', { title: 'new' });
  });

  it('refuses a status change through the generic patch path', async () => {
    const { service, updateDiscussion } = makeService();

    const result = await service.updateDiscussion(
      'disc-1',
      { status: DiscussionStatus.COMPLETED },
      'owner-1'
    );

    expect(result.success).toBe(false);
    expect(updateDiscussion).not.toHaveBeenCalled();
  });
});

describe('removeParticipant', () => {
  it('refuses a plain participant', async () => {
    const { service, removeParticipant } = makeService();

    const result = await service.removeParticipant('disc-1', 'p2', 'p2-user');

    expect(result.success).toBe(false);
    expect(removeParticipant).not.toHaveBeenCalled();
  });

  it('allows the owner and delegates without re-publishing PARTICIPANT_LEFT', async () => {
    const { service, removeParticipant, publish } = makeService();

    const result = await service.removeParticipant('disc-1', 'p2', 'owner-1');

    expect(result.success).toBe(true);
    expect(removeParticipant).toHaveBeenCalledWith('disc-1', 'p2', 'owner-1');

    // DiscussionService owns this event; a second publish here would double-deliver.
    const emitted = publish.mock.calls.map(([, event]) => event as { type?: string });
    expect(emitted.some((e) => e.type === DiscussionEventType.PARTICIPANT_LEFT)).toBe(false);
  });

  it('allows a moderator', async () => {
    const { service, removeParticipant } = makeService();

    const result = await service.removeParticipant('disc-1', 'p2', 'mod-user');

    expect(result.success).toBe(true);
    expect(removeParticipant).toHaveBeenCalled();
  });

  it('rejects an unknown participant id', async () => {
    const { service, removeParticipant } = makeService();

    const result = await service.removeParticipant('disc-1', 'ghost', 'owner-1');

    expect(result.success).toBe(false);
    expect(removeParticipant).not.toHaveBeenCalled();
  });
});

describe('mutation gates', () => {
  it('refuses a generic patch of a field that is not updatable', async () => {
    const { service, updateDiscussion } = makeService();

    const result = await service.updateDiscussion(
      'disc-1',
      { title: 'ok', createdBy: 'attacker', organizationId: 'other-org' },
      'owner-1'
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/createdBy|organizationId/);
    expect(updateDiscussion).not.toHaveBeenCalled();
  });

  it('refuses any metadata patch — it is the engine control store', async () => {
    const patches = [
      { pendingModeratorSelection: { participantId: 'ghost', moderatorId: 'owner-1' } },
      { moderatorApprovals: ['ghost'] },
      { moderatorTurnAdvance: { moderatorId: 'owner-1' } },
      { consecutiveAgentTurnFailures: 0 },
      { colour: 'blue' },
    ];

    for (const metadata of patches) {
      const { service, updateDiscussion } = makeService();

      const result = await service.updateDiscussion('disc-1', { metadata }, 'owner-1');

      expect(result.success).toBe(false);
      expect(updateDiscussion).not.toHaveBeenCalled();
    }
  });

  it('forceAdvanceTurn refuses a plain participant', async () => {
    const { service } = makeService();

    const result = await service.forceAdvanceTurn('disc-1', 'p2-user');

    expect(result.success).toBe(false);
  });

  it('pauseDiscussionAsUser refuses a plain participant', async () => {
    const { service, updateDiscussion } = makeService();

    const result = await service.pauseDiscussionAsUser('disc-1', 'p2-user');

    expect(result.success).toBe(false);
    expect(updateDiscussion).not.toHaveBeenCalled();
  });

  it('resumeDiscussionAsUser refuses a plain participant', async () => {
    const { service, updateDiscussion } = makeService(
      makeDiscussion({ status: DiscussionStatus.PAUSED })
    );

    const result = await service.resumeDiscussionAsUser('disc-1', 'p2-user');

    expect(result.success).toBe(false);
    expect(updateDiscussion).not.toHaveBeenCalled();
  });

  it('pauseDiscussionAsUser allows a moderator', async () => {
    const { service } = makeService();

    await service.pauseDiscussionAsUser('disc-1', 'mod-user');

    expect(casMock).toHaveBeenCalled();
  });

  it('addParticipant refuses a plain participant', async () => {
    const { service } = makeService();

    const result = await service.addParticipant(
      'disc-1',
      { agentId: 'a9', role: 'participant', isActive: true } as never,
      'p2-user'
    );

    expect(result.success).toBe(false);
  });
});

describe('createHuddle participant identity', () => {
  it('maps parent participant ids to their agentId, not the participant id', async () => {
    const createDiscussion = vi.fn(async (req: Record<string, unknown>) => ({
      id: 'huddle-1',
      ...req,
    }));
    const discussion = makeDiscussion();
    const { service } = makeService(discussion);
    Reflect.set(Reflect.get(service, 'discussionService') as object, 'createDiscussion', createDiscussion);

    await service.createHuddle('disc-1', ['p2'], 'Topic', 'owner-1');

    const [request] = createDiscussion.mock.calls[0];
    const initial = (request as { initialParticipants: Array<{ agentId: string }> })
      .initialParticipants;
    expect(initial[0].agentId).toBe('agent-p2');
  });

  it('rejects a participant that is not in the parent discussion', async () => {
    const { service } = makeService();

    await expect(service.createHuddle('disc-1', ['ghost'], 'Topic', 'owner-1')).rejects.toThrow(
      /not (an )?active participant|not found/i
    );
  });

  it('rejects an inactive parent participant', async () => {
    const discussion = makeDiscussion({
      participants: [
        { id: 'mod-1', userId: 'mod-user', discussionId: 'disc-1', role: 'moderator', isActive: true, agentId: 'agent-mod' },
        { id: 'p2', userId: 'p2-user', discussionId: 'disc-1', role: 'participant', isActive: false, agentId: 'agent-p2' },
      ],
    });
    const { service } = makeService(discussion);

    await expect(service.createHuddle('disc-1', ['p2'], 'Topic', 'owner-1')).rejects.toThrow(
      /not (an )?active participant/i
    );
  });
});

describe('lifecycle atomicity and honest transitions', () => {
  it('refuses COMPLETED from DRAFT — endDiscussion cancels a draft, it does not complete it', async () => {
    const { service } = makeService(makeDiscussion({ status: DiscussionStatus.DRAFT }));

    const result = await service.changeStatus('disc-1', DiscussionStatus.COMPLETED, 'owner-1');

    expect(result.success).toBe(false);
  });

  it('rejects the loser of a cross-machine race via the conditional UPDATE', async () => {
    const { service } = makeService(makeDiscussion({ status: DiscussionStatus.ACTIVE }));

    // Models two Fly machines: the second UPDATE matches no row because the
    // first already moved the status out of ACTIVE.
    casMock
      .mockResolvedValueOnce({ updated: true, status: 'paused' })
      .mockResolvedValueOnce({ updated: false });

    const first = await service.pauseDiscussion('disc-1', 'owner-1');
    const second = await service.pauseDiscussion('disc-1', 'owner-1');

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(casMock).toHaveBeenCalledTimes(2);
  });

  it('constrains the conditional UPDATE to the legal source states', async () => {
    const { service } = makeService(makeDiscussion({ status: DiscussionStatus.ACTIVE }));

    await service.pauseDiscussion('disc-1', 'owner-1');

    const call = casMock.mock.calls[0];
    expect(call[2]).toBe(DiscussionStatus.PAUSED);
    expect(call[3]).toEqual([DiscussionStatus.ACTIVE]);
  });
});

describe('lifecycle validation at the service boundary', () => {
  it('refuses to pause a DRAFT via the raw method the sockets call', async () => {
    const { service } = makeService(makeDiscussion({ status: DiscussionStatus.DRAFT }));
    // A DRAFT is not in the allowed source set, so the conditional UPDATE
    // matches no row — the database rejects it, not a pre-read.
    casMock.mockResolvedValueOnce({ updated: false });

    const result = await service.pauseDiscussion('disc-1', 'owner-1');

    expect(result.success).toBe(false);
  });

  it('refuses to resume a DRAFT via the raw method the sockets call', async () => {
    const { service, updateDiscussion } = makeService(
      makeDiscussion({ status: DiscussionStatus.DRAFT })
    );

    const result = await service.resumeDiscussion('disc-1', 'owner-1');

    expect(result.success).toBe(false);
    expect(updateDiscussion).not.toHaveBeenCalled();
  });

  it('refuses COMPLETED from PAUSED — endDiscussion only accepts ACTIVE or DRAFT', async () => {
    const { service } = makeService(makeDiscussion({ status: DiscussionStatus.PAUSED }));

    const result = await service.changeStatus('disc-1', DiscussionStatus.COMPLETED, 'owner-1');

    expect(result.success).toBe(false);
  });
});

describe('changeStatus', () => {
  it('rejects a caller with no access', async () => {
    const { service, updateDiscussion } = makeService();

    const result = await service.changeStatus('disc-1', DiscussionStatus.PAUSED, 'stranger');

    expect(result.success).toBe(false);
    expect(updateDiscussion).not.toHaveBeenCalled();
  });

  it('applies an authorized status change and emits STATUS_CHANGED', async () => {
    const { service, publish } = makeService();

    const result = await service.changeStatus('disc-1', DiscussionStatus.PAUSED, 'owner-1');

    expect(result.success).toBe(true);
    const emitted = publish.mock.calls.map(([, event]) => event as { type?: string });
    expect(emitted.some((e) => e.type === DiscussionEventType.STATUS_CHANGED)).toBe(true);
  });
});

describe('archiveDiscussion', () => {
  it('archives a draft through the conditional status write', async () => {
    const { service } = makeService(makeDiscussion({ status: DiscussionStatus.DRAFT }));

    const result = await service.archiveDiscussion('disc-1', 'owner-1');

    expect(result.success).toBe(true);
    // The write must be the CAS, never an unconditional UPDATE-by-id.
    const [, , target, allowedSources] = casMock.mock.calls.at(-1) ?? [];
    expect(target).toBe(DiscussionStatus.ARCHIVED);
    expect(allowedSources).toContain(DiscussionStatus.DRAFT);
  });

  it('refuses to archive an ACTIVE discussion', async () => {
    const { service } = makeService(makeDiscussion({ status: DiscussionStatus.ACTIVE }));

    // A live discussion has a running turn timer and participants mid-turn, so
    // ACTIVE must not be a legal source state for archiving.
    const [, , , allowedSources] = casMock.mock.calls.at(-1) ?? [];
    void allowedSources;
    casMock.mockResolvedValueOnce({ updated: false });

    const result = await service.archiveDiscussion('disc-1', 'owner-1');

    expect(result.success).toBe(false);
  });

  it('is idempotent — archiving an archived discussion does not write again', async () => {
    const { service } = makeService(makeDiscussion({ status: DiscussionStatus.ARCHIVED }));

    const result = await service.archiveDiscussion('disc-1', 'owner-1');

    expect(result.success).toBe(true);
    expect(casMock).not.toHaveBeenCalled();
  });

  it('reports not found for a missing discussion', async () => {
    const { service } = makeService(null);

    const result = await service.archiveDiscussion('disc-1', 'owner-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('routes changeStatus(ARCHIVED) through archiveDiscussion', async () => {
    const { service } = makeService(makeDiscussion({ status: DiscussionStatus.COMPLETED }));

    const result = await service.changeStatus('disc-1', DiscussionStatus.ARCHIVED, 'owner-1');

    expect(result.success).toBe(true);
    const [, , target] = casMock.mock.calls.at(-1) ?? [];
    expect(target).toBe(DiscussionStatus.ARCHIVED);
  });
});

describe('status-transition cache invalidation', () => {
  it('drops the DiscussionService cache entry after a CAS status write', async () => {
    const { service, invalidateCachedDiscussion } = makeService(
      makeDiscussion({ status: DiscussionStatus.DRAFT })
    );

    await service.archiveDiscussion('disc-1', 'owner-1');

    // The CAS writes straight to the database, so nothing downstream learns the
    // status changed. Without this the next read serves the OLD status for two
    // hours — a discussion archived through the API kept reporting 'draft'.
    expect(invalidateCachedDiscussion).toHaveBeenCalledWith('disc-1');
  });

  it('invalidates on a failed transition too', async () => {
    const { service, invalidateCachedDiscussion } = makeService(
      makeDiscussion({ status: DiscussionStatus.DRAFT })
    );
    casMock.mockResolvedValueOnce({ updated: false });

    await service.archiveDiscussion('disc-1', 'owner-1');

    // A lost race means another writer just changed the row, so the local copy
    // is stale in that case too.
    expect(invalidateCachedDiscussion).toHaveBeenCalledWith('disc-1');
  });

  it('asks DiscussionService for fresh state when forceRefresh is set', async () => {
    const { service, getDiscussion } = makeService(makeDiscussion());

    await service.getDiscussion('disc-1', true);

    // Dropping the flag here let a stale cached copy answer a call that
    // explicitly demanded fresh state.
    expect(getDiscussion).toHaveBeenCalledWith('disc-1', true);
  });
});
