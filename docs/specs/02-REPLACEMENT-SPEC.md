---
# Replacement Specification — Navratna v3.0

## Document Control
- **Version**: 2.4
- **Date**: 2026-03-26
- **Purpose**: Detail every technology swap, current status, and remaining work
- **Updated**: 2026-03-26 — Codebase audit v2.4. Corrected false "100% complete" claims on R2 and R3. Fixed all filename references (codebase now uses snake_case). Identified stale build artifacts and residual infra/script references.

---

## Hard Constraints (Non-Negotiable)

These constraints are locked. They apply retroactively to everything in this spec and everything written going forward. Confirmed by user 2026-03-24, reconfirmed 2026-03-25.

> **User directive (verbatim, 2026-03-24):** "i dont want express, typeorm, anywhere, no fallbacks, i dont want types/interface outside @packages/"
>
> **Concurred. No exceptions.** No Express anywhere. No TypeORM anywhere. No types or interfaces defined outside `apps/packages/`. No fallbacks, no feature flags, no rollback paths. Migrate, verify, delete. This is a single-owner machine — git revert is the only rollback.
>
> **2026-03-25 reconfirmation:** Constraints verified active across all remaining work (R2–R9). R1 (TypeORM) and R8 (Express) verified 100% complete via grep — zero hits. All remaining replacements execute under these same constraints. No new type/interface files may be created in service directories. No amqplib/RabbitMQ fallbacks. Auth goes straight to httpOnly cookies — no compatibility layer. Code splitting goes straight to React.lazy() — no lazy-load flag.

1. **No Express. Anywhere.** Not in source, not in types, not re-exported from shared packages. Elysia is the HTTP framework. If it is not Elysia, delete it. This includes Express-shaped shims (`interface Request/Response/NextFunction`, `asyncHandler`, `errorHandler` with 4-arg signature, `ExpressRequest/Response/NextFunction` type aliases).

2. **No TypeORM. Anywhere.** Not imported, not referenced, not named in class or variable names. Drizzle + raw `pg` Pool is the database layer. `TypeOrmService` must be renamed to `PgService`. File `typeormService.ts` must be renamed to `pgService.ts`. Test helpers must be rewritten. The word "typeorm" (case-insensitive) must not appear in any source file path, class name, variable name, or string literal.

3. **No types or interfaces defined outside `apps/packages/`.** Types shared across more than one service or component go to `apps/packages/shared-types`. Types used only within one file may stay local but must not be exported. Dedicated `types/` files within services are the first to migrate. Exception: Drizzle schema inferred types (`$inferSelect`, `$inferInsert`) stay co-located with their schema file. Component-local `interface Props` inside `.tsx` files — keep local, do not export.

4. **No fallbacks. No feature flags. No rollback strategies.** Single-owner system on one machine. Migrations go direct. Old code gets deleted, not preserved. Rollback = git revert.

### Validation Commands (run after every step)

```bash
# Zero results = passing
grep -ri "typeorm" --include="*.ts" --include="*.js" apps/ scripts/ | grep -v node_modules | grep -v dist/
grep -r "from 'express'" --include="*.ts" --include="*.js" apps/ | grep -v node_modules | grep -v dist/
grep -r "require('express')" --include="*.ts" --include="*.js" apps/ | grep -v node_modules | grep -v dist/
grep -r "ExpressRequest\|ExpressResponse\|ExpressNextFunction" --include="*.ts" apps/ | grep -v node_modules | grep -v dist/
```

---

## Current Status (2026-03-26 — Audit v2.4)

