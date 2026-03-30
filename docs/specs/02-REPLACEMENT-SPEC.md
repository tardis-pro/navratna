---
# Replacement Specification — Navratna v3.0
## Document Control
- **Version**: 2.7
- **Date**: 2026-03-30
- **Purpose**: Detail every technology swap, current status, and remaining work
- **Updated**: 2026-03-30 v2.7 — Hard constraint #4 relaxed: FeatureFactory service-level toggles formally allowed. Violation flag resolved.
- **Previous**: 2026-03-29 — Code review v2.6. Oracle-assisted deep review of 179 unstaged files (+3,158/-7,769 lines). **Two critical findings**: (1) new discussion/persona routes have zero auth — anonymous create/update/delete, (2) shared `DiscussionService` doesn't load participants before start/turn flows, breaking lifecycle logic. Participant migration silently drops `displayName`/`permissions`/`turnOrder`/`turnWeight`. R3 status downgraded from ~90% to ~75%. New E-items E6–E9 added. FeatureFactory interface docs corrected to match actual code.
- **Previous**: 2026-03-29 v2.5 — FeatureFactory architecture introduced across all 7 legacy services. All services now have `feature.ts` + FeatureFactory-based `index.ts`. Legacy services are modernized as importable feature modules, not deleted. Type guards replace `as any` casts across routes handlers. DRY refactoring in controllers. Discussion-orchestration local services deleted (2,709 lines). Shared schema base extracted. Hard constraint violation flagged: FeatureFactory env-var toggles (`process.env.FEATURE_X !== 'false'`) contradict the "no feature flags" rule — requires user decision.

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

4. **No fallback code paths. No runtime feature branching. No rollback strategies.** Migrations go direct. Old code gets deleted, not preserved. Rollback = git revert. **Exception**: service-level FeatureFactory toggles (e.g., `FEATURE_AGENT`, `FEATURE_AUTH`) are allowed — they control module loading at startup, not runtime branching. These toggles default to ON and exist for operational flexibility (e.g., disabling a feature module during debugging).

### Validation Commands (run after every step)

```bash
# Zero results = passing
grep -ri "typeorm" --include="*.ts" --include="*.js" apps/ scripts/ | grep -v node_modules | grep -v dist/
grep -r "from 'express'" --include="*.ts" --include="*.js" apps/ | grep -v node_modules | grep -v dist/
grep -r "require('express')" --include="*.ts" --include="*.js" apps/ | grep -v node_modules | grep -v dist/
grep -r "ExpressRequest\|ExpressResponse\|ExpressNextFunction" --include="*.ts" apps/ | grep -v node_modules | grep -v dist/
```

---

## Current Status (2026-03-29 — Review v2.6)

| #   | What                           | Status      | Notes                                                                                                                                                                                                                  |
| --- | ------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TypeORM → Drizzle              | **100%** ✅ | `grep typeorm` → 0 source hits. Zero in lockfile. Zero in env/config.                                                                                                                                                  |
| 2   | RabbitMQ → BullMQ              | **~85%** ⚠️ | Source code clean (0 amqplib hits). BullMQ wired. But: test/enterprise/infra compose files, 4 monitoring YAMLs, 2 scripts still reference rabbitmq.                                                                    |
| 3   | 7 → 2 Services                 | **~75%** 🔴 | FeatureFactory architecture complete. All 7 legacy services modernized. **Blockers**: new discussion/persona routes have zero auth (E6); shared `DiscussionService` doesn't load participants for start/turn (E7); participant migration drops fields (E8). See ⚠️ constraint flag. |
| 4   | DesktopUnified → Telescope     | **100%** ✅ | DesktopUnified.tsx + DesktopWorkspace.tsx deleted. All portals wired as lazy MaterializableBlocks in portal_registry.tsx.                                                                                              |
| 5   | Framer Basic → Advanced        | **100%** ✅ | 7-state MICROEXPRESSION_VARIANTS wired in MaterializableBlock. layoutId + useMotionValue + gestures in TelescopeSurface.                                                                                               |
| 6   | Code Splitting                 | **100%** ✅ | All portals lazy-loaded in portal_registry.tsx. Vite manualChunks configured. Suspense fallback implemented.                                                                                                           |
| 7   | Auth Tokens → httpOnly cookies | **100%** ✅ | auth_elysia.ts sets httpOnly access_token + refresh_token cookies. api/client.ts uses withCredentials:true, no localStorage.                                                                                           |
| 8   | Express elimination            | **100%** ✅ | `grep express` → 0 source hits. Transitive only via @modelcontextprotocol/sdk in lockfile.                                                                                                                             |
| 9   | Types → `@packages/`           | **100%** ✅ | All service type files deleted. Zod schemas moved to @uaip/types pipeline_schemas.ts. frontend/src/types/ reduced to frontend_extensions.ts only.                                                                      |

