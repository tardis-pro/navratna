import { describe, it, expect, vi, afterEach } from 'vitest';
import { testDouble } from '../test_double.js';
import { DiscussionOrchestrationService } from '../../services/discussion_orchestration_service.js';
import type { DiscussionService, EventBusService } from '@uaip/shared-services';

/**
 * Every mutex.acquire() must be paired with a release() in a finally block.
 * The lock is keyed per discussionId, so a path that returns before releasing
 * permanently wedges that discussion: every later startDiscussion /
 * updateTurnStrategy call for it waits on a token that never resolves.
 */

type MutexLike = { acquire(key: string): Promise<() => void> };

const services: DiscussionOrchestrationService[] = [];

function makeService(
  discussionOverrides: Record<string, unknown> = {}
): DiscussionOrchestrationService {
  const discussionService = testDouble<DiscussionService>({
    getDiscussion: vi.fn(async () => null),
    updateDiscussion: vi.fn(async () => null),
    ...discussionOverrides,
  });

  const eventBusService = testDouble<EventBusService>({
    publish: vi.fn(async () => undefined),
    subscribe: vi.fn(async () => undefined),
  });

  const service = new DiscussionOrchestrationService(discussionService, eventBusService);
  services.push(service);
  return service;
}

function getMutex(service: DiscussionOrchestrationService): MutexLike {
  const mutex = Reflect.get(service, 'mutex');
  if (!mutex || typeof (mutex as MutexLike).acquire !== 'function') {
    throw new Error('mutex is not an AsyncMutex — test needs updating');
  }
  return mutex as MutexLike;
}

async function acquiresWithin(mutex: MutexLike, key: string, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  const acquired = mutex.acquire(key).then((release) => {
    release();
    return true as const;
  });

  try {
    return await Promise.race([acquired, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

afterEach(async () => {
  for (const service of services.splice(0)) {
    await service.cleanup();
  }
  vi.clearAllMocks();
});

describe('AsyncMutex release discipline', () => {
  it('a released lock can be re-acquired', async () => {
    const mutex = getMutex(makeService());

    const release = await mutex.acquire('disc-1');
    release();

    await expect(acquiresWithin(mutex, 'disc-1', 250)).resolves.toBe(true);
  });

  it('a never-released acquire wedges that key', async () => {
    const mutex = getMutex(makeService());

    await mutex.acquire('disc-wedged');

    await expect(acquiresWithin(mutex, 'disc-wedged', 250)).resolves.toBe(false);
  });

  it('startDiscussion releases its lock when it returns early on bad status', async () => {
    const service = makeService({
      getDiscussion: vi.fn(async () => ({
        id: 'disc-2',
        status: 'active',
        participants: [{ id: 'p1', isActive: true, agentId: 'a1', personaId: 'x' }],
        createdBy: 'user-1',
      })),
    });

    const result = await service.startDiscussion('disc-2', 'user-1');
    expect(result.success).toBe(false);

    await expect(acquiresWithin(getMutex(service), 'disc-2', 250)).resolves.toBe(true);
  });

  it('startDiscussion releases its lock when access is denied', async () => {
    const service = makeService({ getDiscussion: vi.fn(async () => null) });

    const result = await service.startDiscussion('disc-3', 'user-1');
    expect(result.success).toBe(false);

    await expect(acquiresWithin(getMutex(service), 'disc-3', 250)).resolves.toBe(true);
  });
});
