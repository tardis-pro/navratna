# @uaip/utils

Shared utilities: structured logger (Winston), error types, widget registry. Small package — build after `@uaip/types`, before everything else.

## EXPORTS

| Export | Purpose |
|--------|---------|
| `logger` | Winston logger — use this everywhere, never `console.log/debug/info` |
| `createLogger(opts)` | Factory for named child loggers per service |
| `AppError`, `ValidationError`, `NotFoundError` | Typed error classes |
| `widgetRegistry` | Widget registration utilities |

## LOGGER USAGE

```typescript
import { logger } from '@uaip/utils';

// Always use structured logging
logger.info('User logged in', { userId, email, action: 'login' });
logger.warn('Rate limit approaching', { userId, count, limit });
logger.error('Database connection failed', { error: err.message, stack: err.stack });

// Service-specific child logger
import { createLogger } from '@uaip/utils';
const log = createLogger({ serviceName: 'agent-intelligence', environment: 'production' });
log.debug('Agent state transition', { agentId, from, to });
```

**oxlint enforces**: `no-console: warn` — `console.log/debug/info` are flagged. Use `logger`. Only `console.warn/error` are allowed (but still prefer `logger`).

## ERROR TYPES

```typescript
import { AppError, ValidationError, NotFoundError } from '@uaip/utils';

throw new NotFoundError(`Agent ${id} not found`);
throw new ValidationError('Invalid persona config', { field: 'traits' });
```

## COMMANDS

```bash
pnpm --filter @uaip/utils build
# Part of: pnpm build:shared
```
