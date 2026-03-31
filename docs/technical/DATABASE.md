# Database Architecture

**Last Updated**: 2026-03-30

## Overview

Navratna uses a triple-store strategy: PostgreSQL for structured data, Neo4j for graph relationships, Qdrant for vector embeddings, and Redis for caching and the BullMQ event bus. The ORM is Drizzle with a two-plane schema architecture.

## Two-Plane Drizzle Schema

Schema files at `apps/shared/services/src/database/drizzle/schemas/`:

### Intelligence Plane — `intelligence_schema.ts`

Used by **navratna-core** (port 3001). Contains entities for:

- Agents and agent configuration
- Discussions, messages, participants
- Knowledge items and relationships
- Artifacts and artifact metadata
- LLM providers and model configurations
- Agent learning records and memory

### Control Plane — `control_schema.ts`

Used by **navratna-gateway** (port 3002). Contains entities for:

- Users, authentication, sessions
- Roles, permissions, RBAC
- Tools, capabilities, MCP servers
- Operations and workflow state
- Audit logs and security events
- Approval workflows

### Base — `schema_base.ts`

Shared Drizzle configuration and base column definitions used by both planes.

## Cross-Plane References

The intelligence and control planes are in the **same PostgreSQL database** but logically separated. Cross-plane references (e.g., an agent referencing a user) use `CrossPlaneGuard.verify()` — application-level validation, not DB-level foreign key constraints.

This allows:
- Independent schema evolution per plane
- No cascading FK issues across service boundaries
- Explicit cross-plane queries that are auditable

## Triple-Store UUID Consistency

Every knowledge item has the **same UUID** across all three stores:

| Store | What It Holds | Access Pattern |
|---|---|---|
| PostgreSQL | Structured metadata, relationships, audit | Drizzle queries |
| Neo4j | Graph relationships, knowledge graph edges | Cypher queries |
| Qdrant | Vector embeddings for semantic search | Vector similarity |

`KnowledgeBootstrapService.runPostSeedSync()` detects and repairs inconsistencies across stores.

## Schema Management

**No migration files exist.** Schema is applied directly via:

```bash
drizzle-kit push
```

To generate migration files (if needed for production):

```bash
pnpm --filter @uaip/shared-services drizzle:generate
```

Drizzle schema files ARE the source of truth — not SQL files or migration snapshots.

## Database Infrastructure

| Database | Version | Port(s) | Memory | Purpose |
|---|---|---|---|---|
| PostgreSQL | 18-alpine | 5432 | ~256MB | Primary ACID store |
| Neo4j | 2025.04.0-community | 7474 (HTTP), 7687 (Bolt) | ~512MB | Graph relationships |
| Qdrant | 1.14.1 | 6333 (HTTP), 6334 (gRPC) | ~512MB | Vector embeddings |
| Redis | 8-alpine | 6379 | ~256MB | Cache + BullMQ event bus |

## Redis Usage

Redis serves dual purposes:

1. **Caching** — session storage, API response caching, relevance score caching
2. **BullMQ Event Bus** — all inter-service async communication uses BullMQ queues on Redis Streams (see `apps/shared/infra/src/event_bus.ts`)

## Connection Configuration

All database connections configured via environment variables:

```
POSTGRES_URL=postgresql://user:pass@host:5432/dbname
NEO4J_URL=bolt://host:7687
NEO4J_USER / NEO4J_PASSWORD
QDRANT_URL=http://host:6333
REDIS_URL=redis://:pass@host:6379
```

## Monitoring

PostgreSQL metrics exported via `postgres-exporter` to Prometheus (port 9187). Dashboard available in Grafana at port 3000.
