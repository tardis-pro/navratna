# Sentry Self-Hosted Setup (OIE)

**Ticket**: PM-177 — OIE Sprint 0: Deploy SigNoz + Sentry self-hosted

## SigNoz (already configured)

SigNoz is deployed via `infrastructure/docker-compose.infrastructure.yml` under the `monitoring` profile:

```bash
# Start full monitoring stack (SigNoz + Prometheus + Grafana)
docker compose -f infrastructure/docker-compose.infrastructure.yml --profile monitoring up -d
```

- **UI**: http://localhost:3301
- **OTel Collector gRPC**: localhost:4317
- **OTel Collector HTTP**: localhost:4318
- **Query Service API**: http://localhost:8080

## Sentry Self-Hosted

Sentry self-hosted is managed via the official `getsentry/self-hosted` installer, mounted as a git submodule at `infrastructure/sentry-self-hosted/`.

```bash
# 1. Initialize the submodule
git submodule update --init infrastructure/sentry-self-hosted

# 2. Run the installer (requires Docker + 4GB RAM)
cd infrastructure/sentry-self-hosted
./install.sh

# 3. Start Sentry
docker compose up -d

# 4. Access Sentry UI → create organization and project
# 5. Copy project DSN from Settings → Projects → <project> → Client Keys
# 6. Generate auth token from Settings → API → Auth Tokens
```

- **UI**: http://localhost:9000

## Environment Variables

After setup, populate in `.env`:

```env
# SigNoz (OIE programmatic queries)
SIGNOZ_API_URL=http://localhost:8080
SIGNOZ_API_KEY=<from SigNoz UI → Settings → API Keys>

# Sentry (OIE programmatic queries + SDK)
SENTRY_DSN=http://<key>@localhost:9000/<project-id>
SENTRY_API_URL=http://localhost:9000
SENTRY_AUTH_TOKEN=sntryu_<token>
SENTRY_ORG=sentry
SENTRY_PROJECT=navratna

# OIE Feature Toggle
FEATURE_OIE=true
```

## Instrumentation

Both navratna-core (3001) and navratna-gateway (3002) are already instrumented:

- **OTel SDK**: `@uaip/middleware` → `initTracing()` called in `BaseService.initializeObservability()`
- **Sentry SDK**: `@uaip/middleware` → `initSentry()` called in `BaseService.initializeObservability()`

The SDK initialization reads from environment variables:
- `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT` → controls OTel export
- `SENTRY_ENABLED`, `SENTRY_DSN` → controls Sentry capture

No code changes needed in navratna-core or navratna-gateway — both extend `BaseService`.