| #   | What                           | Status      | Notes                                                                                                                                                                 |
| --- | ------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TypeORM → Drizzle              | **100%** ✅ | `grep typeorm` → 0 source hits. Zero in lockfile. Zero in env/config.                                                                                                 |
| 2   | RabbitMQ → BullMQ              | **~85%** ⚠️ | Source code clean (0 amqplib hits). BullMQ wired. But: test/enterprise/infra compose files, 4 monitoring YAMLs, 2 scripts still reference rabbitmq.                   |
| 3   | 7 → 2 Services                 | **~80%** ⚠️ | navratna-core/gateway live; docker/nginx updated. But: 4 of 7 legacy index.ts still exist; marketplace-service directory not deleted; agent CRUD routes not imported. |
| 4   | DesktopUnified → Telescope     | **100%** ✅ | DesktopUnified.tsx + DesktopWorkspace.tsx deleted. All portals wired as lazy MaterializableBlocks in portal_registry.tsx.                                             |
| 5   | Framer Basic → Advanced        | **100%** ✅ | 7-state MICROEXPRESSION_VARIANTS wired in MaterializableBlock. layoutId + useMotionValue + gestures in TelescopeSurface.                                              |
| 6   | Code Splitting                 | **100%** ✅ | All portals lazy-loaded in portal_registry.tsx. Vite manualChunks configured. Suspense fallback implemented.                                                          |
| 7   | Auth Tokens → httpOnly cookies | **100%** ✅ | auth_elysia.ts sets httpOnly access_token + refresh_token cookies. api/client.ts uses withCredentials:true, no localStorage.                                          |
| 8   | Express elimination            | **100%** ✅ | `grep express` → 0 source hits. Transitive only via @modelcontextprotocol/sdk in lockfile.                                                                            |
| 9   | Types → `@packages/`           | **100%** ✅ | All service type files deleted. Zod schemas moved to @uaip/types pipeline_schemas.ts. frontend/src/types/ reduced to frontend_extensions.ts only.                     |

> **Filename Convention Note (2026-03-26)**: The codebase now uses **snake_case** for all filenames. This spec has been updated accordingly. Previous versions referenced camelCase/kebab-case names that no longer exist.

---

## Replacement 1: TypeORM → Drizzle ORM

### Rationale

TypeORM is the #1 performance bottleneck: N+1 query problems, heavy decorator/metadata overhead, poor tree-shaking. Drizzle: 0 runtime overhead, queries compile to SQL at build time.

### Verified Complete

- ✅ `grep -ri "typeorm" --include="*.ts" --include="*.js" apps/ scripts/` → **0 hits**
- ✅ `apps/shared/infra/src/database/pgService.ts` — `PgService` class with raw `pg.Pool`; `getDataSource()` and `getRepository()` stubbed to throw with clear error messages
- ✅ `typeormService.ts` deleted; `pgService.ts` is the replacement
- ✅ All 6 production files that called `getDataSource()`/`getRepository()` migrated to Drizzle repositories
- ✅ All TypeORM test helpers rewritten using Drizzle test pool
- ✅ `viralAgents.d.ts` — `DeepPartial<T>` replaced with `Partial<T>`
- ✅ `scripts/sop-builder.ts` — `@Entity`/`@Column` decorators removed
- ✅ All `import { ... } from 'typeorm'` removed across source and test files
- ✅ Health-check key renamed from `typeorm` to `postgres` in `infrastructureFactory.ts`
- ✅ Drizzle schema in `shared/services/src/database/drizzle/schemas/`; repositories in `shared/services/src/database/repositories/`

### Residual Cleanup

✅ Stale TYPEORM env vars removed from docker-compose.yml (2026-03-25).

### Validation

- `grep -r "from 'typeorm'" --include="*.ts" apps/ scripts/` → zero results ✅
- `grep -ri "typeorm" --include="*.ts" apps/ scripts/` → zero results ✅

---

## Replacement 2: RabbitMQ → BullMQ on Redis

### Rationale

RabbitMQ consumes 512MB RAM for simple pub/sub that Redis already handles. BullMQ provides priority queues, retries, delayed jobs, cron scheduling. Redis is already running.

### Verified Complete (Source Code)

