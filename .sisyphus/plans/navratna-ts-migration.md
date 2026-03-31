# Navratna — TypeScript 6 + Nx Migration Plan
**Date**: 2026-03-26  
**Target**: TypeScript 6.0.0 (stable, released 2026-03-23) + Nx orchestration  
**Goal**: LSP seamless, builds deterministic, type system consistent, incremental working

---

## Architecture Decision Summary

After research across Nx docs, TypeScript 6 release notes, and major open-source monorepos (Nx's own repo, Turborepo's own repo), the winning architecture for this repo is:

### The Core Insight: Kill `paths`. Use `customConditions`.

The root cause of every LSP issue in this repo is `paths` scattered across 15+ tsconfig files, each with different targets (src/ vs dist/) and different package lists. The correct replacement:

1. **`package.json exports`** with a `"@uaip/source"` custom condition → source files  
2. **`tsconfig.base.json`** with `customConditions: ["@uaip/source"]` → LSP matches the source condition  
3. **Zero `paths` anywhere** — TypeScript resolves via pnpm symlinks → `node_modules` → `exports` field

Result:
- **LSP** sees `./src/index.ts` (via `@uaip/source` condition)
- **Runtime** sees `./dist/index.js` (via `import`/`default` condition)  
- **`tsc -b`** builds in correct order (via TypeScript project references)
- **Nx** orchestrates order, adds caching, replaces `build:shared` scripts

---

## New Architecture Blueprint

```
navratna/
├── nx.json                        # NEW — task pipeline
├── tsconfig.base.json             # NEW — compiler options only, NO paths
├── tsconfig.json                  # REWRITTEN — solution file (files:[], all refs)
├── package.json                   # UPDATED — remove build:shared, add nx scripts
├── pnpm-workspace.yaml            # UNCHANGED (mostly)
│
├── apps/packages/
│   ├── shared-types/
│   │   ├── tsconfig.json          # REWRITTEN — orchestrator (files:[], refs:[./tsconfig.build.json])
│   │   ├── tsconfig.build.json    # NEW — composite:true, outDir:dist, isolatedDeclarations
│   │   └── package.json           # UPDATED — exports with @uaip/source condition
│   ├── shared-utils/              # same pattern
│   └── contracts/                 # same pattern
│
├── apps/shared/
│   ├── config/                    # same pattern (no refs, it's the bottom of the graph)
│   ├── infra/                     # same pattern
│   ├── middleware/                 # same pattern
│   ├── services/                  # same pattern (moduleResolution: node16 instead of node)
│   └── llm-service/               # same pattern (add exports field)
│
└── apps/backend/services/
    └── each service/
        ├── tsconfig.json          # REWRITTEN — orchestrator
        ├── tsconfig.build.json    # NEW (or rename existing tsconfig.json)
        └── package.json           # UPDATED — exports condition, fix scripts
```

**Split tsconfig per package explained:**
- `tsconfig.json` = orchestrator: `{ "files": [], "references": [{ "path": "./tsconfig.build.json" }] }`  
- `tsconfig.build.json` = actual compilation: composite, outDir, rootDir, include, references to deps' `tsconfig.build.json`

This pattern is what Nx and TypeScript's own repos use. The orchestrator is the LSP project root; the build config does the actual work.

---

## Phase 0 — Install Nx (15 minutes, zero risk)

### Step 0.1: Install

```bash
cd navratna/
pnpm add -D nx -w
```

