---
# Replacement Specification — Navratna v3.0

## Document Control
- **Version**: 2.0
- **Date**: 2026-03-24
- **Purpose**: Detail every technology swap, current status, and remaining work
- **Updated**: Reflects audit as of 2026-03-24; hard constraints added; fallback strategies removed

---

## Hard Constraints (Non-Negotiable)

These constraints are locked. They apply retroactively to everything in this spec and everything written going forward. Confirmed by user 2026-03-24.

> **User directive (verbatim, 2026-03-24):** "i dont want express, typeorm, anywhere, no fallbacks, i dont want types/interface outside @packages/"
>
> **Concurred.** No Express anywhere. No TypeORM anywhere. No types or interfaces defined outside `apps/packages/`. No fallbacks, no feature flags, no rollback paths. Migrate, verify, delete. This is a single-owner machine — git revert is the only rollback.

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

## Current Status (2026-03-24 Audit → updated after refactor)

| # | What | Status | Blocking Issues |
|---|------|--------|-----------------|
| 1 | TypeORM → Drizzle | **100%** ✅ | grep -ri "typeorm" → 0 hits. PgService renamed. All imports, comments, method names, error strings, env vars cleaned. |
| 2 | RabbitMQ → BullMQ | **5%** | amqplib still installed; EventBus untouched |
| 3 | 7 → 2 Services | **55%** | discussion-orchestration not wired; old services still startable |
| 4 | DesktopUnified → Telescope | **35%** | TelescopeSurface shell not complete |
| 5 | Framer Basic → Advanced | **20%** | Phase 1 uses some; variants/physics not wired to microexpressions |
| 6 | Code Splitting | **0%** | No React.lazy(), no Suspense, Vite untouched |
| 7 | Auth Tokens → httpOnly cookies | **0%** | localStorage still used |
| 8 | Express elimination | **100%** ✅ | grep → 0 hits. Dead files deleted, capability-registry controllers rewritten to native Elysia, shared-utils Express types removed. |
| 9 | Types → `@packages/` | **10%** | 300+ exported types scattered across services |

---

## Replacement 1: TypeORM → Drizzle ORM

### Rationale
TypeORM is the #1 performance bottleneck: N+1 query problems, heavy decorator/metadata overhead, poor tree-shaking. Drizzle: 0 runtime overhead, queries compile to SQL at build time.

### What Is Done
- ✅ Drizzle installed in `shared/services` with full schema (`intelligence.schema.ts`, `control.schema.ts`)
- ✅ All major repositories exist in `shared/services/src/database/repositories/`
- ✅ `TypeOrmService` class rewritten to use raw `pg.Pool` (no actual TypeORM import)
- ✅ `typeorm` removed from all `package.json` files

### What Remains

**P1 — 6 production files call `getDataSource()`/`getRepository()` — THROW at runtime:**

| File | Fix |
|------|-----|
| `security-gateway/src/services/apiKeyDecryptionHandler.ts` (lines 62–63) | Replace with `UserLLMProviderRepository` |
| `security-gateway/src/http/tool-preferences.elysia.ts` (line 10) | Replace with `UserPreferencesRepository` |
| `security-gateway/src/http/persona.elysia.ts` (lines 186–190) | Replace with `UserLLMProviderRepository` + Drizzle insert |
| `security-gateway/src/http/providers.elysia.ts` (line 496) | Replace with `LLMProviderRepository` |
| `discussion-orchestration/src/services/personaService.ts` (6 calls) | Replace with `PersonaRepository` from Drizzle repos |
| `shared/services/src/BaseService.ts` (line 168) | Remove `getDataSource()` call in `initializeDatabase()` |

**P2 — Remove 5 remaining `import { ... } from 'typeorm'`:**

| File | Fix |
|------|-----|
| `security-gateway/src/__tests__/utils/testHelpers.ts` | Rewrite: replace `new DataSource(...)` with Drizzle test pool |
| `security-gateway/src/__tests__/integration/oauth-flow.integration.test.ts` | Rewrite using Drizzle test pool |
| `security-gateway/src/__tests__/integration/security-validation.integration.test.ts` | Rewrite using Drizzle test pool |
| `shared/services/src/__tests__/helpers/testUtils.ts` | Replace `Repository<T>` / `DataSource` mocks |
| `shared/services/src/database/seeders/data/viralAgents.d.ts` | Replace `DeepPartial<T>` with `Partial<T>` |

**P3 — Rename TypeOrmService:**
- `shared/infra/src/database/typeormService.ts` → rename class to `PgService`, file to `pgService.ts`
- Update all imports in `database/index.ts`, `infra/src/index.ts`, `infrastructureFactory.ts`
- Rename health-check key from `typeorm` to `postgres` in `infrastructureFactory.ts`

