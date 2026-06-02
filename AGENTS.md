# NAVRATNA — KNOWLEDGE BASE

**Project**: Sovereign Cognitive Shell / Unified Agent Intelligence Platform (UAIP)
**Version**: 3.1 | Backend 90% complete | v3.0 consolidation in progress (7 services → 2)
**Stack**: TypeScript + Bun + Elysia (backend), React 19 + Vite + Tailwind 4 (frontend)
**Build System**: NX (task orchestration, dep graph, caching) + pnpm workspaces

## OVERVIEW

Metacognitive agent OS with multi-agent orchestration, triple-store knowledge (PostgreSQL + Neo4j + Qdrant), real-time WebSocket discussions, MCP protocol, and an ambient "Telescope" UI. Three converging products: UAIP Core (agent platform), BaseBench-Meta (metacognitive benchmark), QuestionForge (stakeholder discovery).

## STRUCTURE

```
navratna/
├── apps/
│   ├── frontend/                  # @council/frontend — React 19 + Vite SPA (port 5173)
│   ├── backend/                   # Backend workspace root
│   │   └── services/              # 13 microservices (v2 legacy + v3 consolidated + oie library)
│   ├── packages/
│   │   ├── shared-types/          # @uaip/types — all TS types/enums/interfaces
│   │   ├── shared-utils/          # @uaip/utils — logger (Winston), utilities
│   │   └── contracts/             # @uaip/contracts — service contracts
│   └── shared/
│       ├── services/              # @uaip/shared-services — BaseService, all domain services
│       ├── infra/                 # @uaip/infra — raw DB/queue clients (TypeORM, Neo4j, Qdrant, Redis, BullMQ)
│       ├── middleware/            # @uaip/middleware — JWT auth, rate limit, metrics, CSRF
│       ├── llm-service/           # @uaip/llm-service — LLM provider abstraction
│       └── config/                # @uaip/config — env/config loading
├── api-gateway/nginx.conf         # nginx reverse proxy → port 8081
├── docker-compose.yml             # Legacy dev compose (all services inline) — prefer infrastructure/ compose files
├── infrastructure/                # All Docker Compose files: core infra, monitoring stack, multi-machine topologies
├── monitoring/                    # OTel collector config, Prometheus config (referenced by infrastructure/ compose)
├── database/                      # Init scripts, migrations, seed data
├── deploy/                        # cloudflare/ (Worker + Pages), fly/ (Fly.io)
├── docs/                          # Architecture, specs, API reference
└── sample.env                     # Template for .env — never commit .env
```

## WHERE TO LOOK

| Task                    | Location                                                                  |
| ----------------------- | ------------------------------------------------------------------------- |
| Add new API endpoint    | `apps/backend/services/<name>/src/http/*.elysia.ts` (or `src/routes/`)    |
| Add new UI page/portal  | `apps/frontend/src/components/futuristic/portals/` + `portalRegistry.tsx` |
| Shared TypeScript types | `apps/packages/shared-types/src/`                                         |
| Shared backend services | `apps/shared/services/src/`                                               |
| Auth middleware         | `apps/shared/middleware/src/authMiddleware.ts` or `JWTValidator.ts`       |
| LLM provider logic      | `apps/shared/llm-service/src/`                                            |
| DB entities/schema      | `apps/shared/services/src/entities/` and `src/database/drizzle/schemas/`  |
| Event bus subscriptions | Each service `src/index.ts` — look for `eventBusService.subscribe(...)`   |
| nginx routing rules     | `api-gateway/nginx.conf`                                                  |
| Env vars reference      | `sample.env`                                                              |

## SERVICE MAP