- ✅ `grep -r "amqplib\|rabbitmq" --include="*.ts" apps/` → **0 hits**
- ✅ `apps/shared/infra/src/event_bus.ts` — fully rewritten with BullMQ + ioredis; no amqplib import (578 lines)
- ✅ `rabbitmq` service removed from main `docker-compose.yml`
- ✅ BullMQ `Queue`/`Worker` pattern implemented; public interface preserved
- ✅ `amqplib` removed from all `package.json` files
- ✅ RabbitMQ config removed from `sample.env`

### Actual EventBusService Implementation

```typescript
// apps/shared/infra/src/event_bus.ts
import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';

export class EventBusService {
  private redis: Redis;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private subscribers: Map<string, EventBusHandler[]> = new Map();

  async publish(topic: string, payload: UAIPEvent, opts?: EventBusPublishContext): Promise<void>;
  async subscribe(
    topic: string,
    handler: EventBusHandler,
    opts?: EventBusSubscriptionOptions
  ): Promise<void>;
  async close(): Promise<void>;
}
```

### Residual Cleanup

✅ Stale RABBITMQ_URL env vars removed from main docker-compose.yml (2026-03-25).

### Remaining Cleanup (2026-03-26 Audit)

The following still reference RabbitMQ and need cleanup:

| File                                               | What Remains                                                                                  | Priority                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `infrastructure/docker-compose.test.yml`           | Full `rabbitmq` service definition (lines 32–46), `rabbitmq_test_data` volume                 | **High** — test infra should match prod                    |
| `infrastructure/docker-compose.enterprise.yml`     | Full `rabbitmq-enterprise` service + `RABBITMQ_URL` injected into 3 app services              | Medium — enterprise compose is archived                    |
| `infrastructure/docker-compose.infrastructure.yml` | Orphaned `rabbitmq_data:` volume entry (line 147)                                             | Low                                                        |
| `scripts/run-integration-tests.sh`                 | `REQUIRED_SERVICES` includes rabbitmq; inline compose block; `export RABBITMQ_URL=amqp://...` | **High** — script will fail or start unnecessary container |
| `scripts/dev-start.sh`                             | `INFRASTRUCTURE_SERVICES` includes rabbitmq; `RABBITMQ_DEFAULT_USER/PASS` env vars            | **High** — dev startup spins up rabbitmq unnecessarily     |
| `monitoring/prometheus.yml`                        | Scrape target `rabbitmq:15692`                                                                | Medium                                                     |
| `monitoring/alerting_rules.yml`                    | `RabbitMQHighErrors` alert rule                                                               | Medium                                                     |
| `monitoring/performance_rules.yml`                 | `rabbitmq_messages_per_second`, `rabbitmq_queue_depth` recording rules                        | Medium                                                     |
| `monitoring/logging_rules.yml`                     | `rabbitmq_log_error_rate` recording rule                                                      | Medium                                                     |
| 10+ docs files                                     | Architecture docs, deployment guides, test setup — all reference RabbitMQ                     | Low — docs-only                                            |

---

## Replacement 3: 7 Microservices → 2 Consolidated Services

### Rationale

7 services × 512MB = 3.5GB RAM on a single-owner machine. Services with constant shared data flow (Agent Intelligence ↔ Discussion Orchestration ↔ LLM) add network latency for zero benefit.

### Consolidation Map

**NAVRATNA-CORE** (Port 3001): Agent Intelligence + Discussion Orchestration + Artifact Service + LLM Service

**NAVRATNA-GATEWAY** (Port 3002): Security Gateway + Orchestration Pipeline + Capability Registry

### Verified Complete

