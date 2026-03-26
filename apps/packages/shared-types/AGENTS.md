# @uaip/types

Single source of truth for all TypeScript types, enums, and interfaces shared across the entire monorepo (229+ source files). Build this first — everything depends on it.

## STRUCTURE

```
src/
├── index.ts                 # Barrel export of all types
├── agent.ts                 # Agent, AgentStatus, AgentRole, AgentState
├── persona.ts               # Persona, PersonaTrait, BehaviorModel, CommunicationStyle
├── discussion.ts            # Discussion, DiscussionStatus, MessageType, TurnStrategy
├── operation.ts             # Operation, OperationStatus, WorkflowStep, ActionRecommendation
├── capability.ts            # Tool, ToolDefinition, ToolCategory, CapabilityStatus
├── security.ts              # SecurityLevel, SecurityPolicy, AuditEventType, Permission
├── artifact.ts              # ArtifactType, ArtifactStatus, ArtifactGenerationRequest
├── basebench.ts             # BaseBench evaluation types
├── battle.ts                # Battle/competition types
├── widget.ts                # Widget, WidgetStatus, WidgetRegistry
├── conversation-intelligence.ts  # ConversationIntelligence, ContextEntry
├── api.ts                   # APIError, APIResponse, PaginatedResponse
├── audit.ts                 # AuditLog, AuditFilter
└── [20+ more domain files]
```

## USAGE

```typescript
// Always import from the package root
import { Agent, AgentStatus, SecurityLevel } from '@uaip/types';

// Never import from file paths
import { Agent } from '@uaip/types/agent'; // ❌ use root import
```

## KEY ENUMS (most referenced)

| Enum               | Values                                                 |
| ------------------ | ------------------------------------------------------ |
| `SecurityLevel`    | `LOW \| MEDIUM \| HIGH \| CRITICAL`                    |
| `AgentStatus`      | `idle \| thinking \| executing \| waiting \| error`    |
| `AgentRole`        | persona role enums                                     |
| `DiscussionStatus` | `pending \| active \| paused \| completed \| archived` |
| `MessageType`      | message classification enum                            |
| `LLMTaskType`      | `ANALYSIS \| GENERATION \| EVALUATION \| ...`          |
| `ToolCategory`     | tool categorization                                    |
| `AuditEventType`   | audit log event classifications                        |
| `PersonaStatus`    | `active \| inactive \| DEPRECATED`                     |

## KNOWN ISSUE

`src/index.ts` has a duplicate export: `WorkflowStep` is exported from both `./agent` and `./operation`. This is a pre-existing conflict — do not add more duplicate exports. Fix by using explicit re-exports: `export { WorkflowStep as OperationWorkflowStep } from './operation'`.

## COMMANDS

```bash
# ALWAYS build this first before any backend service
pnpm --filter @uaip/types build
pnpm build:shared              # builds types + utils + contracts together
```

## NOTES

- Changes here require rebuilding all dependent packages (`pnpm build:shared && pnpm build:backend`)
- `.d.ts` declaration files are generated outputs in `dist/` — never edit them directly
- `personaDefaults.ts` is runtime data (4000 lines) — not just types; be careful with circular imports