**P4 — Delete dead TypeORM script:**
- `scripts/sop-builder.ts` uses `@Entity`, `@Column` decorators → delete or rewrite as Drizzle schema

### Validation
- `grep -r "from 'typeorm'" --include="*.ts" apps/ scripts/` → zero results
- `grep -ri "typeorm" --include="*.ts" apps/ scripts/` → zero results
- All 6 production files build clean (LSP diagnostics zero errors)

---

## Replacement 2: RabbitMQ → BullMQ on Redis

### Rationale
RabbitMQ consumes 512MB RAM for simple pub/sub that Redis already handles. BullMQ provides priority queues, retries, delayed jobs, cron scheduling. Redis is already running.

### What Is Done
- ✅ Nothing structural. The `EventBusService` public interface (publish/subscribe/schedule) is clean and can be preserved while the backend is replaced.

### What Remains

**Step 1 — Install BullMQ:**
```bash
cd apps/backend && pnpm add bullmq
```

**Step 2 — Rewrite EventBusService** (`shared/infra/src/eventBus.ts`):

Replace the entire `amqplib` implementation with BullMQ. Keep same public interface:

```typescript
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';

export class EventBusService {
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();

  async publish(
    topic: string,
    payload: object,
    opts?: { priority?: number; delay?: number; attempts?: number }
  ): Promise<void>;

  async subscribe(
    topic: string,
    handler: (payload: object) => Promise<void>,
    opts?: { concurrency?: number }
  ): Promise<void>;

  async schedule(name: string, cron: string, payload: object): Promise<void>;
}
```

**Step 3 — Remove amqplib from all package.json files:**
- `security-gateway/package.json`
- `shared/infra/package.json`
- `shared/services/package.json`

**Step 4 — Remove RabbitMQ from `docker-compose.yml`**

**Step 5 — Remove `amqplib` config from `.env` / `sample.env`**

---

## Replacement 3: 7 Microservices → 2 Consolidated Services

### Rationale
7 services × 512MB = 3.5GB RAM on a single-owner machine. Services with constant shared data flow (Agent Intelligence ↔ Discussion Orchestration ↔ LLM) add network latency for zero benefit.

### Consolidation Map

**NAVRATNA-CORE** (Port 3001): Agent Intelligence + Discussion Orchestration + Artifact Service + LLM Service

**NAVRATNA-GATEWAY** (Port 3002): Security Gateway + Orchestration Pipeline + Capability Registry

### What Is Done
- ✅ `navratna-core/src/index.ts` exists; imports routes from agent-intelligence, artifact-service, llm-service
- ✅ `navratna-gateway/src/index.ts` exists; imports routes from security-gateway, orchestration-pipeline, capability-registry
- ✅ Both use `BaseService` + Elysia; `enableWebSocket: true` set on core

### What Remains

**Gap 1 — discussion-orchestration WebSocket handlers not wired into navratna-core:**

The service is listed in `consolidates[]` but no handlers are imported. Add to `navratna-core/src/index.ts`:

```typescript
import { registerDiscussionWebSocket } from '../../discussion-orchestration/src/websocket/discussionSocket.js';
import { registerEnterpriseWebSocket } from '../../discussion-orchestration/src/websocket/enterpriseWebSocketHandler.js';
import { registerUserChatSocket } from '../../discussion-orchestration/src/websocket/userChatHandler.js';

// In setupRoutes():
registerDiscussionWebSocket(this.app);
registerEnterpriseWebSocket(this.app);
registerUserChatSocket(this.app);
```

**Gap 2 — Update Docker Compose:**
```yaml
services:
  navratna-core:
    build: { context: ., dockerfile: Dockerfile.base }
    command: ['bun', 'run', 'apps/backend/services/navratna-core/dist/index.js']
    ports: ['3001:3001']

  navratna-gateway:
    build: { context: ., dockerfile: Dockerfile.base }
    command: ['bun', 'run', 'apps/backend/services/navratna-gateway/dist/index.js']
    ports: ['3002:3002']
```
Remove all 7 old service definitions.

**Gap 3 — Update Nginx routing:**
```nginx
upstream navratna_core   { server navratna-core:3001; }
upstream navratna_gateway { server navratna-gateway:3002; }

location /api/v1/agents      { proxy_pass http://navratna_core; }
location /api/v1/discussions  { proxy_pass http://navratna_core; }
location /api/v1/artifacts   { proxy_pass http://navratna_core; }
location /api/v1/llm         { proxy_pass http://navratna_core; }
location /api/v1/auth        { proxy_pass http://navratna_gateway; }
location /api/v1/operations  { proxy_pass http://navratna_gateway; }
location /api/v1/tools       { proxy_pass http://navratna_gateway; }
location /api/v1/mcp         { proxy_pass http://navratna_gateway; }
```

**Gap 4 — Delete old service entry points** once navratna-core/gateway are verified running.

---

