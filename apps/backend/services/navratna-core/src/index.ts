import { BaseService } from '@uaip/shared-services'
import { FeatureFactory } from '@uaip/shared-services/feature-factory'
import { Server as SocketIOServer, Socket } from 'socket.io'
import { Server as BunEngine } from '@socket.io/bun-engine'
import { logger } from '@uaip/utils'
import type { EventBusMessage } from '@uaip/types'
import { requestTimingPlugin, requestTimingBuffer } from './request_timing.js'

import { agentIntelligenceFeature } from '../../agent-intelligence/src/feature.js'
import { discussionFeature } from '../../discussion-orchestration/src/feature.js'
import { artifactFeature } from '../../artifact-service/src/feature.js'
import { llmFeature } from '../../llm-service/src/feature.js'
import { registerKnowledgeIngestRoutes } from './routes/knowledge_ingest_routes.js'

const DEGRADED_P95_THRESHOLD_MS = 1000 as const

const roundToTwo = (value: number): number => Number(value.toFixed(2))
const toMegabytes = (bytes: number): number => roundToTwo(bytes / (1024 * 1024))

class NavratnaCoreService extends BaseService {
  private factory = new FeatureFactory()
    .register(process.env.FEATURE_AGENT !== 'false' && agentIntelligenceFeature)
    .register(process.env.FEATURE_DISCUSSION !== 'false' && discussionFeature)
    .register(process.env.FEATURE_ARTIFACTS !== 'false' && artifactFeature)
    .register(process.env.FEATURE_LLM !== 'false' && llmFeature)

  private io: SocketIOServer
  private bunEngine: BunEngine
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
      cors: { origin: false },
      serveClient: false,
      path: '/socket.io/',
    })

    this.bunEngine = new BunEngine({
      path: '/socket.io/',
      pingInterval: 25000,
      pingTimeout: 60000,
    })
    this.io.bind(this.bunEngine)
  }

  protected async initialize(): Promise<void> {
    await this.factory.initialize({
      eventBusService: this.eventBusService,
    })
    await this.initializeAuthSubscription()
    logger.info('navratna-core services initialized')
  }

  protected async setupRoutes(): Promise<void> {
    this.app.use(requestTimingPlugin())

    this.factory.mountRoutes(this.app)
    registerKnowledgeIngestRoutes(this.app as Parameters<typeof registerKnowledgeIngestRoutes>[0])

    this.app.all('/socket.io/*', ({ request, server }: { request: Request; server: unknown }) => {
      if (!server) {
        logger.error('Server not available for Socket.IO request')
        return new Response('Server not available', { status: 503 })
      }
      return this.bunEngine.handleRequest(
        request,
        server as Parameters<typeof this.bunEngine.handleRequest>[1]
      )
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
    logger.info('navratna-core event subscriptions configured')
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true
  }

  public async start(): Promise<void> {
    try {
      await this.initializeDatabase()
      await this.initializeEventBus()

      this.setupBaseMiddleware()
      this.setupBaseRoutes()

      await this.initialize()
      await this.setupRoutes()

      this.setup404Handler()
      this.setupErrorHandler()

      const bunHandler = this.bunEngine.handler()
      this.server = this.app.listen({
        port: this.config.port,
        idleTimeout: 30,
        websocket: 'websocket' in bunHandler ? bunHandler.websocket : undefined,
      })

      logger.info(
        `navratna-core (Elysia + Socket.IO Bun engine) started on port ${this.config.port}`
      )

      this.setupGracefulShutdown()

      this.io.use(async (socket: Socket, next: (err?: Error) => void) => {
        try {
          const userId = socket.handshake.headers['x-user-id'] as string | undefined
          const userEmail = socket.handshake.headers['x-user-email'] as string | undefined
          const userRole = socket.handshake.headers['x-user-role'] as string | undefined

          if (userId) {
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

          const token =
            socket.handshake.auth?.token ||
            (socket.handshake.headers?.authorization as string | undefined)?.replace('Bearer ', '') ||
            socket.handshake.query?.token

          if (!token) {
            return next(new Error('Authentication required'))
          }

          const authResponse = await this.validateSocketIOToken(token as string)
          if (!authResponse.valid) {
            return next(new Error(`Authentication failed: ${authResponse.reason}`))
          }

          socket.data.user = {
            userId: authResponse.userId,
            sessionId: authResponse.sessionId,
            securityLevel: authResponse.securityLevel || 3,
            complianceFlags: authResponse.complianceFlags || [],
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

      // @ts-expect-error -- SocketIOServer satisfies MinimalWebSocketServer structurally; index signature absent from socket.io typings
      this.factory.mountWebSocket(this.io)

      await this.setupEventSubscriptions()

      logger.info('navratna-core WebSocket handlers initialized')
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
        const eventData = event.data as Record<string, unknown> | undefined
        const correlationId = eventData?.correlationId as string | undefined
        if (correlationId && this.authResponseHandlers.has(correlationId)) {
          const handler = this.authResponseHandlers.get(correlationId)
          if (handler) {
            handler(eventData as Record<string, unknown>)
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
    const WS_AUTH_TIMEOUT_MS = 5000

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
        resolveOnce(
          response as {
            valid: boolean
            userId?: string
            sessionId?: string
            securityLevel?: number
            complianceFlags?: string[]
            reason?: string
          }
        )
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
    const defaultUrls = ['http://navratna-gateway:3002', 'http://localhost:3002']
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
          const errorBody = await response.json().catch((): null => null)
          return {
            valid: false,
            reason:
              (errorBody as Record<string, unknown> | null)?.error?.toString() ||
              'Authentication failed',
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

const service = new NavratnaCoreService()
service.start().catch((error) => {
  logger.error('Failed to start navratna-core', { error })
  process.exit(1)
})
