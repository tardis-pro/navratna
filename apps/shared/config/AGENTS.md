# @uaip/config

Environment configuration loader. Single source of truth for all runtime config — every backend service imports `{ config }` from here. Reads `.env` at project root via `dotenv` on import.

## USAGE

```typescript
import { config } from '@uaip/config';

// Database
const pg = config.database.postgres; // host, port, user, password, database, ssl
const neo4j = config.database.neo4j; // uri, user, password
const qdrant = config.database.qdrant; // url, collectionName

// Redis
const redis = config.redis; // host, port, password, db

// JWT
const jwt = config.jwt; // secret, expiresIn, refreshExpiresIn

// App
const app = config.app; // port, environment, apiVersion, corsOrigins

// LLM
const llm = config.services.llm; // apiUrl, models

// Services
config.services.agentIntelligence; // url for inter-service calls
config.services.securityGateway;
config.services.capabilityRegistry;
// ... (one entry per microservice)
```

## EXPORTED INTERFACES

| Interface             | Key Fields                                                     |
| --------------------- | -------------------------------------------------------------- |
| `Config`              | Top-level — all sub-configs combined                           |
| `DatabaseConfig`      | postgres, neo4j, qdrant sub-objects                            |
| `RedisConfig`         | host, port, password, db, retry settings                       |
| `JwtConfig`           | secret, expiresIn, refreshExpiresIn, issuer                    |
| `AppConfig`           | port, environment, apiVersion, corsOrigins, rateLimitWindowMs  |
| `ServicesConfig`      | URL for each microservice (used for inter-service HTTP calls)  |
| `LoggingConfig`       | level, enableDetailedLogging, serviceName, environment         |
| `ExecutionConfig`     | operationTimeoutMax, maxConcurrentOperations, maxRetryAttempts |
| `RateLimitConfig`     | windowMs, max, skipSuccessfulRequests                          |
| `MonitoringConfig`    | enabled, prometheusPort, healthCheckInterval                   |
| `SecurityConfig`      | bcryptRounds, maxLoginAttempts, sessionTimeout                 |
| `CorsConfig`          | origin, credentials, allowedHeaders                            |
| `EmailConfig`         | smtp settings (optional, dev-only)                             |
| `FrontendConfig`      | url (for CORS allowlist)                                       |
| `NotificationsConfig` | websocket settings                                             |
| `OrchestrationConfig` | stepTimeout, compensationTimeout                               |
| `StateConfig`         | compressionEnabled, checkpointRetentionDays                    |
| `TimeoutConfig`       | database, api, external (ms values)                            |

## STRUCTURE

```
src/
├── config.ts    # All interface definitions + defaultConfig + config singleton
└── index.ts     # Re-exports { config } and all interface types
```

Single-file package — all logic in `config.ts`.

## ENV LOADING

`config.ts` calls `dotenv.config()` at module load time, resolving `.env` from project root (5 levels up from `__dirname`). Every service that imports `@uaip/config` gets env vars populated automatically.

**Reference**: `sample.env` at monorepo root contains all env var names and defaults.

## COMMANDS

```bash
pnpm --filter @uaip/config build    # compiles to src/*.js
# Part of: pnpm build:shared
```

## ANTI-PATTERNS

- `process.env.SOME_VAR` directly in service code — always go through `config.*`
- Importing `config.ts` with a relative path — use `@uaip/config`
- Hardcoding service URLs — read from `config.services.<name>.url`
