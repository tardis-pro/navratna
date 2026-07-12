import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import type { EventBusService } from '@uaip/shared-services/event-bus'
import type { PersonaService } from '@uaip/shared-services'
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
let personaService: PersonaService | undefined

/**
 * Lazily construct a PersonaService to resolve a persona's systemPrompt for
 * workflow agent-action steps. Mirrors the construction in
 * DatabaseService.getDiscussionService (shared-services) so persona resolution
 * runs in the intelligence plane (navratna-core) where the persona table lives.
 */
async function getPersonaService(bus: EventBusService): Promise<PersonaService> {
  if (!personaService) {
    const { PersonaService: PersonaServiceImpl } = await import('@uaip/shared-services')
    const { DatabaseService } = await import('@uaip/infra/database')
    personaService = new PersonaServiceImpl({
      databaseService: DatabaseService.getInstance(),
      eventBusService: bus,
      enableAnalytics: false,
      enableRecommendations: false,
      enableCaching: true,
    })
  }
  return personaService
}


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

    // RPC responder for workflow `agent-action` steps (StepExecutorService.executeAgentAction).
    // The caller uses publishAndWaitForResponse, so we MUST reply on the shared
    // 'rpc.replies' channel with the inbound correlationId and the { data } / { error }
    // envelope (same contract the tool coordinator uses).
    await bus.subscribe('llm.step.generate.request', async (event: EventBusMessage) => {
      const correlationId = event.correlationId
      const data: Record<string, unknown> = isRecord(event.data) ? event.data : {}
      const prompt = typeof data.prompt === 'string' ? data.prompt : ''
      const model = typeof data.model === 'string' ? data.model : undefined
      const agentId = typeof data.agentId === 'string' ? data.agentId : undefined
      let systemPrompt = typeof data.systemPrompt === 'string' ? data.systemPrompt : undefined

      try {
        if (!prompt) {
          throw new Error('prompt is required for llm.step.generate.request')
        }

        // Resolve the persona's systemPrompt when the step referenced a persona
        // and did not carry an explicit systemPrompt.
        if (!systemPrompt && agentId) {
          const svc = await getPersonaService(bus)
          let persona = await svc.getPersona(agentId)
          if (!persona) {
            // agentId may be a persona NAME, not an id — OpenClaw workflows reference
            // agents by name (e.g. "growth"). Fall back to an exact name match.
            const found = await svc.searchPersonas({ query: agentId }, 5)
            persona = found.personas.find((p) => p.name === agentId) ?? null
          }
          if (persona?.systemPrompt) {
            systemPrompt = persona.systemPrompt
          }
        }

        const response = await llmService.generateResponse({ prompt, systemPrompt, model }, undefined, 'agent')

        if (response.error) {
          throw new Error(response.error)
        }

        if (correlationId) {
          await bus.publish(
            'rpc.replies',
            {
              data: {
                content: response.content,
                model: response.model,
                finishReason: response.finishReason,
                tokensUsed: response.tokensUsed,
              },
            },
            { correlationId }
          )
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'LLM agent action failed'
        logger.error('llm.step.generate.request handler failed', { correlationId, agentId, error: message })
        if (correlationId) {
          await bus
            .publish('rpc.replies', { error: { code: 'LLM_AGENT_ACTION_FAILED', message } }, { correlationId })
            .catch(() => undefined)
        }
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