- ✅ `navratna-core/src/index.ts` (486 lines) — imports routes from agent-intelligence, artifact-service, llm-service, discussion-orchestration
- ✅ `navratna-gateway/src/index.ts` (82 lines) — imports routes from security-gateway (10 route files), orchestration-pipeline, capability-registry
- ✅ Both use `BaseService` + Elysia; `enableWebSocket: true` set on core
- ✅ **discussion-orchestration WebSocket fully wired into navratna-core** — `setupWebSocketHandlers`, `UserChatHandler`, `ConversationIntelligenceHandler`, `TaskNotificationHandler`, `StreamingHandler`, `CodingAgentSocketHandler`, `DebateHandler`, `WhatsAppHandler` all imported and instantiated
- ✅ `docker-compose.yml` — only `navratna-core` and `navratna-gateway` as application services; all 7 legacy service entries removed
- ✅ `api-gateway/nginx.conf` — upstreams point to `navratna_core:3001` and `navratna_gateway:3002`; all routing rules updated

### What Remains (2026-03-26 Audit — Correction)

**Previous claim "All 7 legacy index.ts deleted" was incorrect.** Only 3 of 7 were deleted.

| Legacy Service             | `src/index.ts`        | Notes                                                                      |
| -------------------------- | --------------------- | -------------------------------------------------------------------------- |
| `agent-intelligence`       | **EXISTS** (42 lines) | Stripped shell — still registers 2 route files                             |
| `discussion-orchestration` | **EXISTS** (73 lines) | Shell — no routes, services-only initialization                            |
| `artifact-service`         | **DELETED** ✅        | Only route/service files remain (imported by navratna-core)                |
| `llm-service`              | **DELETED** ✅        | Only route/service files remain (imported by navratna-core)                |
| `security-gateway`         | **DELETED** ✅        | Only `http/`, `routes/`, `services/` remain (imported by navratna-gateway) |
| `orchestration-pipeline`   | **EXISTS** (49 lines) | Full standalone service — still runnable independently                     |
| `capability-registry`      | **EXISTS** (50 lines) | Full standalone service — still runnable independently                     |

**Additional**: `marketplace-service/` directory still exists (not deleted per removal spec).

**Functional concern**: `agent-intelligence/src/index.ts` contains full agent/persona/discussion CRUD routes inline (not in extracted route files). navratna-core only imports `POST /api/v1/agents/relevance` via `agent_routes.js`. The nginx config routes `/api/v1/agents` → `navratna_core`, but the full CRUD endpoints may not be served. Verify this is not a live 404.

---

## Replacement 4: DesktopUnified → TelescopeSurface

### Rationale

DesktopUnified implements a window-manager metaphor: drag, resize, minimize, maximize, Z-index layering, taskbar, app launcher. Telescope eliminates all of this. One surface, responds to intent.

### Verified Complete

- ✅ `DesktopUnified.tsx` — deleted; no references remain in source
- ✅ `apps/frontend/src/components/TelescopeSurface/` — full suite: `TelescopeSurface.tsx`, `TelescopeKnowledgeSurface.tsx`, `ConstellationNode.tsx`, `portal_registry.tsx`, `use_constellations.ts`, `use_force_layout.ts`, `telescope_surface_types.ts`, `index.ts`, `AGENTS.md`
- ✅ All portals wrapped as lazy `MaterializableBlocks` in `portal_registry.tsx` — 20+ portals registered with `relevanceScore`, `expression`, `visibility`, `metadata`
- ✅ `renderPortalContent(portalId)` function renders portals in `<Suspense>` wrapper
- ✅ `autoArrangeBlocks` used for initial grid layout
- ✅ No feature flag; direct mount

**What was deleted:**

- `DesktopUnified.tsx` — all window drag/resize/minimize/maximize logic
- Taskbar component, app launcher grid, Z-index layering, desktop shortcuts, sticky notes, window state tracking

### Residual Check

✅ `DesktopWorkspace.tsx` deleted (2026-03-25) — was not mounted in app root.

See `04-TELESCOPE-SPEC.md` for full specification.

---

## Replacement 5: Framer Motion (Basic → Advanced)

### Verified Complete (2026-03-25)