> **Resolved (2026-03-30)**: FeatureFactory env-var toggles are formally allowed under updated constraint #4. They control service startup composition, not runtime behavior.

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

### FeatureFactory Architecture (2026-03-29, corrected v2.6)

All 7 legacy services now follow a uniform `feature.ts` + FeatureFactory pattern. Each service exports a `Feature` object (4 optional lifecycle hooks: `initialize`, `routes`, `events`, `websocket`, `shutdown`). The consolidated services (`navratna-core`, `navratna-gateway`) compose features via `new FeatureFactory().register(feature)` and call lifecycle methods in sequence. Standalone services also use FeatureFactory in their `index.ts`.

```typescript
// apps/shared/services/src/feature_factory.ts (64 lines) — actual interface
export interface Feature {
  readonly name: string;
  initialize?(deps: ServiceDeps): Promise<void>;
  routes?<TApp extends Elysia>(app: TApp): TApp;
  events?(bus: EventBusService): Promise<void>;
  websocket?(io: MinimalWebSocketServer): void;
  shutdown?(): Promise<void>;
}

export class FeatureFactory {
  register(feature: Feature | null | false): this;
  get activeFeatureNames(): string[];
  async initialize(deps: ServiceDeps): Promise<void>;
  mountRoutes<TApp extends Elysia>(app: TApp): TApp;
  async subscribeEvents(bus: EventBusService): Promise<void>;
  mountWebSocket(io: MinimalWebSocketServer): void;
  async shutdown(): Promise<void>;
}
```

**navratna-core** composes 4 features: `agentIntelligenceFeature`, `discussionFeature`, `artifactFeature`, `llmFeature`.

**navratna-gateway** composes 3 features: `securityFeature`, `orchestrationFeature`, `capabilityFeature`.

### Verified Complete