### Step 0.2: Create `nx.json`

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "defaultBase": "main",
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "sharedGlobals": [
      "{workspaceRoot}/tsconfig.base.json",
      "{workspaceRoot}/tsconfig.json"
    ],
    "production": [
      "default",
      "!{projectRoot}/**/*.spec.ts",
      "!{projectRoot}/**/*.test.ts",
      "!{projectRoot}/**/*.spec.tsx",
      "!{projectRoot}/jest.config.*",
      "!{projectRoot}/vitest.config.*"
    ]
  },
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"],
      "outputs": [
        "{projectRoot}/dist",
        "{projectRoot}/dist/*.tsbuildinfo"
      ],
      "cache": true
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"],
      "cache": true
    },
    "test": {
      "inputs": ["default", "^production"],
      "cache": true
    },
    "lint": {
      "inputs": ["default", "{workspaceRoot}/.oxlintrc.json"],
      "cache": true
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  },
  "plugins": [
    {
      "plugin": "@nx/js/typescript",
      "options": {
        "typecheck": { "targetName": "typecheck" },
        "build": {
          "targetName": "build",
          "configName": "tsconfig.build.json"
        }
      }
    }
  ],
  "sync": {
    "applyChanges": true
  },
  "parallel": 6
}
```

**Key decisions:**
- `"dependsOn": ["^build"]` replaces ALL manual `build:shared` scripts
- `sharedGlobals` includes `tsconfig.base.json` — any base change invalidates all caches
- `@nx/js/typescript` plugin auto-infers `build` and `typecheck` targets from `tsconfig.build.json`
- `"sync": { "applyChanges": true }` auto-maintains TypeScript project `references` arrays
- `parallel: 6` — tune to your machine (CPU cores)

### Step 0.3: Add `.gitignore` entries

```
.nx/cache
.nx/workspace-data
```

### Step 0.4: Update root `package.json` scripts

```json
{
  "scripts": {
    "build": "nx run-many -t build",
    "build:shared": "nx run-many -t build --projects=@uaip/config,@uaip/types,@uaip/utils,@uaip/contracts,@uaip/infra,@uaip/middleware,@uaip/shared-services,@uaip/llm-service",
    "build:backend": "nx run-many -t build --projects=tag:backend",
    "build:frontend": "nx run @council/frontend:build",
    "dev": "concurrently \"pnpm dev:frontend\" \"pnpm dev:backend\"",
    "dev:frontend": "nx run @council/frontend:dev",
    "dev:backend": "nx run-many -t dev --projects=tag:backend-service",
    "typecheck": "nx run-many -t typecheck",
    "test": "nx run-many -t test",
    "lint": "nx run-many -t lint",
    "graph": "nx graph",
    "affected:build": "nx affected -t build",
    "clean": "nx run-many -t clean && find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete"
  }
}
```

### Step 0.5: Verify Nx sees all packages

```bash
npx nx show projects
npx nx graph
```

**Expected**: 15+ projects discovered automatically from `pnpm-workspace.yaml`.

---

## Phase 1 — TypeScript 6 Upgrade (1 hour)

### Step 1.1: Update pnpm-workspace.yaml catalog

```yaml
catalog:
  typescript: ^6.0.0  # was ^5.8.3
```

Then:
```bash
pnpm update typescript -r
```

### Step 1.2: Run the official migration tool

```bash
# Fix baseUrl across all tsconfigs (follows project references, handles extends chains)
npx @andrewbranch/ts5to6 --fixBaseUrl .

