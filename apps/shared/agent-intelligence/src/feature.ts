import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import {
  agentChatPersistenceService,
  AgentIntelligenceService,
  BackfillUserAgentAssignments,
  CapabilityDiscoveryService,
  DatabaseService,
  EnsureDefaultAgentTools,
  EnsureOnboardingGuide,
  EnsureOnboardingSchema,
  EnsureAgentChatThreads,
  EnsureAgentChatProjects,
  McpConnectionResolver,
  ProjectManagementService,
  readProjectChatSettings,
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
import type {
  KnowledgeContextProvider,
  ProjectAccessProvider,
  ProjectChatContextProvider,
  ProjectToolScopeProvider,
  ToolSchemaProvider,
} from './routes/agent_chat_routes.js'

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

/**
 * The cross-plane guard for filing a thread under a project: projects live in
 * control, threads in intelligence, so nothing at the database level can reject
 * an id that does not resolve.
 *
 * getProject(id, userId) already answers both halves — it returns null when the
 * project does not exist AND when the caller is neither its owner nor a member —
 * so reusing it keeps one definition of project access rather than a second copy
 * of the owner-or-member rule that could drift from it.
 */
const projectAccess: ProjectAccessProvider = {
  async canUseProject({ projectId, userId }) {
    const service = new ProjectManagementService(databaseServiceRef)
    await service.initialize()

    // Ownership or membership IS the grant — organizationId is not compared
    // because ProjectEntity does not expose it, and a member row is issued per
    // user anyway, so there is no path to a project without one.
    return (await service.getProject(projectId, userId)) !== null
  },
}

/**
 * Reads the instructions every thread in a project inherits.
 *
 * Deliberately does NOT take the caller's identity: by the time a turn reaches
 * here the thread's project has already been authorized — either when the thread
 * was filed under it, or by the PATCH that moved it there — so re-checking would
 * only add a second control-plane round trip per turn.
 */
const projectChatContext: ProjectChatContextProvider = {
  async getInstructions(projectId) {
    const service = new ProjectManagementService(databaseServiceRef)
    await service.initialize()
    const project = await service.getProject(projectId)
    return project ? readProjectChatSettings(project.settings).instructions : null
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

/**
 * Grounds each chat turn in the knowledge graph. ContextOrchestrationService
 * already does layered retrieval (agent → user → general), ranking, and token
 * budgeting; this adapter only shapes its output into one context document.
 * organizationId is the AUTHENTICATED caller's org (from the gateway headers),
 * never a model- or client-supplied value — it is the tenant filter for the
 * vector search.
 */
const buildKnowledgeContextProvider = (
  factory: ServiceFactory
): KnowledgeContextProvider => async ({ query, agentId, userId, organizationId }) => {
  const orchestrator = await factory.getContextOrchestrationService()
  const result = await orchestrator.getOrchestatedContext(query, agentId, userId, {
    organizationId,
    similarityThreshold: 0.55,
  })

  if (result.items.length === 0) return null

  const sections = result.items.map((item) => {
    const source = item.sourceIdentifier ? ` (source: ${item.sourceIdentifier})` : ''
    return `•${source ? source + '\n' : ''}${item.content}`
  })

  logger.info('Knowledge context retrieved for chat turn', {
    agentId,
    itemCount: result.items.length,
    layerBreakdown: result.layerBreakdown,
    totalTokens: result.totalTokens,
  })

  return {
    title: 'Relevant knowledge',
    content: sections.join('\n\n'),
  }
}

let knowledgeContextProvider: KnowledgeContextProvider
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
      // After the thread schema, never before: it adds a column to the table
      // that migration creates the thread identity on.
      await new EnsureAgentChatProjects().run()
      await new EnsureOnboardingGuide().run()
      await new BackfillUserAgentAssignments().run()
      // After the guide exists (it is excluded by id): give every active agent
      // the safe built-in tools, otherwise runWithTools short-circuits on the
      // empty binding list and no agent can ever call anything.
      await new EnsureDefaultAgentTools().run()
    } catch (err) {
      logger.error('agent-intelligence: onboarding provisioning failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    securityService = SecurityService.getInstance()
    const factory = ServiceFactory.getInstance()
    knowledgeContextProvider = buildKnowledgeContextProvider(factory)
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
        agentChatPersistenceService,
        knowledgeContextProvider,
        projectAccess,
        projectChatContext
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
    /**
     * projects live in the control plane and threads in the intelligence plane,
     * so `ON DELETE SET NULL` is not available to release a deleted project's
     * threads. Without this they keep pointing at a project that no longer
     * resolves and disappear from the dock entirely — matching neither the loose
     * filter nor any live project. Detaching returns them to the top level with
     * their history intact.
     */
    await bus.subscribe('project.deleted', async (event: EventBusMessage) => {
      const payload = event.data as { projectId?: unknown } | undefined
      const projectId = typeof payload?.projectId === 'string' ? payload.projectId : undefined
      if (!projectId) return

      try {
        await agentChatPersistenceService.detachThreadsFromProject(projectId)
      } catch (error) {
        logger.error('Failed to detach chat threads from a deleted project', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    logger.info(
      'agent-intelligence event subscriptions configured (agent.discussion.trigger, project.deleted)'
    )
  },

  async shutdown(): Promise<void> {
    memoryConsolidationScheduler?.stop()
  },
}
