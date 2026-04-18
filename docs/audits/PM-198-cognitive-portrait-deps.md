# PM-198: cognitive_portrait_routes.ts Service Dependencies

**Service**: `apps/backend/services/agent-intelligence`
**File**: `src/routes/cognitive_portrait_routes.ts`
**Audited**: 2026-04-18

## Direct Dependencies

| Dependency | Version/Source | Purpose |
|------------|---------------|---------|
| `zod` | npm | Request body schema validation |
| `elysia` | npm | HTTP route group, `Elysia` instance |
| `@uaip/middleware` | workspace | `withRequiredAuth` — JWT/nginx auth guard |
| `@uaip/utils` | workspace | `logger` — structured Winston logger |
| `@uaip/types` | workspace | `CognitivePortraitRequest`, `TrustAction` enum |
| `../services/cognitive_portrait_service.js` | local | `getPortrait`, `updateTrustCalibration`, `getPersonalizationVector` |

## Exposed Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET` | `/api/v1/users/:userId/cognitive-portrait` | required | Accepts `?forceRecompute=true` query param |
| `POST` | `/api/v1/users/:userId/cognitive-portrait/calibrate` | required | Body: `{ action, agentId, context }` |
| `GET` | `/api/v1/users/:userId/personalization-vector` | required | Returns in-memory personalization vector |

## Service Dep Tree

```
cognitive_portrait_routes.ts
└─ cognitive_portrait_service.ts (local)
   └─ (no further service deps — stateless computation using agent memory data)
```

## Registrations

Route is registered in two places:
1. `agent-intelligence/src/feature.ts` → `agentIntelligenceFeature.routes()` (legacy runtime)
2. `navratna-core/src/app.ts` → `coreApp` type stub (v3 runtime via app.ts)
3. `navratna-core/src/index.ts` → mounted via `FeatureFactory.mountRoutes()` through `agentIntelligenceFeature` (v3 production path)

## TrustAction Enum Usage

The `calibrate` endpoint maps the incoming `action` string (`'override' | 'accept'`) to the `TrustAction` enum from `@uaip/types`. If the action doesn't match, it defaults to `TrustAction.ACCEPT`.

## Notes

- No database dependencies — `getPortrait` and `getPersonalizationVector` operate on in-process agent memory
- No event bus dependencies
- `withRequiredAuth` injects user context; routes use `ctx.params.userId` (not the authenticated user's id) — callers can query any userId if authenticated
