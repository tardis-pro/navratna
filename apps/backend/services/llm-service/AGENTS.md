# llm-service — @uaip/llm-service-api

**Port**: 3007 | **Entry**: `src/index.ts` | **Status**: 🔄 Legacy (consolidating into navratna-core)

HTTP service wrapper for LLM provider management. Routes `llm.*` event bus topics to `@uaip/llm-service` library. Manages model catalog bootstrap and per-agent routing config.

## STRUCTURE

```
src/
├── index.ts                     # LLMServiceServer extends BaseService
├── routes/
│   ├── llm.routes.ts            # LLM generation + model listing + provider status
│   └── user-llm.routes.ts       # Per-user LLM preference CRUD
├── handlers/
│   └── agentGenerationHandler.ts  # Agent-aware generation
├── services/                    # ModelRoutingService, ModelBootstrapService
└── config/
    └── agentModels.json         # Per-agent model routing map
```

## ENDPOINTS

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/llm/chat` | Routed chat (agent-aware model selection) |
| GET | `/api/v1/llm/models` | Available models per provider |
| GET | `/api/v1/llm/routes` | All agent model routing configs |
| GET | `/api/v1/llm/routes/:agentId` | Single agent routing config |
| GET/POST/PUT/DELETE | `/api/v1/llm/user-providers` | Per-user provider preferences |

## EVENT BUS

| Topic | Direction | Handler |
|-------|-----------|---------|
| `llm.user.request` | subscribe | `UserLLMService.generateAgentResponse` |
| `llm.global.request` | subscribe | `LLMService.generateAgentResponse` |
| `llm.agent.generate.request` | subscribe | `AgentGenerationHandler` |
| `llm.generate.request` | subscribe | Artifact generation (structured prompts per artifact type) |
| `llm.provider.changed` | subscribe | Re-bootstrap models from updated provider list |
| `llm.response.{requestId}` | publish | Response back to requester |
| `llm.generate.response` | publish | Artifact generation response |

## MODEL ROUTING

`src/config/agentModels.json` maps `agentId → { provider, model, fallback }`. `ModelRoutingService` reads this on boot. Override per-user via `user-llm.routes.ts` endpoints.

`UnifiedModelSelectionFacade` waterfall:
1. Agent-specific config → 2. User preference → 3. Performance-optimized → 4. Context-aware → 5. System default

## COMMANDS

```bash
pnpm --filter @uaip/llm-service-api dev
pnpm --filter @uaip/llm-service-api build
```

## NOTES

- The shared library `@uaip/llm-service` does the actual LLM calls — this service is an HTTP/event-bus wrapper
- v3.0 target: routes imported by `navratna-core`
