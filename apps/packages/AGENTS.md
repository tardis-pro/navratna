# apps/packages — Shared Packages

Three shared packages consumed by all backend services and the frontend. **Build order is fixed**: types → utils → contracts.

## PACKAGES

| Package         | npm name          | Purpose                                                              |
| --------------- | ----------------- | -------------------------------------------------------------------- |
| `shared-types/` | `@uaip/types`     | All TypeScript types, enums, interfaces — single source of truth     |
| `shared-utils/` | `@uaip/utils`     | Logger (Winston), typed error classes, widget registry               |
| `contracts/`    | `@uaip/contracts` | Cross-service interface contracts (tool exec, orchestration, events) |

## BUILD ORDER

```bash
pnpm build:shared          # builds all three in correct dep order via NX
# Or individually:
pnpm --filter @uaip/types build      # 1st — no deps
pnpm --filter @uaip/utils build      # 2nd — depends on @uaip/types
pnpm --filter @uaip/contracts build  # 3rd — depends on @uaip/types
```

After any change here: `pnpm build:shared && pnpm build:backend`

## IMPORT CONVENTIONS

```typescript
// ✅ Always use package aliases
import { Agent, SecurityLevel } from '@uaip/types';
import { logger, ApiError, NotFoundError } from '@uaip/utils';
import { ToolContract, EventContracts } from '@uaip/contracts';

// ❌ Never relative cross-package imports
import { Agent } from '../../shared-types/src/agent';
```

## WHERE TO ADD THINGS

| What                   | Where                                                        |
| ---------------------- | ------------------------------------------------------------ |
| New domain type / enum | `shared-types/src/<domain>.ts` + re-export in `index.ts`     |
| New error class        | `shared-utils/src/errors.ts` + add to `index.ts` export list |
| New utility function   | `shared-utils/src/` + export from `index.ts`                 |
| New event bus contract | `contracts/src/events.ts`                                    |
| New service interface  | `contracts/src/tool.ts` or `contracts/src/orchestration.ts`  |

## ANTI-PATTERNS

- Sub-path type imports: `@uaip/types/agent` — always use root `@uaip/types`
- Domain types in contracts — use `@uaip/types` for domain models
- `console.log/debug/info` anywhere — use `logger` from `@uaip/utils`
- `throw new Error(...)` — use typed error classes from `@uaip/utils`
- Standalone TS `interface` for domain types — define Zod schema first, infer type
- Editing `dist/*.d.ts` — generated outputs, changes will be overwritten

## NOTES

- No test files exist in any of these packages — zero coverage
- `shared-types` is ESM (`"type": "module"`) — some imports use `.js` extension (ESM compat), some don't; both resolve correctly
- `@uaip/source` export condition in `shared-types/package.json` is a custom NX condition for source-level dev imports — not standard Node.js
