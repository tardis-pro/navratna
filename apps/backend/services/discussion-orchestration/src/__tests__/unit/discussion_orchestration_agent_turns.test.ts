import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  DiscussionParticipantSchema,
  DiscussionSchema,
  DiscussionStatus,
  DiscussionVisibility,
  ParticipantRole,
  TurnStrategy,
  type Discussion,
  type DiscussionParticipant,
} from '@uaip/types'
import { EventBusService } from '@uaip/shared-services'
import { DiscussionService } from '@uaip/shared-services/discussion'
import { DiscussionOrchestrationService } from '@uaip/discussion-core'

function createParticipant(id: string, joinedAt: string): DiscussionParticipant {
  const participant = DiscussionParticipantSchema.parse({
    id,
    createdAt: new Date('2026-03-01T10:00:00Z'),
    updatedAt: new Date('2026-03-01T10:00:00Z'),
    discussionId: 'discussion-turn-test',
    agentId: `agent-${id}`,
    personaId: `persona-${id}`,
    participantType: 'agent',
    role: ParticipantRole.PARTICIPANT,
    joinedAt: new Date(joinedAt),
    isActive: true,
    messageCount: 0,
    interruptionCount: 0,
    questionsAsked: 0,
    questionsAnswered: 0,
    topics: [],
    tags: [],
  })
  participant.personaId = `persona-${id}`
  return participant
}

function createSystemParticipant(): DiscussionParticipant {
  return DiscussionParticipantSchema.parse({
    id: 'system-user',
    createdAt: new Date('2026-03-01T10:00:00Z'),
    updatedAt: new Date('2026-03-01T10:00:00Z'),
    discussionId: 'discussion-turn-test',
    agentId: '',
    userId: 'user-1',
    participantType: 'user',
    role: ParticipantRole.MODERATOR,
    joinedAt: new Date('2026-03-01T10:00:00Z'),
    isActive: true,
    messageCount: 0,
    interruptionCount: 0,
    questionsAsked: 0,
    questionsAnswered: 0,
    topics: [],
    tags: [],
  })
}

function createDiscussion(status: DiscussionStatus, turnNumber = 0): TestDiscussion {
  const participants = [
    createParticipant('p1', '2026-03-01T10:00:01Z'),
    createParticipant('p2', '2026-03-01T10:00:02Z'),
    createSystemParticipant(),
  ]

  const discussion = DiscussionSchema.parse({
    id: 'discussion-turn-test',
    createdAt: new Date('2026-03-01T10:00:00Z'),
    updatedAt: new Date('2026-03-01T10:00:00Z'),
    title: 'Automated turn test',
    topic: 'Immediate agent turns',
    participants,
    state: {
      currentTurn: { participantId: turnNumber > 0 ? participants[0].id : undefined, turnNumber },
      phase: 'discussion',
      messageCount: 0,
      activeParticipants: participants.length,
      lastActivity: new Date('2026-03-01T10:00:00Z'),
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
      config: { type: 'round_robin', skipInactive: true, maxSkips: 3 },
    },
    status,
    visibility: DiscussionVisibility.PRIVATE,
    createdBy: 'user-1',
    tags: [],
    objectives: [],
    outcomes: [],
    relatedDiscussions: [],
    childDiscussions: [],
  })
  discussion.participants?.forEach((participant) => {
    participant.personaId = `persona-${participant.id}`
  })
  if (!discussion.participants) throw new Error('Expected parsed discussion participants')
  return Object.assign(discussion, { participants: discussion.participants })
}

type TestDiscussion = Discussion & { participants: DiscussionParticipant[] }

type ServiceHarness = {
  orchestrationService: DiscussionOrchestrationService
  publish: MockInstance
  discussion: TestDiscussion
}