- ✅ `MICROEXPRESSION_VARIANTS: Variants` — 7-state map (`calm`, `attentive`, `working`, `alarmed`, `confused`, `satisfied`, `strained`) in `MaterializableBlock.tsx`; each state maps Framer props: `opacity`, `scale`, `y`, `filter`, per-state `transition`; looping states use `repeat: Infinity`
- ✅ CSS `animation` properties removed from `working`, `alarmed`, `confused` states in `materializable_block_styles.ts` — Framer now owns these
- ✅ `motion.div` in `MaterializableBlock` uses `variants={MICROEXPRESSION_VARIANTS}`, `animate={block.expression}`
- ✅ `AnimatePresence mode="wait"` wrapper added; `layoutId={block.id}` for shared element transitions
- ✅ `drag={isDraggable}` with `onDragEnd` for absolute position update; `whileHover` + `whileTap` gestures
- ✅ `useMotionValue` + `useSpring` + `useTransform` for relevance-driven opacity in `MaterializableBlock`
- ✅ `TelescopeSurface.tsx` — `layoutId={block.id}` on `TelescopeBlock`; `useMotionValue`/`useSpring`/`useTransform` for relevance opacity; `whileHover`/`whileTap` gestures

---

## Replacement 6: Code Splitting (None → Full)

### Verified Complete

- ✅ `apps/frontend/src/components/TelescopeSurface/portal_registry.tsx` — all portals imported via `React.lazy()` with `.then(m => ({ default: m.ComponentName }))` pattern for named exports
- ✅ `renderPortalContent()` wraps all portal renders in `<Suspense fallback={<div className="animate-pulse h-full bg-white/5 rounded-xl" />}>`
- ✅ `apps/frontend/vite.config.ts` — `manualChunks` configured:

```typescript
manualChunks: {
  'vendor-react':  ['react', 'react-dom'],
  'vendor-framer': ['framer-motion'],
  'vendor-radix':  ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
  'vendor-socket': ['socket.io-client'],
  'vendor-query':  ['@tanstack/react-query'],
}
```

Expected impact: Initial bundle 500KB+ → ~150KB. TTI ~3s → ~1s.

---

## Replacement 7: Auth Token Storage

### Verified Complete

- ✅ `apps/backend/services/security-gateway/src/http/auth_elysia.ts` — login and refresh handlers set httpOnly cookies:
  - `cookie['access_token'].set({ httpOnly: true, secure: true, sameSite: 'strict', ... })`
  - `cookie['refresh_token'].set({ httpOnly: true, secure: true, sameSite: 'strict', ... })`
  - Logout handler clears both cookies with `maxAge: 0`
- ✅ `apps/frontend/src/api/client.ts` — `withCredentials: true` on Axios instance; `setAuthToken()` and `clearAuthToken()` are empty stubs (no localStorage)
- ✅ All WebSocket hooks (`useEnhancedWebSocket`, `useStreamingChat`, `useWhatsApp`, `useConversationIntelligence`) use `withCredentials: true`
- ✅ CSRF double-submit pattern preserved — `csrf-token` cookie set with `httpOnly: false`; `X-CSRF-Token` header injected by `CSRFService`
- ✅ No `localStorage.getItem/setItem` for auth tokens anywhere in frontend

---

## Replacement 8: Express → Elysia (Completion)

### Verified Complete