| Service                  | npm pkg                          | Port | Status       | Purpose                                                                                      |
| ------------------------ | -------------------------------- | ---- | ------------ | -------------------------------------------------------------------------------------------- |
| **navratna-core**        | `@uaip/navratna-core`            | 3001 | ⚡ v3 active | Consolidates: agent-intelligence + discussion-orchestration + artifact-service + llm-service |
| **navratna-gateway**     | `@uaip/navratna-gateway`         | 3002 | ⚡ v3 active | Consolidates: security-gateway + orchestration-pipeline + capability-registry                |
| agent-intelligence       | `@uaip/agent-intelligence`       | 3001 | 🔄 legacy    | Agents, personas, memory, LLM chat, discussions                                              |
| security-gateway         | `@uaip/security-gateway`         | 3004 | 🔄 legacy    | Auth, JWT, MFA, OAuth (Jira/GitHub/Slack/Confluence), approvals                              |
| capability-registry      | `@uaip/capability-registry`      | 3003 | 🔄 legacy    | Tool registry, MCP protocol, sandbox execution, Neo4j sync, Canva integration (PM-22)        |
| orchestration-pipeline   | `@uaip/orchestration-pipeline`   | 3002 | 🔄 legacy    | Workflow engine, tasks, projects, saga compensation                                          |
| discussion-orchestration | `@uaip/discussion-orchestration` | 3005 | 🔄 legacy    | Socket.IO discussions, Elysia HTTP discussion/persona routes (PM-324), turn strategies, WhatsApp |
| artifact-service         | `@uaip/artifact-service`         | 3006 | 🔄 legacy    | AI-powered code/PRD/doc generation, Drizzle ORM                                              |
| llm-service              | `@uaip/llm-service-api`          | 3007 | 🔄 legacy    | LLM provider routing, model catalog bootstrap                                                |
| marketplace-service      | `@uaip/marketplace-service`      | 3008 | ⚠️ removal   | Agent/persona marketplace                                                                    |
| questionforge            | `@uaip/questionforge`            | 3010 | 🆕 product   | Stakeholder discovery council                                                                |
| basebench-meta           | `@uaip/basebench-meta`           | 3009 | 🆕 product   | Metacognitive reliability benchmark                                                          |
| oie                      | `@uaip/oie`                      | —    | 🆕 library   | Operational Intelligence Engine — BullMQ pipeline (collector→triage→analyst→fix→verify→learn); Feature-mounted into navratna-core/gateway, no standalone port |

## COMMANDS

> **Orchestrator**: NX handles all task execution, dependency ordering, and caching. pnpm scripts are thin aliases that delegate to `nx run` / `nx run-many`. You can use either.

```bash
# Install
pnpm install

# Dev (hot-reload, full stack)
pnpm dev                                              # all services via NX (pnpm dev:frontend + pnpm dev:backend)
pnpm dev:frontend                                     # → nx run @council/frontend:dev (port 5173)
pnpm dev:backend                                      # → nx run-many -t dev --projects=tag:backend-service

# Dev — single service (NX direct)
nx run @uaip/navratna-core:dev                        # port 3001 (bun --hot)
nx run @uaip/navratna-gateway:dev                     # port 3002 (bun --hot)
nx run @uaip/questionforge:dev                        # port 3010 (bun --hot)
nx run @uaip/basebench-meta:dev                       # port 3009 (bun --hot)
pnpm --filter @uaip/<service-name> dev                # equivalent pnpm form

# Build — NX resolves dependency order automatically
pnpm build                                            # → nx run-many -t build (full dep graph)
pnpm build:shared                                     # shared packages only (types → utils → contracts → infra → …)
pnpm build:backend                                    # backend services (shared packages built first by NX)
pnpm build:frontend                                   # → nx run @council/frontend:build

# Lint & format
pnpm lint                      # oxlint (NOT ESLint)
pnpm lint:fix                  # auto-fix
pnpm format                    # oxfmt (NOT Prettier)

# Test
pnpm test                      # → nx run-many -t test
pnpm test:integration          # full integration suite (requires Docker)
pnpm test:artifacts            # artifact-service demo scripts
pnpm --filter @uaip/<name> test   # per-service

# NX utilities
nx graph                       # visualise dependency graph in browser
nx show projects               # list all project names
nx affected -t test            # run tests only for changed projects (CI)

# Infrastructure
docker compose -f infrastructure/docker-compose.infrastructure.yml up -d                          # core infra (postgres, neo4j, redis, qdrant)
docker compose -f infrastructure/docker-compose.infrastructure.yml --profile monitoring up -d     # + full monitoring stack (SignOZ, Sentry, Prometheus, Grafana)
docker compose -f infrastructure/docker-compose.test.yml up -d                                    # test infra (offset ports: postgres→5433, redis→6380)

# Access
# Frontend dev:   http://localhost:5173
# API Gateway:    http://localhost:8081
# API Docs:       http://localhost:8081/docs
# Health:         http://localhost:8081/health
```