## Replacement 4: DesktopUnified → TelescopeSurface

### Rationale
DesktopUnified implements a window-manager metaphor: drag, resize, minimize, maximize, Z-index layering, taskbar, app launcher. Telescope eliminates all of this. One surface, responds to intent.

### What Is Done
- ✅ Telescope Phase 1 components built: IntentField (606L), MaterializableBlock (702L), microexpression system (168L), relevance engine (383L)
- ✅ TelescopeSurface component exists at `frontend/src/components/TelescopeSurface/`

### What Remains
- Complete the TelescopeSurface shell to replace DesktopUnified as the application root
- Wire all 27 portal components as MaterializableBlocks
- Replace the DesktopUnified mount point in app root with TelescopeSurface directly

**What transfers:**
- 27 portal components — wrapped as MaterializableBlocks (portal code unchanged)
- Design tokens — kept and extended with microexpression tokens
- Auth/security context — unchanged

**What gets deleted after TelescopeSurface is functional:**
- `DesktopUnified.tsx` — all window drag/resize/minimize/maximize logic
- Taskbar component, app launcher grid, Z-index layering system, desktop shortcuts, sticky notes, window state tracking

No feature flag. No toggle. Swap the mount point, delete DesktopUnified.

See `04-TELESCOPE-SPEC.md` for full specification.

---

## Replacement 5: Framer Motion (Basic → Advanced)

### Current State
Framer Motion used for basic fade/scale transitions in Telescope Phase 1 components.

### Target State
Full capabilities wired to the 7-state microexpression system:
- **Layout animations** — `layoutId` for shared element transitions between microexpression states
- **Physics springs** — `useSpring` for gravitational relevance positioning
- **Gesture recognition** — drag/pan/hover with physics for MaterializableBlock
- **Variants** — 7 microexpression states (`dormant`, `whisper`, `aware`, `active`, `crystallizing`, `crystallized`, `dissolving`) as Framer variant maps
- **AnimatePresence** — crystallization/dissolution transitions
- **useMotionValue** — continuous relevance-driven positioning

Additive — existing animations continue to work. No migration needed.

---

## Replacement 6: Code Splitting (None → Full)

### Current State
Zero code splitting. All 27 portals loaded upfront. No `React.lazy()`, no Suspense.

### Target State

```typescript
// MaterializableBlock — lazy load portal on crystallization
const portalMap: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  'agent-manager':  lazy(() => import('./portals/AgentManagerPortal')),
  'discussion':     lazy(() => import('./portals/DiscussionPortal')),
  'knowledge':      lazy(() => import('./portals/KnowledgePortal')),
  // ... all 27 portals
};

const MaterializableBlock = ({ portalId, ...props }) => {
  const Portal = portalMap[portalId];
  return (
    <Suspense fallback={<BlockCrystallizing />}>
      <Portal {...props} />
    </Suspense>
  );
};
```

**Vite config** (`apps/frontend/vite.config.ts`):
```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react':  ['react', 'react-dom'],
        'vendor-framer': ['framer-motion'],
        'vendor-radix':  ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        'vendor-socket': ['socket.io-client'],
      }
    }
  }
}
```

Expected impact: Initial bundle 500KB+ → ~150KB. TTI ~3s → ~1s.

---

## Replacement 7: Auth Token Storage

### Current State
Auth tokens in `localStorage` (XSS vulnerable). `// SECURITY TODO` comment has been in `client.ts` since initial implementation.

### Target State
`httpOnly` cookies set by Security Gateway. Frontend does zero token management.

```typescript
// security-gateway auth.elysia.ts — login handler (Elysia cookie API):
ctx.cookie['auth_token'].set({
  value: token,
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 3600,
  path: '/api',
});
```

**Steps:**
1. Update login and refresh in `security-gateway/src/http/auth.elysia.ts` to set cookie
2. Remove `localStorage.setItem('auth_token', ...)` from `AuthContext`
3. Remove `Authorization: Bearer ...` header injection from `api/client.ts`
4. Keep CSRF token mechanism (double-submit pattern already implemented)
5. Verify Nginx forwards cookies

---

## Replacement 8: Express → Elysia (Completion)

Express is not in any `package.json`. The following Express-shaped code remains and must be removed.

### Delete immediately
- `apps/backend/services/llm-service/src/test.js` — `require('express')` test server, dead code
- `apps/backend/services/marketplace-service/src/index.refactored.ts` — stale file, superseded by `index.ts`

### Rewrite capability-registry controllers as native Elysia
These four files use local `interface Request/Response/NextFunction` shims and construct fake `req`/`res` objects to bridge Elysia into an Express-style controller layer. Delete the bridge and write direct Elysia handlers:

