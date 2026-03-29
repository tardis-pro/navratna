# Navratna — Production-Ready: Layer A+B Plan
**Date**: 2026-03-27  
**Scope**: Infrastructure cleanup + structural refactor (Layer A+B)  
**Status**: APPROVED — awaiting execution  
**Layer C** (TS6 full migration): separate sprint, see `navratna-ts-migration.md`

---

## Architecture Decision: The MIDI / Feature Factory Pattern

> "Each thing should be able to work in a symphony or as a single note, or like MIDI through different instruments."

**Decision**: Every domain is a `Feature` — a self-contained unit implementing a standard interface. navratna-core and navratna-gateway are `FeatureFactory` compositions with no business logic of their own. Legacy services become thin standalone runners using the same Feature objects.

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

**Configurability**: `FEATURE_AGENT=false bun navratna-core` disables the agent domain at runtime.  
**Isolation**: Each feature composes only what it needs from `@uaip/shared-services` sub-paths.  
**Single note**: `agent-intelligence/src/index.ts` uses `new FeatureFactory().register(agentIntelligenceFeature)` — runs standalone with identical logic.

---

## Owner Answers (locked in)

| Q | Answer |
|---|---|
| Scope | Layer A+B only. TS6 migration (Layer C) is a separate sprint. |
| Duplicates | Make shared-services more modular. Delete the subpar copies. shared-services = canonical. |
| Missing routes | My decision: restore as Feature route files per domain. Rationale: isolation/security/reliability/configurability. |
| Legacy services | Remove eventually. Business logic only via @uaip/* packages. Core + gateway run separately. Both behind FeatureFactory. |
| DecisionEngine package | Sub-path export from @uaip/shared-services now. Proper @uaip/agent-intelligence package in Layer C. |

---

## Target State (End of Layer A+B)

```
apps/packages/         pure data: @uaip/types, @uaip/utils, @uaip/contracts
apps/shared/           infra: @uaip/config, @uaip/infra, @uaip/middleware, @uaip/llm-service
                       domain services: @uaip/shared-services (MODULARIZED with sub-path exports)
apps/backend/services/
  navratna-core/       FeatureFactory composition — zero own business logic
  navratna-gateway/    FeatureFactory composition — zero own business logic
  agent-intelligence/  thin standalone runner → agentIntelligenceFeature
  discussion-orchestration/ thin standalone runner → discussionFeature
  artifact-service/    thin standalone runner → artifactFeature
  llm-service/         thin standalone runner → llmFeature
  security-gateway/    thin standalone runner → securityFeature
  orchestration-pipeline/ thin standalone runner → orchestrationFeature
  capability-registry/ thin standalone runner → capabilityFeature
```

**`@uaip/shared-services` new sub-path exports:**
```
@uaip/shared-services                       barrel (unchanged)
@uaip/shared-services/base-service          BaseService
@uaip/shared-services/persona               PersonaService (canonical)
@uaip/shared-services/discussion            DiscussionService (canonical)
@uaip/shared-services/discussion-orchestration  DiscussionOrchestrationService
@uaip/shared-services/participant           ParticipantManagementService (canonical)
@uaip/shared-services/agent-state           AgentStateMachine
@uaip/shared-services/agent-memory          EpisodicMemoryManager, MemoryConsolidator
@uaip/shared-services/decision-engine       DecisionEngine, CapabilityResolver
@uaip/shared-services/cognitive             ConversationIntelligenceService
@uaip/shared-services/event-bus             EventBusService (replaces broken /eventBusService)
@uaip/shared-services/database              DatabaseService, DrizzleService
@uaip/shared-services/feature-factory       FeatureFactory, Feature, ServiceDeps (NEW)
```

---

## Issues Status Going In

### Already Fixed (do not re-do)
| ID | Description |
|----|-------------|
| A9 | build:shared now correctly builds all 8 packages via NX |
| C3 | No --clean in default build; nx run-many used throughout |
| C4 | NX installed (22.6.1), nx.json has dependsOn:["^build"], parallel:6 |
| A1 | Root tsconfig.json now has 20 references (all packages) |
| B7 | capability-registry path depth fixed |
| B9 | .d.ts stubs in security-gateway/src/services/ cleaned |
| C2 | require() in ESM fixed (authMiddleware.ts, mcpClientService.ts) |
| B3 | shared-services now uses moduleResolution: bundler |

### Still Broken (this plan fixes)
| ID | Description | Phase |
|----|-------------|-------|
| NEW | 294 stale .d.ts.map + .js.map files in shared/services/src/ | 0 |
| B4 | @uaip/shared-services exports: 3 entries use package names as values | 0 |
| B5 | @uaip/llm-service (shared) has no exports field | 0 |
| — | ParticipantManagementService local copy is dead code | 0 |
| A3 | @uaip/middleware + @uaip/llm-service commented out in backend base tsconfig | 0 |
| A2 | Root tsconfig paths missing 5 of 8 shared packages | 0 |
| B8 | security-gateway @uaip/llm-service path missing /src | 0 |
| NEW | orchestration-pipeline fake @uaip/knowledge-graph/* aliases → agent-intelligence src | 0 |
| C1 | cognitive_evals.test.ts: 3 five-level cross-package relative imports | 0/1 |
| — | @uaip/shared-services has no sub-path exports, barrel only | 1 |
| — | FeatureFactory does not exist | 1 |
| — | PersonaService exists in discussion-orchestration (subpar duplicate) | 2 |
| — | DiscussionService exists in discussion-orchestration (subpar duplicate) | 2 |
| — | 40+ API endpoints have no HTTP handler (agent CRUD, chat, persona, discussion REST) | 3 |
| — | AgentCoreService never initialized in navratna-core (event bus subscriptions dark) | 3 |
| A5/— | navratna-core: 18 cross-service src/ imports | 4 |
| — | navratna-gateway: 21 cross-service src/ imports | 4 |
| A5 | navratna-core tsconfig include spans 4 sibling service src/ trees | 4 |
| NEW | tsconfig.base.json missing module, moduleResolution, customConditions | 5 |
| NEW | @uaip/source condition only on @uaip/types + @uaip/utils; 5 packages missing it | 5 |
| B11/— | 6 services have noCheck:true | 6 |
| A6 | orchestration-pipeline missing composite:true | 6 |

---

## Phase 0: Immediate Cleanup
**Risk**: Zero. All additive or mechanical deletions.  
**Time estimate**: 2–3 hours.

### 0.1 Delete 294 stale build artifacts
```bash
find apps/shared/services/src -name "*.d.ts.map" -o -name "*.js.map" | xargs rm
```
Old compiled output emitted to src/ instead of dist/. Shadows real type resolution.

### 0.2 Fix @uaip/shared-services 3 invalid exports entries
File: `apps/shared/services/package.json`

Remove these (package names as export values — invalid per Node.js spec):
```json
"./eventBusService": { "import": "@uaip/infra/eventBus.js" }
"./databaseService": { "import": "@uaip/infra/database/index.js" }
"./cacheService":    { "import": "@uaip/infra/cache/index.js" }
```
Replace with proper relative paths pointing to compiled outputs (or remove until Phase 1 adds proper sub-paths).

### 0.3 Add exports field to @uaip/llm-service (shared)
File: `apps/shared/llm-service/package.json`
```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js",
    "default": "./dist/index.js"
  }
}
```

### 0.4 Delete dead ParticipantManagementService local copy
```bash
rm apps/backend/services/discussion-orchestration/src/services/participant_management_service.ts
```
`DiscussionOrchestrationService` line 11 already imports from `@uaip/shared-services`, not this file. Zero consumers.

### 0.5 Fix backend base tsconfig (A3)
File: `apps/backend/tsconfig.json`
Uncomment lines 18-29:
```json
"@uaip/middleware":  ["../shared/middleware/src"],
"@uaip/llm-service": ["../shared/llm-service/src"]
```
22 files import @uaip/middleware; 9 import @uaip/llm-service. All currently unresolvable from base config.

### 0.6 Fix root tsconfig paths (A2)
File: `navratna/tsconfig.json` — add to `compilerOptions.paths`:
```json
"@uaip/config":           ["./apps/shared/config/src"],
"@uaip/config/*":         ["./apps/shared/config/src/*"],
"@uaip/infra":            ["./apps/shared/infra/src"],
"@uaip/infra/*":          ["./apps/shared/infra/src/*"],
"@uaip/middleware":       ["./apps/shared/middleware/src"],
"@uaip/middleware/*":     ["./apps/shared/middleware/src/*"],
"@uaip/shared-services":  ["./apps/shared/services/src"],
"@uaip/shared-services/*":["./apps/shared/services/src/*"],
"@uaip/llm-service":      ["./apps/shared/llm-service/src"],
"@uaip/llm-service/*":    ["./apps/shared/llm-service/src/*"]
```

### 0.7 Fix security-gateway @uaip/llm-service path (B8)
File: `apps/backend/services/security-gateway/tsconfig.json`
```json
"@uaip/llm-service": ["../../../shared/llm-service/src"]   // was: ["../../../shared/llm-service"]
```

### 0.8 Fix orchestration-pipeline fake package aliases (NEW)
File: `apps/backend/services/orchestration-pipeline/tsconfig.json`
Remove:
```json
"@uaip/knowledge-graph/*": ["../../../backend/services/agent-intelligence/src/knowledge-graph/*"]
"@uaip/agent-memory/*":    ["../../../backend/services/agent-intelligence/src/agent-memory/*"]
```
These are invented packages aliased to another service's source. Replace with a proper `references` entry to `../agent-intelligence` in the tsconfig.

### 0.9 Fix cognitive_evals.test.ts imports (C1 + prerequisite for Phase 1)
File: `apps/backend/services/agent-intelligence/src/__tests__/cognitive_evals.test.ts`
Lines 18-20 — after Phase 1 adds the sub-path export:
```typescript
// BEFORE:
import { DecisionEngine } from '../../../../../shared/services/src/agent/agent-intelligence/decision_engine.js'
import type { CapabilityResolver } from '../../../../../shared/services/src/agent/agent-intelligence/capability_resolver.js'
import { AgentStateMachine } from '../../../../../shared/services/src/agent-state/agent_state_machine.js'

// AFTER:
import { DecisionEngine } from '@uaip/shared-services/decision-engine'
import type { CapabilityResolver } from '@uaip/shared-services/decision-engine'
import { AgentStateMachine } from '@uaip/shared-services/agent-state'
```

**Phase 0 success criteria:**
```bash
nx run-many -t build --projects=@uaip/config,@uaip/types,@uaip/utils,@uaip/infra,@uaip/middleware,@uaip/shared-services
# All 6 build clean, no noCheck.
find apps/shared/services/src -name "*.d.ts.map" -o -name "*.js.map" | wc -l  # → 0
```

---

## Phase 1: @uaip/shared-services Modularization + FeatureFactory
**Risk**: Low. Additive changes only. Existing barrel import still works.  
**Time estimate**: 3–4 hours.

### 1.1 Add sub-path exports to apps/shared/services/package.json

Add to `exports` field:
```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./base-service": { "types": "./dist/base_service.d.ts", "import": "./dist/base_service.js" },
    "./persona": { "types": "./dist/persona_service.d.ts", "import": "./dist/persona_service.js" },
    "./discussion": { "types": "./dist/discussion_service.d.ts", "import": "./dist/discussion_service.js" },
    "./discussion-orchestration": {
      "types": "./dist/services/discussion_orchestration_service.d.ts",
      "import": "./dist/services/discussion_orchestration_service.js"
    },
    "./participant": {
      "types": "./dist/participant_management_service.d.ts",
      "import": "./dist/participant_management_service.js"
    },
    "./agent-state": {
      "types": "./dist/agent-state/agent_state_machine.d.ts",
      "import": "./dist/agent-state/agent_state_machine.js"
    },
    "./agent-memory": {
      "types": "./dist/agent-memory/index.d.ts",
      "import": "./dist/agent-memory/index.js"
    },
    "./decision-engine": {
      "types": "./dist/agent/agent-intelligence/decision_engine.d.ts",
      "import": "./dist/agent/agent-intelligence/decision_engine.js"
    },
    "./cognitive": {
      "types": "./dist/cognitive/index.d.ts",
      "import": "./dist/cognitive/index.js"
    },
    "./event-bus": {
      "types": "./dist/event_bus_service.d.ts",
      "import": "./dist/event_bus_service.js"
    },
    "./database": {
      "types": "./dist/database_service.d.ts",
      "import": "./dist/database_service.js"
    },
    "./feature-factory": {
      "types": "./dist/feature_factory.d.ts",
      "import": "./dist/feature_factory.js"
    }
  }
}
```

### 1.2 Create FeatureFactory
File: `apps/shared/services/src/feature_factory.ts`

```typescript
import type { Elysia } from 'elysia'
import type { Server as SocketIOServer } from 'socket.io'
import type { EventBusService } from './event_bus_service.js'
import type { DatabaseService } from './database_service.js'

export interface ServiceDeps {
  eventBusService: EventBusService
  databaseService?: DatabaseService
}

export interface Feature {
  readonly name: string
  initialize?(deps: ServiceDeps): Promise<void>
  routes?(app: Elysia): Elysia
  events?(bus: EventBusService): Promise<void>
  websocket?(io: SocketIOServer): void
  shutdown?(): Promise<void>
}

export class FeatureFactory {
  private readonly features: Feature[] = []

  register(feature: Feature | null | false): this {
    if (feature) this.features.push(feature)
    return this
  }

  async initialize(deps: ServiceDeps): Promise<void> {
    for (const f of this.features) {
      await f.initialize?.(deps)
    }
  }

  mountRoutes(app: Elysia): Elysia {
    return this.features.reduce((a, f) => f.routes?.(a) ?? a, app)
  }

  async subscribeEvents(bus: EventBusService): Promise<void> {
    for (const f of this.features) {
      await f.events?.(bus)
    }
  }

  mountWebSocket(io: SocketIOServer): void {
    for (const f of this.features) {
      f.websocket?.(io)
    }
  }

  async shutdown(): Promise<void> {
    for (const f of [...this.features].reverse()) {
      await f.shutdown?.()
    }
  }
}
```

### 1.3 Export FeatureFactory from shared-services index
Add to `apps/shared/services/src/index.ts`:
```typescript
export { FeatureFactory, type Feature, type ServiceDeps } from './feature_factory.js'
```

### 1.4 Add agent-memory index if missing
If `apps/shared/services/src/agent-memory/index.ts` doesn't exist:
```typescript
export { EpisodicMemoryManager } from './episodic_memory_manager.js'
export { MemoryConsolidator } from './memory_consolidator.js'
// re-export all agent-memory classes
```

**Phase 1 success criteria:**
```typescript
import { FeatureFactory, type Feature } from '@uaip/shared-services/feature-factory'
import { PersonaService } from '@uaip/shared-services/persona'
import { DecisionEngine } from '@uaip/shared-services/decision-engine'
// All resolve without error
```

---

## Phase 2: Duplicate Elimination
**Risk**: Medium. Deleting files that navratna-core currently imports. Must update imports first.  
**Time estimate**: 2 hours.

### 2.1 Confirm PersonaService divergence
Run diff:
```bash
diff apps/shared/services/src/persona_service.ts \
     apps/backend/services/discussion-orchestration/src/services/persona_service.ts
```
**Expected**: shared-services version is a superset (1069 vs 979 lines, raw SQL search, correct sub-path infra imports).

### 2.2 Confirm DiscussionService divergence
```bash
diff apps/shared/services/src/discussion_service.ts \
     apps/backend/services/discussion-orchestration/src/services/discussion_service.ts
```
**Expected**: shared-services version is more complete (1283 vs 1234 lines, Drizzle raw SQL, parallel participant creation).

### 2.3 Update navratna-core to use canonical versions
File: `apps/backend/services/navratna-core/src/index.ts`
```typescript
// REMOVE:
import { PersonaService } from '../../discussion-orchestration/src/services/persona_service.js'
import { DiscussionService } from '../../discussion-orchestration/src/services/discussion_service.js'

// ADD:
import { PersonaService } from '@uaip/shared-services/persona'
import { DiscussionService } from '@uaip/shared-services/discussion'
```

### 2.4 Delete subpar duplicates
```bash
rm apps/backend/services/discussion-orchestration/src/services/persona_service.ts
rm apps/backend/services/discussion-orchestration/src/services/discussion_service.ts
```

**Phase 2 success criteria:**
```bash
grep -r "discussion-orchestration/src/services/persona_service\|discussion-orchestration/src/services/discussion_service" . | grep -v node_modules
# → 0 results
pnpm --filter @uaip/navratna-core build
# → succeeds
```

---

## Phase 3: Create Missing HTTP Routes
**Risk**: Medium (new code). Service logic exists; we're adding HTTP surface only.  
**Time estimate**: 1 day.

### 3.1 Agent domain — create route files

**`apps/backend/services/agent-intelligence/src/routes/agents_crud_routes.ts`**
- `GET  /api/v1/agents`
- `POST /api/v1/agents`
- `GET  /api/v1/agents/:agentId`
- `PUT  /api/v1/agents/:agentId`
- `DELETE /api/v1/agents/:agentId`
- Wires to `AgentCoreService` via event-bus CQRS (publish command, await response)
- Auth: `requireNginxAuth` middleware on all routes

**`apps/backend/services/agent-intelligence/src/routes/agent_chat_routes.ts`**
- `POST /api/v1/agents/:agentId/chat`
- `POST /api/v1/agents/:agentId/approvals/:approvalId`
- Wires to `AgentDiscussionService` (LLM chat with memory)

**`apps/backend/services/agent-intelligence/src/routes/agent_capability_routes.ts`**
- `GET  /api/v1/agents/:agentId/capabilities`
- `POST /api/v1/agents/:agentId/analyze`
- `POST /api/v1/agents/:agentId/plan`
- `POST /api/v1/agents/:agentId/learn`

**`apps/backend/services/agent-intelligence/src/routes/agent_memory_routes.ts`**
- `DELETE /api/v1/agents/:agentId/memory/semantic/:conceptId`
- `PATCH  /api/v1/agents/:agentId/memory/semantic/:conceptId`

### 3.2 Persona domain — create route file

**`apps/backend/services/discussion-orchestration/src/routes/persona_routes.ts`**
- `GET    /api/v1/personas`
- `POST   /api/v1/personas`
- `GET    /api/v1/personas/search`
- `GET    /api/v1/personas/recommendations`
- `GET    /api/v1/personas/templates`
- `GET    /api/v1/personas/:id`
- `PUT    /api/v1/personas/:id`
- `DELETE /api/v1/personas/:id`
- `GET    /api/v1/personas/:id/analytics`
- `POST   /api/v1/personas/:id/validate`
- Uses: `PersonaService` from `@uaip/shared-services/persona`

### 3.3 Discussion REST — create route file

**`apps/backend/services/discussion-orchestration/src/routes/discussion_routes.ts`**
- `POST   /api/v1/discussions`
- `GET    /api/v1/discussions/search`
- `GET    /api/v1/discussions/:id`
- `PUT    /api/v1/discussions/:id`
- `POST   /api/v1/discussions/:id/start`
- `POST   /api/v1/discussions/:id/end`
- `POST   /api/v1/discussions/:id/participants`
- `DELETE /api/v1/discussions/:id/participants/:pid`
- `POST   /api/v1/discussions/:id/participants/:pid/messages`
- `GET    /api/v1/discussions/:id/messages`
- `POST   /api/v1/discussions/:id/advance-turn`
- `GET    /api/v1/discussions/:id/analytics`
- `POST   /api/v1/discussions/:id/turns/request`
- `POST   /api/v1/discussions/:id/huddle`
- `POST   /api/v1/discussions/:id/huddles/:huddle_id/resolve`
- Uses: `DiscussionService`, `DiscussionOrchestrationService` from `@uaip/shared-services/*`

### 3.4 Create Feature objects

**`apps/backend/services/agent-intelligence/src/feature.ts`**
```typescript
import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
// import all route registration functions
// import AgentCoreService

export const agentIntelligenceFeature: Feature = {
  name: 'agent-intelligence',
  async initialize(deps: ServiceDeps) {
    const agentCoreService = new AgentCoreService(deps)
    await agentCoreService.initialize()
    // sets up event-bus subscriptions: agent.command.*, agent.query.*
  },
  routes(app) {
    return registerAgentCrudRoutes(
      registerAgentChatRoutes(
        registerAgentCapabilityRoutes(
          registerAgentMemoryRoutes(app)
        )
      )
    )
  },
  async events(bus) {
    await bus.subscribe('conversation.enhancement.request', handleConversationEnhancement)
    await bus.subscribe('agent.chat.request', handleChatRequest)
  }
}
```

**`apps/backend/services/discussion-orchestration/src/feature.ts`**
```typescript
export const discussionFeature: Feature = {
  name: 'discussion-orchestration',
  routes(app) {
    return registerPersonaRoutes(registerDiscussionRoutes(app), personaService)
  },
  websocket(io) {
    setupWebSocketHandlers(io, orchestrationService)
    userChatHandler.attach(io)
    streamingHandler.attach(io)
    // etc.
  }
}
```

Create similarly: `artifact_feature.ts`, `llm_feature.ts`, `security_feature.ts`, `orchestration_feature.ts`, `capability_feature.ts`

**Phase 3 success criteria:**
```bash
# Run navratna-core
pnpm --filter @uaip/navratna-core dev
# In another terminal:
curl http://localhost:3001/api/v1/agents           # → 200
curl -X POST http://localhost:3001/api/v1/personas # → 201 or 400 (validation)
curl http://localhost:3001/api/v1/discussions      # → 200
```

---

## Phase 4: Rewire navratna-core + navratna-gateway
**Risk**: Medium-high. Replacing cross-service src/ imports. Verify build at each step.  
**Time estimate**: 4–6 hours.

### 4.1 Rewrite navratna-core/src/index.ts

```typescript
import { BaseService } from '@uaip/shared-services/base-service'
import { FeatureFactory } from '@uaip/shared-services/feature-factory'
import { agentIntelligenceFeature } from '../agent-intelligence/src/feature.js'
import { discussionFeature } from '../discussion-orchestration/src/feature.js'
import { artifactFeature } from '../artifact-service/src/feature.js'
import { llmFeature } from '../llm-service/src/feature.js'

class NavratnaCoreService extends BaseService {
  private factory = new FeatureFactory()
    .register(process.env.FEATURE_AGENT !== 'false' && agentIntelligenceFeature)
    .register(process.env.FEATURE_DISCUSSION !== 'false' && discussionFeature)
    .register(process.env.FEATURE_ARTIFACTS !== 'false' && artifactFeature)
    .register(process.env.FEATURE_LLM !== 'false' && llmFeature)

  protected async initialize(): Promise<void> {
    await this.factory.initialize({
      eventBusService: this.eventBusService,
      databaseService: this.databaseService
    })
  }

  protected async setupRoutes(): Promise<void> {
    this.factory.mountRoutes(this.app)
    this.app.get('/health', () => ({
      status: 'ok',
      service: 'navratna-core',
      features: this.factory.activeFeatureNames
    }))
  }

  protected async setupEventSubscriptions(): Promise<void> {
    await this.factory.subscribeEvents(this.eventBusService)
  }
}
```

Note: navratna-core still imports from sibling `../agent-intelligence/src/feature.js` etc.  
This is intentional for now — feature files are the new boundary. The sibling src/ imports
inside the feature files themselves will be cleaned up when they become proper @uaip packages in Layer C.  
What's eliminated: the 18 direct service-class imports into navratna-core's own index.ts.

### 4.2 Rewrite navratna-gateway/src/index.ts (same pattern)
```typescript
import { securityFeature } from '../security-gateway/src/feature.js'
import { orchestrationFeature } from '../orchestration-pipeline/src/feature.js'
import { capabilityFeature } from '../capability-registry/src/feature.js'

const factory = new FeatureFactory()
  .register(process.env.FEATURE_AUTH !== 'false' && securityFeature)
  .register(process.env.FEATURE_ORCHESTRATION !== 'false' && orchestrationFeature)
  .register(process.env.FEATURE_REGISTRY !== 'false' && capabilityFeature)
```

### 4.3 Update each legacy service to use its Feature (standalone mode)

```typescript
// agent-intelligence/src/index.ts — now 25 lines
class AgentIntelligenceService extends BaseService {
  private factory = new FeatureFactory().register(agentIntelligenceFeature)
  protected async initialize() { await this.factory.initialize(this.deps) }
  protected async setupRoutes() { this.factory.mountRoutes(this.app) }
  protected async setupEventSubscriptions() { await this.factory.subscribeEvents(this.eventBusService) }
}
```

Same for all 7 legacy services.

### 4.4 Fix navratna-core tsconfig (A5)
```json
// apps/backend/services/navratna-core/tsconfig.json
// REMOVE from include:
"../agent-intelligence/src/**/*"
"../artifact-service/src/**/*"
"../llm-service/src/**/*"
"../discussion-orchestration/src/**/*"

