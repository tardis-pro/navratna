import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscussionStatus } from '@uaip/types';

/**
 * navratna-core runs multi-instance, so a read-then-write status change lets
 * two machines both observe the old status and both write. Every lifecycle
 * method must claim the transition with a conditional UPDATE and abort when it
 * matches no row.
 */

const casMock = vi.fn<
  (...args: [unknown, string, string, readonly string[]]) => Promise<{ updated: boolean }>
>(async () => ({ updated: true }));

vi.mock('../../discussion_status_cas.js', () => ({
  compareAndSetDiscussionStatus: (...args: [unknown, string, string, readonly string[]]) =>
    casMock(...args),
}));

const { DiscussionService } = await import('../../discussion_service.js');

type Discussion = Record<string, unknown>;

function makeService(discussion: Discussion | null) {
  const service = Object.create(DiscussionService.prototype) as InstanceType<
    typeof DiscussionService
  >;
  const updateDiscussion = vi.fn(async () => ({ ...(discussion ?? {}) }));

  Reflect.set(service, 'databaseService', {});
  Reflect.set(service, 'activeDiscussions', new Map());
  Reflect.set(service, 'cacheTimestamps', new Map());
  Reflect.set(service, 'enableAnalytics', false);
  Reflect.set(service, 'getDiscussion', vi.fn(async () => discussion));
  Reflect.set(service, 'updateDiscussion', updateDiscussion);
  Reflect.set(service, 'emitDiscussionEvent', vi.fn(async () => undefined));
  Reflect.set(service, 'calculateFinalAnalytics', vi.fn(async () => null));
  Reflect.set(service, 'initializeFirstTurn', vi.fn(async () => undefined));
  Reflect.set(service, 'generateDiscussionSummary', vi.fn(async () => undefined));

  return { service, updateDiscussion };
}

const activeDiscussion: Discussion = {
  id: 'd1',
  status: DiscussionStatus.ACTIVE,
  state: {},
  metadata: {},
  participants: [{ id: 'p1' }, { id: 'p2' }],
  startedAt: new Date(),
};

describe('DiscussionService lifecycle transitions claim the row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    casMock.mockResolvedValue({ updated: true });
  });

  it('pauseDiscussion claims ACTIVE -> PAUSED before writing', async () => {
    const { service } = makeService(activeDiscussion);

    await service.pauseDiscussion('d1', 'why');

    expect(casMock).toHaveBeenCalledTimes(1);
    const [, , target, allowed] = casMock.mock.calls[0];
    expect(target).toBe(DiscussionStatus.PAUSED);
    expect(allowed).toEqual([DiscussionStatus.ACTIVE]);
  });

  it('pauseDiscussion refuses when another writer already claimed it', async () => {
    const { service, updateDiscussion } = makeService(activeDiscussion);
    casMock.mockResolvedValue({ updated: false });

    await expect(service.pauseDiscussion('d1', 'why')).rejects.toThrow(/cannot be paused|conflict/i);
    expect(updateDiscussion).not.toHaveBeenCalled();
  });

  it('resumeDiscussion claims PAUSED -> ACTIVE before writing', async () => {
    const { service } = makeService({ ...activeDiscussion, status: DiscussionStatus.PAUSED });

    await service.resumeDiscussion('d1');

    const [, , target, allowed] = casMock.mock.calls[0];
    expect(target).toBe(DiscussionStatus.ACTIVE);
    expect(allowed).toEqual([DiscussionStatus.PAUSED]);
  });

  it('startDiscussion claims DRAFT -> ACTIVE before writing', async () => {
    const { service } = makeService({ ...activeDiscussion, status: DiscussionStatus.DRAFT });

    await service.startDiscussion('d1', 'user-1');

    const [, , target, allowed] = casMock.mock.calls[0];
    expect(target).toBe(DiscussionStatus.ACTIVE);
    expect(allowed).toEqual([DiscussionStatus.DRAFT]);
  });

  it('endDiscussion claims the terminal transition before writing', async () => {
    const { service } = makeService(activeDiscussion);

    await service.endDiscussion('d1', 'user-1', 'manual');

    const [, , target, allowed] = casMock.mock.calls[0];
    expect(target).toBe(DiscussionStatus.COMPLETED);
    expect(allowed).toEqual([DiscussionStatus.ACTIVE]);
  });

  it('endDiscussion of a DRAFT claims CANCELLED, not COMPLETED', async () => {
    const { service } = makeService({ ...activeDiscussion, status: DiscussionStatus.DRAFT });

    await service.endDiscussion('d1', 'user-1', 'manual');

    const [, , target, allowed] = casMock.mock.calls[0];
    expect(target).toBe(DiscussionStatus.CANCELLED);
    expect(allowed).toEqual([DiscussionStatus.DRAFT]);
  });

  it('endDiscussion refuses when another writer already ended it', async () => {
    const { service, updateDiscussion } = makeService(activeDiscussion);
    casMock.mockResolvedValue({ updated: false });

    await expect(service.endDiscussion('d1', 'user-1', 'manual')).rejects.toThrow(
      /cannot be ended|conflict/i
    );
    expect(updateDiscussion).not.toHaveBeenCalled();
  });
});
