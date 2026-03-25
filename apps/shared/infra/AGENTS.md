# @uaip/infra

Raw infrastructure clients. The lowest layer — all other packages import from here for DB connections, cache, and event bus. No business logic.

## EXPORTS

| Module | Export | Purpose |
|--------|--------|---------|
| `./database` | `DatabaseService`, `DatabaseError` | Drizzle PG connection + query builder |
| `./database` | `PgService`, `pgService` | Raw `pg` Pool (use for low-level queries) |
| `./cache` | `RedisCacheService`, `redisCacheService` | ioredis wrapper with typed get/set/del |
| `./eventBus` (via index) | `EventBusService` | BullMQ on Redis — publish/subscribe event bus |
| `./factory` | Factory utilities | Connection factory helpers |

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
├── database/
│   ├── databaseService.ts     # TypeORM singleton (PostgreSQL)
│   ├── pgService.ts           # Raw pg Pool
│   └── index.ts
├── cache/
│   ├── redisCacheService.ts   # ioredis wrapper
│   └── index.ts
└── factory/                   # Connection factory utilities
```

## NOTES

- `EventBusService` uses BullMQ on Redis only — RabbitMQ has been removed from the codebase.
- Singleton pattern — never `new DatabaseService()`. Use `getInstance()`.
- `PgService` is for low-level access; prefer Drizzle via `drizzleService.getDb()` for entity-level operations.

## COMMANDS

```bash
pnpm --filter @uaip/infra build
```