// KEEP:
"include": ["src/**/*"]
```

**Phase 4 success criteria:**
```bash
grep -r "../../agent-intelligence/src\|../../discussion-orchestration/src\|../../security-gateway/src\|../../orchestration-pipeline/src\|../../capability-registry/src" \
  apps/backend/services/navratna-core/src/ \
  apps/backend/services/navratna-gateway/src/
# → 0 results (Feature boundary has been crossed; individual service imports inside feature files are acceptable for now)

pnpm --filter @uaip/navratna-core build && pnpm --filter @uaip/navratna-gateway build
# → both succeed
```

---

## Phase 5: tsconfig.base.json Completion
**Risk**: Low. Additive only.  
**Time estimate**: 1–2 hours.

### 5.1 Add missing fields to tsconfig.base.json
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "customConditions": ["@uaip/source"],
    "target": "ES2022",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "forceConsistentCasingInFileNames": true,
    "ignoreDeprecations": "6.0",
    "types": []
  }
}
```

Remove from base: `allowSyntheticDefaultImports`, `esModuleInterop` (deprecated in TS6, now defaults).

### 5.2 Add @uaip/source condition to 5 remaining packages
For each of `@uaip/contracts`, `@uaip/config`, `@uaip/infra`, `@uaip/middleware`, `@uaip/shared-services`:
```json
"exports": {
  ".": {
    "@uaip/source": "./src/index.ts",
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```
For packages with sub-paths, add `"@uaip/source"` condition to each entry.

