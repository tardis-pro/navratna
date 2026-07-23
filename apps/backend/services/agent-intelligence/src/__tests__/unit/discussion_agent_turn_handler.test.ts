import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logger } from '@uaip/utils'
import { handleAgentDiscussionTrigger } from '../../../../../../shared/agent-intelligence/src/events/discussion_agent_turn_handler'

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/utils')>()
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }
})

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    agentIntelligenceService: {
      getAgent: vi.fn().mockResolvedValue({ id: 'agent-1', name: 'Test Agent' }),
    },
    userLLMService: {
      generateAgentResponse: vi.fn().mockResolvedValue({ content: 'Hello from agent' }),
    },
    databaseService: {
      findMany: vi.fn().mockResolvedValue([{ id: 'participant-1' }]),
      create: vi.fn().mockResolvedValue({ id: 'msg-1' }),
    },
    publish: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeEvent(data: Record<string, unknown>) {
  return {
    id: 'event-1',
    type: 'agent.discussion.trigger',
    source: 'test',
    version: '1.0.0',
    data,
    timestamp: new Date(),
  }
}

describe('handleAgentDiscussionTrigger', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses explicit participant and discussion-owner identities without DB lookup', async () => {
    const deps = makeDeps()
    await handleAgentDiscussionTrigger(
      makeEvent({
        discussionId: 'd-1',
        participantId: 'p-explicit',
        agentId: 'agent-1',
        userId: 'user-owner',
        comment: 'hi',
      }),
      deps
    )

    expect(deps.databaseService.findMany).not.toHaveBeenCalled()
    expect(deps.userLLMService.generateAgentResponse).toHaveBeenCalledWith(
      'user-owner',
      expect.objectContaining({
        agent: expect.objectContaining({ id: 'agent-1' }),
      })
    )
  })

  it('falls back to DB lookup when participantId is absent', async () => {
    const deps = makeDeps()
    await handleAgentDiscussionTrigger(
      makeEvent({ discussionId: 'd-1', agentId: 'agent-1', comment: 'hi' }),
      deps
    )

    expect(deps.databaseService.findMany).toHaveBeenCalledWith('discussion_participants', {
      discussionId: 'd-1',
      agentId: 'agent-1',
    })
  })

  it('publishes discussion.agent.message.failed when agent is not found', async () => {
    const deps = makeDeps({
      agentIntelligenceService: { getAgent: vi.fn().mockResolvedValue(null) },
    })
    await handleAgentDiscussionTrigger(
      makeEvent({ discussionId: 'd-1', agentId: 'missing-agent', comment: 'hi' }),
      deps
    )

    expect(deps.publish).toHaveBeenCalledWith('discussion.agent.message.failed', expect.objectContaining({
      discussionId: 'd-1',
      agentId: 'missing-agent',
    }))
  })

  it('publishes discussion.agent.message.failed when participant cannot be resolved', async () => {
    const deps = makeDeps({
      databaseService: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    })
    await handleAgentDiscussionTrigger(
      makeEvent({ discussionId: 'd-1', agentId: 'agent-1', comment: 'hi' }),
      deps
    )

    expect(deps.publish).toHaveBeenCalledWith('discussion.agent.message.failed', expect.objectContaining({
      discussionId: 'd-1',
      agentId: 'agent-1',
    }))
  })

  it('publishes discussion.agent.message.failed when generation throws', async () => {
    const deps = makeDeps({
      userLLMService: {
        generateAgentResponse: vi.fn().mockRejectedValue(new Error('provider unavailable')),
      },
    })
    await handleAgentDiscussionTrigger(
      makeEvent({ discussionId: 'd-1', participantId: 'p-1', agentId: 'agent-1' }),
      deps
    )

    expect(deps.publish).toHaveBeenCalledWith('discussion.agent.message.failed', expect.objectContaining({
      discussionId: 'd-1',
      participantId: 'p-1',
      agentId: 'agent-1',
      error: 'provider unavailable',
    }))
  })

  it('logs structured identity when failure-event publication fails', async () => {
    const deps = makeDeps({
      agentIntelligenceService: { getAgent: vi.fn().mockResolvedValue(null) },
      publish: vi.fn().mockRejectedValue(new Error('event bus unavailable')),
    })

    await expect(handleAgentDiscussionTrigger(
      makeEvent({ discussionId: 'd-1', agentId: 'missing-agent' }),
      deps
    )).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalledWith(
      'agent.discussion.trigger: failed to publish failure event',
      expect.objectContaining({
        discussionId: 'd-1',
        agentId: 'missing-agent',
        generationError: 'Agent not found in database',
        publicationError: 'event bus unavailable',
      })
    )
  })

  it('generates and publishes a message event on the successful path', async () => {
    const deps = makeDeps()
    await handleAgentDiscussionTrigger(
      makeEvent({ discussionId: 'd-1', participantId: 'p-1', agentId: 'agent-1', comment: 'hi' }),
      deps
    )

    expect(deps.userLLMService.generateAgentResponse).toHaveBeenCalled()
    expect(deps.publish).toHaveBeenCalledWith(
      'discussion.agent.message',
      expect.objectContaining({ discussionId: 'd-1', participantId: 'p-1' })
    )
  })
})