function createServiceHarness(status: DiscussionStatus, turnNumber = 0): ServiceHarness {
  const discussion = createDiscussion(status, turnNumber)
  const databaseService = {
    findMany: vi.fn(async () => discussion.participants),
    getAgentById: vi.fn(async (agentId: string) => ({ id: agentId, name: agentId })),
    // Status transitions are a conditional UPDATE; returning a row means this
    // instance won the claim.
    executeQuery: vi.fn(async () => [{ id: discussion.id, status: discussion.status }]),
  }
  const discussionService = Object.assign(Object.create(DiscussionService.prototype), {
    getDiscussion: vi.fn(async () => discussion),
    updateDiscussion: vi.fn(async (_discussionId: string, update: Partial<Discussion>) => {
      if (update.status) discussion.status = update.status
      if (update.startedAt) discussion.startedAt = update.startedAt
      if (update.state) discussion.state = update.state
      return discussion
    }),
    getDiscussionMessages: vi.fn(async () => []),
    searchDiscussions: vi.fn(async () => ({ discussions: [discussion], total: 1 })),
    getDatabaseService: vi.fn(() => databaseService),
  })
  const publish = vi.fn(async () => undefined)
  const eventBusService = Object.assign(Object.create(EventBusService.prototype), {
    publish,
    emitDiscussionEvent: vi.fn(async () => undefined),
  })

  return {
    orchestrationService: new DiscussionOrchestrationService(discussionService, eventBusService),
    publish,
    discussion,
  }
}

function agentTriggerCalls(publish: MockInstance): unknown[][] {
  return publish.mock.calls.filter((call) => call[0] === 'agent.discussion.trigger')
}

describe('DiscussionOrchestrationService automated agent turns', () => {
  beforeEach(() => vi.useFakeTimers())

  afterEach(() => vi.useRealTimers())

  it('triggers the selected agent immediately and once when discussion starts', async () => {
    const harness = createServiceHarness(DiscussionStatus.DRAFT)

    const result = await harness.orchestrationService.startDiscussion(harness.discussion.id, 'user-1')

    expect(result).toEqual(expect.objectContaining({ success: true }))
    expect(agentTriggerCalls(harness.publish)).toHaveLength(1)
    expect(agentTriggerCalls(harness.publish)[0]?.[1]).toEqual(expect.objectContaining({
      params: expect.objectContaining({
        discussionId: harness.discussion.id,
        participantId: harness.discussion.participants[0].id,
        agentId: harness.discussion.participants[0].agentId,
        userId: 'user-1',
        isInitialParticipation: true,
      }),
    }))

    await harness.orchestrationService.cleanup()
  })

  it('triggers the newly selected agent immediately and once when turn advances', async () => {
    const harness = createServiceHarness(DiscussionStatus.ACTIVE, 1)

    const result = await harness.orchestrationService.advanceTurn(harness.discussion.id, 'system')

    expect(result.success).toBe(true)
    expect(agentTriggerCalls(harness.publish)).toHaveLength(1)
    expect(agentTriggerCalls(harness.publish)[0]?.[1]).toEqual(expect.objectContaining({
      params: expect.objectContaining({
        discussionId: harness.discussion.id,
        participantId: harness.discussion.participants[1].id,
        agentId: harness.discussion.participants[1].agentId,
      }),
    }))

    await harness.orchestrationService.cleanup()
  })

  it('does not duplicate the immediate trigger when the periodic monitor checks the same turn', async () => {
    const harness = createServiceHarness(DiscussionStatus.ACTIVE, 1)

    await harness.orchestrationService.advanceTurn(harness.discussion.id, 'system')
    expect(agentTriggerCalls(harness.publish)).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(16_000)

    expect(agentTriggerCalls(harness.publish)).toHaveLength(1)
    await harness.orchestrationService.cleanup()
  })

  it('never selects an active user participant for an automated turn', async () => {
    const harness = createServiceHarness(DiscussionStatus.ACTIVE, 1)

    const firstResult = await harness.orchestrationService.advanceTurn(
      harness.discussion.id,
      'system'
    )
    const secondResult = await harness.orchestrationService.advanceTurn(
      harness.discussion.id,
      'system'
    )

    expect(firstResult).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          nextParticipant: expect.objectContaining({ agentId: expect.any(String) }),
        }),
      })
    )
    expect(secondResult).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          nextParticipant: expect.objectContaining({ agentId: expect.any(String) }),
        }),
      })
    )
    expect(agentTriggerCalls(harness.publish)).not.toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'agent.discussion.trigger',
          expect.objectContaining({
            params: expect.objectContaining({ participantId: 'system-user' }),
          }),
        ]),
      ])
    )

    await harness.orchestrationService.cleanup()
  })
})
