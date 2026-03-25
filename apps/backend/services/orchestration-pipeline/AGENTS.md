# orchestration-pipeline — @uaip/orchestration-pipeline

**Port**: 3002 | **Entry**: `src/index.ts` | **Status**: 🔄 Legacy (consolidating into navratna-gateway)

Workflow execution engine. Multi-step operations with state management, resource allocation, saga-pattern compensation (rollback), task/project management, BullMQ background jobs.

## STRUCTURE

```
src/
├── index.ts                     # OrchestrationPipelineService extends BaseService
├── engine/
│   └── orchestrationEngine.ts   # Core engine: state → resource → execute → compensate
├── routes/
│   ├── taskRoutes.ts            # Task CRUD + assignment + status transitions
│   └── projectRoutes.ts         # Project CRUD
├── services/                    # stepExecutorService, resourceManagerService, etc.
├── sops/                        # Standard Operating Procedures (workflow definitions)
├── workflows/                   # Workflow definition files (gray-matter parsed)
├── controllers/
└── __tests__/
    ├── unit/orchestrationEngine.test.ts
    └── utils/mockServices.ts
```

## ENDPOINTS

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/v1/operations` | List/create operations |
| GET | `/api/v1/operations/:id/status` | Operation state |
| POST | `/api/v1/operations/:id/pause|resume|cancel` | Operation lifecycle |
| GET/POST/PUT/DELETE | `/api/v1/tasks` | Task management |
| PUT | `/api/v1/tasks/:id/assign` | Assign task to agent/user |
| GET/POST/PUT/DELETE | `/api/v1/projects` | Project CRUD |

## CORE PATTERN: Saga/Compensation

```
Operation → Steps → Execute (each step)
                  → Compensate (on failure, reverse completed steps)
```

`OrchestrationEngine` coordinates:
- `StateManagerService` — operation/step state persistence
- `ResourceManagerService` — resource allocation and locking
- `StepExecutorService` — individual step execution (tool calls, LLM, etc.)
- `CompensationService` — saga rollback for failed multi-step operations

## WORKFLOWS

Workflow definitions in `src/workflows/` use YAML/Markdown with frontmatter (parsed via `gray-matter`). SOPs in `src/sops/` define standard agent operating procedures.

## BACKGROUND JOBS

`bull` queue for async background job processing. Long-running operations are enqueued and reported via WebSocket (`ws`) streaming updates to clients.

## COMMANDS

```bash
pnpm --filter @uaip/orchestration-pipeline dev
pnpm --filter @uaip/orchestration-pipeline build
pnpm --filter @uaip/orchestration-pipeline test   # 75% coverage, 15s timeout
```

## NOTES

- v3.0 target: task/project routes imported by `navratna-gateway`
- No event bus publish/subscribe topics — communicates via HTTP from client side
