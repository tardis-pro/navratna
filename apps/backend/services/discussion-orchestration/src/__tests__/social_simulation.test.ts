import {
  DiscussionParticipantSchema,
  DiscussionSchema,
  DiscussionStatus,
  DiscussionVisibility,
  ParticipantRole,
  TurnStrategy,
  type Discussion,
  type DiscussionParticipant,
} from '@uaip/types';
import { EventBusService } from '@uaip/shared-services';
import { DiscussionService } from '../services/discussion_service.js';
import { DiscussionOrchestrationService } from '../services/discussion_orchestration_service.js';
import { TurnStrategyService } from '../services/turn_strategy_service.js';
import { ModeratedStrategy } from '../strategies/moderated_strategy.js';
import { DiscussionWebSocketHandler } from '../websocket/discussion_web_socket_handler.js';

const createParticipant = (
  id: string,
  role: ParticipantRole,
  joinedAt: string,
  metadata?: Record<string, unknown>,
  messageCount = 0
): DiscussionParticipant =>
  DiscussionParticipantSchema.parse({
    id,
    createdAt: new Date('2026-03-01T10:00:00Z'),
    updatedAt: new Date('2026-03-01T10:00:00Z'),
    discussionId: 'discussion-1',
    agentId: `agent-${id}`,
    role,
    joinedAt: new Date(joinedAt),
    isActive: true,
    messageCount,
    interruptionCount: 0,
    questionsAsked: 0,
    questionsAnswered: 0,
    topics: [],
    tags: [],
    metadata,
  });

const createDiscussion = (
  participants: DiscussionParticipant[],
  strategy: TurnStrategy,
  currentTurnParticipantId?: string,
  turnNumber = 0,
  metadata?: Record<string, unknown>
): Discussion =>
  DiscussionSchema.parse({
    id: 'discussion-1',
    createdAt: new Date('2026-03-01T10:00:00Z'),
    updatedAt: new Date('2026-03-01T10:00:00Z'),
    title: 'Simulation Discussion',
    topic: 'Agent collaboration patterns',
    participants,
    state: {
      currentTurn: {
        participantId: currentTurnParticipantId,
        turnNumber,
      },
      phase: 'discussion',
      messageCount: 0,
      activeParticipants: participants.length,
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
      strategy,
      config:
        strategy === TurnStrategy.MODERATED
          ? {
              type: 'moderated',
              moderatorId: 'moderator-1',
              requireApproval: true,
              autoAdvance: false,
            }
          : { type: 'round_robin', skipInactive: true, maxSkips: 3 },
    },
    status: DiscussionStatus.ACTIVE,
    visibility: DiscussionVisibility.PRIVATE,
    createdBy: 'user-1',
    tags: [],
    objectives: [],
    outcomes: [],
    relatedDiscussions: [],
    childDiscussions: [],
    metadata,
  });

