# agent-intelligence — @uaip/agent-intelligence

**Port**: 3001 | **Entry**: `src/index.ts` | **Status**: 🔄 Legacy (consolidating into navratna-core)

Cognitive engine. Manages agents, personas, 3-tier memory (working/episodic/semantic), LLM-backed chat with human-in-the-loop approval gates, and discussion orchestration. Most complex legacy service (~2000-line entry point).

## STRUCTURE

```
src/
├── index.ts                     # AgentIntelligenceService extends BaseService (2000+ lines)
├── routes/
│   ├── agent_routes.ts              # Core agent relevance
│   ├── agents_crud_routes.ts        # Agent CRUD
│   ├── agent_chat_routes.ts         # Chat + approval resolution
│   ├── agent_capability_routes.ts   # Capability/learning routes
│   ├── agent_memory_routes.ts       # Memory CRUD
│   ├── constellation_routes.ts      # Multi-agent constellation — POST /api/v1/knowledge/constellations
│   └── cognitive_portrait_routes.ts # Cognitive portrait + trust calibration + personalization vector
├── services/
│   ├── agent-core.service.ts    # Agent CRUD + state management
│   ├── agent-discussion.service.ts  # Discussion participation, LLM chat (2300+ lines)
│   ├── agent-planning.service.ts    # Plan generation and execution
│   ├── conversation-enhancement.service.ts  # Auto-enhancer: selects best agent for topic
│   └── [others]
├── knowledge-graph/             # Local Neo4j knowledge graph service
├── agent-memory/                # EpisodicMemoryManager, episodic writes
├── eval/                        # LLM evaluation utilities
└── __tests__/
    ├── agentIntentService.test.ts
    ├── cognitiveEvals.test.ts
    └── utils/mockServices.ts
```

## ENDPOINTS

All inline in `src/index.ts` (Elysia) + registered route files:

| Method              | Path                                            | Purpose                            |
| ------------------- | ----------------------------------------------- | ---------------------------------- | -------------------- |
| GET/POST/PUT/DELETE | `/api/v1/agents`                                | Agent CRUD                         |
| POST                | `/api/v1/agents/:id/chat`                       | LLM chat with memory + persona     |
| POST                | `/api/v1/agents/:id/approvals/:approvalId`      | Resolve human-in-the-loop approval |
| DELETE/PATCH        | `/api/v1/agents/:id/memory/semantic/:conceptId` | Prune/downvote semantic memory     |
| GET/POST/PUT/DELETE | `/api/v1/personas`                              | Persona CRUD + template search     |
| GET/POST/PUT        | `/api/v1/discussions`                           | Discussion CRUD                    |
| POST                | `/api/v1/discussions/:id/start                  | end`                               | Discussion lifecycle |
| POST                | `/api/v1/discussions/:id/messages`              | Add message to discussion          |
| POST                | `/test/sync`                                    | Manual Neo4j/Qdrant sync trigger   |
| GET                 | `/api/v1/debug/conversation-enhancement`        | Memory/leak diagnostics            |
| GET                 | `/api/v1/users/:userId/cognitive-portrait`      | Compute/retrieve cognitive portrait |
| POST                | `/api/v1/users/:userId/cognitive-portrait/calibrate` | Update trust calibration       |
| GET                 | `/api/v1/users/:userId/personalization-vector`  | Per-user personalization vector    |
| POST                | `/api/v1/knowledge/constellations`              | Multi-agent constellation coordination |

## EVENT BUS

| Topic                              | Direction | Handler                                            |
| ---------------------------------- | --------- | -------------------------------------------------- |
| `agent.chat.request`               | subscribe | Process chat, emit `agent.chat.response`           |
| `conversation.enhancement.request` | subscribe | Select best agent, emit `discussion.agent.message` |
| `agent.chat.response`              | publish   | LLM response back to requester                     |
| `discussion.agent.message`         | publish   | Agent message into active discussion               |

## KEY PATTERNS

**Memory system** (3 tiers):

- Working memory — current conversation context (in-process)
- Episodic memory — `EpisodicMemoryManager` writes to Neo4j
- Semantic memory — `SemanticMemoryManager` writes to Qdrant (1024-dim vectors)
- `MemoryConsolidator` runs on interval to promote episodic → semantic

**Human-in-the-loop**:

- `pendingApprovals: Map<string, PendingApproval>` tracks gates
- Agents pause execution until `POST /approvals/:id` resolves/rejects
- Timeout auto-rejects after configurable duration

**Decision engine** (imported from `@uaip/shared-services` source):

```typescript
import { DecisionEngine } from '../../../../shared/services/src/agent/agent-intelligence/decision-engine.js';
import { AgentStateMachine } from '../../../../shared/services/src/agent-state/agent-state-machine.js';
```

Note: direct path imports (not npm) — this is intentional in the legacy service.

**Specialist huddle**: conversation-enhancement auto-creates multi-agent discussions when response confidence is low.

## DEPS

`@uaip/shared-services`, `@uaip/llm-service`, `@uaip/middleware`, `@uaip/types`, `@uaip/utils`, `@uaip/config`

Service config: `enableNeo4j: true`, `enableEnterpriseEventBus: true`

## COMMANDS

```bash
pnpm --filter @uaip/agent-intelligence dev    # nodemon --exec tsx src/index.ts
pnpm --filter @uaip/agent-intelligence build
pnpm --filter @uaip/agent-intelligence test   # no jest.config — uses vitest
```

## NOTES

- v3.0 target: routes will be imported by `navratna-core` directly from `src/`
- `DEPRECATED` comment on old event handler patterns — do not restore them
- Knowledge graph service is local (`src/knowledge-graph/`) in addition to shared package
