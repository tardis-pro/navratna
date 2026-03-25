# @uaip/llm-service

LLM provider abstraction layer. Supports OpenAI, Anthropic, Ollama. Handles provider routing, per-user preferences, API key decryption, model catalog bootstrap, and streaming.

## EXPORTS

| Export | Purpose |
|--------|---------|
| `LLMService` | Core provider abstraction — generates responses, lists models |
| `UserLLMService` | Per-user LLM preference service (CRUD + generation) |
| `ModelBootstrapService` | Syncs provider models to DB on startup |
| `ApiKeyDecryptionService` | Decrypts stored encrypted provider API keys |
| `StreamingService` | Token streaming utilities |
| Provider implementations | OpenAI, Anthropic, Ollama adapters |

## STRUCTURE

```
src/
├── LLMService.ts              # Core provider abstraction
├── UserLLMService.ts          # Per-user preference service
├── providers/                 # OpenAI, Anthropic, Ollama implementations
├── services/
│   ├── ModelBootstrapService.ts
│   ├── ApiKeyDecryptionService.ts
│   └── StreamingService.ts
├── context-manager/           # Conversation context tracking
└── index.ts
```

## USAGE

```typescript
import { LLMService, UserLLMService } from '@uaip/llm-service';

// Global model selection (system default routing)
const llm = new LLMService();
const response = await llm.generateAgentResponse(agentId, messages, context);

// Per-user model (respects user provider preferences)
const userLLM = new UserLLMService();
const response = await userLLM.generateAgentResponse(userId, agentId, messages);
```

## MODEL SELECTION

`ModelSelectionOrchestrator` (in `@uaip/shared-services`) applies a 5-strategy waterfall:
1. `AgentSpecificStrategy` — agent's configured model
2. `UserSpecificStrategy` — user's provider preference
3. `PerformanceOptimizedStrategy` — latency/cost-optimized choice
4. `ContextAwareStrategy` — context-length-aware selection
5. `SystemDefaultStrategy` — fallback from config

## EVENT BUS TOPICS

Services communicate with `llm-service` via BullMQ:
- `llm.user.request` → `UserLLMService.generateAgentResponse`
- `llm.global.request` → `LLMService.generateAgentResponse`
- `llm.generate.request` → artifact generation with structured prompts
- `llm.provider.changed` → re-bootstrap models from updated provider list
- Publishes: `llm.response.{requestId}`, `llm.generate.response`

## COMMANDS

```bash
pnpm --filter @uaip/llm-service build
```
