import type { Feature } from '@uaip/shared-services/feature-factory'
import { registerCapabilityRoutes } from './routes/capability_routes.js'
import { registerMCPRoutes } from './routes/mcp_routes.js'
import { registerHealthRoutes } from './routes/health_routes.js'
import { registerToolRoutes } from './routes/tool_routes.js'
import { registerWorkspaceRoutes } from './routes/workspace_routes.js'
import { registerFederationRoutes } from './routes/federation_routes.js'
import { registerCanvaRoutes } from './routes/canva_routes.js'
import { registerMeshNodeRoutes } from './routes/mesh_node_routes.js'
import { FederationRegistryService } from './services/federation_registry_service.js'
import { ToolExecutionCoordinator } from './services/tool_execution_coordinator_service.js'
import { UnifiedToolRegistry } from './services/unified_tool_registry.js'
import { ToolCategory, SecurityLevel } from '@uaip/types'
import { logger } from '@uaip/utils'

/**
 * Native execution primitives the mesh runs in-process (or dispatches to an exec node):
 * shell-exec runs a command, http-request performs an HTTP call. Both are securityLevel
 * 'low' + requiresApproval:false so the bus path (no securityContext) can execute them.
 * Registered at boot so tool.execute.request can resolve them by id.
 */
async function registerNativeTools(registry: UnifiedToolRegistry): Promise<void> {
  const tools: Array<Parameters<typeof registry.registerTool>[0]> = [
    {
      id: 'shell-exec',
      name: 'shell-exec',
      description: 'Run a shell command on the selected runner (with dependency preflight)',
      version: '1.0.0',
      category: ToolCategory.SYSTEM,
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          requires: { type: 'array', items: { type: 'string' } },
          requiredEnv: { type: 'array', items: { type: 'string' } },
        },
        required: ['command'],
      },
      returnType: { type: 'object' },
      securityLevel: SecurityLevel.LOW,
      requiresApproval: false,
      isEnabled: true,
      author: 'system',
      tags: ['shell', 'native'],
      dependencies: [],
      examples: [],
    },
    {
      id: 'http-request',
      name: 'http-request',
      description: 'Perform an HTTP request',
      version: '1.0.0',
      category: ToolCategory.NETWORK,
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          method: { type: 'string' },
          headers: { type: 'object' },
          body: {},
        },
        required: ['url'],
      },
      returnType: { type: 'object' },
      securityLevel: SecurityLevel.LOW,
      requiresApproval: false,
      isEnabled: true,
      author: 'system',
      tags: ['http', 'native'],
      dependencies: [],
      examples: [],
    },
  ]

  for (const tool of tools) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- two fixed tools, sequential is fine
      await registry.registerTool(tool)
    } catch (error) {
      // Already registered (ConflictError) on a warm restart — that is the desired state.
      logger.debug('Native tool registration skipped', {
        toolId: tool.id,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export const capabilityFeature: Feature = {
  name: 'capability-registry',

  async initialize(deps) {
    const federation = FederationRegistryService.getInstance()
    await federation.initialize({ eventBusService: deps?.eventBusService })

    // Start the tool-execution coordinator. It subscribes to tool.execute.request and
    // runs the real tool via UnifiedToolRegistry, but was never started — so every
    // bus-based tool execution (the step executor, scheduled workflows) silently
    // no-op'd. Without this, un-mocking the step executor has nothing to answer it.
    await ToolExecutionCoordinator.getInstance().initialize()

    // Register the native shell/http tools so tool.execute.request can resolve and run
    // them through the mesh scheduler (native node → BaseToolExecutor, or an exec node).
    const registry = new UnifiedToolRegistry(deps?.eventBusService)
    await registry.initialize()
    await registerNativeTools(registry)
  },

  routes(app) {
    app.use(registerCapabilityRoutes())
    app.use(registerMCPRoutes())
    app.use(registerHealthRoutes())
    app.use(registerToolRoutes())
    app.use(registerWorkspaceRoutes())
    app.use(registerFederationRoutes())
    app.use(registerCanvaRoutes())
    app.use(registerMeshNodeRoutes())
    return app
  },
}