# Fix rootDir inference
npx @andrewbranch/ts5to6 --fixRootDir .
```

This auto-removes `baseUrl` from all tsconfigs and converts relative imports to explicit paths.

### Step 1.3: Add `ignoreDeprecations` as a temporary safety net

Before the tool runs, add to EVERY tsconfig temporarily:
```json
{ "ignoreDeprecations": "6.0" }
```

This silences deprecation diagnostics while you migrate. Remove once fixes are applied.

### Step 1.4: Fix `moduleResolution` deprecations

Packages currently using `moduleResolution: node` (deprecated in TS6, removed in TS7):
- `apps/shared/services/tsconfig.json` → `"moduleResolution": "node16"`
- `apps/backend/services/security-gateway/tsconfig.json` → `"moduleResolution": "node16"`

Why `node16` not `bundler`: These packages emit CommonJS/ESM for Node.js runtime. `bundler` is for bundler consumers, not direct Node.js execution. `node16`/`nodenext` enforces `.js` extensions in imports (which we may want for runtime correctness).

**Note**: After Phase 2, module resolution is driven by `tsconfig.base.json` and per-environment tsconfig presets. Individual overrides go away.

### Step 1.5: Fix `strict: true` new default

TS6 default is now `strict: true`. All existing tsconfigs had `strict: false` or omitted it (meaning `false` in TS5, now `true` in TS6). Two options:

**Option A (immediate, no code changes)**: Add `"strict": false` explicitly to every tsconfig that currently doesn't set it. Done in `tsconfig.base.json` — all packages inherit it.

**Option B (correct)**: Accept `strict: true`, fix errors package by package.

**Recommendation**: Start with `"strict": false` in `tsconfig.base.json`. Migrate individual packages to `strict: true` one at a time after the structural fixes are done.

### Step 1.6: Fix `types: []` new default

TS6 default is `"types": []` (no global types). All backend packages need `"node"`. Frontend needs `"vite/client"`.

In `tsconfig.base.json`, set `"types": []`. Each per-package tsconfig override:
- Backend packages: `"types": ["node"]`
- Test configs: `"types": ["node", "jest"]` or `"types": ["node", "vitest/globals"]`
- Frontend: `"types": ["vite/client"]`

### Step 1.7: Remove deprecated compiler options from all tsconfigs

Options to remove (now defaults or removed):
- `esModuleInterop: true` → now default, remove
- `allowSyntheticDefaultImports: true` → now default, remove
- `downlevelIteration` → remove entirely
- `noCheck: true` → was never a standard tsc option (Bun-specific), remove
- `ignoreDeprecations: "6.0"` → remove after migration complete

### Step 1.8: Handle `outFile` if used anywhere

`outFile` is **hard-removed** in TS6 (not deprecated — removed). Check:
```bash
grep -r "outFile" --include="*.json" . | grep -v node_modules
```
None found in this repo — skip.

---

## Phase 2 — New tsconfig Architecture (2-3 hours)

This is the main structural change. It eliminates ALL path-based issues found in the analysis.

### Step 2.1: Create `navratna/tsconfig.base.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": false,
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "moduleDetection": "force",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "customConditions": ["@uaip/source"],
    "types": []
  }
}
```

**Why `NodeNext` module + resolution**:
- Services run in Node.js (Bun with Node.js compatibility mode)
- `NodeNext` correctly enforces `.js` extensions in relative imports (required for correct ESM)
- `NodeNext` fully respects `package.json exports` — which is how `@uaip/source` condition resolves

**Why `customConditions: ["@uaip/source"]`**:
- TypeScript LSP will match this condition in `package.json exports` → resolves to `./src/index.ts`
- Normal Node.js runtime ignores custom conditions → falls through to `import`/`default` → `./dist/index.js`
- No `paths` needed — zero maintenance as packages are added/removed

**Why NO `paths`**:
- TypeScript official docs (updated March 2026): paths should not point to monorepo packages
- `paths` conflicts with `exports` resolution (TS issue #60460)
- Use pnpm `workspace:*` + `exports` instead — this is the correct 2026 approach

### Step 2.2: Rewrite `navratna/tsconfig.json` (solution file)

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "files": [],
  "references": [
    { "path": "./apps/packages/shared-types" },
    { "path": "./apps/packages/shared-utils" },
    { "path": "./apps/packages/contracts" },
    { "path": "./apps/shared/config" },
    { "path": "./apps/shared/infra" },
    { "path": "./apps/shared/middleware" },
    { "path": "./apps/shared/services" },
    { "path": "./apps/shared/llm-service" },
    { "path": "./apps/backend/services/agent-intelligence" },
    { "path": "./apps/backend/services/security-gateway" },
    { "path": "./apps/backend/services/capability-registry" },
    { "path": "./apps/backend/services/orchestration-pipeline" },
    { "path": "./apps/backend/services/discussion-orchestration" },
    { "path": "./apps/backend/services/artifact-service" },
    { "path": "./apps/backend/services/llm-service" },
    { "path": "./apps/backend/services/navratna-core" },
    { "path": "./apps/backend/services/navratna-gateway" },
    { "path": "./apps/backend/services/basebench-meta" },
    { "path": "./apps/backend/services/questionforge" }
  ]
}
```

