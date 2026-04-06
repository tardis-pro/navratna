# navratna-gateway — @uaip/navratna-gateway

**Port**: 3002 | **Entry**: `src/index.ts` | **Status**: ⚡ v3 Active (primary development target)

v3.0 consolidated gateway service. Combines security-gateway + orchestration-pipeline + capability-registry into one process. Pure route aggregation — minimal own logic.

## PURPOSE

Single-process replacement for auth/security + workflow engine + tool registry. Provides the auth validation endpoint that `navratna-core` calls for Socket.IO authentication.

## STRUCTURE

```
src/
└── index.ts     # NavratnaGatewayService extends BaseService — mounts all routes
```

Routes imported from sibling service `src/` directories.

### Imported from security-gateway (`src/http/*.elysia.ts`)

`auth`, `users`, `approval`, `audit`, `security`, `providers`, `oauth`, `persona`, `knowledge`, `contacts`

**NOT imported** (exist in legacy service but absent from navratna-gateway):

- `projects.elysia.ts` — project routes NOT exposed
- `tool_preferences.elysia.ts` — tool preferences NOT exposed
- `security_stats.elysia.ts` — GET /security-stats NOT exposed
- `dashboard.elysia.ts` — GET /dashboard aggregate stats NOT exposed

### Imported from orchestration-pipeline

- `taskRoutes.ts` + `projectRoutes.ts`

### Imported from capability-registry

- `capabilityRoutes.ts`, `mcpRoutes.ts`, `healthRoutes.ts`

**NOT imported** (exist in capability-registry):

- `toolRoutes.ts` — tool CRUD/execute/search/recommendations NOT exposed
- `workspaceRoutes.ts` — workspace/coding-agent NOT exposed

## WHAT IT EXPOSES

- All auth/users/approvals/audit/security/providers/oauth/persona/knowledge/contacts routes from security-gateway
- Task and project management from orchestration-pipeline
- Capability management and MCP routes from capability-registry
- `GET /health`
- `GET /api/v1/auth/validate` — nginx `auth_request` endpoint + Socket.IO auth fallback for navratna-core

**Not exposed** (requires legacy services): tool CRUD/execution, workspace, projects, tool-preferences, security-stats, dashboard

## COMMANDS

```bash
pnpm --filter @uaip/navratna-gateway dev
pnpm --filter @uaip/navratna-gateway build
```

## NOTES

- `enableEnterpriseEventBus: true`
- `setupEventSubscriptions()` is **empty** — navratna-gateway does NOT subscribe to `security.auth.validate` or any event bus topics. The legacy security-gateway's event-bus-based auth subscription is not present. navratna-core's Socket.IO auth always falls back to HTTP (`GET http://navratna-gateway:3002/api/v1/auth/validate`).
- `dev` script uses `nodemon --exec tsx`, not `bun --hot`.
- When adding new **auth/security/orchestration** features, modify the **legacy service** route files — navratna-gateway picks up via direct source import.
- Known stubs (return empty data): `GET /api/v1/users/persona/recommendations`, `GET /api/v1/users/persona/compatible-agents`, `GET /api/v1/users/persona/optimized-workspace`, `POST /api/v1/users/persona/track-interaction`
- Known 501s: `POST /api/v1/oauth/agent/github/:id` with `get_repo` operation; `POST /api/v1/oauth/agent/gmail/:id` with `get_message` operation
- Pre-existing TS errors likely until `pnpm build:shared` runs
