# Feature Documentation

**Last Updated**: 2026-03-30

## Service Architecture

### navratna-core (port 3001) — Feature Modules

| Module | Toggle | Features |
|---|---|---|
| agent-intelligence | FEATURE_AGENT | Agent chat, 3-tier memory, persona management, LLM integration, relevance engine, context analysis |
| discussion-orchestration | FEATURE_DISCUSSION | Real-time WebSocket discussions, turn strategies, participant management, analytics |
| artifact-service | FEATURE_ARTIFACTS | Artifact generation, versioning, deployment |
| llm-service | FEATURE_LLM | Multi-provider LLM (OpenAI, Anthropic, Ollama), model routing, token tracking |

### navratna-gateway (port 3002) — Feature Modules

| Module | Toggle | Features |
|---|---|---|
| security-gateway | FEATURE_AUTH | JWT auth, MFA scaffold, 5 OAuth providers, RBAC, audit trails, httpOnly cookies |
| orchestration-pipeline | FEATURE_ORCHESTRATION | Workflow coordination, operation management, approval workflows, saga patterns |
| capability-registry | FEATURE_REGISTRY | Tool management, MCP client/server (2100+ lines), tool discovery, sandboxed execution |

### Standalone Services

| Service | Port | Status | Description |
|---|---|---|---|
| questionforge | 3010 | Active | 8 specialist personas, council debate, question ranking, stakeholder packs, interview capture |
| basebench-meta | 3009 | Active | 8 task families, MetaScore scoring (6 components + 2 penalty terms), REST API, seeded test cases |
| marketplace-service | — | Removal | Scheduled for removal. Do not add features. |

## Key Architectural Patterns

**FeatureFactory**: Each legacy service directory exports `feature.ts`. Consolidated services register modules via `FeatureFactory.register()`. Env-var toggles (e.g., `FEATURE_AGENT`) control startup loading — default ON.

**Human-in-the-loop approval**: Agent pauses execution, stores `PendingApproval` in memory, waits for `POST /approvals/:id` to resolve/reject. Timeout auto-rejects.

**Specialist huddle**: When `conversation-enhancement.service.ts` detects low response confidence, it auto-creates a multi-agent discussion to improve quality.

**3-tier agent memory**:
- Working memory — in-process context window (pressure-based consolidation)
- Episodic memory — Neo4j via `EpisodicMemoryManager` (significance: importance x novelty x success x impact)
- Semantic memory — Qdrant via `SemanticMemoryManager` (1024-dim vectors, concept confidence + usage tracking)
- `MemoryConsolidator` promotes episodic → semantic on interval

**Knowledge UUID consistency**: Every knowledge item has the same UUID across PostgreSQL + Neo4j + Qdrant. `CrossPlaneGuard` is defined in `@uaip/shared-services` for this purpose but **not yet called in production code**. `KnowledgeBootstrapService.runPostSeedSync()` repairs inconsistencies post-seed.

**Socket.IO auth (correlation-ID)**: navratna-core publishes `security.auth.validate` with a UUID, registers a one-time response handler, and awaits `security.auth.response` with matching correlation ID. Fallback: HTTP GET to gateway `/api/v1/auth/validate`.
