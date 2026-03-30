# Backend Vision — UAIP Metacognitive Agent Platform

> **For AI agents:** This is the canonical vision document for the backend. Read alongside `CLAUDE.md` (repo root) and `apps/backend/AGENTS.md`. The strategic source is `docs/specs/07-STRATEGIC-VISION-2026.md`.

**Last verified:** 2026-03-30 | **Status:** Active

---

## The One-Sentence Thesis

UAIP is a metacognitive business intelligence that knows what it knows, knows what it doesn't, asks instead of guesses, catches its own errors, and updates when corrected — manifested as an ambient interface that already knows what you need before you type.

The backend is the metacognitive engine behind this. It is not a CRUD API — it is a reasoning, relevance-scoring, event-sourcing, multi-agent orchestration platform with three products running on one runtime.

---

## Three Products, One Runtime

```
                 ┌─────────────────────────────────────┐
                 │          UAIP CORE RUNTIME            │
                 │  navratna-core (3001) · navratna-    │
                 │  gateway (3002) · Triple-store ·      │
                 │  MCP · FeatureFactory                 │
                 └──────────┬──────────┬────────────────┘
                            │          │
            ┌───────────────┤          ├───────────────┐
            ▼               ▼          ▼               ▼
   ┌──────────────┐  ┌────────────┐  ┌──────────────────┐
   │ BaseBench-   │  │QuestionForge│  │ Business Ops     │
   │ Meta (:3009) │  │ (:3010)    │  │ Verticals        │
   │              │  │            │  │ (via MCP +       │
   │ Metacognitive│  │ Stakeholder│  │  Ontology)       │
   │ Reliability  │  │ Discovery  │  │                  │
   │ Benchmark    │  │ Council    │  │ Finance · HR ·   │
   └──────────────┘  └────────────┘  │ Legal · PM · Ops │
                                     └──────────────────┘
```

---

## Current Architecture (v3.0 — FeatureFactory)

### Two Running Services + Two Standalone Products

| Service              | Port | Role                                                           |
| -------------------- | ---- | -------------------------------------------------------------- |
| **navratna-core**    | 3001 | FeatureFactory: agents + discussions + artifacts + LLM         |
| **navratna-gateway** | 3002 | FeatureFactory: auth + orchestration + capability registry     |
| **basebench-meta**   | 3009 | Standalone — metacognitive benchmark suite (MVP complete)      |
| **questionforge**    | 3010 | Standalone — stakeholder discovery council (MVP complete)      |

### FeatureFactory Pattern

> "Each thing should be able to work in a symphony or as a single note — like MIDI through different instruments."

Every domain is a `Feature` — a self-contained unit with a standard interface:

```typescript
interface Feature {
  readonly name: string
  initialize?(deps: ServiceDeps): Promise<void>
  routes?(app: Elysia): Elysia
  events?(bus: EventBusService): Promise<void>
  websocket?(io: SocketIOServer): void
  shutdown?(): Promise<void>
}
```

- **navratna-core** and **navratna-gateway** are `FeatureFactory` compositions — zero own business logic
- Legacy services (`agent-intelligence`, `discussion-orchestration`, etc.) become thin standalone runners using the same Feature objects
- Toggle features at runtime: `FEATURE_AGENT=false bun navratna-core`

### Legacy Services (Feature Module Sources)

The 7 legacy service directories are **not** running services — they are source modules that navratna-core/gateway import directly:

| Module                     | Consumed By       | Feature Flag          |
| -------------------------- | ----------------- | --------------------- |
| `agent-intelligence`       | navratna-core     | `FEATURE_AGENT`       |
| `discussion-orchestration` | navratna-core     | `FEATURE_DISCUSSION`  |
| `artifact-service`         | navratna-core     | `FEATURE_ARTIFACTS`   |
| `llm-service`              | navratna-core     | `FEATURE_LLM`         |
| `security-gateway`         | navratna-gateway  | `FEATURE_AUTH`        |
| `orchestration-pipeline`   | navratna-gateway  | `FEATURE_ORCHESTRATION` |
| `capability-registry`      | navratna-gateway  | `FEATURE_REGISTRY`    |

> `marketplace-service` is scheduled for removal. Do not add features to it.

---

## Data Architecture — Triple-Store Knowledge Foundation