## CONVENTIONS

**Import aliases** — always use workspace imports, never relative paths across packages:

```typescript
// ✅ Correct
import { Agent } from '@uaip/types';
import { logger } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';
import { authMiddleware } from '@uaip/middleware';
import { config } from '@uaip/config';
// Within a service, use @/ alias
import { AgentService } from '@/services/agentService';

// ❌ Never
import { Agent } from '../../../shared/types/src/agent';
```

**Toolchain** — `oxlint` (not ESLint), `oxfmt` (not Prettier). Config in `.oxlintrc.json` / `.oxfmtrc.json`. `pnpm lint` runs oxlint.

**Logging** — use `logger` from `@uaip/utils`, never `console.log/debug/info`. `console.warn/error` are allowed by oxlint but prefer structured logger.

**HTTP framework** — all backend services use **Elysia** (Bun-native), not Express. Routes registered via `this.app.get/post/put/delete/group()`. Extend `BaseService` from `@uaip/shared-services`.

**Commit format** — `type(scope): subject`. Types: `feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert`. Required scopes: `frontend`, `backend`, `agent-intelligence`, `security-gateway`, `capability-registry`, `orchestration-pipeline`, `discussion-orchestration`, `artifact-service`, `api-gateway`, `docker`, `ci`, `deps`, `shared`, `types`, `utils`, `middleware`, `config`, `services`.

**Naming** — camelCase functions/variables, PascalCase React components/classes, kebab-case file/folder names.

**Unused vars** — prefix with `_` to suppress the oxlint error: `const _unused = ...`

**Lint suppression** — always include a reason comment on the same line:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia app types are dynamic
// oxlint-disable-next-line exhaustive-deps -- loadHistory is memoized, safe to omit
```

**No inline types/interfaces** — never define types or interfaces inline (in function signatures, variable declarations, or return types). Always extract to a named type/interface in the appropriate types file (`@uaip/types` for shared, or a local `types.ts` for service-scoped):

```typescript
// ✅ Correct — named and extracted
type CreateAgentParams = { name: string; personaId: string; config: AgentConfig };
function createAgent(params: CreateAgentParams): Agent { ... }