**Note**: Frontend is NOT here. Vite builds the frontend. Adding it causes `noEmit` + `composite` conflicts.

`nx sync` will automatically maintain this `references` array as packages are added or removed.

### Step 2.3: Per-package tsconfig split

For EVERY package (example: `@uaip/types`):

**`apps/packages/shared-types/tsconfig.json`** (orchestrator — for LSP project discovery):
```json
{
  "extends": "../../../tsconfig.base.json",
  "files": [],
  "references": [
    { "path": "./tsconfig.build.json" }
  ]
}
```

**`apps/packages/shared-types/tsconfig.build.json`** (actual compilation):
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "isolatedDeclarations": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

**Why `isolatedDeclarations: true` for `@uaip/types`**:
- It's a pure type/interface package — all exports naturally have explicit types
- Enables parallel `.d.ts` generation (3x-15x faster in large repos)
- No code changes needed — types are already explicit

**For packages with complex implementations** (shared-services, llm-service, services), `isolatedDeclarations` can be added incrementally. Start without, add after explicit return types are annotated.

### Step 2.4: Per-package `references` in `tsconfig.build.json`

Each package's `tsconfig.build.json` declares `references` to its dependency packages' `tsconfig.build.json` files. **`nx sync` manages this automatically** — you just need to ensure the base structure is correct.