All knowledge is stored across three specialized stores with UUID-consistent sync:

| Store          | Role                                    | Tech         | Port  |
| -------------- | --------------------------------------- | ------------ | ----- |
| PostgreSQL     | ACID entities, RBAC, event ledger       | Drizzle ORM  | 5432  |
| Neo4j          | Graph relationships, knowledge topology | Bolt/HTTP    | 7687  |
| Qdrant         | Vector embeddings, semantic search      | gRPC/HTTP    | 6333  |
| Redis          | Hot cache, BullMQ event bus             | BullMQ       | 6379  |

**Two-plane Drizzle schema:**
- `intelligence_schema.ts` — agents, discussions, knowledge, artifacts, LLM (navratna-core domain)
- `control_schema.ts` — users, auth, tools, operations, security (navratna-gateway domain)

Cross-plane access: use `CrossPlaneGuard.verify()`. No DB-level FK constraints across planes.

---

## Relevance Engine — The Core Algorithm

```
relevance(entity, intent, context) → score
```

4-factor scoring (383 lines — `agent-intelligence/src/routes/constellation.routes.ts`):

| Factor     | Weight | Source  | Notes                                    |
| ---------- | ------ | ------- | ---------------------------------------- |
| Vector     | 40%    | Qdrant  | Semantic embedding similarity            |
| Graph      | 30%    | Neo4j   | Relationship topology, entity centrality |
| Recency    | 20%    | Redis   | Time-weighted access frequency           |
| Keyword    | 10%    | PG FTS  | Full-text search fallback                |

**API:** `POST /api/v1/agents/relevance` (navratna-core)
**Gate:** Precision@4 > 80% (eval harness built: `agent-intelligence/src/eval/relevancePrecision.ts`)

---

## Event Bus — BullMQ on Redis Streams

Implementation: `apps/shared/infra/src/event_bus.ts`

- `Queue` + `Worker` from BullMQ
- Publish/subscribe + RPC-style request/response
- Correlation IDs for distributed tracing
- 3 retries with exponential backoff

**RabbitMQ is fully removed.** `SERVICE_ARCHITECTURE.md` references are stale — ignore them.

### Active Event Topics

| Topic                       | Publisher          | Subscriber         |
| --------------------------- | ------------------ | ------------------ |
| `security.auth.validate`    | navratna-core      | navratna-gateway   |
| `security.auth.response`    | navratna-gateway   | navratna-core      |
| `discussion.agent.message`  | discussion-orch    | navratna-core      |
| `agent.created`             | agent-intelligence | any                |
| `artifact.generation.requested` | discussion-orch | artifact-service  |

> navratna-gateway's `setupEventSubscriptions()` is currently empty — Socket.IO auth always falls back to HTTP `GET /api/v1/auth/validate`.

---

## Auth Architecture

- `access_token` + `refresh_token` as httpOnly cookies
- `sameSite: 'strict'`, `secure: true` in production
- 5 OAuth providers + MFA + RBAC
- Account lockout after 5 failed attempts (30 min)
- Socket.IO auth: correlation-ID pattern → `security.auth.validate` → 5s timeout → HTTP fallback
- **No localStorage tokens.** Frontend uses `credentials: 'include'` on all requests.

---

## MCP Protocol

2,100+ lines across `capability-registry`. 10 transport types. Jira/GitHub/Gmail/Slack OAuth adapters. `jira_outcome_bridge_service.ts` closes the value leak loop: Jira outcomes feed back into the relevance engine as training signal.

---

## Metacognitive Agent Layer (Phase 1 — Complete)

4 cognitive services in `backend/shared/services/src/cognitive/`:

| Service                         | Role                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| `metaReasoning.interceptor.ts`  | 5-action gate: proceed / clarify / delegate / abstain / escalate |
| `capabilityGapRadar.service.ts` | Pre-task capability assessment, readiness scoring (5-min cache) |
| `confidenceGatedExecution.ts`   | Dynamic thresholds from EMA accuracy profiles                |
| `explanationDAG.service.ts`     | Reasoning graph: observation/inference/assumption/conclusion  |

These services sit between intent analysis and action — agents cannot "just run" without metacognitive approval.

---

## Ambient Intelligence Layer (Phase 1 — Complete)

