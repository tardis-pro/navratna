# UAIP System Architecture

**Version**: 3.0
**Last Updated**: 2026-03-30
**Last Verified Against Codebase**: 2026-03-30

## Overview

Navratna (UAIP) is a multi-user metacognitive agent platform. Three convergent products share one runtime:

- **UAIP Core** — agent platform + Telescope UX
- **BaseBench-Meta** — metacognitive reliability benchmark
- **QuestionForge** — stakeholder discovery council

### Core Design Principles

1. **Consolidated Services** — 7 legacy services merged into 2 via FeatureFactory pattern
2. **Event-Driven Communication** — BullMQ on Redis Streams
3. **Triple-Store Knowledge** — PostgreSQL (ACID) + Neo4j (graph) + Qdrant (vectors)
4. **Two-Plane Schema** — Intelligence plane and Control plane with CrossPlaneGuard
5. **Intent-Driven UI** — Telescope replaces traditional navigation
6. **Monorepo Organization** — NX + pnpm workspaces

## Service Architecture

```
                    ┌──────────────────┐
                    │   api-gateway    │
                    │   (nginx:8081)   │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────┐
   │navratna-core │  │navratna-gate │  │ frontend │
   │  (3001)      │  │  way (3002)  │  │  (5173)  │
   └──────────────┘  └──────────────┘  └──────────┘

   ┌──────────────┐  ┌──────────────┐
   │basebench-meta│  │questionforge │
   │  (3009)      │  │  (3010)      │
   └──────────────┘  └──────────────┘
```

### navratna-core (port 3001)

Consolidated intelligence service. Hosts 4 feature modules via FeatureFactory:

| Module | Env Toggle | Responsibility |
|---|---|---|
| agent-intelligence | FEATURE_AGENT | Agent chat, memory (3-tier), persona management, LLM integration, relevance engine |
| discussion-orchestration | FEATURE_DISCUSSION | Real-time WebSocket discussions, turn strategies, participant management |
| artifact-service | FEATURE_ARTIFACTS | Artifact generation and management |
| llm-service | FEATURE_LLM | Multi-provider LLM integration (OpenAI, Anthropic, Ollama) |

Includes Socket.IO server (via `@socket.io/bun-engine`) for real-time communication.

### navratna-gateway (port 3002)

Consolidated control service. Hosts 3 feature modules via FeatureFactory:

| Module | Env Toggle | Responsibility |
|---|---|---|
| security-gateway | FEATURE_AUTH | Auth (JWT + MFA + OAuth), RBAC, audit trails, httpOnly cookies |
| orchestration-pipeline | FEATURE_ORCHESTRATION | Workflow coordination, operation management, approval workflows |
| capability-registry | FEATURE_REGISTRY | Tool management, MCP client/server, tool discovery |

### Standalone Services

- **questionforge** (port 3010) — Stakeholder discovery council with 8 specialist personas
- **basebench-meta** (port 3009) — Metacognitive benchmark with 5 task families and MetaScore scoring

### FeatureFactory Pattern

Each legacy service directory exports a `feature.ts` that defines routes, event subscriptions, and WebSocket handlers. The consolidated services import these and register them:

```typescript
// navratna-core/src/index.ts
class NavratnaCoreService extends BaseService {
  private factory = new FeatureFactory()
    .register(process.env.FEATURE_AGENT !== 'false' && agentIntelligenceFeature)
    .register(process.env.FEATURE_DISCUSSION !== 'false' && discussionFeature)
    .register(process.env.FEATURE_ARTIFACTS !== 'false' && artifactFeature)
    .register(process.env.FEATURE_LLM !== 'false' && llmFeature)
}
```

All toggles default to ON. They control module loading at startup, not runtime branching.

## Database Architecture

### Two-Plane Drizzle Schema

Schemas at `apps/shared/services/src/database/drizzle/schemas/`:

| File | Plane | Used By | Contains |
|---|---|---|---|
| `intelligence_schema.ts` | Intelligence | navratna-core | Agents, discussions, knowledge, artifacts, LLM entities |
| `control_schema.ts` | Control | navratna-gateway | Users, auth, tools, operations, security entities |
| `schema_base.ts` | Shared | Both | Base configuration |

Cross-plane references use `CrossPlaneGuard.verify()` — no DB-level foreign key constraints between planes.

### Triple-Store Sync

Every knowledge item maintains the same UUID across all three stores:

```
PostgreSQL (structured data) ←→ Neo4j (graph relationships) ←→ Qdrant (vector embeddings)
                    └─── UUID consistency via KnowledgeBootstrapService ───┘
```

