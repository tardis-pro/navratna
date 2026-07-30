import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testDouble } from '../test_double.js';
import { TurnStrategy, ParticipantRole } from '@uaip/types';
import type {
  Discussion,
  DiscussionParticipant,
  TurnStrategyConfig,
} from '@uaip/types';
import { TurnStrategyService } from '../../services/turn_strategy_service.js';

function makeParticipant(
  id: string,
  role: ParticipantRole = ParticipantRole.PARTICIPANT
): DiscussionParticipant {
  return testDouble<DiscussionParticipant>({
    id,
    discussionId: 'disc-1',
    personaId: `persona-${id}`,
    agentId: `agent-${id}`,
    userId: `user-${id}`,
    role,
    isActive: true,
    joinedAt: new Date(),
    lastActiveAt: new Date(),
    messageCount: 0,
    metadata: {},
  });
}

function makeDiscussion(
  strategy: TurnStrategy,
  participants: DiscussionParticipant[]
): Discussion {
  return testDouble<Discussion>({
    id: 'disc-1',
    title: 'T',
    topic: 'T',
    status: 'active',
    participants,
    turnStrategy: { strategy, config: { type: strategy } },
    state: {
      currentTurn: { participantId: participants[0]?.id, startedAt: new Date(), turnNumber: 1 },
    },
    createdBy: 'user-mod',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('TurnStrategyService', () => {
  let service: TurnStrategyService;

  beforeEach(() => {
    service = new TurnStrategyService();
  });

  describe('validateStrategyConfig — must reject strategies with no registered implementation', () => {
    it('rejects PRIORITY_BASED because no strategy class is registered for it', () => {
      const config = testDouble<TurnStrategyConfig>({
        strategy: TurnStrategy.PRIORITY_BASED,
        config: { type: 'priority_based', priorities: [{ participantId: 'p1', priority: 1 }] },
      });

      const result = service.validateStrategyConfig(TurnStrategy.PRIORITY_BASED, config);

      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/not registered|unknown strategy|unsupported/i);
    });

    it('rejects EXPERTISE_DRIVEN because no strategy class is registered for it', () => {
      const config = testDouble<TurnStrategyConfig>({
        strategy: TurnStrategy.EXPERTISE_DRIVEN,
        config: {
          type: 'expertise_driven',
          topicKeywords: ['a'],
          expertiseThreshold: 0.5,
        },
      });

      const result = service.validateStrategyConfig(TurnStrategy.EXPERTISE_DRIVEN, config);

      expect(result.isValid).toBe(false);
    });

    it('rejects a config whose inner config.type disagrees with the strategy type', () => {
      const config = testDouble<TurnStrategyConfig>({
        strategy: TurnStrategy.ROUND_ROBIN,
        config: { type: 'moderated', moderatorId: 'mod-1' },
      });

      const result = service.validateStrategyConfig(TurnStrategy.ROUND_ROBIN, config);

      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/mismatch/i);
    });

    it('accepts a well-formed ROUND_ROBIN config', () => {
      const config = testDouble<TurnStrategyConfig>({
        strategy: TurnStrategy.ROUND_ROBIN,
        config: { type: 'round_robin', maxSkips: 2, skipInactive: true },
      });

      const result = service.validateStrategyConfig(TurnStrategy.ROUND_ROBIN, config);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('executeModeratorAction — every advertised action must be executable', () => {
    it('advertises only actions this layer can actually execute', async () => {
      const moderator = makeParticipant('mod-1', ParticipantRole.MODERATOR);
      const target = makeParticipant('p2');
      const discussion = makeDiscussion(TurnStrategy.MODERATED, [moderator, target]);

      const actions = await service.getModeratorActions(discussion, 'mod-1');

      for (const { action } of actions) {
        const result = await service.executeModeratorAction(action, discussion, 'mod-1', {
          participantId: 'p2',
        });
        expect(result.message).not.toMatch(/unknown moderator action/i);
      }
    });

    it('does not advertise participant-selection actions it cannot persist', async () => {
      const moderator = makeParticipant('mod-1', ParticipantRole.MODERATOR);
      const target = makeParticipant('p2');
      const discussion = makeDiscussion(TurnStrategy.MODERATED, [moderator, target]);

      const advertised = (await service.getModeratorActions(discussion, 'mod-1')).map(
        (a) => a.action
      );

      expect(advertised).not.toContain('grant_speaking_permission');
      expect(advertised).not.toContain('select_next_participant');
    });

    it('reports participant-selection actions as unknown rather than faking success', async () => {
      const moderator = makeParticipant('mod-1', ParticipantRole.MODERATOR);
      const target = makeParticipant('p2');
      const discussion = makeDiscussion(TurnStrategy.MODERATED, [moderator, target]);

      for (const action of ['grant_speaking_permission', 'select_next_participant']) {
        const result = await service.executeModeratorAction(action, discussion, 'mod-1', {
          participantId: 'p2',
        });
        expect(result.success).toBe(false);
      }
    });
  });

  describe('shouldAdvanceTurn — must not force-advance on error', () => {
    it('returns false when the underlying strategy throws', async () => {
      const participant = makeParticipant('p1');
      const discussion = makeDiscussion(TurnStrategy.ROUND_ROBIN, [participant]);

      const strategy = service.getStrategy(TurnStrategy.ROUND_ROBIN);
      vi.spyOn(strategy, 'shouldAdvanceTurn').mockRejectedValue(new Error('boom'));

      await expect(service.shouldAdvanceTurn(discussion, participant)).resolves.toBe(false);
    });
  });
});
