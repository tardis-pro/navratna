# Integration Guide

**Last Updated**: 2026-03-30

## Overview

Navratna uses three communication patterns: synchronous REST (Elysia), asynchronous events (BullMQ on Redis), and real-time WebSocket (Socket.IO). Service discovery is via environment variables and Docker Compose networking.

## Communication Patterns

### 1. Synchronous REST (Elysia)

All HTTP APIs use Elysia. Services communicate via REST when synchronous response is needed.

```typescript
// Service-to-service HTTP call (e.g., core → gateway)
const response = await fetch(`${GATEWAY_URL}/api/v1/auth/validate`, {
  method: 'GET',
  headers: { Authorization: `Bearer ${token}` },
})
```

Service URLs are configured via environment variables (e.g., `SECURITY_GATEWAY_URL`). Docker Compose provides DNS resolution (e.g., `http://navratna-gateway:3002`).

### 2. Asynchronous Events (BullMQ)

Implementation: `apps/shared/infra/src/event_bus.ts`

**EventBusService** is a singleton providing:

```typescript
// Fire-and-forget event
await eventBusService.publish('agent.learning.operation', { agentId, result })

// Subscribe to events
await eventBusService.subscribe('security.auth.validate', async (event) => {
  // handle auth validation request
})

// RPC-style request/response with correlation ID
const response = await eventBusService.publishAndWaitForResponse(
  'security.auth.validate',
  { token, correlationId },
  5000 // timeout ms
)
```

**Job Configuration**:
- 3 retry attempts with exponential backoff
- Redis connection via `getBullMQConnection()`
- Correlation IDs for request-response tracking
- Reply handlers with timeout management

**Key Event Topics**:

| Topic | Publisher | Subscriber | Purpose |
|---|---|---|---|
| `security.auth.validate` | navratna-core | navratna-gateway | Socket.IO token validation |
| `security.auth.response` | navratna-gateway | navratna-core | Auth validation result |
| `agent.learning.operation` | agent-intelligence | agent-intelligence | Learning from operations |
| `agent.learning.interaction` | agent-intelligence | agent-intelligence | Learning from interactions |
| `agent-activity` | various | frontend (via Socket.IO) | Microexpression state changes |

### 3. Real-Time WebSocket (Socket.IO)

navratna-core hosts a Socket.IO server via `@socket.io/bun-engine` for real-time features:

- Discussion messages and turn management
- Agent activity and microexpression updates
- Operation status updates

## Socket.IO Auth — Correlation-ID Pattern

navratna-core cannot use HTTP middleware for Socket.IO connections. Instead, it authenticates via the event bus:

```
1. Client connects with token (auth header or query param)
2. Core publishes `security.auth.validate` with {token, correlationId}
3. Core registers one-time handler for `security.auth.response` matching correlationId
4. Gateway validates token → publishes {valid, userId, correlationId}
5. Core handler fires → attaches user to socket.data
6. If event bus times out (5s) → HTTP fallback to GET gateway/api/v1/auth/validate
```

Alternatively, clients can pass `x-user-id`, `x-user-email`, `x-user-role` headers to bypass event bus auth (UUID format validated).

## Error Handling

### Event Bus

- **Publish failures**: Logged, not thrown — event publishing is fire-and-forget
- **RPC timeouts**: `publishAndWaitForResponse` rejects after configurable timeout
- **Job retries**: Failed jobs retry 3x with exponential backoff
- **Graceful shutdown**: Workers drain before process exit

### HTTP

- **Service unavailable**: 503 returned when downstream service unreachable
- **Timeouts**: AbortController with 2.5s timeout on service-to-service calls
- **Multiple endpoints**: Auth validation tries multiple URLs (Docker DNS, localhost) before failing

## Service Map

| Service | URL | Purpose |
|---|---|---|
| navratna-core | `http://navratna-core:3001` | Agent intelligence, discussions, artifacts, LLM |
| navratna-gateway | `http://navratna-gateway:3002` | Auth, orchestration, capabilities |
| basebench-meta | `http://basebench-meta:3009` | Metacognitive benchmark |
| questionforge | `http://questionforge:3010` | Stakeholder discovery |
| api-gateway | `http://api-gateway:8081` | Nginx reverse proxy (frontend entry) |
