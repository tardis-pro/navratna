# @uaip/utils

Shared utilities: structured logger (Winston), typed error hierarchy, widget registry. Build after `@uaip/types`.

## EXPORTS

### Logger (from `loggers.ts`)

| Export                                    | Purpose                                           |
| ----------------------------------------- | ------------------------------------------------- |
| `logger`                                  | Default singleton Winston logger — use everywhere |
| `createLogger(config)`                    | Factory for named service loggers                 |
| `logError(logger, err, ctx)`              | Structured error logging helper                   |
| `logSecurityEvent(logger, event)`         | Security audit log helper                         |
| `logAudit(logger, entry)`                 | Audit trail helper                                |
| `logMetric(logger, metric)`               | Performance metric helper                         |
| `logRequest(logger, req)`                 | HTTP request logging                              |
| `logPerformance(logger, data)`            | Timing/perf logging                               |
| `createLoggerStream(logger)`              | Morgan-compatible write stream                    |
| `createLogContext(reqId?, userId?, op?)`  | Build structured log context object               |
| `logWithContext(logger, level, msg, ctx)` | Log with pre-built context                        |

### Error Classes (from `errors.ts`)

All extend `ApiError` which carries `statusCode`, `code`, `details`, and `isOperational`.

| Export                 | Status | Code                     |
| ---------------------- | ------ | ------------------------ |
| `ApiError`             | base   | `API_ERROR`              |
| `ValidationError`      | 400    | `VALIDATION_ERROR`       |
| `AuthenticationError`  | 401    | `AUTHENTICATION_ERROR`   |
| `AuthorizationError`   | 403    | `AUTHORIZATION_ERROR`    |
| `NotFoundError`        | 404    | `NOT_FOUND`              |
| `ConflictError`        | 409    | `CONFLICT`               |
| `RateLimitError`       | 429    | `RATE_LIMIT_EXCEEDED`    |
| `InternalServerError`  | 500    | `INTERNAL_SERVER_ERROR`  |
| `DatabaseError`        | 500    | `DATABASE_ERROR`         |
| `ExternalServiceError` | 502    | `EXTERNAL_SERVICE_ERROR` |
| `SecurityError`        | 403    | `SECURITY_ERROR`         |

### Widget Registry (from `widget-registry.ts`)

| Export                 | Purpose                                |
| ---------------------- | -------------------------------------- |
| `WidgetRegistry`       | Class — widget registration and lookup |
| `globalWidgetRegistry` | Pre-created singleton instance         |

## USAGE

### Logger

```typescript
import { logger, createLogger } from '@uaip/utils';

// Default singleton
logger.info('User logged in', { userId, email, action: 'login' });
logger.warn('Rate limit approaching', { userId, count, limit });
logger.error('Database connection failed', { error: err.message });

// Named child logger per service (requires all 3 fields)
const log = createLogger({
  serviceName: 'agent-intelligence',
  environment: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
});
log.debug('Agent state transition', { agentId, from, to });
```

**oxlint enforces**: `no-console: warn` — `console.log/debug/info` are flagged. Only `console.warn/error` are tolerated; prefer `logger`.

### Error Classes

```typescript
import { ApiError, NotFoundError, ValidationError, AuthorizationError } from '@uaip/utils';

throw new NotFoundError(`Agent ${id} not found`);
throw new ValidationError('Invalid persona config', { field: 'traits' });
throw new AuthorizationError('Insufficient permissions', { required: 'ADMIN' });

// Elysia error handler — use onElysiaError from errors.ts if available
// All ApiError subclasses serialize via .toJSON() including statusCode, code, details
```

## ANTI-PATTERNS

- `throw new Error('...')` — use typed subclasses; raw `Error` loses `statusCode`/`code`
- `console.log / console.debug / console.info` — oxlint flags these
- `logger.info('message')` with no metadata — always pass structured object as 2nd arg
- `createLogger({ serviceName, environment })` missing `logLevel` — all 3 fields required

## KNOWN ISSUES

- `errors.ts` line ~241 has a bare `console.error(...)` inside `createErrorResponse()` — violates the project's own no-console rule; should be `logger.error(...)`

## COMMANDS

```bash
pnpm --filter @uaip/utils build
# Part of: pnpm build:shared
```
