# PM-197: Migration Audit — SQL files 001-007 missing

## Finding

`database/migrations/` contains only files `008` and `009`. Files `001-007` referenced in `README.md` do not exist as physical SQL files.

## Root Cause

The project transitioned from TypeORM to Drizzle ORM. Migrations 001-007 were applied during the TypeORM era and are now represented by the initial database schema in:

- `database/postgresql/01-init-database.sql` — initial DDL (applied once to fresh databases)
- `database/postgresql/02-init-indexes.sql` — indexes
- `database/migrations/README.md` — documents migrations 006/007 as applied manually

## Source of Truth: Drizzle (NOT `database/migrations/`)

Per AGENTS.md: "ORM: Drizzle (not TypeORM). `src/entities/` files are legacy shims."

The authoritative migration path is:

```
apps/shared/services/src/database/drizzle/migrations/
  └── 0000_odd_tyrannus.sql   ← Drizzle-generated (current two-plane schema)
```

Manual SQL files in `database/migrations/` are for legacy reference only.

## Resolution

1. `database/migrations/` files 001-007 are NOT missing — they were applied via `database/postgresql/01-init-database.sql` at database creation time and superseded by Drizzle schema.
2. For new schema changes: use `pnpm --filter @uaip/shared-services drizzle:generate` to generate migrations.
3. For new databases: apply `database/postgresql/01-init-database.sql` first, then run Drizzle migrations.
4. Files 008 and 009 in `database/migrations/` are ad-hoc patches applied to existing deployments. They should be represented as Drizzle migrations going forward.

## Action Items

- [ ] Convert 008 and 009 SQL patches into Drizzle migration files (`drizzle:generate`)
- [ ] Archive `database/migrations/` as `database/migrations/legacy/` to prevent confusion
- [ ] Update `database/migrations/README.md` to clarify Drizzle is the source of truth
