import type { Feature, ServiceDeps, MinimalWebSocketServer } from '@uaip/shared-services/feature-factory'
import type { EventBusService } from '@uaip/shared-services/event-bus'
import type { EventBusMessage } from '@uaip/types'
import { PersonaService } from '@uaip/shared-services/persona'
import { DiscussionService } from '@uaip/shared-services/discussion'
import { getDatabaseConnectionString } from '@uaip/shared-services'
import { DatabaseService } from '@uaip/infra/database'
import { logger } from '@uaip/utils'
import { Server as SocketIOServer } from 'socket.io'

import { DiscussionOrchestrationService } from './services/discussion_orchestration_service.js'
import { UserChatHandler } from './websocket/user_chat_handler.js'
import { ConversationIntelligenceHandler } from './websocket/conversation_intelligence_handler.js'
import { TaskNotificationHandler } from './websocket/task_notification_handler.js'
import { StreamingHandler } from './websocket/streaming_handler.js'
import { CodingAgentSocketHandler } from './websocket/coding_agent_socket_handler.js'
import { setupWebSocketHandlers } from './websocket/discussion_socket.js'
import { DebateHandler } from './handlers/debate_handler.js'
import { WhatsAppHandler } from './whatsapp/whatsapp_handler.js'
import { registerPersonaRoutes } from './routes/persona_routes.js'
import { registerDiscussionRoutes } from './routes/discussion_routes.js'

// Module-level state captured during initialize()
let capturedEventBus: EventBusService
let personaService: PersonaService
let discussionService: DiscussionService
let orchestrationService: DiscussionOrchestrationService

export const discussionFeature: Feature = {
  name: 'discussion-orchestration',

  async initialize(deps: ServiceDeps): Promise<void> {
    capturedEventBus = deps.eventBusService
    const dbService = DatabaseService.getInstance()

    personaService = new PersonaService({
      databaseService: dbService,
      eventBusService: deps.eventBusService,
      cacheConfig: {
        redis: getDatabaseConnectionString('discussion-orchestration', 'redis', 'redis-application'),
        ttl: 300,
        securityLevel: 3,
      },
    })

    discussionService = new DiscussionService({
      databaseService: dbService,
      eventBusService: deps.eventBusService,
      personaService,
      enableRealTimeEvents: true,
      enableAnalytics: false,
      auditMode: 'comprehensive',
    })

    orchestrationService = new DiscussionOrchestrationService(
      discussionService,
      deps.eventBusService
    )

    logger.info('discussion-orchestration feature initialized')
  },

  routes(app) {
    app.use(registerPersonaRoutes(personaService))
    app.use(registerDiscussionRoutes(discussionService, orchestrationService))
    return app
  },

  async events(bus: EventBusService): Promise<void> {
    await bus.subscribe('discussion.agent.message', async (event: EventBusMessage) => {
      try {
        const isRecord = (v: unknown): v is Record<string, unknown> =>
          typeof v === 'object' && v !== null && !Array.isArray(v)
        const rawPayload: unknown = isRecord(event.data) ? event.data : event
        const payload = isRecord(rawPayload) ? rawPayload : {}
        const discussionId = typeof payload.discussionId === 'string' ? payload.discussionId : ''
        const participantId = typeof payload.participantId === 'string' ? payload.participantId : ''
        const agentId = typeof payload.agentId === 'string' ? payload.agentId : undefined
        const content = typeof payload.content === 'string' ? payload.content : ''
        const messageType = typeof payload.messageType === 'string' ? payload.messageType : undefined
        const metadata = isRecord(payload.metadata) ? payload.metadata : undefined
        const isInitialParticipation = payload.isInitialParticipation === true

        const mergedMetadata = {
          ...(metadata || {}),
          ...(isInitialParticipation === true ? { isInitialParticipation: true } : {}),
        }

        const result = await orchestrationService.sendMessage(
          discussionId,
          participantId,
          content,
          messageType || 'message',
          mergedMetadata
        )

        if (!result.success) {
          logger.error('Failed to send agent message to discussion', {
            discussionId,
            agentId,
            participantId,
            error: result.error,
          })
        }
      } catch (error) {
        logger.error('Error processing agent message event', {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    logger.info('discussion-orchestration event subscriptions configured')
  },

  websocket(io: MinimalWebSocketServer): void {
    const socketIO = io as SocketIOServer

    new UserChatHandler(socketIO, capturedEventBus)

    try {
      new ConversationIntelligenceHandler(socketIO, capturedEventBus)
    } catch (error) {
      logger.error('Failed to initialize ConversationIntelligenceHandler:', error)
    }

    try {
      new TaskNotificationHandler(socketIO, capturedEventBus)
    } catch (error) {
      logger.error('Failed to initialize TaskNotificationHandler:', error)
    }

    try {
      new StreamingHandler(socketIO, capturedEventBus)
    } catch (error) {
      logger.error('Failed to initialize StreamingHandler:', error)
    }

    try {
      new CodingAgentSocketHandler(socketIO, capturedEventBus)
    } catch (error) {
      logger.error('Failed to initialize CodingAgentSocketHandler:', error)
    }

    try {
      new WhatsAppHandler(socketIO, capturedEventBus)
    } catch (error) {
      logger.error('Failed to initialize WhatsAppHandler:', error)
    }

    try {
      new DebateHandler(socketIO, capturedEventBus)
    } catch (error) {
      logger.error('Failed to initialize DebateHandler:', error)
    }

    try {
      setupWebSocketHandlers(socketIO, orchestrationService)
    } catch (error) {
      logger.error('Failed to initialize discussion WebSocket handlers:', error)
    }

    logger.info('discussion-orchestration WebSocket handlers initialized')
  },
}