- ✅ `navratna-core/src/index.ts` — uses FeatureFactory with 4 features; env-var toggles per feature (⚠️ see constraint flag above)
- ✅ `navratna-gateway/src/index.ts` — uses FeatureFactory with 3 features; env-var toggles per feature (⚠️ see constraint flag above)
- ✅ Both use `BaseService` + Elysia; `enableWebSocket: true` set on core
- ✅ **discussion-orchestration WebSocket fully wired into navratna-core** — all handlers imported and instantiated via feature lifecycle
- ✅ `docker-compose.yml` — only `navratna-core` and `navratna-gateway` as application services; all 7 legacy service entries removed
- ✅ `api-gateway/nginx.conf` — upstreams point to `navratna_core:3001` and `navratna_gateway:3002`; all routing rules updated
- ✅ **All 7 legacy services have `feature.ts`** — each exports a `Feature` consumed by the consolidated services
- ⚠️ **Discussion-orchestration local services deleted** (2,709 lines): `discussion_service.ts`, `participant_management_service.ts`, `persona_service.ts` — absorbed by `@uaip/shared-services` canonical versions. **However**: shared `DiscussionService` does not load participants before start/turn flows (see E7). Participant migration drops `displayName`/`permissions`/`turnOrder`/`turnWeight` (see E8).
- 🔴 **New discussion/persona route files lack auth** — `discussion_routes.ts` and `persona_routes.ts` added state-changing endpoints with zero auth middleware; several paths default to `'system'`/`'anonymous'` on missing `x-user-id` (see E6).
- ✅ **Shared schema base extracted**: `apps/shared/services/src/database/drizzle/schemas/schema_base.ts` — common Drizzle columns (`id`, `createdAt`, `updatedAt`, `isActive`)
- ✅ **New shared utilities**: `cognitive/agent_capability_utils.ts` (event bus capability fetcher), `utils/async_helpers.ts` (abort-aware delay), `knowledge-graph/base_embedding_service.ts` (abstract embedding base)
- ✅ **Type guards added across route handlers**: `isLLMGenerationResponse`, `isArtifactType`, `isRecord`, `isArtifactConversationContext`, `buildArtifactGenerationRequest` in artifact-service; `requireUser`/`isAuthError` in short_link_routes; `getIdParam`/`requireCapabilityId`/`registryMeta` in capability-registry
- ✅ **DRY consolidation**: `buildZodErrorResponse`/`buildInvalidIdResponse`/`applyToolDefinitionTransforms` extracted in tool_controller; `supportedArtifactTypes` constant replaces inline arrays
- ✅ **`noCheck: true` removed** from artifact-service and basebench-meta tsconfigs — type checking now enabled
- ✅ **Import paths consolidated**: relative deep imports (`../../../../../shared/services/src/...`) replaced with `@uaip/shared-services/decision-engine`, `@uaip/shared-services/agent-state`, etc.

### Legacy Service Status (2026-03-29)

Strategy shifted from "delete index.ts" to "modernize as importable feature modules". All 7 now have `feature.ts` + FeatureFactory-based `index.ts`.

| Legacy Service             | `src/index.ts`              | `src/feature.ts` | Status                                                                    |
| -------------------------- | --------------------------- | ----------------- | ------------------------------------------------------------------------- |
| `agent-intelligence`       | **FeatureFactory shell** ✅ | ✅ Created        | Registers routes via FeatureFactory lifecycle                             |
| `discussion-orchestration` | **FeatureFactory shell** ✅ | ✅ Created        | 2,709 lines local services deleted; ⚠️ shared-services parity incomplete (E7, E8) |
| `artifact-service`         | **New** (untracked) ✅      | ✅ Created        | Replaces deleted original; standalone runner via FeatureFactory            |
| `llm-service`              | **New** (untracked) ✅      | ✅ Created        | Replaces deleted original; standalone runner via FeatureFactory            |
| `security-gateway`         | **New** (untracked) ✅      | ✅ Created        | Routes/services imported directly by navratna-gateway; ⚠️ `projects_elysia.ts` not mounted (E9) |
| `orchestration-pipeline`   | **FeatureFactory shell** ✅ | ✅ Created        | Registers routes via FeatureFactory lifecycle                             |
| `capability-registry`      | **FeatureFactory shell** ✅ | ✅ Created        | Registers routes via FeatureFactory lifecycle                             |

**Additional**: `marketplace-service/` directory still exists (not deleted per removal spec).

### Code Review Findings (2026-03-29, updated v2.6)

Issues discovered during v2.5 audit + v2.6 Oracle-assisted deep review of 179 unstaged files. E6–E7 are **merge blockers**. Tracked as E-items in Outstanding Work.

