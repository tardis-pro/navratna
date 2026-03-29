import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import {
  AgentIntelligenceService,
  CapabilityDiscoveryService,
  DatabaseService,
  SecurityService,
  ServiceFactory,
  UnifiedModelSelectionFacade,
} from '@uaip/shared-services'
import { UserLLMService } from '@uaip/llm-service'
import { logger } from '@uaip/utils'

import { registerAgentCapabilityRoutes } from './routes/agent_capability_routes.js'
import { registerAgentChatRoutes } from './routes/agent_chat_routes.js'
import { registerAgentCrudRoutes } from './routes/agents_crud_routes.js'
import { registerAgentMemoryRoutes } from './routes/agent_memory_routes.js'
import { registerAgentRoutes } from './routes/agent_routes.js'
import { registerConstellationRoutes } from './routes/constellation_routes.js'

let agentIntelligenceService: AgentIntelligenceService
let capabilityDiscoveryService: CapabilityDiscoveryService
let userLLMService: UserLLMService
let securityService: SecurityService
let semanticMemoryManager: Awaited<ReturnType<ServiceFactory['getSemanticMemoryManager']>>

export const agentIntelligenceFeature: Feature = {
  name: 'agent-intelligence',

  async initialize(deps: ServiceDeps): Promise<void> {
    const databaseService = DatabaseService.getInstance()
    await databaseService.initialize()
    agentIntelligenceService = new AgentIntelligenceService(databaseService, deps.eventBusService)
    await agentIntelligenceService.initialize()
    capabilityDiscoveryService = new CapabilityDiscoveryService(databaseService)
    userLLMService = new UserLLMService(new UnifiedModelSelectionFacade())
    securityService = SecurityService.getInstance()
    semanticMemoryManager = await ServiceFactory.getInstance().getSemanticMemoryManager()
    logger.info('agent-intelligence feature initialized')
  },

  routes(app) {
    registerAgentCrudRoutes(
      app as unknown as Parameters<typeof registerAgentCrudRoutes>[0],
      agentIntelligenceService
    )
    registerAgentChatRoutes(
      app as unknown as Parameters<typeof registerAgentChatRoutes>[0],
      agentIntelligenceService,
      userLLMService,
      securityService
    )
    registerAgentCapabilityRoutes(
      app as unknown as Parameters<typeof registerAgentCapabilityRoutes>[0],
      agentIntelligenceService,
      capabilityDiscoveryService
    )
    registerAgentMemoryRoutes(
      app as unknown as Parameters<typeof registerAgentMemoryRoutes>[0],
      semanticMemoryManager
    )
    registerAgentRoutes(app as unknown as Parameters<typeof registerAgentRoutes>[0])
    registerConstellationRoutes(app as unknown as Parameters<typeof registerConstellationRoutes>[0])
    return app
  },
}