**Phase 5 success criteria:**  
Open any `.ts` file in any service. `import { PersonaService } from '@uaip/shared-services/persona'` → Go-to-Definition navigates to `persona_service.ts` source (not .d.ts).

---

## Phase 6: noCheck Removal (one at a time)
**Risk**: High per service. Capped by single-service scope.  
**Time estimate**: 1–2 hours per service = 1 day total.

**Order** (safest to most coupled):

| # | Service | Reason for order |
|---|---------|-----------------|
| 1 | basebench-meta | standalone product, no navratna-core/gateway deps |
| 2 | artifact-service | navratna-core imports feature file only |
| 3 | llm-service | navratna-core imports feature file only |
| 4 | discussion-orchestration | navratna-core uses discussionFeature |
| 5 | orchestration-pipeline | navratna-gateway uses orchestrationFeature; add composite:true here |
| 6 | security-gateway | navratna-gateway uses securityFeature; most complex |

**For each service:**
1. Remove `noCheck: true` from tsconfig
2. Run `tsc --noEmit -p apps/backend/services/<name>/tsconfig.json`
3. Triage: real bugs → fix; Elysia typing false positives → `// @ts-expect-error -- Elysia middleware type limitation`
4. Confirm `pnpm --filter @uaip/<name> build` succeeds

