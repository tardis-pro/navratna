import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import type { EventBusService } from '@uaip/shared-services/event-bus'
import type { EventBusMessage } from '@uaip/types'
import { UnifiedModelSelectionFacade } from '@uaip/shared-services'
import { LLMService, UserLLMService, ModelBootstrapService } from '@uaip/llm-service'
import type { ArtifactRequest } from '@uaip/types'
import { logger, isRecord } from '@uaip/utils'

import { registerLLMRoutes } from './routes/llm_routes.js'
import { registerUserLLMRoutes } from './routes/user_llm_routes.js'
import { AgentGenerationHandler } from './handlers/agent_generation_handler.js'

let llmService: LLMService
let userLLMService: UserLLMService
let modelBootstrapService: ModelBootstrapService
let agentGenerationHandler: AgentGenerationHandler


function extractRequestId(event: EventBusMessage): string | undefined {
  if (typeof event.correlationId === 'string') return event.correlationId
  if (isRecord(event.metadata) && typeof event.metadata.requestId === 'string') {
    return event.metadata.requestId
  }
  return undefined
}

export const llmFeature: Feature = {
  name: 'llm-service',

  async initialize(deps: ServiceDeps): Promise<void> {
    const modelSelectionFacade = new UnifiedModelSelectionFacade()
    llmService = LLMService.getInstance()
    userLLMService = new UserLLMService(modelSelectionFacade)
    modelBootstrapService = ModelBootstrapService.getInstance()
    agentGenerationHandler = new AgentGenerationHandler(
      userLLMService,
      llmService,
      deps.eventBusService
    )
    logger.info('llm-service feature initialized')
  },

  routes(app) {
    app.use(registerLLMRoutes(llmService, modelBootstrapService, userLLMService))
    app.use(registerUserLLMRoutes(userLLMService))
    return app
  },

  async events(bus: EventBusService): Promise<void> {
    await bus.subscribe('llm.generate.request', async (event: EventBusMessage) => {
      const requestId = extractRequestId(event)
      const rawData: unknown = isRecord(event.data) ? event.data : event

      try {
        const data: Record<string, unknown> = isRecord(rawData) ? rawData : {}
        const artifactType = typeof data.artifactType === 'string' ? data.artifactType : 'code'
        const contextData: unknown = data.context
        const contextStr = typeof contextData === 'string'
          ? contextData
          : JSON.stringify(contextData ?? {})

        const optionsData: unknown = data.options
        const options = isRecord(optionsData) ? optionsData : {}

        const artifactRequest: ArtifactRequest = {
          type: artifactType as ArtifactRequest['type'],
          language: typeof options.language === 'string' ? options.language : undefined,
          context: contextStr,
          requirements: [],
        }

        const response = await llmService.generateArtifact(artifactRequest)

        await bus.publish('llm.generate.response', {
          success: true,
          content: response.content,
          metadata: { requestId, artifactType, model: response.model },
        }, { metadata: { requestId } })
      } catch (error) {
        logger.error('llm.generate.request handler failed', {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        })
        await bus.publish('llm.generate.response', {
          success: false,
          error: {
            code: 'LLM_GENERATION_FAILED',
            message: error instanceof Error ? error.message : 'LLM generation failed',
          },
        }, { metadata: { requestId } }).catch(() => undefined)
      }
    })

    await bus.subscribe('llm.agent.generate.request', async (event: EventBusMessage) => {
      const data = isRecord(event.data) ? event.data : {}
      await agentGenerationHandler.handle({ ...data, correlationId: event.correlationId })
    })

    await bus.subscribe('llm.provider.changed', async (_event: EventBusMessage) => {
      try {
        await modelBootstrapService.bootstrapAllModels({ force: true })
        logger.info('LLM model catalog refreshed after provider change')
      } catch (error) {
        logger.error('Failed to refresh model catalog', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    logger.info('llm-service event subscriptions configured')
  },
}
