import type { AgentIntelligenceService, DatabaseService } from '@uaip/shared-services'
import type { UserLLMService } from '@uaip/llm-service'
import type { AgentResponseRequest, ChatMessage, EventBusMessage } from '@uaip/types'
import { logger, isRecord } from '@uaip/utils'

type TriggerParams = {
  discussionId: string
  participantId?: string
  agentId: string
  userId?: string
  comment: string
  isInitialParticipation: boolean
}

function parseTrigger(event: EventBusMessage): TriggerParams | null {
  const root: unknown = isRecord(event.data) ? event.data : event
  const outer = isRecord(root) ? root : {}
  const params = isRecord(outer.params) ? outer.params : outer
  const discussionId = typeof params.discussionId === 'string' ? params.discussionId : ''
  const participantId = typeof params.participantId === 'string' ? params.participantId : undefined
  const agentId = typeof params.agentId === 'string' ? params.agentId : ''
  const userId = typeof params.userId === 'string' ? params.userId : undefined
  const comment = typeof params.comment === 'string' ? params.comment : ''
  const isInitialParticipation = params.isInitialParticipation === true
  if (!discussionId || !agentId) return null
  return { discussionId, participantId, agentId, userId, comment, isInitialParticipation }
}

type ParticipantRow = { id: string; discussionId?: string; agentId?: string }

async function resolveParticipantId(
  databaseService: Pick<DatabaseService, 'findMany'>,
  discussionId: string,
  agentId: string
): Promise<string | null> {
  const rows = await databaseService.findMany<ParticipantRow>('discussion_participants', {
    discussionId,
    agentId,
  })
  return rows[0]?.id ?? null
}

function extractContent(response: unknown): string {
  if (!isRecord(response)) return ''
  if (typeof response.content === 'string' && response.content.trim()) return response.content
  if (typeof response.response === 'string' && response.response.trim()) return response.response
  return ''
}

type AgentTurnDeps = {
  agentIntelligenceService: Pick<AgentIntelligenceService, 'getAgent'>
  userLLMService: Pick<UserLLMService, 'generateAgentResponse'>
  databaseService: Pick<DatabaseService, 'findMany'>
  publish: (topic: string, payload: Record<string, unknown>) => Promise<void>
}

type AgentMessageFailurePayload = {
  discussionId: string
  participantId?: string
  agentId: string
  error: string
  model?: string
}

async function publishAgentMessageFailure(
  deps: AgentTurnDeps,
  payload: AgentMessageFailurePayload
): Promise<void> {
  try {
    await deps.publish('discussion.agent.message.failed', payload)
  } catch (publicationError) {
    logger.error('agent.discussion.trigger: failed to publish failure event', {
      discussionId: payload.discussionId,
      participantId: payload.participantId,
      agentId: payload.agentId,
      generationError: payload.error,
      publicationError:
        publicationError instanceof Error ? publicationError.message : 'Unknown publication error',
    })
  }
}

export async function handleAgentDiscussionTrigger(
  event: EventBusMessage,
  deps: AgentTurnDeps
): Promise<void> {
  const trigger = parseTrigger(event)
  if (!trigger) {
    logger.warn('agent.discussion.trigger missing discussionId/agentId', { data: event.data })
    return
  }

  const {
    discussionId,
    participantId: explicitParticipantId,
    agentId,
    userId: discussionOwnerId,
    comment,
    isInitialParticipation,
  } = trigger

  try {
    const agent = await deps.agentIntelligenceService.getAgent(agentId)
    if (!agent) {
      logger.error('agent.discussion.trigger: agent not found', { discussionId, agentId })
      await publishAgentMessageFailure(deps, {
        discussionId,
        agentId,
        error: 'Agent not found in database',
      })
      return
    }

    const participantId = explicitParticipantId || await resolveParticipantId(deps.databaseService, discussionId, agentId)
    if (!participantId) {
      logger.error('agent.discussion.trigger: participant not found for agent', {
        discussionId,
        agentId,
      })
      await publishAgentMessageFailure(deps, {
        discussionId,
        agentId,
        error: 'Participant identity not found for agent',
      })
      return
    }

    const messages: ChatMessage[] = [
      {
        id: `turn_${Date.now()}`,
        content: comment || `Contribute to the discussion.`,
        sender: 'system',
        timestamp: new Date().toISOString(),
        type: 'user',
      },
    ]

    const request: AgentResponseRequest = {
      agent: {
        id: typeof agent.id === 'string' && agent.id ? agent.id : agentId,
        name: agent.name,
        role: String(agent.role),
        modelId: typeof agent.modelId === 'string' ? agent.modelId : undefined,
        apiType: typeof agent.apiType === 'string' ? agent.apiType : undefined,
        userLLMProviderId:
          typeof agent.userLLMProviderId === 'string' ? agent.userLLMProviderId : undefined,
        temperature: typeof agent.temperature === 'number' ? agent.temperature : undefined,
        maxTokens: typeof agent.maxTokens === 'number' ? agent.maxTokens : undefined,
        systemPrompt: typeof agent.systemPrompt === 'string' ? agent.systemPrompt : undefined,
        configuration: isRecord(agent.configuration) ? agent.configuration : undefined,
        persona: isRecord(agent.persona)
          ? {
              ...agent.persona,
              description:
                typeof agent.persona.description === 'string' ? agent.persona.description : undefined,
              capabilities: Array.isArray(agent.persona.capabilities)
                ? agent.persona.capabilities.filter((item): item is string => typeof item === 'string')
                : undefined,
            }
          : undefined,
      },
      messages,
    }

    const userId = discussionOwnerId || (typeof agent.createdBy === 'string' ? agent.createdBy : '')
    const response = await deps.userLLMService.generateAgentResponse(userId, request)
    if (response.error || response.finishReason === 'error') {
      logger.error('agent.discussion.trigger: LLM failed, suppressing fallback content', {
        discussionId,
        agentId,
        model: response.model,
        error: response.error,
      })
      await publishAgentMessageFailure(deps, {
        discussionId,
        participantId,
        agentId,
        error: response.error || 'LLM response finished with error',
        model: response.model,
      })
      return
    }

    const content = extractContent(response)

    if (!content) {
      logger.error('agent.discussion.trigger: LLM returned empty content', { discussionId, agentId })
      await publishAgentMessageFailure(deps, {
        discussionId,
        participantId,
        agentId,
        error: 'LLM returned empty content',
        model: response.model,
      })
      return
    }

    await deps.publish('discussion.agent.message', {
      discussionId,
      participantId,
      agentId,
      content,
      messageType: 'message',
      isInitialParticipation,
    })

    logger.info('agent.discussion.trigger: agent response published', {
      discussionId,
      agentId,
      participantId,
      contentLength: content.length,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('agent.discussion.trigger: failed to generate agent response', {
      discussionId,
      agentId,
      participantId: explicitParticipantId,
      error: errorMessage,
    })
    await publishAgentMessageFailure(deps, {
      discussionId,
      participantId: explicitParticipantId,
      agentId,
      error: errorMessage,
    })
  }
}