// ❌ Never — inline type
function createAgent(params: { name: string; personaId: string; config: AgentConfig }): { id: string; status: string } { ... }
```

**No circular dependencies** — modules must form a DAG. If A imports B, B must never import A (directly or transitively). Resolve via dependency inversion, shared interfaces in `@uaip/types`, or event-based decoupling.

**Separation of concerns** — each module/file has a single responsibility. Do not mix HTTP handlers with business logic, business logic with data access, or type definitions with implementations. Layer structure: routes → services → repositories → entities.

## ANTI-PATTERNS

- `var` declarations — use `const` / `let`
- Relative imports across package boundaries — use `@uaip/*` aliases
- `console.log/debug/info` — use `logger` from `@uaip/utils`
- `any` type without comment — use `unknown` or typed generics
- Empty `catch(e) {}` — always log with structured message
- `httpHeaders` (live API keys) leaving the process — strip in `sanitizeServerState()`
- Default JWT secret (`DEFAULT_DEV_SECRET`) in production — `JWTValidator` throws `FATAL`
- Importing test files from production code (`not-to-spec` rule)
- Circular dependencies — resolve via dependency inversion
- Re-implementing stubs in `databaseService.ts`, `widgetService.ts`, `toolRegistry.ts` — those are known TODO placeholders, not gaps to fill

## TESTING

- **Framework**: **Vitest** (backend + frontend). `vitest.config.ts` is the active runner everywhere — no jest configs exist anywhere in the codebase.
- **Coverage thresholds**: middleware 80%, security-gateway/discussion-orchestration/navratna-core/navratna-gateway 70%, orchestration-pipeline 75%; capability-registry and shared-services have no thresholds
- **File convention**: `src/__tests__/unit/*.test.ts`, `src/__tests__/integration/*.test.ts`
- **Shared test utilities**: `apps/shared/services/src/__tests__/helpers/testUtils.ts` (TestUtils: mock repos, pool, DB, eventBus, logger, UUID helpers) and `mocks/serviceMocks.ts` (ServiceMockFactory, 12 mock factories)
- **Setup files**: `src/__tests__/setup.ts` — `afterEach(() => vi.clearAllMocks())`, sets `NODE_ENV=test`, suppresses SIGTERM handlers; security-gateway setup also adds `toBeOneOf()` custom matcher + `createMockRequest/Response/Next`
- **No tests**: questionforge, artifact-service, llm-service, oie have no `vitest.config.ts`; basebench-meta uses `tsx --test` (Node.js built-in runner). navratna-core/gateway were added in PM-208/209.
- **Integration tests**: require Docker — run `docker-compose -f infrastructure/docker-compose.test.yml up -d` first; offset ports postgres→5433, redis→6380; rabbitmq:5673 in compose file is stale (RabbitMQ removed from prod)
- **Per-service test run**: `pnpm --filter @uaip/<name> test`

## SECURITY

- All requests flow through nginx API gateway (port 8081) → `auth_request` validates JWT → forwards `X-User-ID`, `X-User-Email`, `X-User-Role` headers → services trust these headers
- JWT validation: `@uaip/middleware` `JWTValidator` or `requireNginxAuth` — use `attachNginxAuth` for nginx-forwarded auth, `attachAuth` for direct JWT
- MFA via TOTP (`speakeasy`); OAuth via Jira/GitHub/Slack/Confluence adapters in security-gateway
- CORS managed entirely at nginx level — do not add CORS headers in individual services
- Env vars from `.env` (derived from `sample.env`) — never commit secrets

## DATABASE SCHEMA

**Two-plane Drizzle ORM schema** (no TypeORM — `src/entities/` files are legacy shims):

| Plane                   | File                     | Owned by         | Tables                                                                                                                |
| ----------------------- | ------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Intelligence** (PC-A) | `intelligence_schema.ts` | navratna-core    | agents, personas, discussions, messages, knowledge_items, artifacts, llm_providers, llm_models, short_links           |
| **Control** (PC-B)      | `control_schema.ts`      | navratna-gateway | users, sessions, tokens, mfa, oauth, tools, mcp_servers, operations, tasks, projects, security_policies, audit_events |

**Cross-plane constraint**: No DB-level FKs between planes. Use `CrossPlaneGuard.verify(pool, table, id, entityName)` before any cross-plane write.

```typescript
import { getIntelligenceDb, getControlDb, CrossPlaneGuard } from '@uaip/shared-services';
// Schema changes → apps/shared/services/src/database/drizzle/schemas/{intelligence,control}_schema.ts
// Migrations: pnpm --filter @uaip/shared-services drizzle:generate (new) / drizzle:push (dev sync). Baseline migration 0000_odd_tyrannus.sql exists (PM-244). Canonical path is Drizzle migrate; legacy SQL scripts 008/009 are superseded (PM-246).
```

## INFRASTRUCTURE

- **PostgreSQL** 5432 — primary database (Drizzle ORM, two-plane schema above)
- **Neo4j** 7474/7687 — graph relationships, recommendations, knowledge graph
- **Qdrant** 6333 — vector embeddings (1024-dim default; TEI mode: 768-dim)
- **Redis** 6379 — cache, sessions, pub/sub, BullMQ event bus
- **nginx** 8081 — API gateway, auth validation, rate limiting, CORS

**Monitoring stack** (`--profile monitoring` in `infrastructure/docker-compose.infrastructure.yml`):
- **SignOZ** 3301 — APM: traces/metrics/logs via OpenTelemetry (ClickHouse-backed, query-service on 8080)
- **OTel Collector** 4317 (gRPC) / 4318 (HTTP) — OpenTelemetry ingestion endpoint
- **Sentry** 9000 — error tracking + perf monitoring (Kafka `apache/kafka:3.7.1` + Snuba + ClickHouse)
- **Prometheus** 9090 — metrics scraping (config: `monitoring/prometheus.yml`)
- **Grafana** 3000 — dashboards (default: admin/admin)

## NOTES

- **Build order**: NX resolves this automatically via `dependsOn: ["^build"]` in `nx.json`. You never need to manually sequence builds. `pnpm build` (or `nx run-many -t build`) handles the full dep graph. `pnpm build:shared` is available if you want to pre-warm shared packages before starting dev servers.
- **`@ts-expect-error` in Elysia routes** — intentional pattern where middleware injects user context TypeScript can't infer through nested Elysia groups; always add a reason comment.
- **`marketplace-service`** is scheduled for removal in v3.0 — avoid adding features to it.
- **v3.0 consolidation**: `navratna-core` and `navratna-gateway` import route handlers directly from sibling service `src/` directories — this is intentional for zero-copy consolidation.
- **ORM**: Drizzle (not TypeORM). `src/entities/` files are thin re-export shims — never add TypeORM decorators there.
- **Event bus**: BullMQ on Redis only — RabbitMQ has been removed. `run-integration-tests.sh` script is stale (still references rabbitmq port 5673).
- **CI workflows are stale** — reference old `backend/` path (pre-NX). Tests don't run in CI currently.
- **`navratna-core` and `navratna-gateway` smoke tests**: `scripts/smoke-test-core.sh` (14 route groups) and `scripts/smoke-test-gateway.sh` (23 route groups). Unit/integration tests added PM-208/209 with 70% coverage thresholds.
- **Default credentials** (dev only): `admin` / `admin` at `http://localhost:5173`.
- **FeatureFactory pattern**: each legacy service exports `feature.ts` with a `Feature` interface (initialize/routes/events/websocket/shutdown). Consolidated services (navratna-core/gateway) import and register these via `FeatureFactory` — controlled by `FEATURE_*` env vars, default ON.
- **CrossPlaneGuard**: `CrossPlaneGuard.verify(pool, table, id, entityName)` is defined in `@uaip/shared-services` but **not yet called in production code** — cross-plane writes are not currently guarded at the application layer.
- **`navratna-core` own pipeline**: `RepoIngestionService`, `AstSymbolExtractor`, `SemanticIndexService`, `ImportGraphService` are navratna-core's own native services (not imported from legacy). Exposed at `POST /api/v1/knowledge/ingest`.
- **OIE (Operational Intelligence Engine)**: `@uaip/oie` is a library-only Feature (no HTTP port, no `dev` script). Runs a BullMQ pipeline: SigNoz/Sentry collector → triage → auto-Jira + analyst (stub) → fix proposer (stub) → verifier (stub) → learner (stub) + 5-min SLO reconciliation loop. Ready to mount via `FeatureFactory` but not yet imported by navratna-core/gateway (no `FEATURE_OIE` wiring).
- **Canva integration (PM-22)**: `capability-registry/src/adapters/canva_adapter.ts` + `src/routes/canva_routes.ts`. OAuth 2.0 + 4 MCP tools (create-design, list-templates, export-design, update-brand-kit). Auth via `X-Canva-Access-Token` header on tool endpoints.
- **`persona_defaults.ts`** in `@uaip/types` is 4,014 lines of runtime persona seed data — the largest file in the codebase. It should not be treated as a types file.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