- ✅ `grep -r "from 'express'" --include="*.ts" apps/` → **0 hits**
- ✅ `grep -r "require('express')" --include="*.ts" apps/` → **0 hits**
- ✅ `grep -r "ExpressRequest\|ExpressResponse\|ExpressNextFunction" --include="*.ts" apps/` → **0 hits**
- ✅ `apps/backend/services/llm-service/src/test.js` — deleted (Express test server dead code)
- ✅ `apps/backend/services/marketplace-service/src/index.refactored.ts` — deleted
- ℹ️ `express` exists in `pnpm-lock.yaml` as transitive dependency of `@modelcontextprotocol/sdk@1.28.0` (MCP HTTP transport) — not a direct workspace dependency
- ℹ️ `apps/backend/UAIP_Backend_API_Collection.postman_collection.json` contains "express" in sample payload data — not application source code
- ✅ `capability-registry/src/controllers/capabilityController.ts` — rewritten as native Elysia handlers
- ✅ `capability-registry/src/controllers/toolController.ts` — rewritten as native Elysia handlers
- ✅ `capability-registry/src/routes/toolRoutes.ts` — bridge deleted, direct Elysia routes
- ✅ `capability-registry/src/routes/capabilityRoutes.ts` — bridge deleted, direct Elysia routes
- ✅ `apps/packages/shared-utils/src/errors.ts` — `ExpressRequest`, `ExpressResponse`, `ExpressNextFunction` type aliases removed; `errorHandler` replaced with Elysia-compatible `onError` hook
- ✅ `apps/backend/shared/middleware/src/integration-example.ts` — deleted or updated to Elysia context

---

## Replacement 9: Types → `apps/packages/` Only

### Rule

All exported types and interfaces used across more than one service or component live in `apps/packages/shared-types`. Types used only within one file may stay local but must not be exported. Drizzle schema inferred types (`$inferSelect`, `$inferInsert`) stay with their schema — they are exceptions.

### What Exists in `apps/packages/shared-types`

50+ domain type files covering: agent, api, artifact, audit, basebench, battle, capability, common, config, contextTriggers, conversation-intelligence, critique, database, debate, discussion, event-bus, events, frontend-api, frontend-auth, http, knowledge-graph, llm, marketplace, mcp, microexpression, models, operation, persona, personaAdvanced, personaConstants, personaDefaults, personaUtils, project, questionforge, security, service-auth, social, streaming, system, telescope, thought, tool, tools, ui-interfaces, user, websocket, widget, workspace.

### Verified Complete

| File                                                        | Status                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| `artifact-service/src/interfaces/ArtifactTypes.ts`          | ✅ Deleted — types in `@uaip/types` artifact module           |
| `artifact-service/src/interfaces/ServiceTypes.ts`           | ✅ Deleted — types in `@uaip/types` artifact module           |
| `capability-registry/src/types/tool-definition.ts`          | ✅ Deleted — types in `@uaip/types` tool module               |
| `orchestration-pipeline/src/sops/sop-types.ts`              | ✅ Deleted — types added to `@uaip/types`                     |
| `discussion-orchestration/src/websocket/websocket.types.ts` | ✅ Deleted — types merged into `@uaip/types` websocket module |
| `security-gateway/src/http/types/elysia-context.ts`         | ✅ Deleted — types merged into `@uaip/types` http module      |
| `frontend/src/types/frontend-extensions.ts`                 | ✅ Now a re-export shim only — no local type definitions      |
| `frontend/src/types/persona.ts`                             | ✅ Merged into `@uaip/types` persona module                   |

### What Remains

✅ All type migrations complete (2026-03-25):

- `orchestration-pipeline/src/types/schemas.ts` → moved to `apps/packages/shared-types/src/pipeline_schemas.ts`; exported from `@uaip/types` index
- `frontend/src/types/` — 8 re-export shims deleted; only `frontend_extensions.ts` (re-export shim + `createAgentStateFromShared()` utility) retained

### Rule for component-local interfaces

`interface Props { ... }` inside a `.tsx` component file — keep local, do not export. Already unexported = already fine.

---

## Remaining Work

### Previously Completed (2026-03-25)