| ID  | Finding                                                                                                 | Severity     |
| --- | ------------------------------------------------------------------------------------------------------- | ------------ |
| E1  | `sql_helpers.ts` — table/column names string-interpolated into SQL. Currently low risk (hardcoded callers) but a landmine for future use. Parameterize or add allowlist. | Medium       |
| E2  | `feature_factory.ts` — `factory.shutdown()` never called anywhere. Resource leak on process exit.       | Medium       |
| E3  | `feature_factory.ts` — no error isolation in lifecycle loops. One failing feature kills the entire service startup. | Low          |
| E4  | `isRecord()` utility duplicated 6x across codebase and doesn't guard against arrays (`!Array.isArray`). Needs `!Array.isArray(value)` check and DRY consolidation. | Low          |
| E5  | `basebench-meta` type regression: `data.entries ?? []` → `(data as Record<string, unknown>).entries as unknown[] ?? []` — worse than before. Also `agent_generation_handler.ts` reintroduces `@ts-expect-error` + `as unknown as Record<string, unknown>`. | Low          |
| E6  | 🔴 **Auth bypass in new discussion/persona routes** — `discussion_routes.ts` (lines 20–35, 85–167, 248–289) and `persona_routes.ts` (lines 15–171) add state-changing endpoints with zero auth middleware. Several paths default to `'system'` or `'anonymous'` when `x-user-id` absent. Creates anonymous create/update/delete/start/end behavior. | **Critical** |
| E7  | 🔴 **Shared `DiscussionService` incompatible with start/turn flows** — `discussion_service.ts:181–195` fetches via `findById('discussions', id)` but `startDiscussion` (:264–305) and turn init (:1047–1081) depend on `discussion.participants`. Deleted local implementation loaded participants; shared one does not. Start/turn will fail or behave as zero participants. | **Critical** |
| E8  | **Participant migration dropped fields** — `participant_management_service.ts:42–79` only persists `participationConfig`/`behavioralConstraints`/`contextAwareness` in metadata. `displayName`, `permissions`, `turnOrder`, `turnWeight` accepted then silently discarded (:100–150). Downstream code in `discussion_orchestration_service.ts:444–446, 1984–2055` and `discussion_service.ts:455–488, 594–606` still reads these fields. | **Important** |
| E9  | `projects_elysia.ts` edited but not mounted — `security-gateway/src/feature.ts` registers 11 route modules but does not include `registerProjectRoutes`. Dead code or missing mount. | Minor        |

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

### Outstanding Work (2026-03-29 Review v2.6)

| Item | Description                                                                                                                                                            | Priority     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| E6   | 🔴 **MERGE BLOCKER** — Add required auth middleware to discussion/persona route groups. Remove all `'system'`/`'anonymous'` fallbacks on write paths. Fail closed on missing `x-user-id`. | **Critical** |
| E7   | 🔴 **MERGE BLOCKER** — Fix shared `DiscussionService` integration: either load participants/messages explicitly before start/turn, or keep the local service until parity is proven with regression test. | **Critical** |
| E8   | Persist participant fields that orchestration layer reads: `displayName`, `permissions`, `turnOrder`, `turnWeight` in `participant_management_service.ts`. Add regression test for participant creation → start flow. | **High**     |
| D1   | ~~Delete 4 remaining legacy `index.ts`~~ **Redesigned** — All 7 legacy services now modernized via FeatureFactory pattern. Original D1 (delete index.ts) no longer applies. Remaining: remove env-var toggles to comply with Hard Constraint #4 (see ⚠️ flag). | **High** |
| D2   | Verify agent CRUD routes (`GET/POST/PUT/DELETE /api/v1/agents`) are served by navratna-core — currently inline in legacy agent-intelligence/src/index.ts, not imported | **High** |
| D3   | Remove rabbitmq from `scripts/run-integration-tests.sh` (REQUIRED_SERVICES, inline compose, RABBITMQ_URL export)                                                       | **High** |
| D4   | Remove rabbitmq from `scripts/dev-start.sh` (INFRASTRUCTURE_SERVICES, RABBITMQ_DEFAULT_USER/PASS)                                                                      | **High** |
| D5   | Remove rabbitmq service from `infrastructure/docker-compose.test.yml`                                                                                                  | **High** |
| E5   | Replace remaining unsafe casts in `agent_generation_handler.ts` (`@ts-expect-error`, `as unknown as Record`) and `basebench-meta/src/index.ts` with narrow validators  | Medium       |
| D6   | Remove rabbitmq-enterprise + RABBITMQ_URL from `infrastructure/docker-compose.enterprise.yml`                                                                          | Medium   |
| D7   | Remove orphaned `rabbitmq_data:` volume from `infrastructure/docker-compose.infrastructure.yml`                                                                        | Low      |
| D8   | Remove RabbitMQ scrape targets and rules from 4 monitoring YAML files                                                                                                  | Medium   |
| D9   | Delete marketplace-service directory                                                                                                                                   | Medium   |
| E9   | Mount `projects_elysia.ts` in `security-gateway/src/feature.ts` or delete it — currently edited but not registered                                                     | Medium   |
| E1   | `sql_helpers.ts` — parameterize table/column interpolation or add allowlist to prevent SQL injection                                                                   | Medium   |
| E2   | `feature_factory.ts` — call `factory.shutdown()` on process exit (SIGTERM/SIGINT handler)                                                                              | Medium   |
| E3   | `feature_factory.ts` — add error isolation in lifecycle loops so one failing feature doesn't kill entire service. Move feature state out of module scope into per-registration instances (`createFeature()` pattern). | Low      |
| E4   | Consolidate `isRecord()` to single shared utility and add `!Array.isArray()` guard                                                                                     | Low      |
| D10  | Clean stale build artifacts: `auth.elysia.js/.d.ts/.map` in security-gateway/src/http/                                                                                 | Low      |
| D11  | Clean stale build artifacts: `pipeline-schemas.js/.d.ts/.map` in shared-types/src/                                                                                     | Low      |
| D12  | Export `fetchAgentCapabilitiesViaEventBus` from shared-services barrel (`apps/shared/services/src/index.ts`)                                                           | Low      |
| D13  | Export `schema_base` from shared-services barrel                                                                                                                       | Low      |
| D14  | Re-enable `strict: true` in `apps/shared/tsconfig.base.json` (currently `false` for consolidation phase)                                                               | Low      |

