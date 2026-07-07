import type { Elysia } from 'elysia'
import type { DatabaseService } from '@uaip/infra/database'
import type { EventBusService } from './event_bus_service.js'
import { logger } from '@uaip/utils'

/**
 * Structural subset of socket.io Server. Avoids hard dependency on socket.io
 * in shared-services while allowing NavratnaCoreService to pass its
 * SocketIOServer without a cast.
 */
export interface MinimalWebSocketServer {
  on(event: string, listener: (...args: never[]) => void): unknown
  emit(event: string, ...args: unknown[]): unknown
  of(nsp: string | RegExp): unknown
}

export interface ServiceDeps {
  eventBusService: EventBusService
  databaseService?: DatabaseService
}

export interface Feature {
  readonly name: string
  initialize?(deps: ServiceDeps): Promise<void>
  routes?<TApp extends Elysia>(app: TApp): TApp
  events?(bus: EventBusService): Promise<void>
  websocket?(io: MinimalWebSocketServer): void
  shutdown?(): Promise<void>
}

export class FeatureFactory {
  private readonly features: Feature[] = []

  register(feature: Feature | null | false): this {
    if (feature) this.features.push(feature)
    return this
  }

  get activeFeatureNames(): string[] {
    return this.features.map((f) => f.name)
  }

  async initialize(deps: ServiceDeps): Promise<void> {
    // Each feature's async init is bounded by a timeout and isolated by a
    // try/catch. A slow or hanging dependency (Neo4j/BullMQ/DB) must never hold
    // the port hostage — the process binds and serves whatever initialized. A
    // feature that times out or throws degrades gracefully; its routes still
    // mount (that is a separate synchronous path in mountRoutes).
    const INIT_TIMEOUT_MS = 20_000
    for (const f of this.features) {
      if (!f.initialize) continue
      try {
        await Promise.race([
          f.initialize(deps),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`feature "${f.name}" initialize timed out after ${INIT_TIMEOUT_MS}ms`)),
              INIT_TIMEOUT_MS
            )
          ),
        ])
        logger.info(`FeatureFactory: feature "${f.name}" initialized`)
      } catch (error) {
        logger.error(`FeatureFactory: feature "${f.name}" init failed — continuing with degraded functionality`, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  mountRoutes<TApp extends Elysia>(app: TApp): TApp {
    return this.features.reduce((a, f) => f.routes?.(a) ?? a, app)
  }

  async subscribeEvents(bus: EventBusService): Promise<void> {
    for (const f of this.features) {
      await f.events?.(bus)
    }
  }

  mountWebSocket(io: MinimalWebSocketServer): void {
    if (!io) {
      logger.error('FeatureFactory.mountWebSocket: io is null/undefined — WebSocket handlers will not be bound')
      return
    }
    const wsFeatures = this.features.filter((f) => typeof f.websocket === 'function')
    if (wsFeatures.length === 0) {
      logger.warn('FeatureFactory.mountWebSocket: no features have websocket handlers registered')
    }
    for (const f of wsFeatures) {
      logger.info(`FeatureFactory: binding WebSocket handlers for feature "${f.name}"`)
      f.websocket!(io)
    }
  }

  async shutdown(): Promise<void> {
    for (const f of [...this.features].reverse()) {
      await f.shutdown?.()
    }
  }
}
