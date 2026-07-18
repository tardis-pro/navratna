import { BaseService, getKnowledgeSummaryEnrichmentJob, UnifiedModelSelectionFacade } from '@uaip/shared-services'
import { FeatureFactory } from '@uaip/shared-services/feature-factory'
import { LLMService } from '@uaip/llm-service'
import { LLMTaskType } from '@uaip/types'
import { Server as SocketIOServer, Socket } from 'socket.io'
import { Server as BunEngine } from '@socket.io/bun-engine'
import { createAdapter } from '@socket.io/redis-adapter'
import Redis from 'ioredis'
import { getRedisTLSOptions } from '@uaip/infra'
import { config } from '@uaip/config'
import { logger, isRecord } from '@uaip/utils'
import { JWTValidator } from '@uaip/middleware'
import type { EventBusMessage } from '@uaip/types'
import { requestTimingPlugin, requestTimingBuffer } from './request_timing.js'

import { agentIntelligenceFeature } from '@uaip/agent-intelligence-core/feature'
import { discussionFeature } from '@uaip/discussion-core/feature'
import { artifactFeature } from '../../artifact-service/src/feature.js'
import { llmFeature } from '../../llm-service/src/feature.js'
import { deploymentFeature } from './deployment/feature.js'
import { oieFeature } from '../../oie/src/feature.js'
import { registerKnowledgeIngestRoutes } from './routes/knowledge_ingest_routes.js'
import { registerCompositionRoutes } from './composition/composition_routes.js'
import { WorkflowStateHandler } from './composition/workflow_state_handler.js'

const DEGRADED_P95_THRESHOLD_MS = 1000


const roundToTwo = (value: number): number => Number(value.toFixed(2))
const toMegabytes = (bytes: number): number => roundToTwo(bytes / (1024 * 1024))

class NavratnaCoreService extends BaseService {
  private factory = new FeatureFactory()
    .register(process.env.FEATURE_AGENT !== 'false' && agentIntelligenceFeature)
    .register(process.env.FEATURE_DISCUSSION !== 'false' && discussionFeature)
    .register(process.env.FEATURE_ARTIFACTS !== 'false' && artifactFeature)
    .register(process.env.FEATURE_LLM !== 'false' && llmFeature)
    .register(process.env.FEATURE_DEPLOYMENT !== 'false' && deploymentFeature)
    .register(process.env.FEATURE_OIE === 'true' && oieFeature)

  private io: SocketIOServer
  private bunEngine: BunEngine
  private socketPubClient?: Redis
  private socketSubClient?: Redis
  private authResponseHandlers = new Map<string, (response: Record<string, unknown>) => void>()
  private authSubscriptionInitialized = false

  constructor() {
    super({
      name: 'navratna-core',
      port: parseInt(process.env.NAVRATNA_CORE_PORT || '3001', 10),
      version: '3.0.0',
      enableWebSocket: true,
      enableNeo4j: true,
      enableEnterpriseEventBus: true,
    })
    this.registerEntities([])

    this.io = new SocketIOServer({
      // Reflect the request origin + allow credentials. origin:false rejected
      // the cross-origin WebSocket upgrade (frontend and API are on different
      // subdomains); the CF Worker already gates who can reach /socket.io.
      cors: { origin: true, credentials: true, methods: ['GET', 'POST'] },
      serveClient: false,
      path: '/socket.io/',
    })

    this.bunEngine = new BunEngine({
      path: '/socket.io/',
      pingInterval: 25000,
      pingTimeout: 60000,
    })

    // @socket.io/bun-engine never assigns `request` to its engine socket, but Socket.IO
    // builds the handshake from `conn.request` (socket.io/dist/socket.js: `headers:
    // this.request?.headers || {}`). The result was an empty handshake — no cookie, no
    // X-User-ID from the edge, no query — so every socket was rejected as unauthenticated
    // even with a valid session. The engine does hand us the Bun Request on `connection`,
    // so adapt it to the Node-ish shape Socket.IO expects. Registered BEFORE io.bind()
    // because listeners fire in registration order and Socket.IO reads `request` in its
    // own connection handler.
    this.bunEngine.on('connection', (socket: unknown, req: Request) => {
      const conn = socket as { request?: unknown }
      if (!req || conn.request) return

      const headers: Record<string, string> = {}
      req.headers.forEach((value, key) => {
        headers[key] = value
      })

      const url = new URL(req.url)
      const query: Record<string, string> = {}
      url.searchParams.forEach((value, key) => {
        query[key] = value
      })

      conn.request = {
        headers,
        _query: query,
        url: `${url.pathname}${url.search}`,
        connection: { encrypted: url.protocol === 'https:' },
      }
    })

    // Without a shared adapter, each Fly machine keeps Socket.IO sessions in-process,
    // so a polling request carrying a `sid` routed to a different machine fails with
    // 400 "Session ID unknown". Best-effort: Redis is non-fatal at core boot.
    this.setupSocketIORedisAdapter()

    this.io.bind(this.bunEngine)
  }

