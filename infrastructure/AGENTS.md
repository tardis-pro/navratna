# infrastructure/ — Docker Compose & Configuration

All Docker Compose files and service configuration for the Navratna stack.

## COMPOSE FILES

| File | Purpose | Use |
| ---- | ------- | --- |
| `docker-compose.infrastructure.yml` | **Primary** — core infra + monitoring stack | Local dev, production-like |
| `docker-compose.test.yml` | Test infra — offset ports (postgres→5433, redis→6380) | CI, integration tests |
| `docker-compose.standalone.yml` | Single-machine all-in-one | Minimal dev setup |
| `docker-compose.mac.yml` | Mac-specific overrides (ARM, resource limits) | macOS dev |
| `docker-compose.pc-a.yml` | PC-A: Intelligence plane (Postgres, Neo4j, Qdrant, Redis) | Multi-machine topology |
| `docker-compose.pc-b.yml` | PC-B: Control plane (separate Redis, Sentry) | Multi-machine topology |
| `docker-compose.enterprise.yml` | Full enterprise stack | Staging/production |

## CORE INFRA SERVICES (always-on)

| Container | Image | Ports | Purpose |
| --------- | ----- | ----- | ------- |
| `uaip-postgres-dev` | postgres:18-alpine | 5432 | Primary DB (Drizzle ORM, two-plane schema) |
| `uaip-neo4j-dev` | neo4j:2025.04.0-community | 7474, 7687 | Graph relationships + APOC + GDS |
| `uaip-redis-dev` | redis:8-alpine | 6379 | Cache, sessions, BullMQ event bus |
| `uaip-qdrant-dev` | qdrant/qdrant:v1.7.4 | 6333, 6334 | Vector embeddings (TCP bash healthcheck) |

## MONITORING STACK (`--profile monitoring`)

### APM — SignOZ

| Container | Image | Ports | Purpose |
| --------- | ----- | ----- | ------- |
| `uaip-signoz-clickhouse` | clickhouse/clickhouse-server:24.1 | — | ClickHouse backend for traces/metrics/logs |
| `uaip-otel-collector` | signoz/signoz-otel-collector:0.102.12 | 4317 (gRPC), 4318 (HTTP) | OTel ingestion → ClickHouse |
| `uaip-signoz-query` | signoz/query-service:0.52.0 | 8080 | SignOZ query API |
| `uaip-signoz-frontend` | signoz/frontend:0.52.0 | **3301** | SignOZ UI |

OTel collector config: `../monitoring/otel-collector-config.yaml`
ClickHouse config: `./clickhouse-config/cluster.xml` + `./clickhouse-config/signoz-databases.sql`

### Error Tracking — Sentry

| Container | Image | Purpose |
| --------- | ----- | ------- |
| `uaip-sentry-snuba-*` | getsentry/snuba:24.6.0 | Snuba API + 3 consumers (errors/outcomes/replacer) |
| `uaip-sentry-postgres` | postgres:16-alpine | Sentry metadata DB (separate from main PG) |
| `uaip-sentry-redis` | redis:8-alpine | Sentry Redis (separate from main) |
| `uaip-sentry-init` | getsentry/sentry:24.6.0 | One-shot migration (`sentry upgrade --noinput`) |
| `uaip-sentry-web` | getsentry/sentry:24.6.0 | **port 9000** — Sentry web UI |
| `uaip-sentry-worker/cron` | getsentry/sentry:24.6.0 | Celery worker + beat scheduler |

Sentry config: `./sentry-config/sentry.conf.py` (mounted read-only into all Sentry containers)
Secret: `SENTRY_SECRET_KEY` env var (default dev value set in compose — **change in prod**)

### Metrics & Dashboards

| Container | Image | Port | Config |
| --------- | ----- | ---- | ------ |
| `uaip-prometheus-dev` | prom/prometheus:latest | 9090 | `../monitoring/prometheus.yml` |
| `uaip-grafana-dev` | grafana/grafana:latest | 3000 | `../monitoring/grafana/provisioning/` (admin/admin) |

## CONFIG SUBDIRECTORIES

| Directory | Contents |
| --------- | -------- |
| `clickhouse-config/` | `cluster.xml` (ClickHouse Keeper + cluster), `signoz-databases.sql` (SignOZ DB init) |
| `sentry-config/` | `sentry.conf.py` (Sentry Python config: DB, Redis, Kafka, Snuba URLs) |
| `monitoring/` | `grafana/` (Grafana provisioning) |
| `database/` | Postgres and Neo4j init scripts (mounted into DB containers) |
| `backup/` | Backup scripts and configs |
| `compliance/` | Compliance configuration |

**Note**: `monitoring/` at repo root (not this directory) contains `otel-collector-config.yaml` and `prometheus.yml` — mounted from compose via `../monitoring/`.

## COMMANDS

```bash
# Core infra only
docker compose -f infrastructure/docker-compose.infrastructure.yml up -d

# Core + full monitoring stack
docker compose -f infrastructure/docker-compose.infrastructure.yml --profile monitoring up -d

# Tear down (preserves volumes)
docker compose -f infrastructure/docker-compose.infrastructure.yml down

# Tear down + wipe all data
docker compose -f infrastructure/docker-compose.infrastructure.yml down -v

# Test infra (offset ports, no monitoring)
docker compose -f infrastructure/docker-compose.test.yml up -d
```

## NOTES

- Kafka uses `apache/kafka:3.7.1` (KRaft mode — no ZooKeeper). Do NOT use `bitnami/kafka:3.7` (image doesn't exist).
- Snuba shares ClickHouse with SignOZ (`signoz-clickhouse` container) — Sentry and SignOZ are deliberately co-located.
- Qdrant healthcheck uses bash TCP socket (`/dev/tcp/localhost/6333`) — not curl (not available in the image).
- SignOZ query-service health endpoint: `/api/v1/health` on port 8080 (not `/health` or `/healthz`).
- `rabbitmq_data` volume entry in compose is a stale artifact — RabbitMQ is fully removed; BullMQ on Redis is the event bus.
