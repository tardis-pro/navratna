# Layer C — Execution Plan
**Date**: 2026-06-01
**Scope**: TS6 tsconfig architecture + new shared packages + noCheck removal
**Status**: DRAFT — awaiting Momus review
**Prerequisite**: Layer A+B complete (committed)

---

## Current State Snapshot (2026-06-01)

- TS 6.0.2 installed, NX 22.6.1 installed
- `tsconfig.base.json` has: `NodeNext`, `customConditions: ["@uaip/source"]`, `types: []`, `strict: false`
- `ignoreDeprecations: "6.0"` still present in base
- **0 packages have tsconfig.build.json** — entire split is ahead
- **noCheck removed from all services** (done in Layer A+B)

### @uaip/source condition coverage

**Has it (10):** shared-types, shared-utils, contracts, config, infra, middleware, shared-services, navratna-core (./app), navratna-gateway (./app), questionforge (./app)

**Missing (8 backend services):** agent-intelligence, security-gateway, capability-registry, orchestration-pipeline, discussion-orchestration, artifact-service, llm-service-api, basebench-meta

**Missing (1 shared):** @uaip/llm-service (shared) — has exports but no @uaip/source condition

### Critical anomalies

- `module: "preserve"` in shared-services (unique in monorepo)
- `rootDir: ".."` on navratna-core/gateway (consolidation mechanism)
- 4 services use `tsc-alias` post-step (agent-intelligence, artifact-service, questionforge, discussion-orchestration)
- `apps/backend/tsconfig.json` paths point to `dist/` while services override to `src/`
- Backend inheritance chain: root → backend → services (composite:true flows down)
- Shared inheritance chain: root → shared/tsconfig.base.json → shared/* (separate base)

---

## Execution Order (Metis-validated safe sequence)

### Phase C1: Complete @uaip/source exports (BEFORE any paths removal)
**Risk**: Zero. Purely additive.
**Time**: 1 hour.

Add `@uaip/source` condition to exports for:
1. `@uaip/llm-service` (shared) — has exports, just needs the condition key
2. `agent-intelligence` — needs exports field created
3. `security-gateway` — needs exports field created
4. `capability-registry` — needs exports field created
5. `orchestration-pipeline` — needs exports field created
6. `discussion-orchestration` — needs exports field created
7. `artifact-service` — needs exports field created
8. `llm-service-api` — needs exports field created
9. `basebench-meta` — needs exports field created
10. `oie` — has exports but no @uaip/source condition

Pattern per service:
```json
"exports": {
  ".": {
    "@uaip/source": "./src/index.ts",
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js",
    "default": "./dist/index.js"
  }
}
```

**Success criteria**: Every package in the monorepo has `@uaip/source` in its exports. Verify:
```bash
# Count packages with @uaip/source (should be ~20)
grep -rl '"@uaip/source"' apps/*/package.json apps/*/*/package.json apps/*/*/*/package.json 2>/dev/null | wc -l
```

---

### Phase C2: Create stub packages for @uaip/agent-intelligence and @uaip/discussion
**Risk**: Low. Empty packages with correct structure.
**Time**: 30 minutes.

**`apps/shared/agent-intelligence/`** — stub package:
```
apps/shared/agent-intelligence/
  package.json        # name: @uaip/agent-intelligence, exports with @uaip/source
  tsconfig.json       # orchestrator: files:[], refs:[./tsconfig.build.json]
  tsconfig.build.json # composite:true, outDir:dist, rootDir:src
  src/index.ts        # empty barrel: export {} (placeholder)
```

**`apps/shared/discussion/`** — stub package:
```
apps/shared/discussion/
  package.json        # name: @uaip/discussion, exports with @uaip/source
  tsconfig.json       # orchestrator
  tsconfig.build.json # composite:true
  src/index.ts        # empty barrel