- `capability-registry/src/controllers/capabilityController.ts` — rewrite as Elysia handler functions
- `capability-registry/src/controllers/toolController.ts` — rewrite as Elysia handler functions
- `capability-registry/src/routes/toolRoutes.ts` — delete bridge, use direct Elysia routes
- `capability-registry/src/routes/capabilityRoutes.ts` — delete bridge, use direct Elysia routes

### Clean up shared-utils
`apps/packages/shared-utils/src/errors.ts` exports `ExpressRequest`, `ExpressResponse`, `ExpressNextFunction` type aliases and an `errorHandler` with Express 4-argument signature. Remove these. Replace `errorHandler` with Elysia-compatible `onError` hook function.

### Update integration example
`apps/backend/shared/middleware/src/integration-example.ts` shows Express-style `(req, res, next)` handler — update to Elysia context or delete.

---

## Replacement 9: Types → `apps/packages/` Only

### Rule
All exported types and interfaces used across more than one service or component live in `apps/packages/shared-types`. Types used only within one file may stay local but must not be exported. Drizzle schema inferred types (`$inferSelect`, `$inferInsert`) stay with their schema — they are exceptions.

### What Exists in `apps/packages/shared-types`
42 domain type files already cover virtually every domain: agent, artifact, audit, capability, discussion, event-bus, http, knowledge-graph, llm, marketplace, mcp, microexpression, models, operation, persona, project, security, telescope, tool, user, websocket, widget, and more.

Most service-level type violations are **duplicating** types already in packages. The migration is: delete the duplicate, import from `@uaip/types`.

### Priority Targets (dedicated type-only files — migrate first)

| File | Destination |
|------|-------------|
| `artifact-service/src/interfaces/ArtifactTypes.ts` | Merge into `@uaip/types` artifact module |
| `artifact-service/src/interfaces/ServiceTypes.ts` | Merge into `@uaip/types` artifact module |
| `capability-registry/src/types/tool-definition.ts` | Merge into `@uaip/types` tool module |
| `orchestration-pipeline/src/types/schemas.ts` (20 exported types) | Merge into `@uaip/types` operation module |
| `orchestration-pipeline/src/sops/sop-types.ts` | Add to `@uaip/types` |
| `discussion-orchestration/src/websocket/websocket.types.ts` | Merge into `@uaip/types` websocket module |
| `security-gateway/src/http/types/elysia-context.ts` | Merge into `@uaip/types` http module |
| `frontend/src/types/frontend-extensions.ts` | Merge into `@uaip/types` frontend-api module |
| `frontend/src/types/persona.ts` | Merge into `@uaip/types` persona module |

### Rule for component-local interfaces
`interface Props { ... }` inside a `.tsx` component file — keep local, do not export. Already unexported = already fine.

---

## Execution Order

These are sequential. Each unblocks the next.

1. **[R1 P1]** Fix 6 runtime-throwing production files (replace getDataSource/getRepository with Drizzle repos)
2. **[R1 P2]** Remove 5 remaining `import from 'typeorm'` in test files
3. **[R1 P3]** Rename `TypeOrmService` → `PgService`
4. **[R8]** Delete Express dead files → rewrite capability-registry controllers → clean shared-utils errors.ts
5. **[R3]** Wire discussion-orchestration into navratna-core → update Docker Compose → update Nginx → delete old entry points
6. **[R2]** Install BullMQ → rewrite EventBusService → remove amqplib → remove RabbitMQ from compose
7. **[R7]** httpOnly cookies in auth.elysia.ts → update AuthContext → update api/client.ts
8. **[R6]** Add React.lazy() to all 27 portals → update Vite config
9. **[R9]** Migrate dedicated type files to @packages/ — ongoing alongside each step above
10. **[R4]** Complete TelescopeSurface → wire portals → replace DesktopUnified → delete DesktopUnified
11. **[R5]** Advanced Framer patterns — additive as Telescope is built

---

## Replacement Summary

| # | What | From | To | Status | Note |
|---|------|------|----|--------|------|
| 1 | ORM | TypeORM | Drizzle | **100% ✅** | DONE — 0 grep hits |
| 2 | Message Bus | RabbitMQ | BullMQ/Redis | **5%** | Not started |
| 3 | Services | 7 microservices | 2 consolidated | **55%** | Wire discussion-orchestration |
| 4 | UI Shell | DesktopUnified | TelescopeSurface | **35%** | Build shell, then delete old |
| 5 | Animations | Basic Framer | Advanced Framer | **20%** | Additive |
| 6 | Bundle | Monolithic | Code-split | **0%** | Not started |
| 7 | Auth tokens | localStorage | httpOnly cookies | **0%** | Not started |
| 8 | HTTP framework | Express remnants | Elysia | **100% ✅** | DONE — 0 grep hits |
| 9 | Types | Scattered | `@packages/` only | **10%** | Ongoing |

No feature flags. No rollback paths. No fallbacks. Migrate, verify, delete.

---
