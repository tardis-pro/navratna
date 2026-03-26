# @uaip/shared-services

Largest shared package (141+ source files). Provides `BaseService` (abstract base for all backend microservices), all domain services (User, Agent, Tool, Discussion, Persona, Knowledge, Task, Project, etc.), database layer, event bus, Qdrant, memory systems, and the Elysia HTTP app factory.

## STRUCTURE

```
src/
├── BaseService.ts              # Abstract base — ALL microservices extend this
├── ServiceFactory.ts           # Singleton DI container — get services via getInstance()
├── http-app.ts                 # Elysia app factory (createAppServer)
├── databaseService.ts          # TypeORM facade (delegates to domain services below)
├── eventBusService.ts          # Re-export of @uaip/infra EventBusService
├── index.ts                    # Barrel export
│
├── services/                   # Domain service layer
│   ├── MCPService.ts           # Model Context Protocol client/server
│   ├── ModelSelectionOrchestrator.ts  # 5-strategy model selection (Unified)
│   └── [8+ more domain services]
│
├── agent/                      # Agent intelligence internals
│   └── agent-intelligence/
│       ├── decision-engine.ts          # Confidence-gated tool execution decisions
│       ├── capability-resolver.ts      # ToolRegistry capability matching
│       └── [planning, execution...]
│
├── agent-memory/               # MemoryConsolidator, EpisodicMemoryManager
├── agent-state/                # AgentStateMachine
├── cognitive/                  # ConversationIntelligenceService, CognitivePipelineService
├── collaboration/              # CollaborationService
├── conversation/               # ConversationService
├── capabilities/               # CapabilityDiscoveryService
├── database/
│   ├── base/                   # Base repository classes
│   ├── repositories/           # 100+ TypeORM repository files
│   ├── drizzle/schemas/        # Drizzle schemas (artifact-service)
│   └── seeders/                # Database seed scripts
├── entities/                   # TypeORM entity definitions (57+ tables)
├── events/                     # Event type definitions
├── integration/                # IntegrationService (PG↔Neo4j↔Qdrant sync)
├── knowledge-graph/            # KnowledgeBootstrapService, knowledge-sync.service
├── observability/              # Metrics, health monitoring
└── repositories/               # High-level repository aggregators
```

## WHERE TO LOOK

| Task                   | Location                                                              |
| ---------------------- | --------------------------------------------------------------------- |
| Add new entity         | `src/entities/` + matching repository in `src/database/repositories/` |
| Add new domain service | `src/services/` → export from `src/index.ts`                          |
| Extend BaseService     | `src/BaseService.ts` — add optional init hooks                        |
| New DI registration    | `src/ServiceFactory.ts` `getInstance()` + `getXxxService()`           |
| Knowledge graph sync   | `src/knowledge-graph/`                                                |
| Agent memory           | `src/agent-memory/`                                                   |
| Model selection        | `src/services/ModelSelectionOrchestrator.ts`                          |
| Event bus access       | Import `EventBusService` from `@uaip/infra`; re-exported here         |

## BASESERVICE PATTERN

Every backend microservice extends `BaseService`:

```typescript
class MyService extends BaseService {
  constructor() {
    super({
      name: 'my-service',
      port: 3001,
      version: '1.0.0',
      enableWebSocket: false, // Socket.IO
      enableNeo4j: false, // Neo4j driver
      enableEnterpriseEventBus: false, // RabbitMQ compliance mode
    });
  }

  protected async initialize(): Promise<void> {
    // Custom startup — called after infra is ready
    // this.app — Elysia instance
    // this.eventBusService — BullMQ on Redis
    // this.databaseService — Drizzle (use drizzleService.getDb() for queries)
  }
}
```

## SERVICE FACTORY (DI Container)

```typescript
// Access any shared service
const factory = ServiceFactory.getInstance();
const userService = factory.getUserService();
const agentService = factory.getAgentService();
// Never instantiate shared services with `new` — always use ServiceFactory
```

## KNOWN TECHNICAL DEBT (do not re-implement)

These are intentional TODO placeholders — stubs pending future migration:

- `databaseService.ts` — delegated methods to domain services; 10+ stub methods
- `widgetService.ts` — storage/retrieval stubs returning empty
- `toolRegistry.ts` — knowledge-graph recommendation methods returning `[]`

Do not fill these stubs without coordinating with the domain service migration plan.

## TWO-PLANE DATABASE ACCESS

```typescript
import { getIntelligenceDb, getControlDb, CrossPlaneGuard } from '@uaip/shared-services';

const db = getIntelligenceDb(); // agents, personas, discussions, knowledge, artifacts
const cdb = getControlDb(); // users, auth, tools, operations, projects

// Before cross-plane writes (no DB-level FKs):
await CrossPlaneGuard.verify(pool, 'operations', agentId, 'Agent');
```

Schema files (all schema changes go here):

- `src/database/drizzle/schemas/intelligence.schema.ts` — PC-A (navratna-core domain)
- `src/database/drizzle/schemas/control.schema.ts` — PC-B (navratna-gateway domain)

Migrations: `pnpm --filter @uaip/shared-services drizzle:generate` → `src/database/drizzle/migrations/`

## CONVENTIONS

- **ORM**: Drizzle (not TypeORM). Schema in `src/database/drizzle/schemas/`. Use `drizzleService.getDb()` or the typed plane getters.
- **`src/entities/`**: Legacy re-export shims — do NOT add TypeORM decorators. Actual types live in `@uaip/types`.
- **Event bus**: BullMQ on Redis only — `EventBusService` from `@uaip/infra`
- All exports are named (no default exports)
- Domain services injected via `ServiceFactory`, not imported directly
- Event bus topics defined in `src/events/`

## COMMANDS

```bash
pnpm --filter @uaip/shared-services build          # compile
pnpm --filter @uaip/shared-services test           # Vitest (globals: true, pool: forks)
pnpm --filter @uaip/shared-services test:unit      # unit only
pnpm --filter @uaip/shared-services test:coverage  # with v8 coverage
pnpm --filter @uaip/shared-services drizzle:generate  # generate migration files
pnpm --filter @uaip/shared-services seed           # seed dev database
```

**Build order**: this package depends on `@uaip/types`, `@uaip/utils`, `@uaip/infra`, `@uaip/config`. Always `pnpm build:shared` before backend services.

**Test setup**: `src/__tests__/setup.ts` silences console, sets DB env vars, `afterEach: vi.clearAllMocks()`. Test helpers in `src/__tests__/helpers/testUtils.ts` (`TestUtils.createMockRepository<T>()` etc.) and `src/__tests__/mocks/serviceMocks.ts` (`ServiceMockFactory`).
