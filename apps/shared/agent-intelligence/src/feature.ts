import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import {
  agentChatPersistenceService,
  AgentIntelligenceService,
  BackfillUserAgentAssignments,
  CapabilityDiscoveryService,
  DatabaseService,
  EnsureOnboardingGuide,
  EnsureOnboardingSchema,
  EnsureAgentChatThreads,
  McpConnectionResolver,
  SecurityService,
  ServiceFactory,
  setOnboardingLLMGateway,
  ToolService,
  UnifiedModelSelectionFacade,
} from '@uaip/shared-services'
import type { EventBusService } from '@uaip/shared-services/event-bus'
import { llmService, UserLLMService } from '@uaip/llm-service'
import { logger } from '@uaip/utils'
import type { EventBusMessage } from '@uaip/types'

import { handleAgentDiscussionTrigger } from './events/discussion_agent_turn_handler.js'

import { registerAgentCapabilityRoutes } from './routes/agent_capability_routes.js'
import { registerAgentChatRoutes } from './routes/agent_chat_routes.js'
import { registerAgentCrudRoutes } from './routes/agents_crud_routes.js'
import { registerOnboardingRoutes } from './routes/onboarding_routes.js'
import { registerAgentMemoryRoutes } from './routes/agent_memory_routes.js'
import { registerAgentRoutes } from './routes/agent_routes.js'
import { registerCognitivePortraitRoutes } from './routes/cognitive_portrait_routes.js'
import { registerConstellationRoutes } from './routes/constellation_routes.js'
import { MemoryConsolidationScheduler } from './services/memory_consolidation_scheduler.js'
import type { ProjectToolScopeProvider, ToolSchemaProvider } from './routes/agent_chat_routes.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const projectToolScope: ProjectToolScopeProvider = {
  async listIntegrationServerKeys() {
    const servers = await McpConnectionResolver.getInstance().listIntegrationServers()
    return servers
      .filter((server) => server.credentialMode === 'caller_connection')
      .map((server) => server.serverKey)
  },
  async listBoundServerKeys(projectId, agentId) {
    return await McpConnectionResolver.getInstance().listBoundServerKeys(projectId, agentId)
  },
}

const loadToolSchema: ToolSchemaProvider = async (toolId) => {
  try {
    // Mirrors UnifiedToolRegistry.executeTool's resolution: MCP-discovered bindings
    // carry a semantic `mcp-<server>-<tool>` id, not the row's generated uuid, and
    // findToolById throws on a non-uuid value. Resolving by name here is what keeps
    // a discovered tool visible to the LLM instead of being silently dropped.
    const service = ToolService.getInstance()
    const tool = UUID_PATTERN.test(toolId)
      ? await service.findToolById(toolId)
      : await service.findToolByName(toolId)
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

    // shared-services cannot import @uaip/llm-service (that package depends on
    // it), so the onboarding extractor declares a port and this feature — which
    // legitimately owns both — supplies the adapter.
    const onboardingLLM = userLLMService
    setOnboardingLLMGateway({
      generateForUser: (userId, request) => onboardingLLM.generateResponse(userId, request),
      generateOnPlatform: (request) => llmService.generateResponse(request, undefined, 'global'),
    })
    // Runs on EVERY boot including production, like OAuthProviderSeed in
    // security-gateway, because DatabaseSeeder.seedAll() refuses to run in
    // production. Order is load-bearing: the schema owns the tables the other
    // two write to; the guide must exist because agent_chat_conversations.agent_id
    // FKs agents.id, so without it the first interview turn dies on an FK
    // violation; the backfill follows because GET /agents now returns assigned
    // agents only, so every pre-existing user would otherwise see an empty
    // roster. All four are idempotent; a failure must not take the service down.
    try {
      await new EnsureOnboardingSchema().run()
      await new EnsureAgentChatThreads().run()
      await new EnsureOnboardingGuide().run()
      await new BackfillUserAgentAssignments().run()
    } catch (err) {
      logger.error('agent-intelligence: onboarding provisioning failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

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
    app.use(registerOnboardingRoutes())
    app.use(
      registerAgentChatRoutes(
        agentIntelligenceService,
        userLLMService,
        securityService,
        loadToolSchema,
        projectToolScope,
        agentChatPersistenceService
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
