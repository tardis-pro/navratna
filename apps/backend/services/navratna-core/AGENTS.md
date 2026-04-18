# navratna-core — @uaip/navratna-core

**Port**: 3001 | **Entry**: `src/index.ts` | **Status**: ⚡ v3 Active (primary development target)

v3.0 consolidated service. Combines agent-intelligence + discussion-orchestration + artifact-service + llm-service into one process. Imports route handlers directly from sibling service `src/` directories.

## PURPOSE

Single-process replacement for 4 legacy services. All agent intelligence, real-time discussions, artifact generation, and LLM routing in one Bun process with shared memory (no inter-process event bus overhead for these domains).

## STRUCTURE

```
src/
└── index.ts     # NavratnaCoreService extends BaseService — mounts routes + Socket.IO (486 lines)
```

Two source layers: (1) own native services under `src/services/` (repo ingestion pipeline); (2) routes imported from legacy service `src/` directories (not full coverage — see gaps below).

### Own native services (not from legacy)

| Service | Purpose |
| ------- | ------- |
| `RepoIngestionService` | Ingests git repos — clones, walks files, dispatches to extractors |
| `AstSymbolExtractor` | Tree-sitter AST parsing — extracts functions/classes/imports |
| `SemanticIndexService` | Generates embeddings → upserts to Qdrant |
| `ImportGraphService` | Builds import dependency graph → Neo4j |

Exposed at: `POST /api/v1/knowledge/ingest` — accepts `{ repoUrl, branch?, depth? }`, returns job ID.

### Imported routes

Registered via `FeatureFactory.mountRoutes()` through the feature instances in `index.ts`. Also declared as a type stub in `src/app.ts`.

| Import                           | Source                                                             | Exposes                                                                   |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `registerAgentRoutes`            | `agent-intelligence/src/routes/agent_routes.ts`                    | `POST /api/v1/agents/relevance`                                           |
| `registerAgentCrudRoutes`        | `agent-intelligence/src/routes/agents_crud_routes.ts`              | Agent CRUD under `/api/v1/agents`                                         |
| `registerAgentChatRoutes`        | `agent-intelligence/src/routes/agent_chat_routes.ts`               | `POST /api/v1/agents/:id/chat`, approvals                                 |
| `registerAgentCapabilityRoutes`  | `agent-intelligence/src/routes/agent_capability_routes.ts`         | Capability/learning routes under `/api/v1/agents`                         |
| `registerAgentMemoryRoutes`      | `agent-intelligence/src/routes/agent_memory_routes.ts`             | Memory CRUD under `/api/v1/agents/:id/memory`                             |
| `registerConstellationRoutes`    | `agent-intelligence/src/routes/constellation_routes.ts`            | `POST /api/v1/knowledge/constellations`                                   |
| `registerCognitivePortraitRoutes`| `agent-intelligence/src/routes/cognitive_portrait_routes.ts`       | `GET/POST /api/v1/users/:userId/cognitive-portrait`, personalization      |
| `registerPersonaRoutes`          | `discussion-orchestration/src/routes/persona_routes.ts`            | Persona CRUD under `/api/v1/personas`                                     |
| `registerDiscussionRoutes`       | `discussion-orchestration/src/routes/discussion_routes.ts`         | Discussion CRUD + messaging under `/api/v1/discussions`                   |
| `registerArtifactRoutes`         | `artifact-service/src/routes/artifact_routes.ts`                   | 8 routes under `/api/v1/artifacts`                                        |
| `registerShortLinkRoutes`        | `artifact-service/src/routes/short_link_routes.ts`                 | 7 routes under `/api/v1/links` + `/s/:shortCode`                          |
| `registerLLMRoutes`              | `llm-service/src/routes/llm_routes.ts`                             | 17 routes under `/api/v1/llm`                                             |
| `registerUserLLMRoutes`          | `llm-service/src/routes/user_llm_routes.ts`                        | 13 routes under `/api/v1/user/llm`                                        |
| `registerKnowledgeIngestRoutes`  | `navratna-core/src/routes/knowledge_ingest_routes.ts`              | `POST /api/v1/knowledge/ingest`                                           |
| `registerDeploymentRoutes`       | `navratna-core/src/deployment/deployment_routes.ts`                | Deployment management under `/api/v1/deploy`                              |
| `registerOnboardingRoutes`       | `navratna-core/src/onboarding/onboarding_routes.ts`                | Onboarding config generation                                              |
| `registerCompositionRoutes`      | `navratna-core/src/composition/composition_routes.ts`              | Workflow composition under `/api/v1/compose`                              |

