# @uaip/types

Single source of truth for all TypeScript types, enums, and interfaces shared across the entire monorepo. Build this first — everything depends on it.

## STRUCTURE

```
src/
├── index.ts                      # Barrel export (90 lines, 40+ domain modules)
│
├── — Core domain —
├── agent.ts                      # Agent, AgentStatus, AgentRole, AgentState, AgentSkill
├── persona.ts                    # Persona, PersonaTrait, BehaviorModel, CommunicationStyle, PersonaStatus
├── discussion.ts                 # Discussion, DiscussionStatus, MessageType, TurnStrategy
├── operation.ts                  # Operation, OperationStatus, WorkflowStep, ActionRecommendation
├── capability.ts                 # Capability, CapabilityStatus, CapabilityType (Zod-first)
├── security.ts                   # SecurityLevel, SecurityPolicy, Permission, RiskLevel
├── artifact.ts                   # ArtifactType, ArtifactStatus, ArtifactGenerationRequest
├── user.ts                       # User, UserRole, UserProfile
├── project.ts                    # Project, ProjectStatus, ProjectMember
├── workspace.ts                  # Workspace, WorkspaceSettings
│
├── — Tooling —
├── tool.ts                       # ToolCategory, ToolDefinition, ToolExecution, ToolRegistry
├── mcp.ts                        # MCP protocol types
├── capability.ts                 # Capability metadata, search, registration
│
├── — LLM & AI —
├── llm.ts                        # LLMProvider, LLMRequest, LLMResponse, LLMTaskType
├── models.ts                     # ModelDefinition, ModelProvider, ModelCatalog
├── conversation-intelligence.ts  # ConversationIntelligence, ContextEntry, SentimentAnalysis
├── thought.ts                    # ThoughtChain, ReasoningStep
├── critique.ts                   # Critique, CritiqueDimension
├── debate.ts                     # Debate, DebateRound, DebateParticipant
│
├── — Infrastructure —
├── events.ts                     # UAIPEvent<T> generic envelope, createUAIPEvent
├── event-bus.ts                  # Event bus config and channel types
├── database.ts                   # DB query types, pagination
├── api.ts                        # APIResponse, PaginatedResponse, APIError
├── http.ts                       # Elysia context hierarchy (ElysiaBaseContext → FullAuthenticatedContext)
├── websocket.ts                  # WebSocket message types, connection state
├── streaming.ts                  # StreamChunk, StreamSession
├── service-auth.ts               # Service-to-service auth tokens
├── audit.ts                      # AuditLog, AuditFilter, AuditEventType
├── system.ts                     # SystemHealth, ServiceMetrics
│
├── — Persona subsystem (runtime-heavy) —
├── personaDefaults.ts            # ⚠️ 4000-line runtime data file — not pure types
├── personaUtils.ts               # ⚠️ 888-line runtime utility functions
├── personaAdvanced.ts            # HybridPersona, ConversationContext (type-only exports)
├── personaConstants.ts           # ⚠️ Runtime constant data — NOT in barrel export
├── contextTriggers.ts            # contextualTriggers value export (named, not wildcard)
│
├── — UI / Frontend —
├── frontend-api.ts               # Frontend API response shapes (type-only export)
├── telescope.ts                  # Telescope UI types
├── ui-interfaces.ts              # Shared UI component interfaces
├── widget.ts                     # Widget, WidgetStatus, WidgetRegistry
├── social.ts                     # Social features, reactions, follows
│
├── — Products —
├── basebench.ts                  # BaseBench evaluation types
├── battle.ts                     # Battle/competition types
├── marketplace.ts                # Agent/persona marketplace
├── pipeline-schemas.ts           # Pipeline configuration schemas
├── microexpression.ts            # Microexpression analysis types
├── knowledge-graph.ts            # Knowledge graph nodes, edges, queries
├── questionforge.ts              # QuestionForge product types (selective exports)
│
└── — Orphan files (NOT in barrel export) —
    ├── config.ts                 # ServiceDatabaseConfig, RedisConfig, StringValue (JWT duration)
    ├── tools.ts                  # Duplicate ToolCategory — superseded by tool.ts
    └── frontend-auth.ts          # LoginCredentials, LoginResponse (frontend-only auth)
```

## USAGE

```typescript
// Always import from the package root
import { Agent, AgentStatus, SecurityLevel } from '@uaip/types';

// Sub-path imports work via wildcard export but are discouraged
import { ServiceDatabaseConfig } from '@uaip/types/config'; // only for orphan files
```

## CRITICAL PATTERNS

### Zod-First Type Definition

All domain types use Zod schemas — the schema IS the source of truth:

```typescript
// ✅ Correct pattern
export const AgentSchema = BaseEntitySchema.extend({ ... });
export type Agent = z.infer<typeof AgentSchema>;

// ❌ Never write standalone interfaces for domain types
export interface Agent { ... }
```

### UAIPEvent Generic Envelope

All cross-service events extend this:

```typescript
import { UAIPEvent } from '@uaip/types';
// events.ts pattern:
export interface MyEvent extends UAIPEvent<MyPayload> {
  type: 'domain.action.verb'; // narrow string literal
}
```

### Elysia Context Hierarchy (http.ts)

```
ElysiaBaseContext → AuthContext → RequiredAuthContext → FullAuthenticatedContext → FullAgentContext
```

Use these in Elysia route handlers — never use `any` for context.

## KEY ENUMS

| Enum               | Values                                                        |
| ------------------ | ------------------------------------------------------------- |
| `SecurityLevel`    | `LOW \| MEDIUM \| HIGH \| CRITICAL`                           |
| `AgentStatus`      | `idle \| thinking \| executing \| waiting \| error`           |
| `DiscussionStatus` | `pending \| active \| paused \| completed \| archived`        |
| `LLMTaskType`      | `ANALYSIS \| GENERATION \| EVALUATION \| ...`                 |
| `ToolCategory`     | in `tool.ts` — 16 categories (API, DATABASE, WEB_SEARCH, ...) |
| `AuditEventType`   | audit log event classifications                               |
| `PersonaStatus`    | `active \| inactive \| DEPRECATED`                            |
| `CapabilityStatus` | includes `DEPRECATED` value                                   |

## KNOWN ISSUES

1. **Duplicate export**: `WorkflowStep` exported from both `./agent` and `./operation`. Do not add more duplicate exports. Fix pattern: `export { WorkflowStep as OperationWorkflowStep } from './operation'`
2. **Orphan file `tools.ts`**: Has its own `ToolCategory` enum that conflicts with `tool.ts`. Not exported from barrel. Do not use or expand this file.
3. **Runtime code in types package**: `personaDefaults.ts` (4000 lines) and `personaUtils.ts` (888 lines) contain runtime data/functions. Circular import risk is real — be cautious.

## COMMANDS

```bash
pnpm --filter @uaip/types build    # ALWAYS build first
pnpm build:shared                  # builds types + utils + contracts together
```

## NOTES

- Changes here require rebuilding all dependents: `pnpm build:shared && pnpm build:backend`
- `.d.ts` files in `dist/` are generated — never edit them
- Some imports use `.js` extension (ESM compat), some don't — both resolve correctly; match the file's existing style
- `@uaip/source` export condition in `package.json` is a custom NX dev-mode condition — not standard Node.js
- No tests exist in this package
