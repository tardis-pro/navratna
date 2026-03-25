# @uaip/contracts

Service-to-service interface contracts. Defines the shapes for tool execution, orchestration events, and cross-service communication — separate from runtime types in `@uaip/types`.

## EXPORTS (3 sub-paths)

```typescript
import { ToolContract } from '@uaip/contracts/tool';
import { OrchestrationContract } from '@uaip/contracts/orchestration';
import { EventContract } from '@uaip/contracts/events';
```

## WHEN TO USE

- When defining the interface for an event bus message payload
- When specifying tool input/output schemas for MCP
- When two services need a shared contract that isn't a domain type

Do not add domain types here — use `@uaip/types` instead.

## COMMANDS

```bash
pnpm --filter @uaip/contracts build
# Part of: pnpm build:shared
```
