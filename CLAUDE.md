# CLAUDE.md

Guidance for Claude Code in this repository. This is the **single source of truth** for architecture, conventions, and commands. All other docs must be consistent with this file.

**Last verified against codebase: 2026-03-30**

## Product Identity

Navratna (UAIP) is a **multi-user metacognitive agent platform** with a Telescope intent-driven UI. Three convergent products on one runtime:

- **UAIP Core** — agent platform + Telescope UX (navratna-core + navratna-gateway)
- **BaseBench-Meta** — metacognitive reliability benchmark (standalone service, port 3009)
- **QuestionForge** — stakeholder discovery council (standalone service, port 3010)

Target: B2C + B2B. Keep RBAC, team personas, enterprise tiers.

## Stack

| Layer | Technology |
|---|---|
| Backend runtime | Bun |
| Backend framework | Elysia |
| Frontend | React 19 + Vite + Tailwind 4 |
| ORM | Drizzle (two-plane schema) |
| Event bus | BullMQ on Redis Streams |
| Databases | PostgreSQL + Neo4j + Qdrant + Redis |
| Auth | httpOnly JWT cookies (no localStorage tokens) |
| Monorepo | NX + pnpm workspaces |
| Linting | oxlint |
| Formatting | oxfmt |
| File naming | snake_case (backend .ts), PascalCase (React components .tsx) |

## Architecture — 3 Running Services

```
navratna-core (port 3001)
  ├── agent-intelligence   (FeatureFactory module — FEATURE_AGENT)
  ├── discussion-orchestration (FeatureFactory module — FEATURE_DISCUSSION)
  ├── artifact-service     (FeatureFactory module — FEATURE_ARTIFACTS)
  └── llm-service          (FeatureFactory module — FEATURE_LLM)

navratna-gateway (port 3002)
  ├── security-gateway     (FeatureFactory module — FEATURE_AUTH)
  ├── orchestration-pipeline (FeatureFactory module — FEATURE_ORCHESTRATION)
  └── capability-registry  (FeatureFactory module — FEATURE_REGISTRY)

questionforge (port 3010)        — standalone service
basebench-meta (port 3009)       — standalone service
```

The 7 legacy service directories (`agent-intelligence`, `discussion-orchestration`, `artifact-service`, `llm-service`, `security-gateway`, `orchestration-pipeline`, `capability-registry`) are **feature modules** imported by core/gateway via FeatureFactory. They are NOT independent running services. Each exports a `feature.ts` that registers routes, event subscriptions, and WebSocket handlers.

`marketplace-service` is **scheduled for removal** — do not add features to it.

### FeatureFactory Toggles

Service-level toggles exist as env vars (e.g., `FEATURE_AGENT`, `FEATURE_AUTH`). Default: all features ON (`!== 'false'`). These are allowed — they control module loading at startup, not runtime branching.

## Database — Two-Plane Drizzle Schema

Schemas at `apps/shared/services/src/database/drizzle/schemas/`:

- `intelligence_schema.ts` — agents, discussions, knowledge, artifacts, LLM (navratna-core)
- `control_schema.ts` — users, auth, tools, operations, security (navratna-gateway)
- `schema_base.ts` — shared base config

**Cross-plane foreign keys**: Use `CrossPlaneGuard.verify()`. No DB-level FK constraints across planes.

**No migration files exist** — schema applied via `drizzle-kit push`. Run `pnpm --filter @uaip/shared-services drizzle:generate` to produce migrations when needed.

**DO NOT** use TypeORM. The `src/entities/` files are legacy shims — never add TypeORM decorators.

## Event Bus — BullMQ on Redis

Implementation: `apps/shared/infra/src/event_bus.ts`

- Uses `Queue` + `Worker` from `bullmq`
- Publish/subscribe + RPC-style request/response
- Correlation IDs for tracing
- 3 retries with exponential backoff

**RabbitMQ is fully removed** from source code. Some stale references may exist in test/infrastructure compose files — ignore them.

## Auth — httpOnly Cookies

Implementation: `apps/backend/services/security-gateway/src/http/auth_elysia.ts`

- `access_token` + `refresh_token` as httpOnly cookies
- `sameSite: 'strict'`, `secure: true` in production
- Account lockout after 5 failed attempts (30 min)
- Socket.IO auth via correlation-ID pattern (publish `security.auth.validate`, await `security.auth.response`)

**No localStorage token reads.** Frontend uses `credentials: 'include'` on all API calls.

## Port Map

| Port | Service | Notes |
|---|---|---|
| 3001 | navratna-core | Agent intelligence, discussions, artifacts, LLM |
| 3002 | navratna-gateway | Auth, orchestration, capability registry |
| 3009 | basebench-meta | Metacognitive benchmark |
| 3010 | questionforge | Stakeholder discovery council |
| 5173 | frontend | Vite dev server |
| 8081 | api-gateway | Nginx reverse proxy |
| 5432 | PostgreSQL | Primary database |
| 7474/7687 | Neo4j | Graph database (HTTP/Bolt) |
| 6333/6334 | Qdrant | Vector database (HTTP/gRPC) |
| 6379 | Redis | Cache + BullMQ event bus |

## Frontend

- Entry: `apps/frontend/src/main.tsx` → `DesktopApp.tsx`
- Telescope: `apps/frontend/src/components/TelescopeSurface/`
- `DesktopUnified.tsx` has been **deleted** — Telescope is the primary interface
- All portals lazy-loaded via `portal_registry.tsx`
- Puppeteer/browser testing: use port **5173** (Vite dev server)

## Non-Obvious Facts

- `@ts-expect-error` in Elysia routes is intentional — middleware injects `user` context that TS can't infer through nested Elysia groups; always add a reason comment.
- CI workflows (`ci.yml`, `pr-checks.yml`) are stale — reference old paths. Tests do not currently run in CI. Use `nx run-many -t test` locally.
- `navratna-core` and `navratna-gateway` have minimal test coverage.
- **ALWAYS search before implementing** — never duplicate shared interfaces or utilities.
- Types/interfaces shared across services go to `apps/packages/shared-types`. Types used only within one file may stay local but must not be exported.

## Commands

```bash
pnpm dev                          # full stack
nx run @uaip/navratna-core:dev    # single service
pnpm build:shared                 # build shared packages first
pnpm test                         # all tests via NX
pnpm lint && pnpm format          # oxlint + oxfmt
docker-compose up -d              # infra (postgres, neo4j, redis, qdrant)
```

## Development Notes

- NX monorepo + pnpm workspaces — think globally, extend configs
- EC2 instance with Docker Compose hot-reload — changes apply immediately
- Access: Frontend http://localhost:5173 | API http://localhost:8081 | Credentials: admin/admin

## Key Specs (read order for new agents)

1. This file (CLAUDE.md) — architecture truth
2. `docs/specs/07-STRATEGIC-VISION-2026.md` — roadmap and phase status
3. `docs/specs/00-SOVEREIGN-SHELL-PRD.md` — product requirements
4. `docs/specs/02-REPLACEMENT-SPEC.md` — migration status and hard constraints

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
