# PM-243: Migration Files 001-005 History Search

## Findings

**Date searched:** 2026-04-18  
**Branch searched:** `subtasks-tests-hygiene` (all refs)

### git log results

```
git log --all --full-history --format="%H %s" -- "database/migrations/00[1-5]*.sql"
```

**Result: Zero commits found.** Migration files 001 through 005 were never committed to this repository.

### What does exist

| File | Status |
|------|--------|
| `database/migrations/008-add-agent-description.sql` | Committed in `422f06d1` |
| `database/migrations/009-add-agent-user-llm-provider.sql` | Committed in `422f06d1` |
| `apps/shared/services/src/database/drizzle/migrations/0000_odd_tyrannus.sql` | Present — Drizzle auto-generated, 1131 lines |

### Conclusion

Migrations 001-005 never existed in git. The numbering gap (001-007) predates this repo's history — likely written against a TypeORM/raw-SQL flow that was replaced by the Drizzle two-plane schema before any migration files were committed.

The canonical DB initialisation path is now **Drizzle migrate** via `0000_odd_tyrannus.sql`. See `PM-246` for the updated README.
