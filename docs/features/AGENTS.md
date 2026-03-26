# docs/features — Feature Documentation

Reference docs for implemented features. For architecture/service map, see root `AGENTS.md`.

## Documents in this directory

| File | Description |
| ---- | ----------- |
| (add feature docs here as markdown files) | |

## Feature Areas

| Feature                   | Primary Service                        | Status   |
| ------------------------- | -------------------------------------- | -------- |
| Agent chat + memory       | agent-intelligence / navratna-core     | ✅ Active |
| Real-time discussions     | discussion-orchestration / navratna-core | ✅ Active |
| Artifact generation       | artifact-service / navratna-core       | ✅ Active |
| Auth + MFA + OAuth        | security-gateway / navratna-gateway    | ✅ Active |
| Tool registry + MCP       | capability-registry / navratna-gateway | ✅ Active |
| Workflow orchestration    | orchestration-pipeline / navratna-gateway | ✅ Active |
| Knowledge graph sync      | shared-services/knowledge-graph        | ✅ Active |
| Stakeholder discovery     | questionforge (port 3010)              | 🆕 Active |
| Metacognitive benchmark   | basebench-meta (port 3009)             | 🆕 Active |
| Agent marketplace         | marketplace-service                    | ⚠️ Removal |

## Key Architectural Patterns

**Human-in-the-loop approval**: Agent pauses execution, stores `PendingApproval` in memory, waits for `POST /approvals/:id` to resolve/reject. Timeout auto-rejects.

**Specialist huddle**: When `conversation-enhancement.service.ts` detects low response confidence, it auto-creates a multi-agent discussion to improve quality.

**3-tier agent memory**:
- Working memory — in-process context window
- Episodic memory — Neo4j via `EpisodicMemoryManager`
- Semantic memory — Qdrant via `SemanticMemoryManager` (1024-dim vectors)
- `MemoryConsolidator` promotes episodic → semantic on interval

**Knowledge UUID consistency**: Every knowledge item has the same UUID across PostgreSQL + Neo4j + Qdrant. `CrossPlaneGuard` enforces this. `KnowledgeBootstrapService.runPostSeedSync()` repairs inconsistencies.

**Socket.IO auth (correlation-ID)**: discussion-orchestration can't use HTTP middleware. It publishes `security.auth.validate` with a UUID, registers a one-time response handler, and awaits `security.auth.response` with matching correlation ID.
