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

Routes imported from sibling service `src/` directories:

- All `security-gateway/src/http/*.elysia.ts` handlers
- `orchestration-pipeline/src/routes/taskRoutes.ts`
- `orchestration-pipeline/src/routes/projectRoutes.ts`
- `capability-registry/src/routes/toolRoutes.ts`
- `capability-registry/src/routes/mcpRoutes.ts`
- `capability-registry/src/routes/healthRoutes.ts`

## WHAT IT EXPOSES

All endpoints from:

- [security-gateway endpoints](../security-gateway/AGENTS.md)
- [orchestration-pipeline endpoints](../orchestration-pipeline/AGENTS.md)
- [capability-registry endpoints](../capability-registry/AGENTS.md)

Plus: `POST /api/v1/auth/validate` — used by `navratna-core` for Socket.IO auth

## COMMANDS

```bash
pnpm --filter @uaip/navratna-gateway dev
pnpm --filter @uaip/navratna-gateway build
```

## NOTES

- `enableEnterpriseEventBus: true`
- When adding new security/auth/tool/workflow features, modify the **legacy service** — navratna-gateway picks up changes via direct source imports
- Pre-existing TS errors likely until `pnpm build:shared` runs