describe('Layer 4: Social Simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('completes a 3-agent round-robin loop without deadlock', async () => {
    const turnStrategyService = new TurnStrategyService();
    const participants = [
      createParticipant('p1', ParticipantRole.PARTICIPANT, '2026-03-01T10:00:01Z'),
      createParticipant('p2', ParticipantRole.PARTICIPANT, '2026-03-01T10:00:02Z'),
      createParticipant('p3', ParticipantRole.PARTICIPANT, '2026-03-01T10:00:03Z'),
    ];

    const discussion = createDiscussion(
      participants,
      TurnStrategy.ROUND_ROBIN,
      participants[0].id,
      0
    );
    const seenTurns = new Set<string>();

    for (let iteration = 0; iteration < 6; iteration += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const result = await turnStrategyService.advanceTurn(
        discussion,
        participants,
        discussion.turnStrategy
      );
      if (result.nextParticipant) {
        seenTurns.add(result.nextParticipant.id);
        discussion.state.currentTurn.participantId = result.nextParticipant.id;
      }
      discussion.state.currentTurn.turnNumber = result.turnNumber;
    }

    expect(seenTurns).toEqual(new Set(participants.map((participant) => participant.id)));
  });

  it('cycles debate phases thesis -> antithesis -> synthesis -> thesis', async () => {
    const moderatedStrategy = new ModeratedStrategy();
    const facilitator = createParticipant(
      'facilitator-1',
      ParticipantRole.FACILITATOR,
      '2026-03-01T10:00:01Z',
      { agreementScore: 0.8 },
      6
    );
    const opponent = createParticipant(
      'opponent-1',
      ParticipantRole.PARTICIPANT,
      '2026-03-01T10:00:02Z',
      { agreementScore: 0.1 },
      2
    );
    const moderator = createParticipant(
      'moderator-1',
      ParticipantRole.MODERATOR,
      '2026-03-01T10:00:03Z',
      { agreementScore: 0.5 },
      1
    );

    const participants = [facilitator, opponent, moderator];
    const discussion = createDiscussion(participants, TurnStrategy.MODERATED, facilitator.id, 0);

    const first = await moderatedStrategy.getNextParticipant(
      discussion,
      participants,
      discussion.turnStrategy
    );
    const second = await moderatedStrategy.getNextParticipant(
      discussion,
      participants,
      discussion.turnStrategy
    );
    const third = await moderatedStrategy.getNextParticipant(
      discussion,
      participants,
      discussion.turnStrategy
    );
    const fourth = await moderatedStrategy.getNextParticipant(
      discussion,
      participants,
      discussion.turnStrategy
    );

    expect(first?.id).toBe(facilitator.id);
    expect(second?.id).toBe(opponent.id);
    expect(third?.id).toBe(moderator.id);
    expect(fourth?.id).toBe(facilitator.id);
  });

  it('creates a sub-discussion huddle with isHuddle metadata', async () => {
    const parentParticipants = [
      createParticipant('p1', ParticipantRole.PARTICIPANT, '2026-03-01T10:00:01Z'),
      createParticipant('p2', ParticipantRole.PARTICIPANT, '2026-03-01T10:00:02Z'),
    ];
    const parentDiscussion = createDiscussion(
      parentParticipants,
      TurnStrategy.ROUND_ROBIN,
      parentParticipants[0].id,
      1
    );

    const huddleDiscussion = createDiscussion(
      parentParticipants,
      TurnStrategy.ROUND_ROBIN,
      undefined,
      0,
      { isHuddle: true, parentDiscussionId: parentDiscussion.id }
    );

    const discussionService = {
      getDiscussion: vi.fn(async () => parentDiscussion),
      createDiscussion: vi.fn(async () => huddleDiscussion),
    } as unknown as DiscussionService;

    const eventBusService = {
      publish: vi.fn(async () => undefined),
    } as unknown as EventBusService;

    const service = new DiscussionOrchestrationService(discussionService, eventBusService);

    const result = await service.createHuddle(
      parentDiscussion.id,
      ['agent-a', 'agent-b', 'agent-a'],
      'Resolve integration conflict'
    );

    expect(discussionService.createDiscussion).toHaveBeenCalledWith(
      expect.objectContaining({
        parentDiscussionId: parentDiscussion.id,
        metadata: expect.objectContaining({
          isHuddle: true,
          parentDiscussionId: parentDiscussion.id,
        }),
      })
    );
    expect(result.metadata?.isHuddle).toBe(true);
    await service.cleanup();
  });

  it('prioritizes a relevance 0.9 turn request into queue ordering', async () => {
    const participants = [
      createParticipant('p1', ParticipantRole.PARTICIPANT, '2026-03-01T10:00:01Z'),
      createParticipant('p2', ParticipantRole.PARTICIPANT, '2026-03-01T10:00:02Z'),
      createParticipant('p3', ParticipantRole.PARTICIPANT, '2026-03-01T10:00:03Z'),
    ];

    const discussion = createDiscussion(
      participants,
      TurnStrategy.ROUND_ROBIN,
      participants[0].id,
      1
    );

    const discussionService = {
      getDiscussion: vi.fn(async () => discussion),
      updateDiscussion: vi.fn(async (_discussionId: string, update: Partial<Discussion>) => {
        if (update.state) {
          discussion.state = {
            ...discussion.state,
            ...update.state,
            currentTurn: {
              ...discussion.state.currentTurn,
              ...update.state.currentTurn,
            },
          };
        }
        return discussion;
      }),
    } as unknown as DiscussionService;

    const eventBusService = {
      publish: vi.fn(async () => undefined),
    } as unknown as EventBusService;

    const webSocketHandler = {
      broadcastToDiscussion: vi.fn(),
      broadcastContextUpdate: vi.fn(),
    } as unknown as DiscussionWebSocketHandler;

    const service = new DiscussionOrchestrationService(
      discussionService,
      eventBusService,
      webSocketHandler
    );

    const requestResult = await service.requestTurn(discussion.id, participants[2].id, 0.9);

    expect(requestResult.success).toBe(true);
    expect(requestResult.data?.status).toBe('queued');
    expect(service.getCleanupStatistics().turnRequestQueues).toBe(1);

    const advanceResult = await service.advanceTurn(discussion.id, 'system');

    expect(advanceResult.success).toBe(true);
    expect(advanceResult.data?.nextParticipant?.id).toBe(participants[2].id);

    await service.cleanup();
  });

  it('broadcasts raise-hand as turn:requested event', async () => {
    const participants = [
      createParticipant('p1', ParticipantRole.PARTICIPANT, '2026-03-01T10:00:01Z'),
      createParticipant('p2', ParticipantRole.PARTICIPANT, '2026-03-01T10:00:02Z'),
    ];
    const discussion = createDiscussion(
      participants,
      TurnStrategy.ROUND_ROBIN,
      participants[0].id,
      0
    );

    const discussionService = {
      getDiscussion: vi.fn(async () => discussion),
    } as unknown as DiscussionService;

    const eventBusService = {
      publish: vi.fn(async () => undefined),
    } as unknown as EventBusService;

    const webSocketHandler = {
      broadcastToDiscussion: vi.fn(),
      broadcastContextUpdate: vi.fn(),
    } as unknown as DiscussionWebSocketHandler;

    const service = new DiscussionOrchestrationService(
      discussionService,
      eventBusService,
      webSocketHandler
    );

    const result = await service.requestTurn(discussion.id, participants[0].id, 0.4);

    expect(result.success).toBe(true);
    expect(webSocketHandler.broadcastToDiscussion).toHaveBeenCalledWith(
      discussion.id,
      expect.objectContaining({
        type: 'turn:requested',
        data: expect.objectContaining({
          participantId: participants[0].id,
          relevanceScore: 0.4,
          queued: false,
        }),
      })
    );

    await service.cleanup();
  });
});
