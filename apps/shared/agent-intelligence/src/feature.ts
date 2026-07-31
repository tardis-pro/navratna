import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import {
  AgentIntelligenceService,
  CapabilityDiscoveryService,
  DatabaseService,
  SecurityService,
  ServiceFactory,
  ToolService,
  UnifiedModelSelectionFacade,
} from '@uaip/shared-services'
import type { EventBusService } from '@uaip/shared-services/event-bus'
import { UserLLMService } from '@uaip/llm-service'
import { logger } from '@uaip/utils'
import type { EventBusMessage } from '@uaip/types'

import { handleAgentDiscussionTrigger } from './events/discussion_agent_turn_handler.js'

import { registerAgentCapabilityRoutes } from './routes/agent_capability_routes.js'
import { registerAgentChatRoutes } from './routes/agent_chat_routes.js'
import { registerAgentCrudRoutes } from './routes/agents_crud_routes.js'
import { registerAgentMemoryRoutes } from './routes/agent_memory_routes.js'
import { registerAgentRoutes } from './routes/agent_routes.js'
import { registerCognitivePortraitRoutes } from './routes/cognitive_portrait_routes.js'
import { registerConstellationRoutes } from './routes/constellation_routes.js'
import { MemoryConsolidationScheduler } from './services/memory_consolidation_scheduler.js'
import type { ToolSchemaProvider } from './routes/agent_chat_routes.js'

const loadToolSchema: ToolSchemaProvider = async (toolId) => {
  try {
    const tool = await ToolService.getInstance().findToolById(toolId)
    if (!tool) return null

    const description = typeof tool.description === 'string' ? tool.description : ''
    const parameters =
      typeof tool.parameters === 'object' && tool.parameters !== null
        ? (tool.parameters as Record<string, unknown>)
        : { type: 'object', properties: {} }

    return { description, parameters }
  } catch (error) {
    logger.warn('Failed to load tool schema for agent binding', { toolId, error })
    return null
  }
}

let agentIntelligenceService: AgentIntelligenceService
let capabilityDiscoveryService: CapabilityDiscoveryService
let userLLMService: UserLLMService
let securityService: SecurityService
let semanticMemoryManager: Awaited<ReturnType<ServiceFactory['getSemanticMemoryManager']>>
let memoryConsolidationScheduler: MemoryConsolidationScheduler
let databaseServiceRef: DatabaseService

export const agentIntelligenceFeature: Feature = {
  name: 'agent-intelligence',

  async initialize(deps: ServiceDeps): Promise<void> {
    const databaseService = DatabaseService.getInstance()
    await databaseService.initialize()
    databaseServiceRef = databaseService
    agentIntelligenceService = new AgentIntelligenceService(databaseService, deps.eventBusService)
    await agentIntelligenceService.initialize()
    capabilityDiscoveryService = new CapabilityDiscoveryService(databaseService)
    userLLMService = new UserLLMService(new UnifiedModelSelectionFacade())
    userLLMService.setToolExecutionBus(deps.eventBusService)
    securityService = SecurityService.getInstance()
    const factory = ServiceFactory.getInstance()
    semanticMemoryManager = await factory.getSemanticMemoryManager()

    const [memoryConsolidator, workingMemoryManager] = await Promise.all([
      factory.getMemoryConsolidator(),
      factory.getWorkingMemoryManager(),
    ])
    memoryConsolidationScheduler = new MemoryConsolidationScheduler(
      memoryConsolidator,
      workingMemoryManager
    )
    memoryConsolidationScheduler.start()

    logger.info('agent-intelligence feature initialized')
  },

  routes(app) {
    app.use(registerAgentCrudRoutes(agentIntelligenceService))
    app.use(
      registerAgentChatRoutes(
        agentIntelligenceService,
        userLLMService,
        securityService,
        loadToolSchema
      )
    )
    app.use(registerAgentCapabilityRoutes(agentIntelligenceService, capabilityDiscoveryService))
    app.use(registerAgentMemoryRoutes(semanticMemoryManager))
    app.use(registerAgentRoutes())
    app.use(registerCognitivePortraitRoutes())
    app.use(registerConstellationRoutes())
    return app
  },

  async events(bus: EventBusService): Promise<void> {
    await bus.subscribe('agent.discussion.trigger', async (event: EventBusMessage) => {
      await handleAgentDiscussionTrigger(event, {
        agentIntelligenceService,
        userLLMService,
        databaseService: databaseServiceRef,
        publish: (topic, payload) => bus.publish(topic, payload),
      })
    })
    logger.info('agent-intelligence event subscriptions configured (agent.discussion.trigger)')
  },

  async shutdown(): Promise<void> {
    memoryConsolidationScheduler?.stop()
  },
}
