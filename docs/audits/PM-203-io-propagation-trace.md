# PM-203: Socket.IO io Instance Propagation Trace

**Audited**: 2026-04-18

## Propagation Path

```
NavratnaCoreService (navratna-core/src/index.ts)
│
├─ constructor()
│   └─ this.io = new SocketIOServer(...)        ← created once, owned by the service
│   └─ this.bunEngine = new BunEngine(...)
│   └─ this.io.bind(this.bunEngine)             ← io ↔ bun engine linked
│
└─ start()
    ├─ this.factory.mountWebSocket(this.io)     ← FeatureFactory.mountWebSocket()
    │   └─ for each feature: f.websocket?.(io)  ← loops all registered features
    │       └─ discussionFeature.websocket(io)  ← io received as MinimalWebSocketServer
    │           └─ const socketIO = io as SocketIOServer
    │               ├─ new UserChatHandler(socketIO, capturedEventBus)
    │               ├─ new ConversationIntelligenceHandler(socketIO, capturedEventBus)
    │               ├─ new TaskNotificationHandler(socketIO, capturedEventBus)
    │               ├─ new StreamingHandler(socketIO, capturedEventBus)
    │               ├─ new CodingAgentSocketHandler(socketIO, capturedEventBus)
    │               ├─ new WhatsAppHandler(socketIO, capturedEventBus)
    │               ├─ new DebateHandler(socketIO, capturedEventBus)
    │               └─ setupWebSocketHandlers(socketIO, orchestrationService)
    │
    └─ this.io.use(authMiddleware)              ← auth applied BEFORE handlers register
```

## Type Flow

```typescript
// NavratnaCoreService: SocketIOServer
private io: SocketIOServer  // socket.io Server<DefaultEventsMap, ...>

// FeatureFactory: MinimalWebSocketServer (structural subtype)
mountWebSocket(io: MinimalWebSocketServer): void {
  for (const f of this.features) {
    f.websocket?.(io)  // passes same reference, typed as MinimalWebSocketServer
  }
}

// MinimalWebSocketServer (defined in shared-services/feature-factory.ts)
interface MinimalWebSocketServer {
  on(event: string, listener: (...args: never[]) => void): unknown
  emit(event: string, ...args: unknown[]): unknown
  of(nsp: string | RegExp): unknown
}
// SocketIOServer satisfies MinimalWebSocketServer — no casting needed at call site

// discussionFeature receives io and up-casts:
websocket(io: MinimalWebSocketServer): void {
  const socketIO = io as SocketIOServer  // safe: NavratnaCoreService always passes SocketIOServer
  // ... handler instantiation
}
```

## Initialization Order (critical)

```
1. factory.initialize()           → discussionFeature.initialize()
                                    → capturedEventBus = deps.eventBusService ✅
2. factory.mountRoutes(this.app)  → HTTP routes registered
3. io.use(authMiddleware)         → Socket.IO auth applied
4. factory.mountWebSocket(this.io)→ WebSocket handlers registered
                                    → capturedEventBus is now populated ✅
5. factory.subscribeEvents(bus)   → Event bus subscriptions registered
```

**Key insight**: `capturedEventBus` is a module-level variable in `discussion-orchestration/src/feature.ts`. It is assigned during `initialize()` (step 1) and consumed during `websocket()` (step 4). The order is correct — handlers can safely use `capturedEventBus` without null-check.

## Verdict

- io propagation is **correct** — single `SocketIOServer` instance flows from service constructor to all 8 handlers
- `capturedEventBus` is always populated before `websocket()` is called
- No io propagation bug found
- Up-cast in `discussionFeature` is safe by design — only `NavratnaCoreService` ever calls `mountWebSocket()`