Example for `@uaip/shared-services`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"],
  "references": [
    { "path": "../../packages/shared-types/tsconfig.build.json" },
    { "path": "../../packages/shared-utils/tsconfig.build.json" },
    { "path": "../config/tsconfig.build.json" },
    { "path": "../infra/tsconfig.build.json" },
    { "path": "../middleware/tsconfig.build.json" }
  ]
}
```

### Step 2.5: Fix the Frontend tsconfig

Frontend is built by Vite (not tsc). Use `bundler` module resolution, `noEmit: true`:

**`apps/frontend/tsconfig.json`** (Vite compatible):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "strict": false,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Note**: Frontend DOES use `paths` for the local `@/` alias — this is fine because `@/` is local to the frontend, not cross-package. The `@uaip/types` and `@uaip/utils` imports resolve via `customConditions` + exports field.

Also update `vite.config.ts` to remove manual alias overrides for `@uaip/*` — they resolve via exports now.

### Step 2.6: Fix `navratna-core` — the Hardest Case

**The problem**: navratna-core uses `composite: false` and includes sibling service source files — both of which violate project references.

**Short-term fix** (keep the v3 consolidation pattern working):
```json
// apps/backend/services/navratna-core/tsconfig.build.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "outDir": "dist",
    "rootDir": ".",
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "noCheck": false,
    "types": ["node"]
  },
  "include": [
    "src/**/*.ts",
    "../agent-intelligence/src/**/*.ts",
    "../artifact-service/src/**/*.ts",
    "../llm-service/src/**/*.ts",
    "../discussion-orchestration/src/**/*.ts"
  ],
  "exclude": ["**/*.test.ts", "**/__tests__/**/*"]
}
```

With `composite: false`, navratna-core CANNOT be in project references. It must be built separately:
```json
// apps/backend/services/navratna-core/package.json scripts
"build": "tsc -p tsconfig.build.json"  // plain tsc, not tsc -b
```

And navratna-core should NOT be in the root `tsconfig.json references` or `tsconfig.build.json references`.

**Long-term fix** (proper v3 design): Each sibling service is a proper composite package. navratna-core imports from their `workspace:*` dist outputs. This aligns with the TypeScript project references model. Do this when there's bandwidth to annotate return types and add `isolatedDeclarations`.

---

## Phase 3 — Fix `package.json exports` (1 hour)

### Step 3.1: Add `@uaip/source` condition to every shared package

Every package under `apps/packages/` and `apps/shared/` needs this pattern:

```json
{
  "exports": {
    ".": {
      "@uaip/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

**For packages with sub-path exports** (infra, shared-services, contracts):
```json
{
  "exports": {
    ".": {
      "@uaip/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./database": {
      "@uaip/source": "./src/database/index.ts",
      "types": "./dist/database/index.d.ts",
      "import": "./dist/database/index.js"
    },
    "./eventBus": {
      "@uaip/source": "./src/eventBus.ts",
      "types": "./dist/eventBus.d.ts",
      "import": "./dist/eventBus.js"
    },
    "./cache": {
      "@uaip/source": "./src/cache/index.ts",
      "types": "./dist/cache/index.d.ts",
      "import": "./dist/cache/index.js"
    }
  }
}
```

### Step 3.2: Fix `@uaip/shared-services` exports — the invalid entries

Current state (BROKEN — uses package names, not file paths):
```json
"./eventBusService": { "import": "@uaip/infra/eventBus.js" }  // ← INVALID
"./databaseService": { "import": "@uaip/infra/database/index.js" }  // ← INVALID
"./cacheService":    { "import": "@uaip/infra/cache/index.js" }  // ← INVALID
```

Fix — these sub-paths should redirect to the actual files in `dist/`:
```json
"./eventBusService": {
  "@uaip/source": "./src/eventBusService.ts",
  "types": "./dist/eventBusService.d.ts",
  "import": "./dist/eventBusService.js"
},
"./databaseService": {
  "@uaip/source": "./src/databaseService.ts",
  "types": "./dist/databaseService.d.ts",
  "import": "./dist/databaseService.js"
},
"./cacheService": {
  "@uaip/source": "./src/cacheService.ts",
  "types": "./dist/cacheService.d.ts",
  "import": "./dist/cacheService.js"
}
```

Note: `eventBusService.ts` in `shared-services/src/` already exists — it re-exports from `@uaip/infra`. Keep that re-export; just make the exports field point to the compiled output.

### Step 3.3: Add `exports` to `@uaip/llm-service` (currently missing)

```json
{
  "name": "@uaip/llm-service",
  "exports": {
    ".": {
      "@uaip/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

### Step 3.4: Add `@uaip/source` to Vite config

Since we're removing the manual Vite aliases for `@uaip/*`, Vite also needs to know about the custom condition:

```typescript
// vite.config.ts
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')  // keep local @/ alias
      // Remove: '@uaip/types' and '@uaip/utils' aliases — now resolved via exports
    },
    conditions: ['@uaip/source']  // ← ADD THIS — Vite respects custom conditions
  }
})
```

---

## Phase 4 — Fix Service-Level Issues (2 hours)

### Step 4.1: Fix `capability-registry` path depth (4 → 3 levels)

This is now moot after Phase 2 (no more `paths`). But if anyone is using the old tsconfig, the service's `tsconfig.build.json` needs `references` not `paths`.

### Step 4.2: Remove all `noCheck: true`

Services using `noCheck: true`: security-gateway, orchestration-pipeline, discussion-orchestration, llm-service (service).

Replace with proper `skipLibCheck: true` (already in base) and fix actual errors or suppress with `// @ts-expect-error -- <reason>`. `noCheck` was never a standard tsc option — it may have been a Bun-specific extension that is no longer supported.

To find what errors exist:
```bash
nx typecheck @uaip/security-gateway  # now produces real error list
```

### Step 4.3: Fix `orchestration-pipeline` — add `composite` and `references`

```json
// apps/backend/services/orchestration-pipeline/tsconfig.build.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.test.ts", "**/__tests__/**/*", "node_modules", "dist"],
  "references": [
    { "path": "../../../packages/shared-types/tsconfig.build.json" },
    { "path": "../../../packages/shared-utils/tsconfig.build.json" },
    { "path": "../../../shared/config/tsconfig.build.json" },
    { "path": "../../../shared/services/tsconfig.build.json" },
    { "path": "../../../shared/middleware/tsconfig.build.json" },
    { "path": "../../../shared/llm-service/tsconfig.build.json" },
    { "path": "../../../shared/infra/tsconfig.build.json" }
  ]
}
```

### Step 4.4: Fix `contracts` — add `references`

```json
// apps/packages/contracts/tsconfig.build.json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "isolatedDeclarations": true,
    "types": []
  },
  "include": ["src/**/*.ts"],
  "references": [
    { "path": "../shared-types/tsconfig.build.json" }
  ]
}
```

### Step 4.5: Fix `security-gateway` — remove hand-crafted .d.ts stubs

The 8 hand-crafted `.d.ts` files in `security-gateway/src/services/` need to be removed. TypeScript should be generating `.d.ts` files in `dist/` from the source `.ts` files. The stubs in `src/` will be preferred over `.ts` files, causing stale type information.

```bash
# Find and remove them
find apps/backend/services/security-gateway/src -name "*.d.ts" -delete
```

Same for `middleware/src/` (11 stubs) and other affected packages.

### Step 4.6: Fix `shared/middleware/src/` — remove hand-crafted .d.ts stubs

```bash
find apps/shared/middleware/src -name "*.d.ts" -delete
find apps/shared/services/src -name "*.d.ts" -not -path "*/dist/*" -delete
```

These stubs were likely created as workarounds for the LSP issues we're now fixing properly. With the new architecture, TypeScript generates `.d.ts` in `dist/` and LSP uses the `@uaip/source` condition to navigate to source directly.

### Step 4.7: Fix `require()` in ESM modules

Two production files:

**`apps/shared/middleware/src/authMiddleware.ts`**:
```typescript
// BEFORE (line 296):
const jwt = require('jsonwebtoken');