**Also in this phase:**
- Add `composite: true` to `orchestration-pipeline/tsconfig.json` (A6)
- Clean up `security-gateway` contradictory `files`/`include`/`exclude` (B11)

**Phase 6 success criteria:**
```bash
nx run-many -t typecheck
# → all services pass with no noCheck suppression
grep -r '"noCheck"' apps/backend/services/ | grep -v node_modules
# → 0 results
```

---

## Phase 7: Final Verification
**Time estimate**: 2–3 hours.

```bash
# Full build: dep graph in correct order
nx run-many -t build
# Second run: ALL CACHE HITS (incremental working)
nx run-many -t build

# Type checking
nx run-many -t typecheck

# No cross-service src/ imports in entry points
grep -rn "../../agent-intelligence/src\|../../discussion-orchestration/src\|../../security-gateway/src\|../../orchestration-pipeline/src\|../../capability-registry/src" \
  apps/backend/services/navratna-core/ \
  apps/backend/services/navratna-gateway/
# → 0

# No duplicate service files
ls apps/backend/services/discussion-orchestration/src/services/
# Should NOT contain: persona_service.ts, discussion_service.ts, participant_management_service.ts

# No stale artifacts
find apps/shared/services/src -name "*.d.ts.map" -o -name "*.js.map" | wc -l
# → 0

# API surface verification (navratna-core running)
curl localhost:3001/api/v1/agents         # → 200 or 401
curl localhost:3001/api/v1/personas       # → 200 or 401
curl localhost:3001/api/v1/discussions    # → 200 or 401
curl localhost:3001/health                # → 200 {status: "ok", features: [...]}

# Standalone mode verification
FEATURE_DISCUSSION=false pnpm --filter @uaip/navratna-core dev
curl localhost:3001/api/v1/personas       # → 404 (feature disabled)
```