  private setupSocketIORedisAdapter(): void {
    try {
      const host = config.redis?.host || process.env.REDIS_HOST || 'localhost'
      const port = config.redis?.port || parseInt(process.env.REDIS_PORT || '6379', 10)
      const password = config.redis?.password || process.env.REDIS_PASSWORD

      const redisOptions = {
        host,
        port,
        password,
        db: config.redis?.db ?? parseInt(process.env.REDIS_DB || '0', 10),
        maxRetriesPerRequest: 3,
        enableOfflineQueue: true,
        commandTimeout: 5000,
        ...getRedisTLSOptions(host),
      }

      this.socketPubClient = new Redis(redisOptions)
      // Subscriber connections cannot issue normal commands, so duplicate() onto a
      // dedicated socket is mandatory, not optional.
      this.socketSubClient = this.socketPubClient.duplicate()

      const logAdapterError = (role: string) => (err: Error) =>
        logger.warn(`Socket.IO Redis adapter ${role} client error`, { error: err.message })
      this.socketPubClient.on('error', logAdapterError('pub'))
      this.socketSubClient.on('error', logAdapterError('sub'))

      this.io.adapter(createAdapter(this.socketPubClient, this.socketSubClient))
      logger.info('Socket.IO Redis adapter registered — cross-machine session fan-out enabled', {
        host,
        port,
      })
    } catch (err) {
      logger.warn('Socket.IO Redis adapter not registered — falling back to in-memory (single-machine) adapter', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  protected async initialize(): Promise<void> {
    await this.factory.initialize({
      eventBusService: this.eventBusService,
    })
    await this.initializeAuthSubscription()
    this.startSummaryEnrichmentWorker()
    logger.info('navratna-core services initialized')
  }

  private startSummaryEnrichmentWorker(): void {
    try {
      const facade = new UnifiedModelSelectionFacade()
      const llm = LLMService.getInstance()
      getKnowledgeSummaryEnrichmentJob().startWorker(async (content: string) => {
        const selection = await facade.selectForSystem(LLMTaskType.SUMMARIZATION)
        const response = await llm.generateResponse(
          {
            prompt: `Summarize the following text in 2-4 sentences. Return only the summary, no preamble.\n\n${content}`,
            systemPrompt: 'You are a precise summarizer.',
            maxTokens: 300,
            temperature: 0.3,
            model: selection.model.model,
          },
          selection.model.provider,
        )
        if (response.error || !response.content?.trim()) {
          throw new Error(response.error || 'LLM returned empty summary')
        }
        return response.content
      })
    } catch (err) {
      logger.warn('Failed to start summary enrichment worker', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  protected async setupRoutes(): Promise<void> {
    this.app.use(requestTimingPlugin())

    this.factory.mountRoutes(this.app)
    this.app.use(registerKnowledgeIngestRoutes())
    // Composition routes are declared in app.ts, but that file only builds the Eden type
    // contract — it is never served. Without mounting them here /api/v1/compositions was
    // in the client's typed API yet answered NOT_FOUND at runtime.
    this.app.use(registerCompositionRoutes())

    this.app.all('/socket.io/*', ({ request, server }: { request: Request; server: unknown }) => {
      if (!server) {
        logger.error('Server not available for Socket.IO request')
        return new Response('Server not available', { status: 503 })
      }
      return this.bunEngine.handleRequest(request, server)
    })

    this.app.get('/health', () => ({
      status: 'ok',
      service: 'navratna-core',
      features: this.factory.activeFeatureNames,
    }))

    this.app.get('/health/detailed', () => this.buildHealthPayload())

    this.app.get('/api/v1/core/health', ({ request, set }) => {
      const forwardedFor = request.headers.get('x-forwarded-for')
      const host = request.headers.get('host') || ''
      const isInternal =
        host.startsWith('localhost') ||
        host.startsWith('127.0.0.1') ||
        host.startsWith('navratna-core') ||
        host.includes(':3001') ||
        !forwardedFor
      if (!isInternal) {
        set.status = 403
        return { error: 'Forbidden' }
      }
      return this.buildHealthPayload()
    })

    logger.info('navratna-core routes configured')
  }

  private buildHealthPayload() {
    const timingStats = requestTimingBuffer.getStats()
    const memoryUsage = process.memoryUsage()
    const cpuUsage = process.cpuUsage()
    const status =
      timingStats.count > 0 && timingStats.p95 > DEGRADED_P95_THRESHOLD_MS ? 'degraded' : 'ok'

    return {
      status,
      service: 'navratna-core',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      features: this.factory.activeFeatureNames,
      timing: {
        p95: timingStats.p95,
        p50: timingStats.p50,
        avg: timingStats.avg,
        sampleCount: timingStats.count,
      },
      memory: {
        heapUsed: toMegabytes(memoryUsage.heapUsed),
        heapTotal: toMegabytes(memoryUsage.heapTotal),
        rss: toMegabytes(memoryUsage.rss),
        external: toMegabytes(memoryUsage.external),
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
    }
  }

  protected async setupEventSubscriptions(): Promise<void> {
    await this.factory.subscribeEvents(this.eventBusService)

    const workflowStateHandler = new WorkflowStateHandler(this.io, this.eventBusService)
    await workflowStateHandler.subscribe()
    workflowStateHandler.setupSocketJoin(this.io)

    logger.info('navratna-core event subscriptions configured')
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true
  }

  protected async cleanup(): Promise<void> {
    try {
      this.io.close()
    } catch (err) {
      logger.error('navratna-core: Socket.IO close error', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    try {
      await Promise.all([this.socketPubClient?.quit(), this.socketSubClient?.quit()])
    } catch (err) {
      logger.warn('navratna-core: Socket.IO Redis adapter client close error', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    await this.factory.shutdown()
  }

  public async start(): Promise<void> {
    try {
      this.setupBaseMiddleware()
      this.setupBaseRoutes()

      this.setupGracefulShutdown()

      await this.initializeDatabase()
      await this.initializeEventBus()

      await this.initialize()
      await this.setupRoutes()

      this.setup404Handler()
      this.setupErrorHandler()

      this.io.use(async (socket: Socket, next: (err?: Error) => void) => {
        try {
          const rawUserId = socket.handshake.headers['x-user-id']
          const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId
          const rawEmail = socket.handshake.headers['x-user-email']
          const userEmail = Array.isArray(rawEmail) ? rawEmail[0] : rawEmail
          const rawRole = socket.handshake.headers['x-user-role']
          const userRole = Array.isArray(rawRole) ? rawRole[0] : rawRole

          // Edge-trust gate: only honor the forwarded x-user-id header when the
          // request carries a valid X-Edge-Auth (i.e. came through the Worker).
          // Otherwise fall through to real token validation below.
          const edgeSecret = process.env.EDGE_AUTH_SECRET
          const rawEdge = socket.handshake.headers['x-edge-auth']
          const edgeHeader = Array.isArray(rawEdge) ? rawEdge[0] : rawEdge
          const edgeTrusted = !edgeSecret || edgeHeader === edgeSecret

          if (userId && edgeTrusted) {
            const UUID_REGEX =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            if (!UUID_REGEX.test(userId)) {
              return next(new Error('Authentication failed: Invalid user ID format'))
            }
            socket.data.user = {
              userId,
              email: userEmail || '',
              role: userRole || 'user',
              sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              securityLevel: 3,
              complianceFlags: [],
            }
            return next()
          }

          const rawAuthToken: unknown = socket.handshake.auth?.token
          const authToken = typeof rawAuthToken === 'string' ? rawAuthToken : undefined
          const rawQueryToken = socket.handshake.query?.token
          const queryToken = typeof rawQueryToken === 'string' ? rawQueryToken
            : Array.isArray(rawQueryToken) && typeof rawQueryToken[0] === 'string' ? rawQueryToken[0]
            : undefined
          const cookieHeader = typeof socket.handshake.headers.cookie === 'string'
            ? socket.handshake.headers.cookie : ''
          const cookieMatch = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/)
          const cookieToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : undefined
          const token =
            authToken ||
            socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
            queryToken ||
            cookieToken

          if (!token) {
            // Rejecting with no explanation made this failure impossible to diagnose from
            // logs. Record which identity sources were present — presence only, never values.
            logger.warn('Socket.IO auth: no token on handshake', {
              socketId: socket.id,
              headerNames: Object.keys(socket.handshake.headers),
              hasUserIdHeader: Boolean(userId),
              edgeTrusted,
              hasEdgeHeader: Boolean(edgeHeader),
              edgeSecretConfigured: Boolean(edgeSecret),
              hasAuthToken: Boolean(authToken),
              hasAuthorizationHeader: Boolean(socket.handshake.headers?.authorization),
              hasQueryToken: Boolean(queryToken),
              hasCookieHeader: Boolean(cookieHeader),
              cookieNames: cookieHeader
                ? cookieHeader.split(';').map((c) => c.split('=')[0].trim())
                : [],
            })
            return next(new Error('Authentication required'))
          }

          // Verify the JWT locally. Core shares the JWT secret, so there is no
          // need to round-trip to the gateway to validate a socket token — the
          // event-bus responder is absent and the internal gateway address was
          // unreachable, which made every socket connect time out. Local verify
          // is the same trust model the CF Worker uses for HTTP.
          let claims: { userId?: string } | null = null
          try {
            claims = (await JWTValidator.verify(token)) as { userId?: string } | null
          } catch {
            claims = null
          }
          if (!claims || typeof claims.userId !== 'string') {
            return next(new Error('Authentication failed: invalid or expired token'))
          }

          socket.data.user = {
            userId: claims.userId,
            sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            securityLevel: 3,
            complianceFlags: [],
          }
          next()
        } catch (error) {
          logger.error('Socket.IO authentication error', {
            socketId: socket.id,
            error: error instanceof Error ? error.message : String(error),
          })
          return next(new Error('Authentication service unavailable'))
        }
      })

      this.factory.mountWebSocket(this.io)

      await this.setupEventSubscriptions()

      const bunHandler = this.bunEngine.handler()
      this.server = this.app.listen({
        port: this.config.port,
        idleTimeout: 30,
        websocket: 'websocket' in bunHandler ? bunHandler.websocket : undefined,
      })

      logger.info(
        `navratna-core (Elysia + Socket.IO Bun engine) listening on port ${this.config.port}`
      )
    } catch (error) {
      logger.error('navratna-core: Failed to start:', error)
      process.exit(1)
    }
  }

  private async initializeAuthSubscription(): Promise<void> {
    if (this.authSubscriptionInitialized) return

    await this.eventBusService.subscribe(
      'security.auth.response',
      async (event: EventBusMessage) => {
        const rawData = event.data
        if (!isRecord(rawData)) return
        const correlationId = typeof rawData.correlationId === 'string' ? rawData.correlationId : undefined
        if (correlationId && this.authResponseHandlers.has(correlationId)) {
          const handler = this.authResponseHandlers.get(correlationId)
          if (handler) {
            handler(rawData)
            this.authResponseHandlers.delete(correlationId)
          }
        }
      }
    )
    this.authSubscriptionInitialized = true
    logger.info('Shared authentication subscription initialized')
  }

  private async validateSocketIOToken(token: string): Promise<{
    valid: boolean
    userId?: string
    sessionId?: string
    securityLevel?: number
    complianceFlags?: string[]
    reason?: string
  }> {
    const correlationId = `socketio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const WS_AUTH_TIMEOUT_MS = 1500

    return new Promise((resolve) => {
      let resolved = false
      const resolveOnce = (result: {
        valid: boolean
        userId?: string
        sessionId?: string
        securityLevel?: number
        complianceFlags?: string[]
        reason?: string
      }) => {
        if (resolved) return
        resolved = true
        resolve(result)
      }

      const timeoutId = setTimeout(() => {
        this.authResponseHandlers.delete(correlationId)
        this.validateSocketIOTokenViaHttp(token)
          .then(resolveOnce)
          .catch(() => resolveOnce({ valid: false, reason: 'Auth validation timed out' }))
      }, WS_AUTH_TIMEOUT_MS)

      this.authResponseHandlers.set(correlationId, (response: Record<string, unknown>) => {
        clearTimeout(timeoutId)
        resolveOnce({
          valid: response.valid === true,
          userId: typeof response.userId === 'string' ? response.userId : undefined,
          sessionId: typeof response.sessionId === 'string' ? response.sessionId : undefined,
          securityLevel: typeof response.securityLevel === 'number' ? response.securityLevel : undefined,
          complianceFlags: Array.isArray(response.complianceFlags)
            ? response.complianceFlags.filter((f): f is string => typeof f === 'string')
            : undefined,
          reason: typeof response.reason === 'string' ? response.reason : undefined,
        })
      })

      this.eventBusService
        .publish('security.auth.validate', {
          token,
          service: 'navratna-core',
          operation: 'socketio_auth',
          correlationId,
          timestamp: new Date().toISOString(),
        })
        .catch((error: unknown) => {
          clearTimeout(timeoutId)
          this.authResponseHandlers.delete(correlationId)
          this.validateSocketIOTokenViaHttp(token)
            .then(resolveOnce)
            .catch(() => resolveOnce({ valid: false, reason: 'Auth validation failed' }))
          logger.error('Socket.IO auth event bus publish failed', {
            error: error instanceof Error ? error.message : String(error),
            correlationId,
          })
        })
    })
  }

  private async validateSocketIOTokenViaHttp(token: string): Promise<{
    valid: boolean
    userId?: string
    sessionId?: string
    securityLevel?: number
    complianceFlags?: string[]
    reason?: string
  }> {
    // Fly 6PN private networking: the gateway is reachable at
    // <app>.internal on its internal_port (8080). The old navratna-gateway:3002
    // / localhost:3002 never resolve on Fly, so socket-token validation always
    // timed out → "Authentication service timeout" on every socket connect.
    const defaultUrls = [
      'http://navratna-gateway.internal:8080',
      'http://navratna-gateway:3002',
      'http://localhost:3002',
    ]
    const urls = process.env.SECURITY_GATEWAY_URL
      ? [process.env.SECURITY_GATEWAY_URL, ...defaultUrls]
      : defaultUrls

    for (const baseUrl of urls) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2500)
      try {
        // oxlint-disable-next-line no-await-in-loop
        const response = await fetch(`${baseUrl}/api/v1/auth/validate`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          // oxlint-disable-next-line no-await-in-loop
          const errorBody: unknown = await response.json().catch((): null => null)
          return {
            valid: false,
            reason: isRecord(errorBody) && errorBody.error !== undefined
              ? String(errorBody.error)
              : 'Authentication failed',
          }
        }

        return { valid: true, userId: response.headers.get('x-user-id') || undefined }
      } catch (error) {
        clearTimeout(timeoutId)
        logger.warn('Socket.IO HTTP auth fallback failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          baseUrl,
        })
      }
    }

    return { valid: false, reason: 'Authentication service timeout' }
  }
}

const bootSink = process.env.BOOT_SINK_URL
const bootCrumb = (phase: string, extra?: string): void => {
  if (!bootSink) return
  void fetch(bootSink, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ svc: 'core', phase, extra, t: Date.now() }),
  }).catch(() => {})
}

process.on('exit', (code) => bootCrumb('process.exit', `code=${code}`))
process.on('beforeExit', (code) => bootCrumb('beforeExit', `code=${code}`))
process.on('SIGTERM', () => bootCrumb('SIGTERM'))
process.on('uncaughtException', (e) => bootCrumb('uncaughtException', String(e?.stack ?? e)))
process.on('unhandledRejection', (e) => bootCrumb('unhandledRejection', String(e)))

bootCrumb('module-loaded')

const service = new NavratnaCoreService()
service
  .start()
  .then(() => bootCrumb('start-resolved'))
  .catch((error) => {
    bootCrumb('start-rejected', String(error?.stack ?? error))
    logger.error('Failed to start navratna-core', { error })
    process.exit(1)
  })

// Cloudflare Containers (Firecracker) drains the Bun event loop to exit(0)
// after start() resolves, despite Bun.serve being active. This ref'd timer
// pins the loop so the process stays alive to serve requests.
setInterval(() => {}, 1 << 30)
