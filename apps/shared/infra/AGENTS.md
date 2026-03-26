# @uaip/infra

Raw infrastructure clients. The lowest layer — all other packages import from here for DB connections, cache, and event bus. No business logic.

## EXPORTS

| Module                   | Export                                   | Purpose                                                   |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------- |
| `./database`             | `DatabaseService`, `DatabaseError`       | Drizzle PG connection + query builder                     |
| `./database`             | `PgService`, `pgService`                 | Raw `pg` Pool (use for low-level queries)                 |
| `./cache`                | `RedisCacheService`, `redisCacheService` | ioredis wrapper with typed get/set/del                    |
| `./eventBus` (via index) | `EventBusService`                        | BullMQ on Redis — publish/subscribe event bus             |
| `./factory`              | `QdrantService`                          | Qdrant REST client — upsertVectors/search/delete (SDK)    |
| `./factory`              | `ToolGraphDatabase`                      | Neo4j driver — tool nodes + relationships/recommendations |
| `./factory`              | `InfrastructureFactory`                  | Singleton that inits+healthchecks all 4 DBs               |

## USAGE

```typescript
import { EventBusService, RedisCacheService } from '@uaip/infra';
// or from @uaip/shared-services (re-exported):
import { EventBusService, RedisCacheService } from '@uaip/shared-services';
```

**EventBusService** (BullMQ on Redis):

```typescript
const bus = EventBusService.getInstance();
await bus.publish('topic.name', { payload });
bus.subscribe('topic.name', async (data) => { ... });
```

**DatabaseService** (Drizzle):

```typescript
import { DatabaseService } from '@uaip/infra';
const db = DatabaseService.getInstance();
// use drizzleService.getDb() for Drizzle query builder
```

**PgService** (raw pg pool — use for bulk ops, migrations, analytics):

```typescript
import { pgService } from '@uaip/infra';
const result = await pgService.query('SELECT ...', [params]);
```

## STRUCTURE

```
src/
├── index.ts                   # Barrel: EventBusService, RedisCacheService, DatabaseService, PgService
├── eventBus.ts                # EventBusService (BullMQ) — publish/subscribe/publishAndWait/request
├── database/
│   ├── databaseService.ts     # DatabaseService (Drizzle-backed CRUD helpers)
│   ├── pgService.ts           # PgService — raw pg.Pool; singleton pgService
│   └── index.ts
├── cache/
│   ├── redisCacheService.ts   # RedisCacheService (ioredis)
│   └── index.ts
└── factory/
    ├── infrastructureFactory.ts  # InfrastructureFactory — init/health/shutdown all 4 DBs
    ├── qdrantService.ts          # QdrantService — @qdrant/js-client-rest; 1024-dim default
    ├── toolGraphDatabase.ts      # ToolGraphDatabase — neo4j-driver; tool nodes + recommendations
    └── index.ts
```

## NOTES

- `EventBusService` uses BullMQ on Redis only — RabbitMQ has been removed from the codebase.
- Singleton pattern — never `new DatabaseService()`. Always use `getInstance()`.
- `PgService` is for low-level access; prefer Drizzle via `drizzleService.getDb()` for entity-level operations.
- **Two `QdrantService` implementations exist**: `infra/factory/qdrantService.ts` (SDK-based, single collection) and `shared-services/src/qdrant.service.ts` (fetch-based, dual episodic+semantic collections, 1024-dim or 768-dim TEI mode). Use the shared-services version for knowledge/memory operations.
- `ToolGraphDatabase` (Neo4j) is accessed via `infra` — used by capability-registry for tool graph recommendations.

## COMMANDS

```bash
pnpm --filter @uaip/infra build
```
