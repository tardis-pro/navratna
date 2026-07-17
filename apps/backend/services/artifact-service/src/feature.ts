import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import type { EventBusService } from '@uaip/shared-services/event-bus'
import type { EventBusMessage } from '@uaip/types'
import type {
  ArtifactGenerationRequest,
  ArtifactConversationContext,
  ConversationMessage,
  Participant,
} from '@uaip/types'
import { logger, isRecord } from '@uaip/utils'

import { ArtifactService } from './artifact_service.js'
import { registerArtifactRoutes } from './routes/artifact_routes.js'
import { registerShortLinkRoutes } from './routes/short_link_routes.js'

let artifactService: ArtifactService

export const artifactFeature: Feature = {
  name: 'artifact-service',

  async initialize(deps: ServiceDeps): Promise<void> {
    artifactService = new ArtifactService(deps.eventBusService)
    await artifactService.initialize()
    logger.info('artifact-service feature initialized')
  },

  routes(app) {
    app.use(registerArtifactRoutes(artifactService))
    app.use(registerShortLinkRoutes())
    return app
  },

  async events(bus: EventBusService): Promise<void> {
    await bus.subscribe('discussion.completed', async (event: EventBusMessage) => {
      const rawData: unknown = isRecord(event.data) ? event.data : event
      const data: Record<string, unknown> = isRecord(rawData) ? rawData : {}

      const discussionId = typeof data.discussionId === 'string' ? data.discussionId : 'unknown'
      const discussion = isRecord(data.discussion) ? data.discussion : {}
      const artifactGeneration = isRecord(data.artifactGeneration) ? data.artifactGeneration : {}

      if (artifactGeneration.generateOnCompletion === false) {
        logger.info('artifact-service: skipping generation, generateOnCompletion=false', { discussionId })
        return
      }

      const rawParticipants = Array.isArray(data.participants) ? data.participants : []

      const participants: Participant[] = rawParticipants.filter(isRecord).map((p) => ({
        id: typeof p.id === 'string' ? p.id : '',
        name: typeof (p.agentId ?? p.userId) === 'string' ? String(p.agentId ?? p.userId) : 'unknown',
        role: typeof p.role === 'string' ? p.role : 'participant',
        type: typeof p.agentId === 'string' ? ('agent' as const) : ('human' as const),
      }))
      const roleById = new Map<string, 'user' | 'assistant'>()
      for (const p of rawParticipants.filter(isRecord)) {
        if (typeof p.id === 'string') {
          roleById.set(p.id, typeof p.agentId === 'string' ? 'assistant' : 'user')
        }
      }

      const rawMessages = Array.isArray(data.messages) ? data.messages : []
      const messages: ConversationMessage[] = rawMessages.filter(isRecord).map((m) => {
        const participantId = typeof m.participantId === 'string' ? m.participantId : ''
        return {
          id: typeof m.id === 'string' ? m.id : '',
          content: typeof m.content === 'string' ? m.content : '',
          role: roleById.get(participantId) ?? 'assistant',
          timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(String(m.timestamp ?? '')),
          metadata: isRecord(m.metadata) ? m.metadata : undefined,
        }
      })

      const suggestedType =
        typeof artifactGeneration.suggestedType === 'string' ? artifactGeneration.suggestedType : 'analysis'

      const firstAgent = rawParticipants.filter(isRecord).find((p) => typeof p.agentId === 'string')

      const context: ArtifactConversationContext = {
        conversationId: discussionId,
        messages,
        participants,
        topics: [],
        decisions: [],
        actionItems: [],
        discussion: {
          id: typeof discussion.id === 'string' ? discussion.id : discussionId,
          messages,
          participants,
        },
        agent: firstAgent && typeof firstAgent.agentId === 'string' ? { id: firstAgent.agentId } : undefined,
        metadata: isRecord(artifactGeneration.metadata) ? artifactGeneration.metadata : undefined,
      }

      const request: ArtifactGenerationRequest = {
        type: suggestedType as ArtifactGenerationRequest['type'],
        context,
        metadata: {
          triggeredBy: 'discussion.completed',
          discussionId,
          completionReason:
            typeof discussion.completionReason === 'string' ? discussion.completionReason : undefined,
          priority: artifactGeneration.priority,
        },
      }

      try {
        logger.info('artifact-service: generating artifact from discussion.completed', {
          discussionId,
          suggestedType,
        })
        const response = await artifactService.generateArtifact(request)

        if (response.success) {
          await bus.publish('artifact.generated', {
            discussionId,
            artifact: response.artifact,
            metadata: response.metadata,
          })
          logger.info('artifact-service: artifact.generated published', { discussionId })
        } else {
          await bus
            .publish('artifact.generation.failed', { discussionId, error: response.error })
            .catch(() => undefined)
          logger.warn('artifact-service: generation returned failure', { discussionId, error: response.error })
        }
      } catch (error) {
        logger.error('artifact-service: discussion.completed handler threw', {
          discussionId,
          error: error instanceof Error ? error.message : String(error),
        })
        await bus
          .publish('artifact.generation.failed', {
            discussionId,
            error: {
              code: 'HANDLER_EXCEPTION',
              message: error instanceof Error ? error.message : 'Unknown error',
            },
          })
          .catch(() => undefined)
      }
    })

    logger.info('artifact-service event subscriptions configured')
  },
}
