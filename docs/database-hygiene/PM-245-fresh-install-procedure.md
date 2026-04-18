# PM-245: Fresh Install Procedure

## Prerequisites

- Docker and Docker Compose installed
- Node.js + pnpm installed
- Environment file: `cp sample.env .env` (fill in secrets)

## Step 1 — Start Infrastructure

```bash
docker compose -f infrastructure/docker-compose.infrastructure.yml up -d
```

Waits for: PostgreSQL on `:5432`, Neo4j on `:7474`, Redis on `:6379`, Qdrant on `:6333`

### Verify containers

```bash
docker compose -f infrastructure/docker-compose.infrastructure.yml ps
```

All services must show `running` / `healthy`.

## Step 2 — Build shared packages

```bash
pnpm build:shared
```

This compiles `@uaip/types`, `@uaip/utils`, `@uaip/config`, `@uaip/infra`, `@uaip/shared-services`
in dependency order (NX handles sequencing).

## Step 3 — Run Drizzle Migrations

```bash
pnpm --filter @uaip/shared-services drizzle:migrate
```

This applies `0000_odd_tyrannus.sql` — the canonical Drizzle migration that creates all
intelligence-plane and control-plane tables in a single transaction.

### Verify tables

```bash
docker exec $(docker ps -qf "name=postgres") psql -U uaip_user -d uaip -c "\dt" | head -40
```

Expected tables include: `agents`, `personas`, `users`, `sessions`, `tools`, `tasks`, `projects`, `audit_events`, `knowledge_items`, `artifacts`, `discussions`.

## Step 4 — Seed the database

```bash
pnpm --filter @uaip/shared-services run seed
```

Creates default admin user (`admin@example.com` / `admin`), LLM providers, security policies.

## Step 5 — Start services

```bash
pnpm dev
```

Or individual services:
```bash
nx run @uaip/navratna-core:dev     # port 3001
nx run @uaip/navratna-gateway:dev  # port 3002
pnpm dev:frontend                   # port 5173
```

## Verification

```bash
curl http://localhost:3002/health | jq .
curl http://localhost:3001/health | jq .
curl http://localhost:5173
```

## Notes

- **Do NOT run** `database/scripts/run-migration-006.sql` or `run-migration-007.sql` —
  those reference SQL files that no longer exist. Drizzle handles all schema setup.
- `database/migrations/008-add-agent-description.sql` and `009-add-agent-user-llm-provider.sql`
  are superseded by Drizzle. Do not run them on a Drizzle-initialized database.
- For CI/test databases, use `docker-compose.test.yml` (offset ports: postgres→5433, redis→6380).
