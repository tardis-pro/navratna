# NAVRATNA — KNOWLEDGE BASE

**Project**: Sovereign Cognitive Shell / Unified Agent Intelligence Platform (UAIP)
**Version**: 3.1 | Backend 90% complete | v3.0 consolidation in progress (7 services → 2)
**Stack**: TypeScript + Bun + Elysia (backend), React 19 + Vite + Tailwind 4 (frontend)

## OVERVIEW

Metacognitive agent OS with multi-agent orchestration, triple-store knowledge (PostgreSQL + Neo4j + Qdrant), real-time WebSocket discussions, MCP protocol, and an ambient "Telescope" UI. Three converging products: UAIP Core (agent platform), BaseBench-Meta (metacognitive benchmark), QuestionForge (stakeholder discovery).

## STRUCTURE

```
navratna/
├── apps/
│   ├── frontend/                  # @council/frontend — React 19 + Vite SPA (port 5173)
│   ├── backend/                   # Backend workspace root
│   │   └── services/              # 12 microservices (v2 legacy + v3 consolidated)
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
├── docker-compose.yml             # Full stack: postgres:16, neo4j, redis:8, qdrant, rabbitmq
├── infrastructure/                # docker-compose.test.yml + multi-machine topologies
├── database/                      # Init scripts, migrations, seed data
├── deploy/                        # cloudflare/ (Worker + Pages), fly/ (Fly.io)
├── docs/                          # Architecture, specs, API reference
└── sample.env                     # Template for .env — never commit .env
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add new API endpoint | `apps/backend/services/<name>/src/http/*.elysia.ts` (or `src/routes/`) |
| Add new UI page/portal | `apps/frontend/src/components/futuristic/portals/` + `portalRegistry.tsx` |
| Shared TypeScript types | `apps/packages/shared-types/src/` |
| Shared backend services | `apps/shared/services/src/` |
| Auth middleware | `apps/shared/middleware/src/authMiddleware.ts` or `JWTValidator.ts` |
| LLM provider logic | `apps/shared/llm-service/src/` |
| DB entities/schema | `apps/shared/services/src/entities/` and `src/database/drizzle/schemas/` |
| Event bus subscriptions | Each service `src/index.ts` — look for `eventBusService.subscribe(...)` |
| nginx routing rules | `api-gateway/nginx.conf` |
| Env vars reference | `sample.env` |

## SERVICE MAP

| Service | npm pkg | Port | Status | Purpose |
|---------|---------|------|--------|---------|
| **navratna-core** | `@uaip/navratna-core` | 3001 | ⚡ v3 active | Consolidates: agent-intelligence + discussion-orchestration + artifact-service + llm-service |
| **navratna-gateway** | `@uaip/navratna-gateway` | 3002 | ⚡ v3 active | Consolidates: security-gateway + orchestration-pipeline + capability-registry |
| agent-intelligence | `@uaip/agent-intelligence` | 3001 | 🔄 legacy | Agents, personas, memory, LLM chat, discussions |
| security-gateway | `@uaip/security-gateway` | 3004 | 🔄 legacy | Auth, JWT, MFA, OAuth (Jira/GitHub/Slack/Confluence), approvals |
| capability-registry | `@uaip/capability-registry` | 3003 | 🔄 legacy | Tool registry, MCP protocol, sandbox execution, Neo4j sync |
| orchestration-pipeline | `@uaip/orchestration-pipeline` | 3002 | 🔄 legacy | Workflow engine, tasks, projects, saga compensation |
| discussion-orchestration | `@uaip/discussion-orchestration` | 3005 | 🔄 legacy | Socket.IO discussions, turn strategies, WhatsApp |
| artifact-service | `@uaip/artifact-service` | 3006 | 🔄 legacy | AI-powered code/PRD/doc generation, Drizzle ORM |
| llm-service | `@uaip/llm-service-api` | 3007 | 🔄 legacy | LLM provider routing, model catalog bootstrap |
| marketplace-service | `@uaip/marketplace-service` | 3008 | ⚠️ removal | Agent/persona marketplace |
| questionforge | `@uaip/questionforge` | 3010 | 🆕 product | Stakeholder discovery council |
| basebench-meta | `@uaip/basebench-meta` | 3009 | 🆕 product | Metacognitive reliability benchmark |

## COMMANDS

```bash
# Install
pnpm install

# Dev (hot-reload, full stack)
pnpm dev                       # frontend + backend concurrently
pnpm dev:frontend              # frontend only (port 5173)
pnpm dev:backend               # all backend services

# Build — ORDER MATTERS: shared types first
pnpm build                     # full: shared-types → shared-utils → backend → frontend
pnpm build:shared              # @uaip/types + @uaip/utils + @uaip/contracts
pnpm build:backend             # backend services only
pnpm build:frontend            # frontend only

# Lint & format
pnpm lint                      # oxlint (NOT ESLint)
pnpm lint:fix                  # auto-fix
pnpm format                    # oxfmt (NOT Prettier)

# Test
pnpm test                      # workspace-wide Jest
pnpm test:integration          # full integration suite (requires Docker)
pnpm test:artifacts            # artifact-service demo scripts

# Infrastructure
docker-compose up -d                                      # full stack (postgres, neo4j, redis, qdrant, rabbitmq)
docker-compose -f infrastructure/docker-compose.test.yml up -d  # test infra (offset ports)

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

- **Framework**: Jest + ts-jest (backend), Vitest (frontend)
- **Coverage thresholds**: middleware 80%, security-gateway/discussion-orchestration 70%, orchestration-pipeline 75%
- **File convention**: `src/__tests__/unit/*.test.ts`, `src/__tests__/integration/*.test.ts`
- **Shared test utilities**: `apps/shared/services/src/__tests__/helpers/testUtils.ts` (TestUtils) and `mocks/serviceMocks.ts` (ServiceMockFactory, 12 mock factories)
- **Setup files**: every service has `src/__tests__/setup.ts` — `beforeEach(() => jest.clearAllMocks())`, sets `process.env.NODE_ENV = 'test'`, suppresses SIGTERM handlers
- **Integration tests**: require Docker — run `docker-compose -f infrastructure/docker-compose.test.yml up -d` first; uses offset ports (postgres→5433, redis→6380, rabbitmq→5673)
- **Per-service test run**: `pnpm --filter @uaip/<name> test`

## SECURITY

- All requests flow through nginx API gateway (port 8081) → `auth_request` validates JWT → forwards `X-User-ID`, `X-User-Email`, `X-User-Role` headers → services trust these headers
- JWT validation: `@uaip/middleware` `JWTValidator` or `requireNginxAuth` — use `attachNginxAuth` for nginx-forwarded auth, `attachAuth` for direct JWT
- MFA via TOTP (`speakeasy`); OAuth via Jira/GitHub/Slack/Confluence adapters in security-gateway
- CORS managed entirely at nginx level — do not add CORS headers in individual services
- Env vars from `.env` (derived from `sample.env`) — never commit secrets

## INFRASTRUCTURE

- **PostgreSQL** 5432 — primary database (Drizzle ORM, 57+ tables)
- **Neo4j** 7474/7687 — graph relationships, recommendations, knowledge graph
- **Qdrant** 6333 — vector embeddings for semantic search (1024-dim)
- **Redis** 6379 — cache, sessions, pub/sub, BullMQ event bus
- **nginx** 8081 — API gateway, auth validation, rate limiting, CORS

## NOTES

- **Build order is mandatory**: `@uaip/types` and `@uaip/utils` must build before any backend service. Run `pnpm build:shared` first when in doubt.
- **`@ts-expect-error` in Elysia routes** — intentional pattern where middleware injects user context TypeScript can't infer through nested Elysia groups; always add a reason comment.
- **`marketplace-service`** is scheduled for removal in v3.0 — avoid adding features to it.
- **v3.0 consolidation**: `navratna-core` and `navratna-gateway` import route handlers directly from sibling service `src/` directories — this is intentional for zero-copy consolidation.
- **ORM**: Drizzle (not TypeORM). Schema in `apps/shared/services/src/database/drizzle/schemas/`.
- **Event bus**: BullMQ on Redis only — RabbitMQ has been removed.
- **Default credentials** (dev only): `admin` / `admin` at `http://localhost:5173`.