---

## What Layer C Will Complete (Next Sprint)

Not in scope for this plan:

- Full TS6 upgrade via `@andrewbranch/ts5to6` migration tool
- Per-package `tsconfig.json` (orchestrator) + `tsconfig.build.json` (compilation) split
- Create `@uaip/agent-intelligence` as a proper composite package in `apps/shared/agent-intelligence/`
  - Move: AgentCoreService, AgentDiscussionService, AgentPlanningService, DecisionEngine, CapabilityResolver
  - Proper composite:true, exports with @uaip/source condition
- Create `@uaip/discussion` as a proper composite package in `apps/shared/discussion/`
  - Move: DiscussionOrchestrationService (DiscussionService + PersonaService already in shared-services)
- navratna-core and navratna-gateway import from `@uaip/agent-intelligence` and `@uaip/discussion` (proper packages, not sibling src/)
- Legacy service directories become standalone entry-point files only (25 lines each) or are deleted
- Remove `ignoreDeprecations: "6.0"` from all tsconfigs after migration tool runs

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| PersonaService/DiscussionService canonical versions have different method signatures | Low | Diff in Phase 2.1-2.2 before deletion. Stop if incompatible. |
| noCheck removal reveals hundreds of errors per service | High | Fix one service at a time. Use @ts-expect-error with reason for Elysia typing issues. |
| navratna-core tsconfig include removal breaks compilation during transition | Medium | Phase 4.4 happens after Feature wiring (4.1-4.3) is confirmed working |
| @uaip/shared-services sub-path path changes break existing consumers | Low | Phase 1 is additive; existing barrel import unchanged |
| FeatureFactory initialization order matters for services with cross-feature dependencies | Medium | Document initialization order; use sequential await in factory.initialize() |
| cognitive_evals.test.ts fix timing (depends on Phase 1 sub-path export) | Low | Phase 0.9 is listed after Phase 1 prerequisite; do 0.9 after 1.1 completes |

---

## Hard Constraints (MUST NOT violate)

1. **Do not set `composite: true` on navratna-core** while its tsconfig includes sibling service src/ trees. Physically impossible. Fix include first (Phase 4.4), then composite is an option in Layer C.
2. **Do not delete PersonaService or DiscussionService** without running the diff in Phase 2.1-2.2 first.
3. **Do not remove noCheck from multiple services in the same session** without triaging errors between each.
4. **Do not touch `navratna-core/tsconfig.json` to set composite:false` OR add composite:true** — leave it as-is until Phase 4.4 removes the sibling includes.
5. **Do not start Phase 5 (customConditions) before shared packages build correctly** — activating customConditions before the exports exist causes LSP to fail instead of degrade gracefully.
