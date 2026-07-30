import { describe, it, expect, vi, afterEach } from 'vitest';
import { testDouble } from '../test_double.js';
import { TurnStrategy, ParticipantRole } from '@uaip/types';
import type { DiscussionService, EventBusService } from '@uaip/shared-services';
import { DiscussionOrchestrationService } from '../../services/discussion_orchestration_service.js';

/**
 * Two invariants for the moderated turn strategy:
 *
 * 1. A turn-strategy config reaching the DB must satisfy TurnStrategyConfigSchema.
 *    Casting an arbitrary object to TurnStrategyConfig lets a config missing its
 *    required fields be persisted, leaving the discussion unable to advance.
 * 2. Granting speaking permission must PERSIST state that canParticipantTakeTurn
 *    reads (discussion.metadata.pendingModeratorSelection). Validating and
 *    logging returns success while granting nothing.
 */

const services: DiscussionOrchestrationService[] = [];

function makeDiscussion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'disc-1',
    title: 'T',
    topic: 'T',
    status: 'active',
    createdBy: 'mod-1',
    metadata: {},
    turnStrategy: { strategy: TurnStrategy.MODERATED, config: { type: 'moderated', moderatorId: 'mod-1' } },
    participants: [
      { id: 'mod-1', discussionId: 'disc-1', role: ParticipantRole.MODERATOR, isActive: true },
      { id: 'p2', discussionId: 'disc-1', role: ParticipantRole.PARTICIPANT, isActive: true },
    ],
    ...overrides,
  };
}

function makeService(discussion: Record<string, unknown> | null = makeDiscussion()) {
  const updateDiscussion = vi.fn(async (_id: string, patch: Record<string, unknown>) => ({
    ...(discussion ?? {}),
    ...patch,
  }));

  const discussionService = testDouble<DiscussionService>({
    getDiscussion: vi.fn(async () => discussion),
    updateDiscussion,
    // Turn advance is a conditional UPDATE; a returned row means this instance
    // won the claim.
    getDatabaseService: vi.fn(() =>
      testDouble<ReturnType<DiscussionService['getDatabaseService']>>({
        executeQuery: vi.fn(async () => [{ id: 'disc-1' }]),
      })
    ),
  });

  const eventBusService = testDouble<EventBusService>({
    publish: vi.fn(async () => undefined),
    subscribe: vi.fn(async () => undefined),
  });

  const service = new DiscussionOrchestrationService(discussionService, eventBusService);
  services.push(service);
  return { service, updateDiscussion };
}

afterEach(async () => {
  for (const service of services.splice(0)) {
    await service.cleanup();
  }
  vi.clearAllMocks();
});

describe('updateTurnStrategy schema enforcement', () => {
  it('rejects a moderated config missing its required moderatorId', async () => {
    const { service, updateDiscussion } = makeService();

    const result = await service.updateTurnStrategy(
      'disc-1',
      TurnStrategy.MODERATED,
      {},
      'mod-1'
    );

    expect(result.success).toBe(false);
    expect(updateDiscussion).not.toHaveBeenCalled();
  });

  it('persists schema defaults rather than the raw caller input', async () => {
    const { service, updateDiscussion } = makeService();

    const result = await service.updateTurnStrategy(
      'disc-1',
      TurnStrategy.ROUND_ROBIN,
      {},
      'mod-1'
    );

    expect(result.success).toBe(true);
    const [, patch] = updateDiscussion.mock.calls[0];
    const persisted = patch.turnStrategy as { config: Record<string, unknown> };
    expect(persisted.config).toMatchObject({
      type: 'round_robin',
      skipInactive: true,
      maxSkips: 3,
    });
  });
});

describe('grantSpeakingPermission persistence', () => {
  it('persists a pending moderator selection the turn check can read', async () => {
    const { service, updateDiscussion } = makeService();

    const result = await service.grantSpeakingPermission('disc-1', 'mod-1', 'p2');

    expect(result.success).toBe(true);
    const [, patch] = updateDiscussion.mock.calls[0];
    const metadata = patch.metadata as Record<string, unknown>;
    expect(metadata.pendingModeratorSelection).toMatchObject({
      participantId: 'p2',
      moderatorId: 'mod-1',
    });
  });

  it('refuses a grant from a non-moderator and persists nothing', async () => {
    const { service, updateDiscussion } = makeService();

    const result = await service.grantSpeakingPermission('disc-1', 'p2', 'mod-1');

    expect(result.success).toBe(false);
    expect(updateDiscussion).not.toHaveBeenCalled();
  });

  it('clears the grant once the turn advances so it is not permanent', async () => {
    const granted = makeDiscussion({
      status: 'active',
      metadata: {
        pendingModeratorSelection: {
          participantId: 'p2',
          moderatorId: 'mod-1',
          timestamp: new Date(),
        },
      },
      state: { currentTurn: { turnNumber: 1 }, activeParticipants: 2 },
    });
    const { service, updateDiscussion } = makeService(granted);

    await service.advanceTurn('disc-1', 'mod-1');

    const patch = updateDiscussion.mock.calls.at(-1)?.[1] as
      | { metadata?: Record<string, unknown> }
      | undefined;
    expect(patch?.metadata).toBeDefined();
    expect(patch?.metadata).not.toHaveProperty('pendingModeratorSelection');
  });

  it('refuses a grant to an unknown participant', async () => {
    const { service, updateDiscussion } = makeService();

    const result = await service.grantSpeakingPermission('disc-1', 'mod-1', 'ghost');

    expect(result.success).toBe(false);
    expect(updateDiscussion).not.toHaveBeenCalled();
  });
});
