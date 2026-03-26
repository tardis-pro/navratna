# @uaip/contracts

Cross-service interface contracts: tool execution, orchestration pipeline, event bus payloads. Depends on `@uaip/types` but does not re-export domain types.

## STRUCTURE

```
src/
├── tool.ts          # ToolContract, ToolExecutionRequest/Response, CapabilityRegistry
│                    # + Zod schemas: ToolDefinitionSchema, ToolRelationshipSchema
├── orchestration.ts # OrchestrationPipeline, StepExecutor, WorkflowOrchestrator
├── events.ts        # EventContracts map + all event interfaces (extend UAIPEvent<T>)
└── index.ts         # Re-exports all three
```

## IMPORTS

```typescript
// Root import (preferred — all 3 modules)
import { ToolContract, OrchestrationPipeline, EventContracts } from '@uaip/contracts';

// Sub-path imports (also valid per package.json exports)
import type { ToolContract } from '@uaip/contracts/tool';
import type { OrchestrationPipeline } from '@uaip/contracts/orchestration';
import type { EventContracts } from '@uaip/contracts/events';
```

## KEY CONTRACTS

### tool.ts

| Export                            | Purpose                                            |
| --------------------------------- | -------------------------------------------------- |
| `ToolExecutionRequest / Response` | Request/response shape for tool execution          |
| `ToolExecutionCoordinator`        | Interface for services that execute tools          |
| `ToolContract`                    | Full tool interface (execute, validate, getSchema) |
| `CapabilityRegistry`              | Register/discover/filter capabilities              |
| `Capability / CapabilityFilters`  | Capability shape and search filters                |
| `ToolDefinitionSchema`            | Zod runtime validator for tool definitions         |
| `ToolRelationshipSchema`          | Zod validator for tool relationships               |

### orchestration.ts

| Export                                               | Purpose                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `OrchestrationPipeline`                              | Create/execute/pause/cancel execution plans                |
| `ExecutionPlan / ExecutionContext / ExecutionResult` | Pipeline data shapes                                       |
| `StepExecutor / CompensationHandler`                 | Per-step execution + saga compensation                     |
| `WorkflowOrchestrator`                               | Start workflows, submit tasks, subscribe to events         |
| `ExecutionStatus`                                    | Progress tracking (queued/running/paused/completed/failed) |

### events.ts — Event Types

All events extend `UAIPEvent<TPayload>` from `@uaip/types` with a narrowed `type` literal.

| Event type string                         | Purpose                     |
| ----------------------------------------- | --------------------------- |
| `tool.execute.request/response`           | Tool execution round-trip   |
| `approval.request/response`               | Human-in-the-loop approvals |
| `operation.started/completed/failed`      | Operation lifecycle         |
| `operation.step.completed/failed`         | Step-level tracking         |
| `capability.discovered/updated`           | Registry sync               |
| `security.validation.requested/completed` | Security checks             |

## WHEN TO USE

- Event bus message payload shapes → `events.ts`
- MCP tool input/output contracts → `tool.ts`
- Workflow step execution interfaces → `orchestration.ts`
- Runtime validation of tool definitions → `ToolDefinitionSchema` from `tool.ts`

## ANTI-PATTERNS

- Domain types (Agent, Persona, Operation) here — use `@uaip/types` instead
- Raw event payloads without extending `UAIPEvent<T>` — all events must use the envelope
- New event interfaces without a narrowed `type: 'domain.action.verb'` literal

## KNOWN GAP

`AgentCapabilityMetric` is defined locally in `tool.ts` (line ~92) with the comment "not exported from types." It belongs in `@uaip/types` but hasn't been moved yet.

## COMMANDS

```bash
pnpm --filter @uaip/contracts build
# Part of: pnpm build:shared
```
