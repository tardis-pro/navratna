# questionforge — @uaip/questionforge

**Port**: 3010 | **Entry**: `src/index.ts` | **Status**: 🆕 Active product

Stakeholder discovery council. Generates structured interview question packs, captures responses, runs debate-style follow-up flows, and surfaces insights from stakeholder input. Powers the `/questionforge` frontend portal.

## STRUCTURE

```
src/
├── index.ts                         # QuestionForgeService extends BaseService
├── routes/
│   └── questionforgeRoutes.ts       # All HTTP endpoints
└── services/
    ├── questionForge.service.ts     # Core orchestration — session lifecycle
    ├── questionPack.generator.ts    # LLM-powered question generation
    ├── questionRanker.service.ts    # Ranks/prioritizes questions by relevance
    ├── inputNormalizer.service.ts   # Normalizes free-text stakeholder responses
    ├── interviewCapture.service.ts  # Captures + persists interview sessions
    └── debateFlow.extension.ts      # Extension for debate-style follow-up questions
```

## ENDPOINTS

All routes in `src/routes/questionforgeRoutes.ts`:

| Method | Path                                     | Purpose                                    |
| ------ | ---------------------------------------- | ------------------------------------------ |
| POST   | `/api/v1/questionforge/generate`         | Generate question pack from topic/context  |
| POST   | `/api/v1/questionforge/sessions`         | Start a new stakeholder interview session  |
| GET    | `/api/v1/questionforge/sessions/:id`     | Get session state + captured answers       |
| POST   | `/api/v1/questionforge/sessions/:id/answer` | Submit answer to a question             |
| POST   | `/api/v1/questionforge/sessions/:id/debate` | Trigger debate-style follow-up flow     |
| GET    | `/api/v1/questionforge/sessions/:id/insights` | Get synthesized insights              |

## KEY PATTERNS

**Question generation** — `questionPack.generator.ts` calls `@uaip/llm-service` with structured prompts. Always uses `UnifiedModelSelectionFacade` for model routing (respects user preferences).

**Debate extension** — `debateFlow.extension.ts` integrates with `debate-orchestrator.service.ts` from `@uaip/shared-services/cognitive` to run multi-round follow-up questioning.

**Response normalization** — free-text answers run through `inputNormalizer.service.ts` before storage; extracts structured data (entities, sentiment, key themes).

## COMMANDS

```bash
nx run @uaip/questionforge:dev      # port 3010, bun --hot
pnpm --filter @uaip/questionforge dev
pnpm --filter @uaip/questionforge build
```

## FRONTEND

Routes: `/questionforge` → `QuestionForgeLanding`, `/questionforge/results` → `QuestionForgeResults`
Portal in: `apps/frontend/src/components/futuristic/portals/`

## NOTES

- Auth via nginx → `attachNginxAuth` (standard pattern)
- Session persistence in PostgreSQL via `interviewCapture.service.ts`
- No event bus subscriptions — purely HTTP-driven
