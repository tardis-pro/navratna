import type { Elysia } from 'elysia'
import type { DatabaseService } from '@uaip/infra/database'
import type { EventBusService } from './event_bus_service.js'

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
    for (const f of this.features) {
      await f.initialize?.(deps)
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
    for (const f of this.features) {
      f.websocket?.(io)
    }
  }

  async shutdown(): Promise<void> {
    for (const f of [...this.features].reverse()) {
      await f.shutdown?.()
    }
  }
}