// AFTER:
import jwt from 'jsonwebtoken';
// (put at top of file with other imports)
```

**`apps/backend/services/capability-registry/src/services/mcpClientService.ts`**:
```typescript
// BEFORE (line 1750):
require('stream')

// AFTER:
import stream from 'stream';
// (put at top of file)
```

### Step 4.8: Fix `cognitiveEvals.test.ts` cross-package relative import

**`apps/backend/services/agent-intelligence/src/__tests__/cognitiveEvals.test.ts`**:
```typescript
// BEFORE (5-level relative import crossing package boundary):
import { DecisionEngine } from '../../../../../shared/services/src/agent/agent-intelligence/decision-engine.js';
import { AgentStateMachine } from '../../../../../shared/services/src/agent-state/agent-state-machine.js';

// AFTER (use workspace package):
import { DecisionEngine } from '@uaip/shared-services/agent/agent-intelligence/decision-engine.js';
import { AgentStateMachine } from '@uaip/shared-services/agent-state/agent-state-machine.js';
// OR add these as exports to @uaip/shared-services package.json and re-export via index.ts
```

### Step 4.9: Remove `--clean` from `build-services` script

```json
// apps/backend/package.json — BEFORE
"build-services": "pnpm exec tsc -b tsconfig.build.json --clean && pnpm exec tsc -b tsconfig.build.json"

// AFTER — Nx handles orchestration, no --clean
"build": "tsc -b tsconfig.build.json"
```

With Nx caching, `--clean` is counterproductive — Nx manages cache invalidation. Only run `--clean` explicitly when debugging build issues.

---

## Phase 5 — Bun Runtime Compatibility (30 minutes)

Since services run on Bun, update per-service tsconfigs:

### Step 5.1: Add `"types": ["bun"]` to service tsconfigs

Services that use Bun APIs need:
```json
// In tsconfig.build.json for each Bun-based service
{
  "compilerOptions": {
    "types": ["bun", "node"]
  }
}
```

### Step 5.2: Add `@types/bun` dependency

```bash
pnpm add -D @types/bun -w
```

### Step 5.3: Verify Bun-specific code compiles

Bun uses `module: "Preserve"` + `moduleResolution: "bundler"` per official Bun TS6 docs. But since services are Node.js-compatible (not Bun-exclusive APIs), `NodeNext` + `NodeNext` is safer.

For `navratna-core` and `navratna-gateway` which use `bun --hot src/index.ts`:
```json
{
  "compilerOptions": {
    "module": "Preserve",
    "moduleResolution": "bundler",
    "types": ["bun"]
  }
}
```

---

## Phase 6 — Remove Legacy Build Scripts (30 minutes)

Now that Nx handles build orchestration, clean up:

```json
// navratna/package.json — REMOVE these:
"build:shared": "pnpm --filter ... build && ...",  // ← replaced by nx with dependsOn
"build:backend": "cd apps/backend && pnpm build-services",  // ← nx run-many -t build

