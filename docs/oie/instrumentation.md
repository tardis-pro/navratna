# OTel + Sentry Instrumentation (PM-178)

## Status: COMPLETE (pre-existing in BaseService)

Both `navratna-core` and `navratna-gateway` are fully instrumented via `@uaip/middleware`.
No code changes were needed — instrumentation is wired into `BaseService`.

## How It Works

`BaseService.initializeObservability()` (`apps/shared/services/src/base_service.ts`) calls:

```typescript
// OpenTelemetry SDK — traces + metrics → SigNoz
initTracing({
  serviceName: this.config.name,    // e.g. 'navratna-core'
  serviceVersion: this.config.version,
});

// Sentry SDK — error capture → Sentry self-hosted
initSentry({
  serviceName: this.config.name,
  release: this.config.version,
});
```

This runs at the very start of the service lifecycle, before any route handlers.

## OTel Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `OTEL_ENABLED` | `true` | Enable/disable OTel SDK |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP HTTP endpoint (SigNoz collector) |

**Resource attributes set automatically**:
- `service.name` — from `SERVICE_NAME` env / service config
- `service.version` — from `SERVICE_VERSION` env
- `deployment.environment` — from `NODE_ENV`

## Sentry Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `SENTRY_ENABLED` | `true` | Enable/disable Sentry |
| `SENTRY_DSN` | (empty) | DSN from Sentry project settings |
| `SERVICE_VERSION` | `1.0.0` | Used as `release` tag |

If `SENTRY_DSN` is empty, Sentry SDK initializes silently with no-op behavior.

## Elysia Error Plugin

`sentryErrorPlugin(serviceName)` is registered in `BaseService.setupBaseMiddleware()` —
automatically captures all HTTP 5xx errors with request context (URL, method, user ID).

## Manual Instrumentation Helpers

From `@uaip/middleware`:

```typescript
import { withSpan, traceDbQuery, traceEventBus, traceLLMCall, captureException } from '@uaip/middleware';

// Wrap async operation in a trace span
await withSpan('operation.name', async (span) => {
  span.setAttribute('custom.key', 'value');
  return doWork();
});

// Capture exception with context
captureException(error, {
  userId: 'user-123',
  endpoint: '/api/v1/agents',
  tags: { module: 'agent-intelligence' },
});
```

## Verification

To verify traces appear in SigNoz:
1. Start SigNoz: `docker compose -f infrastructure/docker-compose.infrastructure.yml --profile monitoring up -d`
2. Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in `.env`
3. Start navratna-core: `nx run @uaip/navratna-core:dev`
4. Make a request: `curl http://localhost:3001/health`
5. Open SigNoz at http://localhost:3301 → Services → `navratna-core`