```

Add to `pnpm-workspace.yaml` if needed. Add `workspace:*` dependencies in services that will consume them.

**Success criteria**: `pnpm nx show projects` includes both. `tsc -b` on each stub succeeds.

---

### Phase C3: Per-package tsconfig.build.json split
**Risk**: HIGH. One misconfigured file breaks the tsc -b chain.
**Time**: 4-6 hours. DO NOT BIG-BANG.

**Order**: Bottom of dependency graph first, leaf services last.

#### Batch 1 — Foundation packages (no upstream deps)
1. `@uaip/types` (shared-types)
2. `@uaip/config` (config)

#### Batch 2 — Low-dep packages
3. `@uaip/utils` (depends on types)
4. `@uaip/contracts` (depends on types)

#### Batch 3 — Infrastructure layer
5. `@uaip/infra` (depends on types, utils, config)
6. `@uaip/middleware` (depends on types, utils, config) — already uses `tsc -b`

#### Batch 4 — Service layer
7. `@uaip/shared-services` (depends on types, utils, config, infra, middleware)
8. `@uaip/llm-service` shared (depends on types, utils, config, middleware, services)

#### Batch 5 — New shared packages (stubs)
9. `@uaip/agent-intelligence` (shared) — stub
10. `@uaip/discussion` (shared) — stub

#### Batch 6 — Backend services (independent of each other)
11-19. All backend services — can be parallelized

#### Batch 7 — Consolidated services (LAST — most complex)
20. `navratna-gateway` (composite:false, rootDir:..)
21. `navratna-core` (composite:false, rootDir:.., sibling includes)

**Per-package procedure:**
```
1. Create tsconfig.build.json:
   - extends: relative path to tsconfig.base.json
   - composite: true (or false for navratna-core/gateway)
   - outDir: ./dist
   - rootDir: ./src (or .. for navratna-core/gateway)
   - tsBuildInfoFile: ./dist/.tsbuildinfo
   - types: ["node"] (or ["bun", "node"] for Bun services)
   - include: ["src/**/*.ts"]
   - exclude: ["**/*.test.ts", "**/__tests__/**/*", "node_modules", "dist"]
   - references: [deps' tsconfig.build.json paths]

2. Rewrite tsconfig.json as orchestrator:
   - extends: relative path to tsconfig.base.json
   - files: []
   - references: [{ "path": "./tsconfig.build.json" }]
   - include: ["src/**/*.ts"] (for LSP — ensures editor discovers source)

3. Update package.json build script:
   - "build": "tsc -b tsconfig.build.json" (or "tsc -b tsconfig.build.json && tsc-alias" for tsc-alias users)

4. Remove paths from tsconfig.json (now resolved via @uaip/source)
   - KEEP @/ local alias for frontend and services that use it

5. Verify: tsc -b tsconfig.build.json exits 0
6. Verify: NX build --skip-nx-cache produces dist/
7. Verify: Editor import resolution still works (tsc --noEmit from a consumer)
```

**Hard constraints:**
- navratna-core keeps composite:false and rootDir:".." until Phase C5 removes sibling includes
- Do NOT add navratna-core to any references array
- After each batch, commit and verify `nx run-many -t build --skip-nx-cache`

**Success criteria:**
```bash
# All packages have tsconfig.build.json
find apps/ -name "tsconfig.build.json" -not -path "*/node_modules/*" | wc -l  # → ~21

# All builds pass
nx run-many -t build --skip-nx-cache

# Second run: all cache hits
nx run-many -t build  # should be instant

# No paths to src/ in tsconfig.json (except @/ local aliases)
grep -r '"@uaip/' --include="tsconfig.json" apps/ | grep -v node_modules | grep 'src/'  # → 0
```

---

### Phase C4: Fix remaining structural issues
**Risk**: Medium.
**Time**: 2 hours.

1. Remove `ignoreDeprecations: "6.0"` from `tsconfig.base.json`
   - This will surface TS6 deprecation warnings — fix them
   - Do BEFORE noCheck removal (Metis directive)

2. Fix `module: "preserve"` in shared-services
   - Validate TS6 compatibility
   - If incompatible, switch to `ESNext` or `NodeNext`

3. Remove stale `.d.ts` stubs in `security-gateway/src/services/` and `middleware/src/`
   ```bash
   find apps/shared/middleware/src -name "*.d.ts" -delete
   find apps/backend/services/security-gateway/src -name "*.d.ts" -delete
   ```

4. Fix `require()` → `import` in:
   - `authMiddleware.ts` (already done? verify)
   - `mcp_client_service.ts`

5. Update Vite config: add `conditions: ['@uaip/source']`, remove manual `@uaip/*` aliases

**Success criteria**: `nx run-many -t build,typecheck` passes with 0 deprecation warnings.

---

### Phase C5: Move code into new shared packages
**Risk**: HIGH. Cross-package code movement.
**Time**: 1 day.

**@uaip/agent-intelligence (shared)** — move from `apps/backend/services/agent-intelligence/src/`:
- `services/agent_core_service.ts`
- `services/agent_discussion_service.ts`
- `services/agent_planning_service.ts`
- `knowledge-graph/` (entire directory)
- `agent-memory/` (entire directory)
- Keep: routes/, feature.ts, index.ts, __tests__/ in the backend service

**@uaip/discussion (shared)** — move from `apps/backend/services/discussion-orchestration/src/`:
- `services/discussion_orchestration_service.ts`
- `strategies/` (turn strategies)
- `config/` (discussion config)
- Keep: routes/, feature.ts, index.ts, websocket/ in the backend service

After moving:
- Update all imports from `../../agent-intelligence/src/` → `@uaip/agent-intelligence`
- Update navratna-core to import features from packages, not sibling src/
- Remove sibling src/ includes from navratna-core tsconfig
- Enable composite:true on navratna-core (now possible)

**Success criteria**:
```bash
# No more sibling src/ imports in navratna-core
grep -r '../../agent-intelligence/src\|../../discussion-orchestration/src' apps/backend/services/navratna-core/ | grep -v node_modules  # → 0

# navratna-core has composite:true
grep composite apps/backend/services/navratna-core/tsconfig.build.json  # → true

# Full build passes
nx run-many -t build --skip-nx-cache
```

---

### Phase C6: noCheck removal (one service at a time)
**Risk**: HIGH per service, capped by single-service scope.
**Time**: 2-4 hours per service.

**NOTE**: noCheck was already removed from all services in Layer A+B. This phase is now about removing the last `ignoreDeprecations` flag and enabling strict mode.

**Strict mode enablement order** (safest to most coupled):
1. `@uaip/types` (pure types)
2. `@uaip/utils` (pure functions)
3. `@uaip/contracts` (pure contracts)
4. `@uaip/config` (small, stable)
5. Work outward from there

**Success criteria**: `nx run-many -t typecheck` passes with strict:true on migrated packages.

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| tsconfig.build.json misconfiguration breaks tsc -b chain | High | Per-package, verify after each |
| Killing paths before @uaip/source breaks dev resolution | Eliminated | Phase C1 completes exports BEFORE C3 kills paths |
| navratna-core composite deadlock | Known | C5 removes sibling includes first, then composite:true |
| NX cache invalidation drift after tsconfig split | Medium | Run `nx graph` before/after, diff edges |
| tsc-alias users break with new build script | Low | Preserve post-step: `tsc -b && tsc-alias` |
| Elysia type inference breaks with NodeNext exports | Medium | Test route handler types after each service migration |
| Code movement in C5 breaks circular imports | Medium | Map import graph before moving |

---

## Hard Constraints

1. **Phase C1 MUST complete before Phase C3** — @uaip/source is the safety net
2. **Phase C2 MUST complete before Phase C3** — stubs must exist for reference graph
3. **Per-package tsconfig split, NEVER big-bang** — one package at a time, verify after each
4. **Do NOT add navratna-core to references** until sibling includes removed (Phase C5)
5. **Remove ignoreDeprecations BEFORE strict mode** — sequence the error surfaces
6. **Commit after each batch** — every batch must be a revertible unit
