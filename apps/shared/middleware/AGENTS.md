# @uaip/middleware

Auth middleware, JWT validation, rate limiting, CSRF protection, metrics, request logging. Critical security layer used by all backend services. 85+ source files, 132 passing tests, 80% coverage threshold.

## EXPORTS

| Export | Purpose |
|--------|---------|
| `JWTValidator` | Static class — validates tokens; throws FATAL if default secret in prod |
| `attachAuth` | Elysia middleware — direct JWT validation (no nginx) |
| `attachNginxAuth` | Elysia middleware — trusts nginx-forwarded `X-User-*` headers |
| `requireNginxAuth` | Guard — throws 401 if no nginx auth headers |
| `withRequiredAuth` | Elysia group helper — requires auth on all routes in group |
| `withOptionalAuth` | Elysia group helper — auth optional |
| `validateJWTToken` | Raw token validation function |
| `generateAuthTokens` | Access + refresh token pair generation |
| `rateLimiter` | Express-compatible rate limiter |
| `createRateLimiter` | Factory for custom rate limiter configs |
| `errorHandler` | Standard error response formatter |
| `requestLogger` | Winston request/response logger |
| `metricsMiddleware` | Prometheus metrics collection |
| `metricsEndpoint` | `/metrics` endpoint handler |
| `csrfProtection` | CSRF token validation |
| `apiKeyAuth` | API key authentication |
| `agentMiddleware` | Agent-specific request validation |
| `agentValidationMiddleware` | Agent payload validation |
| `agentTransformationService` | Request transformation for agents |

## AUTH PATTERNS

**Services behind nginx** (most services):
```typescript
import { attachNginxAuth, requireNginxAuth } from '@uaip/middleware';
// nginx forwards X-User-ID, X-User-Email, X-User-Role after auth_request validation
// Services trust these headers — no re-validation needed
this.app.use(attachNginxAuth);
// In a route handler:
const user = requireNginxAuth(context); // returns UserContext or throws 401
```

**Direct JWT** (security-gateway itself, for login/register endpoints):
```typescript
import { attachAuth, validateJWTToken } from '@uaip/middleware';
this.app.use(attachAuth);
```

**Elysia group-level auth**:
```typescript
import { withRequiredAuth } from '@uaip/middleware';
this.app.group('/api/v1/protected', (app) =>
  withRequiredAuth(app).get('/resource', handler)
);
// @ts-expect-error — Elysia middleware injects user but TS can't infer through groups
```

## SECURITY RULES

- `JWTValidator` throws `FATAL` error if `DEFAULT_DEV_SECRET` detected in `NODE_ENV=production`
- CSRF protection required on all state-mutation endpoints (POST/PUT/DELETE/PATCH)
- Never bypass auth with `force: true` or by importing `@uaip/middleware` internals directly
- Static utility classes (`JWTValidator`, `agentValidationMiddleware`) — lint warning suppressed with `// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- static utility class pattern`

## TESTING

```bash
pnpm --filter @uaip/middleware test     # 132 tests, 80% coverage threshold
```

Test suite covers: auth, error handling, request validation (Zod), rate limiting, metrics, agent validation/transformation. Each test has its own `setup.ts` with mocked `@uaip/*` imports.

## COMMANDS

```bash
pnpm --filter @uaip/middleware build
pnpm --filter @uaip/middleware test
```