| Item | Description                                                                          | Completed     |
| ---- | ------------------------------------------------------------------------------------ | ------------- |
| A1   | Remove stale TYPEORM_SYNC / TYPEORM_MIGRATIONS_RUN from docker-compose.yml           | ✅ 2026-03-25 |
| A2   | Remove stale RABBITMQ_URL from main docker-compose.yml                               | ✅ 2026-03-25 |
| A4   | Audit frontend/src/types/ — delete re-export shims                                   | ✅ 2026-03-25 |
| A5   | Delete DesktopWorkspace.tsx (not mounted in app root)                                | ✅ 2026-03-25 |
| B1   | Move Zod schemas from orchestration-pipeline/src/types/schemas.ts to @uaip/types     | ✅ 2026-03-25 |
| C1   | Wire 7-state microexpression system to Framer Motion variants in MaterializableBlock | ✅ 2026-03-25 |
| C2   | Add layoutId, useMotionValue, gesture recognition to TelescopeSurface                | ✅ 2026-03-25 |

### Outstanding Work (2026-03-26 Audit)

| Item | Description                                                                                                                                                            | Priority |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| D1   | Delete 4 remaining legacy `index.ts`: agent-intelligence, discussion-orchestration, orchestration-pipeline, capability-registry                                        | **High** |
| D2   | Verify agent CRUD routes (`GET/POST/PUT/DELETE /api/v1/agents`) are served by navratna-core — currently inline in legacy agent-intelligence/src/index.ts, not imported | **High** |
| D3   | Remove rabbitmq from `scripts/run-integration-tests.sh` (REQUIRED_SERVICES, inline compose, RABBITMQ_URL export)                                                       | **High** |
| D4   | Remove rabbitmq from `scripts/dev-start.sh` (INFRASTRUCTURE_SERVICES, RABBITMQ_DEFAULT_USER/PASS)                                                                      | **High** |
| D5   | Remove rabbitmq service from `infrastructure/docker-compose.test.yml`                                                                                                  | **High** |
| D6   | Remove rabbitmq-enterprise + RABBITMQ_URL from `infrastructure/docker-compose.enterprise.yml`                                                                          | Medium   |
| D7   | Remove orphaned `rabbitmq_data:` volume from `infrastructure/docker-compose.infrastructure.yml`                                                                        | Low      |
| D8   | Remove RabbitMQ scrape targets and rules from 4 monitoring YAML files                                                                                                  | Medium   |
| D9   | Delete marketplace-service directory                                                                                                                                   | Medium   |
| D10  | Clean stale build artifacts: `auth.elysia.js/.d.ts/.map` in security-gateway/src/http/                                                                                 | Low      |
| D11  | Clean stale build artifacts: `pipeline-schemas.js/.d.ts/.map` in shared-types/src/                                                                                     | Low      |

---

## Replacement Summary

| #   | What           | From             | To                | Status      | Remaining                                                            |
| --- | -------------- | ---------------- | ----------------- | ----------- | -------------------------------------------------------------------- |
| 1   | ORM            | TypeORM          | Drizzle           | **100% ✅** | —                                                                    |
| 2   | Message Bus    | RabbitMQ         | BullMQ/Redis      | **~85% ⚠️** | D3–D8: infra/scripts/monitoring cleanup                              |
| 3   | Services       | 7 microservices  | 2 consolidated    | **~80% ⚠️** | D1–D2, D9: delete legacy index.ts, verify routes, delete marketplace |
| 4   | UI Shell       | DesktopUnified   | TelescopeSurface  | **100% ✅** | —                                                                    |
| 5   | Animations     | Basic Framer     | Advanced Framer   | **100% ✅** | —                                                                    |
| 6   | Bundle         | Monolithic       | Code-split        | **100% ✅** | —                                                                    |
| 7   | Auth tokens    | localStorage     | httpOnly cookies  | **100% ✅** | —                                                                    |
| 8   | HTTP framework | Express remnants | Elysia            | **100% ✅** | —                                                                    |
| 9   | Types          | Scattered        | `@packages/` only | **100% ✅** | —                                                                    |

No feature flags. No rollback paths. No fallbacks. Migrate, verify, delete.

---
