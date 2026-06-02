# discussion-orchestration — @uaip/discussion-orchestration

**Port**: 3005 | **Entry**: `src/index.ts` | **Status**: 🔄 Legacy (consolidating into navratna-core)

Real-time discussion coordination. Socket.IO connections, turn strategies, multiple WebSocket namespaces (chat/streaming/coding-agent/conversation-intelligence), WhatsApp via Baileys, formal debate handler, correlation-ID auth pattern.

## STRUCTURE

```
src/
├── index.ts                     # DiscussionOrchestrationServer extends BaseService
├── handlers/
│   ├── discussionWebSocketHandler.ts  # Socket.IO event handlers per namespace
│   └── debateHandler.ts         # Formal consensus debate logic
├── services/
│   ├── discussionOrchestrationService.ts  # Core orchestration (2700+ lines)
│   ├── turnStrategyService.ts   # Round-robin, priority, expertise-based turns
│   ├── socialSimulation.ts      # Agent social simulation
│   ├── event_driven_discussion_service.ts  # @deprecated PM-324 — RPC/publishAndWait pattern replaced by Elysia HTTP routes
│   └── [others]
├── routes/                      # Elysia HTTP routes
│   ├── discussion_routes.ts     # Discussion CRUD + messaging (PM-324: formerly RPC)
│   └── persona_routes.ts        # Persona CRUD
├── strategies/                  # Turn strategy implementations
├── websocket/                   # Socket.IO namespace config
├── whatsapp/                    # Baileys WhatsApp integration
├── config/
└── __tests__/
    ├── unit/                    # 2 unit tests
    ├── integration/service.test.ts
    ├── turnStrategyService.test.ts
    └── socialSimulation.test.ts
```

## SOCKET.IO NAMESPACES

| Namespace                    | Purpose                                                 |
| ---------------------------- | ------------------------------------------------------- |
| `/` (default)                | Discussions — join/leave rooms, send messages, presence |
| `/streaming`                 | LLM token streaming — session-based subscriptions       |
| `/conversation-intelligence` | Conversation analysis and enhancement                   |
| `/coding-agent`              | Workspace/coding agent sessions                         |

All Socket.IO uses `@socket.io/bun-engine` for native Bun WebSocket.

## REST ENDPOINTS (minimal)

| Method | Path                                          | Purpose                                   |
| ------ | --------------------------------------------- | ----------------------------------------- |
| GET    | `/api/v1/info`                                | Service info                              |
| POST   | `/api/v1/discussions/:id/turns/request`       | Turn request                              |
| GET    | `/api/v1/users/online`                        | Online presence                           |
| GET    | `/api/v1/users/:id/status`                    | User status                               |
| POST   | `/api/v1/discussions/:id/huddle`              | Create specialist huddle                  |
| POST   | `/api/v1/discussions/:id/huddles/:id/resolve` | Resolve huddle                            |
| GET    | `/api/v1/whatsapp/status`                     | WhatsApp connection state                 |
| GET    | `/api/v1/debug/*`                             | Race conditions, memory, pending requests |

## EVENT BUS

| Topic                         | Direction | Handler                                              |
| ----------------------------- | --------- | ---------------------------------------------------- |
| `discussion.agent.message`    | subscribe | Route agent message into active Socket.IO discussion |
| `security.auth.response`      | subscribe | Correlation-ID auth validation response              |
| `orchestration.control`       | publish   | Control messages                                     |
| `service.registry.register`   | publish   | Service registration on boot                         |
| `service.registry.deregister` | publish   | Service deregistration on shutdown                   |

## AUTH PATTERN (correlation-ID)

Socket.IO auth cannot use standard HTTP middleware. Pattern:

1. Socket auth handshake extracts token
2. Publishes `security.auth.validate` with UUID correlation ID
3. Registers one-time response handler in `Map<correlationId, resolve/reject>`
4. Awaits `security.auth.response` with matching correlation ID
5. HTTP fallback: `POST /api/v1/auth/validate` to security-gateway if event bus times out

In v3.0, auth validates against `navratna-gateway` instead.

## TURN STRATEGIES

`TurnStrategyService` supports: `round-robin`, `priority-based`, `expertise-based`, `debate-mode`. Strategy selected per discussion configuration.

## COMMANDS

```bash
pnpm --filter @uaip/discussion-orchestration dev
pnpm --filter @uaip/discussion-orchestration build
pnpm --filter @uaip/discussion-orchestration test   # 70% coverage, 15s timeout
```

## NOTES

- `enableEnterpriseEventBus: true` — compliance mode events via BullMQ (RabbitMQ removed)
- `SERVICE_ACCESS_MATRIX` validates enterprise database access patterns
- WhatsApp: `baileys` lib; QR pairing on first connect; session persisted to Redis
- **PM-324**: `EventDrivenDiscussionService` (RPC/publishAndWait pattern) is `@deprecated` — all discussion operations now served as direct Elysia HTTP routes in `routes/discussion_routes.ts`. Do not instantiate for new features.
- v3.0 target: Socket.IO setup + route handlers imported by `navratna-core`
