# basebench-meta — @uaip/basebench-meta

**Port**: 3009 | **Entry**: `src/index.ts` | **Status**: 🆕 Active product

Metacognitive reliability benchmark. Evaluates agent responses for reasoning quality, confidence calibration, and self-awareness. Scores agents using the BaseBench-Meta methodology.

## STRUCTURE

```
src/
├── index.ts                         # BaseBenchMetaService extends BaseService
├── routes/
│   └── basebenchRoutes.ts           # All HTTP endpoints
├── services/
│   ├── basebenchMeta.service.ts     # Core benchmark orchestration
│   └── basebenchScoring.service.ts  # Scoring algorithms + rubric evaluation
├── fixtures/                        # Test prompts, expected outputs, rubrics
└── __tests__/                       # Benchmark test suite
```

## ENDPOINTS

All routes in `src/routes/basebenchRoutes.ts`:

| Method | Path                                  | Purpose                                       |
| ------ | ------------------------------------- | --------------------------------------------- |
| POST   | `/api/v1/basebench/evaluate`          | Run benchmark evaluation on an agent response |
| POST   | `/api/v1/basebench/run`               | Run full benchmark suite against an agent     |
| GET    | `/api/v1/basebench/results/:agentId`  | Get historical benchmark results              |
| GET    | `/api/v1/basebench/leaderboard`       | Ranked agent leaderboard by benchmark score   |
| GET    | `/api/v1/basebench/rubrics`           | List available evaluation rubrics             |

## SCORING MODEL

`basebenchScoring.service.ts` evaluates:

- **Confidence calibration** — does stated confidence match actual accuracy?
- **Reasoning transparency** — quality of `<thinking>` chain output (via `thought-parser.service.ts`)
- **Self-critique accuracy** — uses `critique.service.ts` from `@uaip/shared-services/cognitive`
- **Capability gap awareness** — `capabilityGapRadar.service.ts` match against declared capabilities
- **Meta-reasoning intercept score** — from `metaReasoning.interceptor.ts`

## FIXTURES

`src/fixtures/` contains benchmark prompts and ground-truth rubrics. To add new evaluation scenarios:
1. Add prompt in `fixtures/prompts/`
2. Add rubric in `fixtures/rubrics/`
3. Register in `basebenchMeta.service.ts` `BENCHMARK_SCENARIOS` map

## COMMANDS

```bash
nx run @uaip/basebench-meta:dev     # port 3009, bun --hot
pnpm --filter @uaip/basebench-meta dev
pnpm --filter @uaip/basebench-meta build
pnpm --filter @uaip/basebench-meta test
```

## NOTES

- Heavy dependency on `@uaip/shared-services/cognitive` — ensure that package builds first
- Auth via nginx → `attachNginxAuth`
- Results persisted to PostgreSQL — no separate store
- `src/__tests__/` uses fixtures — always run `pnpm build:shared` before testing
