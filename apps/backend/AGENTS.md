# apps/backend — Backend Workspace Root

**Services**: 13 microservices in `services/` | **v3 Active**: navratna-core (3001), navratna-gateway (3002)

Backend workspace root. Contains shared backend config (tsconfig, esbuild, docker), API testing tools, and service orchestration. Individual service AGENTS.md files live in `services/<name>/`.

**Vision & Architecture:** See `docs/VISION.md` for the full backend vision — FeatureFactory pattern, three-product runtime, relevance engine, metacognitive layer, triple-store architecture, and Phase 2 roadmap.

## STRUCTURE

```
apps/backend/
├── services/                    # All 13 microservices (see SERVICE MAP below)
├── docker/                      # Per-service Dockerfile templates
├── docker/                      # Per-service Dockerfile templates (docker-compose files moved to infrastructure/ at repo root)
├── esbuild.config.js            # Shared esbuild config for non-Bun builds
├── tsconfig.json                # Root tsconfig — services extend this
├── tsconfig.build_shared.json   # Shared package build tsconfig
├── SERVICE_ARCHITECTURE.md      # Legacy routing docs (pre-v3, still useful reference)
├── UAIP_Backend_API_Collection.postman_collection.json  # Full API collection
├── test-agent-endpoints.sh      # Agent endpoint smoke tests
├── test-persona-discussion-system.sh  # Discussion system integration test
├── test-uuid-validation.sh      # UUID consistency checks across PG/Neo4j/Qdrant
├── test-websocket-connection.js # Manual Socket.IO connection test
├── persona-creation-example.json  # Example persona payload
└── examples/                    # Additional request/response examples
```

## SERVICE MAP

| Service                  | Port | Status       | AGENTS.md                                        |
| ------------------------ | ---- | ------------ | ------------------------------------------------ |
| **navratna-core**        | 3001 | ⚡ v3 active | [→](services/navratna-core/AGENTS.md)            |
| **navratna-gateway**     | 3002 | ⚡ v3 active | [→](services/navratna-gateway/AGENTS.md)         |
| agent-intelligence       | 3001 | 🔄 legacy    | [→](services/agent-intelligence/AGENTS.md)       |
| security-gateway         | 3004 | 🔄 legacy    | [→](services/security-gateway/AGENTS.md)         |
| capability-registry      | 3003 | 🔄 legacy    | [→](services/capability-registry/AGENTS.md)      |
| orchestration-pipeline   | 3002 | 🔄 legacy    | [→](services/orchestration-pipeline/AGENTS.md)   |
| discussion-orchestration | 3005 | 🔄 legacy    | [→](services/discussion-orchestration/AGENTS.md) |
| artifact-service         | 3006 | 🔄 legacy    | [→](services/artifact-service/AGENTS.md)         |
| llm-service              | 3007 | 🔄 legacy    | [→](services/llm-service/AGENTS.md)              |
| marketplace-service      | 3008 | ⚠️ removal   | (skip — do not add features)                     |
| questionforge            | 3010 | 🆕 product   | [→](services/questionforge/AGENTS.md)            |
| basebench-meta           | 3009 | 🆕 product   | [→](services/basebench-meta/AGENTS.md)           |
| **oie**                  | —    | 🆕 library   | [→](services/oie/AGENTS.md) — BullMQ pipeline, no HTTP port, mounted as Feature into navratna-core/gateway |

## TOOLING

**Local infra** (no Docker for code, only infra deps):

```bash
docker compose -f infrastructure/docker-compose.infrastructure.yml up -d
# postgres:5432, neo4j:7474/7687, redis:6379, qdrant:6333
# Add --profile monitoring for SignOZ, Sentry, Prometheus, Grafana
```

**Postman collection**: `UAIP_Backend_API_Collection.postman_collection.json` — import into Postman for full API coverage. Contains pre-request scripts for auth tokens.

**esbuild.config.js** — used only for legacy non-Bun services. Bun services (navratna-core, navratna-gateway, questionforge, basebench-meta) use `bun build` directly.

**tsconfig.json** — all services extend via `"extends": "../../tsconfig.json"` (from workspace root) or `"extends": "../../../tsconfig.json"`. Path aliases (`@/*`) are configured here — don't duplicate in per-service configs.

## WHERE TO ADD THINGS

| What                      | Where                                                          |
| ------------------------- | -------------------------------------------------------------- |
| New microservice          | `services/<name>/` extending this tsconfig                     |
| New API endpoint (v3)     | Add to legacy service first, navratna-core/gateway picks it up |
| API test collection entry | `UAIP_Backend_API_Collection.postman_collection.json`          |
| Shared backend script     | Root `scripts/` (not here)                                     |

## ROUTE PARITY STATUS

See `docs/audits/PM-200-route-parity-audit.md` for full audit.

### navratna-core (port 3001) — ~97% parity with legacy services

Consolidated: agent-intelligence + discussion-orchestration + artifact-service + llm-service.

- **Covered**: All extracted route files from all 4 legacy services + cognitive portrait routes
- **Missing**: `GET /api/v1/info`, `GET /api/v1/users/online`, WhatsApp status, debug routes (all low-priority)
- **Smoke tests**: `scripts/smoke-test-core.sh` (14 route groups)

### navratna-gateway (port 3002) — ~95% parity with legacy services

Consolidated: security-gateway + orchestration-pipeline + capability-registry.

- **Covered**: All auth, security, orchestration, capability, tools, workspace, federation routes
- **Missing**: `GET/POST /api/v1/operations`, GitHub/Jira webhook routes in `orchestrationFeature.ts`
- **Note**: `app.ts` type stub includes GH/Jira webhooks but `orchestrationFeature.ts` does not — they are inactive in production
- **Smoke tests**: `scripts/smoke-test-gateway.sh` (20+ route groups)

## NOTES

- `SERVICE_ARCHITECTURE.md` references RabbitMQ — stale. BullMQ on Redis is the event bus.
- `package.json` here is the backend workspace root (NX workspace member) — not the repo root.
- `.env` lives here — derived from `sample.env` at repo root. Never commit it.
- `test-*.sh` scripts are manual smoke tests — not wired to CI.
- `scripts/smoke-test-core.sh` and `scripts/smoke-test-gateway.sh` test v3 route coverage — run against local stack after `docker compose up`.
- `pnpm test:smoke` in workspace root runs both smoke scripts.
