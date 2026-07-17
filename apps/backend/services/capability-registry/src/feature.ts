import type { Feature } from '@uaip/shared-services/feature-factory'
import { registerCapabilityRoutes } from './routes/capability_routes.js'
import { registerMCPRoutes } from './routes/mcp_routes.js'
import { registerHealthRoutes } from './routes/health_routes.js'
import { registerToolRoutes } from './routes/tool_routes.js'
import { registerWorkspaceRoutes } from './routes/workspace_routes.js'
import { registerFederationRoutes } from './routes/federation_routes.js'
import { registerCanvaRoutes } from './routes/canva_routes.js'
import { registerMeshNodeRoutes } from './routes/mesh_node_routes.js'
import { registerGitHubAppInstallationRoutes } from './routes/github_app_installation_routes.js'
import { FederationRegistryService } from './services/federation_registry_service.js'
import { ToolExecutionCoordinator } from './services/tool_execution_coordinator_service.js'
import { UnifiedToolRegistry } from './services/unified_tool_registry.js'
import { CodingSessionStore } from './services/execution_mesh/coding_session_store.js'
import { CodingNodeClient } from './services/execution_mesh/coding_node_client.js'
import { CodingSessionCoordinator } from './services/execution_mesh/coding_session_coordinator.js'
import { FlyMachineDriver } from './services/execution_mesh/fly_machine_driver.js'
import { GitHubAppTokenBroker } from './services/execution_mesh/github_app_token_broker.js'
import type { BrokerRedisClient } from './services/execution_mesh/github_app_token_broker.js'
import { GitHubAppInstallationRepository } from './services/execution_mesh/github_app_installation_repository.js'
import { probeKeyPair, importSigningKey } from './services/execution_mesh/coding_node_jwt.js'
import { createProductionAuditSink } from './services/execution_mesh/coding_session_audit_sink.js'
import type { RedisClient } from './services/execution_mesh/coding_session_store.js'
import { getRedisClient } from '@uaip/infra'
import { getControlDb } from '@uaip/shared-services'
import { ToolCategory, SecurityLevel } from '@uaip/types'
import { logger } from '@uaip/utils'

let codingCoordinator: CodingSessionCoordinator | null = null
let githubTokenBroker: GitHubAppTokenBroker | null = null
let githubInstallationRepository: GitHubAppInstallationRepository | null = null

/**
 * Env vars the coding tier hard-requires. When any is missing the coding tier is
 * disabled (its routes are skipped) rather than crashing the whole gateway — the
 * capability/MCP/tool/mesh routes must still mount on an unprovisioned deploy.
 */
const CODING_TIER_ENV = [
  'CODING_NODE_JWT_PRIVATE_KEY_PEM',
  'CODING_NODE_JWT_PUBLIC_KEY_PEM',
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY_PEM',
  'GITHUB_IAT_ENCRYPTION_KEY',
  'FLY_API_TOKEN',
  'FLY_CODING_APP',
  'FLY_CODING_IMAGE',
  'FLY_CODING_PRIMARY_REGION',
] as const

function codingTierEnvStatus(): { enabled: boolean; missing: string[] } {
  const missing = CODING_TIER_ENV.filter((name) => !process.env[name]?.trim())
  return { enabled: missing.length === 0, missing }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required coding-tier environment variable: ${name}`)
  return value
}

async function buildCodingCoordinator(): Promise<CodingSessionCoordinator> {
  const privatePem = requiredEnv('CODING_NODE_JWT_PRIVATE_KEY_PEM')
  const publicPem = requiredEnv('CODING_NODE_JWT_PUBLIC_KEY_PEM')
  const appId = requiredEnv('GITHUB_APP_ID')
  const appPrivateKeyPem = requiredEnv('GITHUB_APP_PRIVATE_KEY_PEM')
  const encryptionKeyHex = requiredEnv('GITHUB_IAT_ENCRYPTION_KEY')

  if (encryptionKeyHex.length !== 64) {
    throw new Error('GITHUB_IAT_ENCRYPTION_KEY must be exactly 64 hex characters (32-byte AES-256 key)')
  }

  await probeKeyPair(privatePem, publicPem)
  await importSigningKey(privatePem)

  const redisClient = await getRedisClient()
  if (!redisClient) throw new Error('Coding tier requires a healthy Redis connection')

  const redis: RedisClient = {
    get: (key) => redisClient.get(key),
    set: (key, value, expiryMode, seconds) => redisClient.set(key, value, expiryMode, seconds),
    del: (...keys) => redisClient.del(...keys),
    eval: (script, keyCount, ...args) => redisClient.eval(script, keyCount, ...args),
  }

  const brokerRedis: BrokerRedisClient = {
    get: (key) => redisClient.get(key),
    setEx: (key, value, seconds) => redisClient.set(key, value, 'EX', seconds),
    setNxPx: (key, value, milliseconds) => redisClient.set(key, value, 'PX', milliseconds, 'NX'),
    del: (...keys) => redisClient.del(...keys),
    eval: (script, keyCount, ...args) => redisClient.eval(script, keyCount, ...args),
  }
  const broker = new GitHubAppTokenBroker({
    redis: brokerRedis,
    appId,
    privateKeyPem: appPrivateKeyPem,
    encryptionKeyHex,
  })

  const controlDb = getControlDb()
  const installationRepo = new GitHubAppInstallationRepository(controlDb)
  githubTokenBroker = broker
  githubInstallationRepository = installationRepo

  const fallbackRegions = (process.env.FLY_CODING_FALLBACK_REGIONS ?? '')
    .split(',')
    .map((region) => region.trim())
    .filter(Boolean)
  const store = new CodingSessionStore({ redis })
  const fly = new FlyMachineDriver({
    apiToken: requiredEnv('FLY_API_TOKEN'),
    appName: requiredEnv('FLY_CODING_APP'),
    image: requiredEnv('FLY_CODING_IMAGE'),
    primaryRegion: requiredEnv('FLY_CODING_PRIMARY_REGION'),
    fallbackRegions,
  })
  const auditSink = await createProductionAuditSink()
  return new CodingSessionCoordinator({
    store,
    nodeClient: new CodingNodeClient(),
    fly,
    codingNodePublicKeyPem: publicPem,
    auditSink,
    broker,
    installationRepo,
  })
}

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

    // The coding tier is optional infrastructure. On a deploy without GitHub App /
    // Fly / signing-key secrets, skip it and let the rest of capability-registry
    // serve — do NOT throw and take the gateway down. Fail-closed happens
    // per-request (the coding routes simply are not mounted), not at boot.
    const coding = codingTierEnvStatus()
    if (coding.enabled) {
      codingCoordinator = await buildCodingCoordinator()
    } else {
      logger.warn('Coding tier disabled — missing environment; capability-registry will serve without coding routes', {
        missing: coding.missing,
      })
    }
  },

  routes(app) {
    app.use(registerCapabilityRoutes())
    app.use(registerMCPRoutes())
    app.use(registerHealthRoutes())
    app.use(registerToolRoutes())
    if (codingCoordinator && githubTokenBroker && githubInstallationRepository) {
      app.use(registerWorkspaceRoutes(undefined, codingCoordinator))
      app.use(registerGitHubAppInstallationRoutes(githubInstallationRepository, githubTokenBroker))
    } else {
      logger.warn('Coding tier routes not mounted (coordinator unavailable) — /api/v1/workspaces and GitHub App installation endpoints are disabled')
    }
    app.use(registerFederationRoutes())
    app.use(registerCanvaRoutes())
    app.use(registerMeshNodeRoutes())
    return app
  },
}
