# Getting Started

Local setup and the standard dev workflow.

## Prerequisites

- Bun ≥ 1.1 (runtime for all backend services)
- pnpm ≥ 10 (package manager)
- NX CLI (optional but recommended: `pnpm add -g nx`)
- Docker + Docker Compose
- Git

## Setup

```bash
git clone <repository-url>
cd navratna
pnpm install
cp sample.env .env
```

Update `.env` with any required API keys. Use `ENVIRONMENT_CONFIG.md` for the full reference.

## Run Locally

```bash
# Full stack — NX orchestrates all services in parallel
pnpm dev
```

This runs `pnpm dev:frontend` (Vite HMR) and `pnpm dev:backend` (all Bun services with `--hot` reload) concurrently. NX resolves dependency order automatically — no manual build sequencing needed.

### Targeted Runs

```bash
# Frontend only (port 5173)
pnpm dev:frontend                      # → nx run @council/frontend:dev

# All backend services
pnpm dev:backend                       # → nx run-many -t dev --projects=tag:backend-service

# Single service (fastest for focused work)
nx run @uaip/navratna-core:dev         # port 3001
nx run @uaip/navratna-gateway:dev      # port 3002
nx run @uaip/questionforge:dev         # port 3010
nx run @uaip/basebench-meta:dev        # port 3009
pnpm --filter @uaip/<service-name> dev # pnpm alias form
```

### Infrastructure (Docker)

Services depend on Postgres, Neo4j, Redis, Qdrant. Start them first:

```bash
docker-compose up -d postgres neo4j redis qdrant
```

Or start the full stack including observability (Prometheus + Grafana + Loki):

```bash
docker-compose up -d
```

## Verify

- Frontend: http://localhost:5173
- API Gateway: http://localhost:8081
- API Docs: http://localhost:8081/docs
- Health: http://localhost:8081/health
- Grafana: http://localhost:3000 (admin/admin)
- Prometheus: http://localhost:9090

## Common Checks

```bash
pnpm lint                      # oxlint (not ESLint)
pnpm format                    # oxfmt (not Prettier)
pnpm test                      # → nx run-many -t test
pnpm test:integration          # requires Docker infra

# NX utilities
nx graph                       # visualise dependency graph
nx affected -t test            # test only changed projects
nx reset                       # clear NX cache if builds go stale
```
