import {
  DiscussionParticipantSchema,
  DiscussionSchema,
  DiscussionStatus,
  DiscussionVisibility,
  TurnStrategy,
} from '@uaip/types';
import { TurnStrategyService } from '@uaip/discussion-core';

function createRoundRobinDiscussion(turnNumber: number) {
  return DiscussionSchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    title: 'Round Robin Test Discussion',
    topic: 'Turn sequencing',
    participants: [],
    state: {
      currentTurn: {
        turnNumber,
      },
      phase: 'discussion',
      messageCount: 0,
      activeParticipants: 3,
      consensusLevel: 0,
      engagementScore: 0,
      topicDrift: 0,
      keyPoints: [],
      decisions: [],
      actionItems: [],
    },
    settings: {
      maxParticipants: 10,
      autoModeration: true,
      requireApproval: false,
      allowInvites: true,
      allowFileSharing: true,
      allowAnonymous: false,
      recordTranscript: true,
      enableAnalytics: true,
      turnTimeout: 30,
      responseTimeout: 30,
      moderationRules: [],
    },
    turnStrategy: {
      strategy: TurnStrategy.ROUND_ROBIN,
      config: {
        type: 'round_robin',
        skipInactive: true,
        maxSkips: 3,
      },
    },
    status: DiscussionStatus.ACTIVE,
    visibility: DiscussionVisibility.PRIVATE,
    createdBy: '22222222-2222-4222-8222-222222222222',
    tags: [],
    objectives: [],
    outcomes: [],
    relatedDiscussions: [],
    childDiscussions: [],
  });
}

function createParticipant(id: string, joinedAt: string) {
  return DiscussionParticipantSchema.parse({
    id,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    discussionId: '11111111-1111-4111-8111-111111111111',
    agentId: `agent-${id}`,
    role: 'participant',
    joinedAt: new Date(joinedAt),
    isActive: true,
    messageCount: 0,
    interruptionCount: 0,
    questionsAsked: 0,
    questionsAnswered: 0,
    topics: [],
    tags: [],
  });
}

describe('TurnStrategyService', () => {
  let service: TurnStrategyService;

  beforeEach(() => {
    service = new TurnStrategyService();
  });

  it('cycles through participants for round-robin strategy', async () => {
    const participants = [
      createParticipant('33333333-3333-4333-8333-333333333333', '2026-01-01T00:00:01Z'),
      createParticipant('44444444-4444-4444-8444-444444444444', '2026-01-01T00:00:02Z'),
      createParticipant('55555555-5555-4555-8555-555555555555', '2026-01-01T00:00:03Z'),
    ];

    const first = await service.getNextParticipant(createRoundRobinDiscussion(0), participants);
    const second = await service.getNextParticipant(createRoundRobinDiscussion(1), participants);
    const third = await service.getNextParticipant(createRoundRobinDiscussion(2), participants);
    const fourth = await service.getNextParticipant(createRoundRobinDiscussion(3), participants);

    expect(first?.id).toBe(participants[0].id);
    expect(second?.id).toBe(participants[1].id);
    expect(third?.id).toBe(participants[2].id);
    expect(fourth?.id).toBe(participants[0].id);
  });

  it('returns a metrics object with usage, averageTurnDuration and successRate', async () => {
    const participants = [
      createParticipant('33333333-3333-4333-8333-333333333333', '2026-01-01T00:00:01Z'),
    ];

    await service.getNextParticipant(createRoundRobinDiscussion(0), participants);
    const metrics = service.getStrategyMetrics(TurnStrategy.ROUND_ROBIN);

    expect(metrics).toEqual(
      expect.objectContaining({
        usage: expect.any(Number),
        averageTurnDuration: expect.any(Number),
        successRate: expect.any(Number),
      })
    );
  });

  it('initializes strategy metrics for all registered strategies', () => {
    const roundRobinMetrics = service.getStrategyMetrics(TurnStrategy.ROUND_ROBIN);
    const moderatedMetrics = service.getStrategyMetrics(TurnStrategy.MODERATED);
    const contextAwareMetrics = service.getStrategyMetrics(TurnStrategy.CONTEXT_AWARE);

    expect(roundRobinMetrics).toEqual({ usage: 0, averageTurnDuration: 0, successRate: 0 });
    expect(moderatedMetrics).toEqual({ usage: 0, averageTurnDuration: 0, successRate: 0 });
    expect(contextAwareMetrics).toEqual({ usage: 0, averageTurnDuration: 0, successRate: 0 });
  });
});