### Database Infrastructure

| Database | Version | Port(s) | Purpose |
|---|---|---|---|
| PostgreSQL | 18-alpine | 5432 | Primary ACID store, Drizzle schema |
| Neo4j | 2025.04.0 | 7474 (HTTP), 7687 (Bolt) | Graph relationships, knowledge graph |
| Qdrant | 1.14.1 | 6333 (HTTP), 6334 (gRPC) | Vector embeddings, semantic search |
| Redis | 8-alpine | 6379 | Cache, BullMQ event bus, sessions |

Schema management: `drizzle-kit push` (no migration files).

## Event-Driven Architecture

### BullMQ on Redis Streams

Implementation: `apps/shared/infra/src/event_bus.ts`

**EventBusService** (singleton):
- `publish(topic, data)` — fire-and-forget event publishing
- `subscribe(topic, handler)` — subscribe to topic events
- `publishAndWaitForResponse(topic, data, timeout)` — RPC-style with correlation IDs
- Job retry: 3 attempts with exponential backoff

**Key Event Topics**:
- `security.auth.validate` / `security.auth.response` — cross-service auth
- `agent.learning.operation` / `.interaction` / `.consolidate` — agent learning
- `agent-activity` — microexpression state changes

### Socket.IO Auth (Correlation-ID Pattern)

navratna-core authenticates Socket.IO connections via event bus:

1. Client connects with token
2. Core publishes `security.auth.validate` with correlation UUID
3. Core registers one-time handler for `security.auth.response`
4. Gateway validates token, publishes response with matching correlation ID
5. Core resolves auth and attaches user to socket
6. Fallback: HTTP GET to gateway `/api/v1/auth/validate` if event bus times out (5s)

## Security Architecture

### Authentication

- httpOnly JWT cookies (`access_token` + `refresh_token`)
- `sameSite: 'strict'`, `secure: true` in production
- Account lockout: 5 failed attempts → 30 min lock
- Rate limiting: 10 attempts per 15 minutes
- No localStorage token storage — frontend uses `credentials: 'include'`

### Authorization

- RBAC with roles: admin, developer, user, agent
- Fine-grained permissions per resource type
- Approval workflows for high-risk operations
- Agent capabilities scoped by persona

## Frontend Architecture

### Stack

- React 19 + Vite + Tailwind 4
- Entry: `apps/frontend/src/main.tsx` → `DesktopApp.tsx`
- Primary surface: `components/TelescopeSurface/`
- All portals lazy-loaded via `portal_registry.tsx`

### Telescope Components

| Component | Purpose |
|---|---|
| IntentField | Unified command palette + search (Cmd+K, 5 intent types) |
| MaterializableBlock | HOC wrapping portals with visibility states, relevance scores |
| Microexpression System | 7-state UI expressions (calm/attentive/working/alarmed/confused/satisfied/strained) |
| Relevance Engine | 4-factor scoring: vector (40%), graph (30%), recency (20%), keyword (10%) |
| TelescopeSurface | Physics-based intent surface composing all Telescope components |

### Key UX Principles

1. Ambient-first — system shows what matters before you ask
2. Effort gradient — zero effort (ambient) → light (type) → deep (precise queries)
3. Four working memory slots — max 4 primary items on surface
4. Silence is the feature — empty telescope = everything is working

## Infrastructure

### Docker Compose Services

| Service | Image | Port | Purpose |
|---|---|---|---|
| postgres | postgres:18-alpine | 5432 | Primary database |
| neo4j | neo4j:2025.04.0 | 7474, 7687 | Graph database |
| redis | redis:8-alpine | 6379 | Cache + event bus |
| qdrant | qdrant/qdrant:v1.14.1 | 6333, 6334 | Vector database |
| navratna-core | Custom Dockerfile | 3001 | Core service |
| navratna-gateway | Custom Dockerfile | 3002 | Gateway service |
| basebench-meta | uaip-backend-base | 3009 | Benchmark service |
| questionforge | uaip-backend-base | 3010 | Discovery council |
| frontend | Custom Dockerfile | 5173 | Vite dev server |
| api-gateway | nginx:alpine | 8081 | Reverse proxy |
| prometheus | prom/prometheus | 9090 | Metrics collection |
| grafana | grafana/grafana | 3000 | Dashboards |
| postgres-exporter | postgres-exporter | 9187 | DB metrics |

### Monitoring

Prometheus + Grafana + postgres-exporter. Structured JSON logs via Winston — use `docker compose logs` for log inspection.
