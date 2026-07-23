import type { AgentIntelligenceService, DatabaseService } from '@uaip/shared-services'
import type { UserLLMService } from '@uaip/llm-service'
import type { AgentResponseRequest, ChatMessage, EventBusMessage } from '@uaip/types'
import { logger, isRecord } from '@uaip/utils'

type TriggerParams = {
  discussionId: string
  agentId: string
  comment: string
  isInitialParticipation: boolean
}

function parseTrigger(event: EventBusMessage): TriggerParams | null {
  const root: unknown = isRecord(event.data) ? event.data : event
  const outer = isRecord(root) ? root : {}
  const params = isRecord(outer.params) ? outer.params : outer
  const discussionId = typeof params.discussionId === 'string' ? params.discussionId : ''
  const agentId = typeof params.agentId === 'string' ? params.agentId : ''
  const comment = typeof params.comment === 'string' ? params.comment : ''
  const isInitialParticipation = params.isInitialParticipation === true
  if (!discussionId || !agentId) return null
  return { discussionId, agentId, comment, isInitialParticipation }
}

type ParticipantRow = { id: string; discussionId?: string; agentId?: string }

async function resolveParticipantId(
  databaseService: DatabaseService,
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
  databaseService: DatabaseService
  publish: (topic: string, payload: Record<string, unknown>) => Promise<void>
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

  const { discussionId, agentId, comment, isInitialParticipation } = trigger

  try {
    const agent = await deps.agentIntelligenceService.getAgent(agentId)
    if (!agent) {
      logger.error('agent.discussion.trigger: agent not found', { discussionId, agentId })
      return
    }

    const participantId = await resolveParticipantId(deps.databaseService, discussionId, agentId)
    if (!participantId) {
      logger.error('agent.discussion.trigger: participant not found for agent', {
        discussionId,
        agentId,
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
        id: agent.id,
        name: agent.name,
        role: String(agent.role),
        modelId: typeof agent.modelId === 'string' ? agent.modelId : undefined,
        apiType: typeof agent.apiType === 'string' ? agent.apiType : undefined,
        temperature: typeof agent.temperature === 'number' ? agent.temperature : undefined,
        maxTokens: typeof agent.maxTokens === 'number' ? agent.maxTokens : undefined,
        systemPrompt: typeof agent.systemPrompt === 'string' ? agent.systemPrompt : undefined,
        configuration: isRecord(agent.configuration) ? agent.configuration : undefined,
        persona: isRecord(agent.persona)
          ? {
              description:
                typeof agent.persona.description === 'string' ? agent.persona.description : undefined,
            }
          : undefined,
      },
      messages,
    }

    const userId = typeof agent.createdBy === 'string' ? agent.createdBy : ''
    const response = await deps.userLLMService.generateAgentResponse(userId, request)
    const content = extractContent(response)

    if (!content) {
      logger.error('agent.discussion.trigger: LLM returned empty content', { discussionId, agentId })
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
    logger.error('agent.discussion.trigger: failed to generate agent response', {
      discussionId,
      agentId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
