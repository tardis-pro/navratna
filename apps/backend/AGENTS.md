# apps/backend — Backend Workspace Root

**Services**: 12 microservices in `services/` | **v3 Active**: navratna-core (3001), navratna-gateway (3002)

Backend workspace root. Contains shared backend config (tsconfig, esbuild, docker), API testing tools, and service orchestration. Individual service AGENTS.md files live in `services/<name>/`.

## STRUCTURE

```
apps/backend/
├── services/                    # All 12 microservices (see SERVICE MAP below)
├── docker/                      # Per-service Dockerfile templates
├── docker-compose.infrastructure.yml  # Local infra: postgres, neo4j, redis, qdrant
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

| Service                  | Port | Status       | AGENTS.md                                           |
| ------------------------ | ---- | ------------ | --------------------------------------------------- |
| **navratna-core**        | 3001 | ⚡ v3 active | [→](services/navratna-core/AGENTS.md)              |
| **navratna-gateway**     | 3002 | ⚡ v3 active | [→](services/navratna-gateway/AGENTS.md)           |
| agent-intelligence       | 3001 | 🔄 legacy    | [→](services/agent-intelligence/AGENTS.md)         |
| security-gateway         | 3004 | 🔄 legacy    | [→](services/security-gateway/AGENTS.md)           |
| capability-registry      | 3003 | 🔄 legacy    | [→](services/capability-registry/AGENTS.md)        |
| orchestration-pipeline   | 3002 | 🔄 legacy    | [→](services/orchestration-pipeline/AGENTS.md)     |
| discussion-orchestration | 3005 | 🔄 legacy    | [→](services/discussion-orchestration/AGENTS.md)   |
| artifact-service         | 3006 | 🔄 legacy    | [→](services/artifact-service/AGENTS.md)           |
| llm-service              | 3007 | 🔄 legacy    | [→](services/llm-service/AGENTS.md)                |
| marketplace-service      | 3008 | ⚠️ removal   | (skip — do not add features)                        |
| questionforge            | 3010 | 🆕 product   | [→](services/questionforge/AGENTS.md)              |
| basebench-meta           | 3009 | 🆕 product   | [→](services/basebench-meta/AGENTS.md)             |

## TOOLING

**Local infra** (no Docker for code, only infra deps):
```bash
docker-compose -f apps/backend/docker-compose.infrastructure.yml up -d
# postgres:5432, neo4j:7474/7687, redis:6379, qdrant:6333
```

**Postman collection**: `UAIP_Backend_API_Collection.postman_collection.json` — import into Postman for full API coverage. Contains pre-request scripts for auth tokens.

**esbuild.config.js** — used only for legacy non-Bun services. Bun services (navratna-core, navratna-gateway, questionforge, basebench-meta) use `bun build` directly.

**tsconfig.json** — all services extend via `"extends": "../../tsconfig.json"` (from workspace root) or `"extends": "../../../tsconfig.json"`. Path aliases (`@/*`) are configured here — don't duplicate in per-service configs.

## WHERE TO ADD THINGS

| What | Where |
|------|-------|
| New microservice | `services/<name>/` extending this tsconfig |
| New API endpoint (v3) | Add to legacy service first, navratna-core/gateway picks it up |
| API test collection entry | `UAIP_Backend_API_Collection.postman_collection.json` |
| Shared backend script | Root `scripts/` (not here) |

## NOTES

- `SERVICE_ARCHITECTURE.md` references RabbitMQ — stale. BullMQ on Redis is the event bus.
- `package.json` here is the backend workspace root (NX workspace member) — not the repo root.
- `.env` lives here — derived from `sample.env` at repo root. Never commit it.
- `test-*.sh` scripts are manual smoke tests — not wired to CI.