### ⚠️ CRITICAL GAP

Full agent CRUD (`/api/v1/agents`), chat (`/api/v1/agents/:id/chat`), memory management, persona CRUD, and discussion endpoints are **inline** in `agent-intelligence/src/index.ts` — they are NOT in the extracted route files. These endpoints are **not accessible via navratna-core**; they require the legacy `agent-intelligence` service to be running.

### Socket.IO handlers (from discussion-orchestration)

Imported: `UserChatHandler`, `ConversationIntelligenceHandler`, `TaskNotificationHandler`, `StreamingHandler`, `CodingAgentSocketHandler`, `DebateHandler`, `WhatsAppHandler`, `setupWebSocketHandlers`. Each wrapped in `try/catch` — silent degradation on failure.

**Engine**: `@socket.io/bun-engine`, path `/socket.io/`, pingInterval 25s, pingTimeout 60s

| Namespace                    | Handler                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/` (default)                | `setupWebSocketHandlers` — full discussion lifecycle: join/leave rooms, messages, typing, turns, reactions |
| `/conversation-intelligence` | `ConversationIntelligenceHandler`                                                                          |
| `/streaming`                 | `StreamingHandler`                                                                                         |
| `/coding-agent`              | `CodingAgentSocketHandler`                                                                                 |

## WHAT IT EXPOSES

- Agent CRUD, chat, capability, memory routes (`/api/v1/agents`)
- `POST /api/v1/agents/relevance` — relevance scoring
- `POST /api/v1/knowledge/constellations` — multi-agent constellation coordination
- `GET/POST /api/v1/users/:userId/cognitive-portrait` — cognitive portrait + calibration
- `GET /api/v1/users/:userId/personalization-vector` — per-user personalization
- Persona CRUD (`/api/v1/personas`)
- Discussion CRUD + messaging (`/api/v1/discussions`)
- All artifact, short-link, LLM, and user-LLM routes (see service AGENTS.md files)
- `POST /api/v1/knowledge/ingest` — repo ingestion (native service)
- Deployment, onboarding, and composition routes
- `GET /health`
- Socket.IO namespaces (4)

## AUTH

Socket.IO auth (correlation-ID pattern):

1. Extract token from `socket.handshake.auth.token` / `Authorization: Bearer` / `query.token`
2. Publish `security.auth.validate` with UUID correlation ID → await `security.auth.response` (5s timeout)
3. HTTP fallback: `GET http://navratna-gateway:3002/api/v1/auth/validate` (then `http://localhost:3002`)

## COMMANDS

```bash
pnpm --filter @uaip/navratna-core dev     # bun --hot src/index.ts (or tsx)
pnpm --filter @uaip/navratna-core build
```

## NOTES

- Pre-existing TypeScript errors in `src/index.ts` — packages not yet built in dev. Run `pnpm build:shared` first.
- `dev` script uses `nodemon --exec tsx`, not `bun --hot` — hot reload is slower than expected.
- `enableEnterpriseEventBus: true` — compliance mode BullMQ queue (RabbitMQ removed)
- When adding new **artifact/llm** features: add to the legacy service's route files — navratna-core picks them up via import.
- When adding new **agent/discussion** features: add to the legacy `agent-intelligence` or `discussion-orchestration` service. Note that the full agent CRUD is inline in `agent-intelligence/src/index.ts` and is NOT yet extracted to route files — v3.0 consolidation for agents is incomplete.
- `setupEventSubscriptions()` subscribes to `discussion.agent.message` and `security.auth.response` — these are the only event bus subscriptions.
- Redis session manager uses DB index 2 (`REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` env vars).