---

## Replacement Summary

| #   | What           | From             | To                | Status       | Remaining                                                                      |
| --- | -------------- | ---------------- | ----------------- | ------------ | ------------------------------------------------------------------------------ |
| 1   | ORM            | TypeORM          | Drizzle           | **100% ✅**  | —                                                                              |
| 2   | Message Bus    | RabbitMQ         | BullMQ/Redis      | **~85% ⚠️**  | D3–D8: infra/scripts/monitoring cleanup                                        |
| 3   | Services       | 7 microservices  | 2 consolidated    | **~75% 🔴**  | **Blockers**: E6 (auth bypass), E7 (DiscussionService parity), E8 (participant fields). Also: D1 (env-var toggles), D2 (agent routes), D9 (marketplace), E1–E5,E9 (code review) |
| 4   | UI Shell       | DesktopUnified   | TelescopeSurface  | **100% ✅**  | —                                                                              |
| 5   | Animations     | Basic Framer     | Advanced Framer   | **100% ✅**  | —                                                                              |
| 6   | Bundle         | Monolithic       | Code-split        | **100% ✅**  | —                                                                              |
| 7   | Auth tokens    | localStorage     | httpOnly cookies  | **100% ✅**  | —                                                                              |
| 8   | HTTP framework | Express remnants | Elysia            | **100% ✅**  | —                                                                              |
| 9   | Types          | Scattered        | `@packages/` only | **100% ✅**  | —                                                                              |

No feature flags. No rollback paths. No fallbacks. Migrate, verify, delete.

### What's Done Well (v2.6 Review)

- ✅ **Net deletion of 4,611 lines** — DRY improvements are substantial and mostly well-executed
- ✅ **Import cleanup to `@uaip/*` sub-path exports** — shared-services `package.json` properly defines the new export map
- ✅ **Removing `noCheck: true`** and adding real type guards in route handlers is the right direction
- ✅ **FeatureFactory** is intentionally small (64 lines) and well-shaped — composable, testable surface
- ✅ **Type guards** in artifact_routes, short_link_routes, capability_controller are production-quality runtime validation

---