- `processArchaeology.service.ts` — crawls data sources, extracts entities, infers relationships, proposes ontology
- `entityMatcher.service.ts` — 5-signal matching (name/sample/semantic/structural/co-occurrence)
- `taskDAG.service.ts` — NL goal → TaskDAG with topological sort + parallel batch execution
- 8 workflow templates (onboard, deploy, investigate-bug, create-feature, security-audit, data-migration, code-review, stakeholder-update)

**Gate:** Time to first meaningful insight < 5 minutes after onboarding

---

## What's Next — Phase 2 (Flywheel)

| Area                           | Key Items                                                                 | Priority |
| ------------------------------ | ------------------------------------------------------------------------- | -------- |
| **Missing routes**             | Full agent CRUD, tool CRUD/execute, workspace routes into FeatureFactory   | P0       |
| **FeatureFactory completion**  | Move inline `agent-intelligence/src/index.ts` routes to route files       | P0       |
| **Security hardening**         | Column-level encryption (replace `'salt'`), mTLS, DLP scanner            | P0       |
| **Sub-path exports**           | `@uaip/shared-services/persona`, `/decision-engine`, `/cognitive`, etc.   | P1       |
| **MCP Extension Ecosystem**    | MCP Forge SDK, Extension Sandbox, Widget Extensions, Revenue-Share        | P1       |
| **Model optimization**         | Shadow Jury, Smallest Viable Model routing, Cost-Quality Pareto Engine    | P2       |
| **Business Ops verticals**     | Persona=Employee, Discussion=Contract, Artifact=Invoice via MCP ontology  | P2       |
| **Agent Delegation**           | Tool Foraging, Delegation Handshake, Agent Spawn Mesh, PEOR loop          | P2       |

---

## Hard Gates (Non-Negotiable)

| Metric                              | Target         | Current Status                  |
| ----------------------------------- | -------------- | ------------------------------- |
| Relevance Precision@4               | > 80%          | Eval harness built, not run     |
| Intent-to-rendered-component        | < 500ms        | Wired, not measured             |
| Time to first meaningful insight    | < 5 min        | Service built, not benchmarked  |
| Agent self-escalation rate          | > 0            | Services built, not integrated  |
| httpOnly cookie auth                | 100% endpoints | Enforced                        |
| No RabbitMQ references in runtime   | Zero           | Clean                           |
| No TypeORM decorators added         | Zero           | Legacy shims exist, don't touch |

---

## Production Readiness Checklist

**Layer A — Structural (approved, awaiting execution):**
- [ ] `@uaip/shared-services` sub-path exports (8 paths listed in `navratna-production-ready.md`)
- [ ] Delete duplicate service copies; shared-services is canonical
- [ ] Inline agent CRUD routes extracted from `agent-intelligence/src/index.ts`
- [ ] Missing routes (`toolRoutes.ts`, `workspaceRoutes.ts`, `projects.elysia.ts`) added to navratna-gateway

**Layer B — Infrastructure:**
- [ ] Replace `'salt'` and `'default-key'` encryption stubs with KMS envelope encryption
- [ ] `navratna-gateway.setupEventSubscriptions()` — wire `security.auth.validate` subscriber
- [ ] CI pipeline restored (currently stale, tests don't run)
- [ ] Known 501 stubs in oauth routes (`github get_repo`, `gmail get_message`)

**Layer C — TypeScript migration:** Separate sprint (`navratna-ts-migration.md`)

---

## Key Files for New Backend Agents

| File                                             | Read When                                     |
| ------------------------------------------------ | --------------------------------------------- |
| `navratna/CLAUDE.md`                             | Always — architecture truth                   |
| `apps/backend/AGENTS.md`                         | Overview of all services and their status     |
| `apps/backend/services/navratna-core/AGENTS.md`  | Working on agent/discussion/artifact/LLM      |
| `apps/backend/services/navratna-gateway/AGENTS.md` | Working on auth/orchestration/capabilities  |
| `docs/specs/07-STRATEGIC-VISION-2026.md`         | Full roadmap + phase status                   |
| `.sisyphus/plans/navratna-production-ready.md`   | FeatureFactory refactor plan (approved)       |
| `apps/shared/services/src/cognitive/`            | Metacognitive services                        |
| `apps/shared/infra/src/event_bus.ts`             | BullMQ event bus implementation               |
