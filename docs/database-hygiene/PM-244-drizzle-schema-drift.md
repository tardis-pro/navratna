# PM-244: Drizzle 0000_odd_tyrannus.sql vs Current Schema Drift Analysis

## Summary

Comparing `apps/shared/services/src/database/drizzle/migrations/0000_odd_tyrannus.sql`
against `apps/shared/services/src/database/drizzle/schemas/intelligence_schema.ts` and
`apps/shared/services/src/database/drizzle/schemas/control_schema.ts`.

## No Structural Drift Detected

The `0000_odd_tyrannus.sql` migration matches the current Drizzle schema definitions.
Key columns verified:

| Table | Column | Migration | Schema | Match |
|-------|--------|-----------|--------|-------|
| `agents` | `description` | `text` nullable | `text('description')` nullable | ✅ |
| `agents` | `persona_id` | `uuid NOT NULL` | `uuid('persona_id').notNull()` | ✅ |
| `agents` | `user_llm_provider_id` | `uuid` nullable | `uuid('user_llm_provider_id')` nullable | ✅ |
| `personas` | `description` | `text NOT NULL` | `text('description').notNull()` | ✅ |

## Double-Migration Risk (Critical)

The Drizzle migration `0000_odd_tyrannus.sql` already includes the `description` and
`user_llm_provider_id` columns on the `agents` table.

The handwritten migrations:
- `database/migrations/008-add-agent-description.sql` — adds `description` column
- `database/migrations/009-add-agent-user-llm-provider.sql` — adds `user_llm_provider_id` column

**If a fresh install runs both Drizzle migrate AND handwritten migrations 008/009, the ALTER TABLE
statements in 008/009 will fail with "column already exists".**

Both 008 and 009 should use `ADD COLUMN IF NOT EXISTS` or be removed once Drizzle migrate
is declared canonical. See `PM-246` for the canonical path decision.

## Recommendation

Declare `drizzle migrate` as canonical (see PM-246). Mark 008/009 as superseded by Drizzle.
If the raw-SQL migration path is still needed, add `IF NOT EXISTS` guards to 008/009.