// apps/backend/package.json — SIMPLIFY:
"build-services": "tsc -b tsconfig.build.json"  // no --clean, Nx handles caching
```

---

## Complete File Change Inventory

| File | Action | Reason |
|------|--------|--------|
| `navratna/nx.json` | CREATE | Task pipeline, caching |
| `navratna/tsconfig.base.json` | CREATE | Single source of truth for compiler options |
| `navratna/tsconfig.json` | REWRITE | Add all 18 packages to references |
| `navratna/package.json` | UPDATE | New nx-based scripts, typescript 6 |
| Every package `tsconfig.json` | REWRITE | Orchestrator: files:[], refs:[./tsconfig.build.json] |
| Every package `tsconfig.build.json` | CREATE | Compilation: composite, outDir, rootDir, refs |
| Every package `package.json` exports | UPDATE | Add @uaip/source condition |
| `shared-services/package.json` exports | FIX | Remove invalid package-name values |
| `llm-service (shared)/package.json` | FIX | Add exports field (currently missing) |
| `navratna-core/tsconfig.build.json` | REWRITE | composite:false + custom tsc command |
| `security-gateway/src/services/*.d.ts` | DELETE (8 files) | Stale stubs override source |
| `shared/middleware/src/*.d.ts` | DELETE (11 files) | Stale stubs |
| `authMiddleware.ts` line 296 | FIX | require() → import |
| `mcpClientService.ts` line 1750 | FIX | require() → import |
| `cognitiveEvals.test.ts` lines 18-20 | FIX | 5-level relative → @uaip/shared-services |
| `apps/backend/tsconfig.build.json` | UPDATE | Remove --clean from build scripts that call it |
| `apps/frontend/tsconfig.json` | REWRITE | bundler mode, add conditions |
| `apps/frontend/vite.config.ts` | UPDATE | Remove @uaip/* aliases, add conditions |
| All service tsconfig.json | UPDATE/REWRITE | Remove paths, baseUrl, noCheck |
| `pnpm-workspace.yaml` | UPDATE | typescript: ^6.0.0 in catalog |

---

## What the Developer Experience Looks Like After Migration

### Cold start (first time or after `git clone`):
```bash
pnpm install
nx run-many -t build   # Builds all packages in correct dep order, parallel where possible
# First run: ~2-3 minutes
```

### After changing `@uaip/types`:
```bash
nx affected -t build   # Rebuilds types + everything that depends on it
# Nx knows the graph — no manual "build:shared first"
# With caching: only changed packages rebuild
```

### LSP / editor (VS Code, Zed, Neovim):
```
Open any .ts file in any service
→ TypeScript LSP finds tsconfig.json (orchestrator)
→ Resolves @uaip/* imports via customConditions["@uaip/source"]
→ Matches "@uaip/source" condition in each package's exports
→ Resolves to ./src/index.ts
→ Go-to-Definition opens source files, not .d.ts stubs
→ Works WITHOUT any prior build (source files always exist)
```

### Running a single service in dev:
```bash
nx run @uaip/agent-intelligence:dev  # Nx ensures deps are built first (cached)
```

### Adding a new package:
1. Create the package directory with `package.json` (workspace:* deps), `tsconfig.json`, `tsconfig.build.json`, `src/index.ts`
2. Add `"@newpackage/source": "./src/index.ts"` to its `exports`
3. Run `nx sync` — automatically adds it to root `tsconfig.json references` and any package that depends on it
4. No manual path editing anywhere

---

## Migration Order (Do This Sequence)

```
Day 1:
  ✓ Phase 0 — Install Nx, create nx.json, verify project discovery
  ✓ Phase 1.1-1.4 — TypeScript 6, ignoreDeprecations safety net, moduleResolution fixes

Day 2:
  ✓ Phase 1.5-1.8 — strict:false, types:[], remove deprecated options
  ✓ Phase 2.1-2.2 — Create tsconfig.base.json, rewrite root tsconfig.json solution file

Day 3:
  ✓ Phase 2.3-2.5 — Per-package tsconfig split (shared packages first: config, types, utils, infra, middleware, services, llm-service)
  ✓ Phase 3 — Fix package.json exports (add @uaip/source conditions)

Day 4:
  ✓ Phase 2.3 continued — Per-service tsconfig split (all backend services)
  ✓ Phase 4.1-4.4 — Fix structural issues (orchestration-pipeline, contracts)

Day 5:
  ✓ Phase 4.5-4.8 — Fix code issues (stubs, require(), cross-pkg imports)
  ✓ Phase 2.6 — Handle navratna-core (composite:false + custom build)
  ✓ Phase 5 — Bun compatibility
  ✓ Phase 6 — Remove legacy scripts

Day 6:
  ✓ Verify: nx run-many -t typecheck (find all remaining TS errors)
  ✓ Fix errors package by package (start with no-noCheck services)
  ✓ Remove ignoreDeprecations: "6.0" from all tsconfigs
  ✓ Final: nx run-many -t build,test
```

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `strict: true` causes mass errors | High | Set `strict: false` in base, migrate per package |
| `noCheck` removal reveals hidden errors in 4 services | High | Fix one service at a time; use `// @ts-expect-error -- <reason>` |
| `moduleResolution: NodeNext` requires `.js` extensions in relative imports | Medium | Run `tsc --noEmit` per package to find violations |
| navratna-core composite:false breaks tsc -b | Known (existing bug) | Already excluded from project refs; build with plain tsc |
| `.d.ts` stub deletion causes TypeScript to find new errors | Medium | Errors in source that stubs were hiding; fix them |
| pnpm symlink watcher stale after adding new packages | Low | Restart TS language server in editor |
| Nx cache invalidated after tsconfig.base.json changes | Expected | `sharedGlobals` input includes base — intentional |
| `customConditions` not supported in older Node.js | Low | Only used by TypeScript LSP, not runtime. Runtime uses `import` condition |

---

## Quick Verification Commands

```bash
# After each phase, verify:
npx nx show projects          # all 15+ packages visible
npx nx graph                  # dep graph looks correct
npx nx run-many -t typecheck  # type errors (expected initially)
npx nx run-many -t build      # builds succeed in order
npx nx run-many -t build      # second run: all CACHE HITS (no recompilation)

# Verify LSP is working (in editor):
# Open apps/backend/services/agent-intelligence/src/services/agent-core.service.ts
# Hover over: import { Agent } from '@uaip/types'
# Cmd+Click on Agent → should navigate to src/agent.ts (NOT dist/agent.d.ts)

# Verify no paths anywhere (after Phase 2):
grep -r '"paths"' --include="*.json" . | grep -v node_modules | grep -v tsconfig.json | grep -v "vite.config\|@/\|@uaip/source"
# Should only show frontend tsconfig (local @/ alias) and nx.json (if used there)
```

---

## References

- TypeScript 6 announcement: https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- TypeScript 6 migration issue: https://github.com/microsoft/TypeScript/issues/62508
- TS5to6 migration tool: `npx @andrewbranch/ts5to6`
- Nx + pnpm docs: https://nx.dev/docs/guides/adopting-nx/adding-to-monorepo  
- Nx TypeScript TS solution setup: https://nx.dev/docs/technologies/typescript/guides/switch-to-workspaces-project-references
- `nx sync` for project references: https://nx.dev/docs/features/maintain-typescript-monorepos
- customConditions pattern: https://colinhacks.com/essays/live-types-typescript-monorepo
- Bun TypeScript 6 guide: https://bun.com/docs/typescript-6
