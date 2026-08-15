# orchestration-pipeline — @uaip/orchestration-pipeline

**Not a running service.** This is a FeatureFactory module imported by
**navratna-gateway** (port 3002) via `feature.ts`. It has no port and no
independent lifecycle. `src/index.ts` exists but the gateway is the entry point.

**Last verified against the tree: 2026-08-15.**

Workflow and operation execution: multi-step operations with state management,
resource allocation, saga-pattern compensation, scheduled/triggered workflows,
task management, and BullMQ-backed background work.

> This file was materially wrong before 2026-08-15 — it described
> `engine/orchestrationEngine.ts`, `routes/projectRoutes.ts`, a `sops/`
> directory, and stated "No event bus publish/subscribe topics." None of those
> matched the tree, and the event bus is used heavily. In a codebase whose
> central failure mode is "looks wired, isn't", a stale map is an active hazard,
> so please re-verify rather than extend on trust.

## STRUCTURE

File naming is **snake_case** throughout (repo-wide rule for backend `.ts`).

```
src/
├── feature.ts                       # FeatureFactory module: routes + wiring (the real entry)
├── index.ts
├── orchestration_engine.ts          # Operation lifecycle: state → resource → execute → compensate
├── engine/
│   ├── workflow_orchestrator.ts     # Topological (Kahn) step ordering; runs each group concurrently
│   ├── step_execution_manager.ts    # Per-step execution, timeout race, retry backoff
│   └── operation_validator.ts       # Zod schemas for operations and steps
├── routes/
│   ├── operation_routes.ts
│   ├── task_routes.ts
│   ├── workflow_routes.ts           # Workflow definition CRUD + manual execute
│   ├── workflow_hook_routes.ts      # HMAC-verified ingress for 'webhook' triggers
│   ├── dev_loop_routes.ts           # Deliberately narrow — see the file header
│   ├── github_webhook_routes.ts     # Mounted only when GITHUB_WEBHOOK_SECRET is set
│   └── jira_webhook_routes.ts       # Mounted only when the Jira secret is set
├── services/                        # workflow_engine_service, workflow_executor_service,
│                                    # healing_agent_service, github_ci_monitor_service, …
├── adapters/                        # board providers: internal, github, jira, linear
├── controllers/
├── seeds/
├── workflows/
└── __tests__/
```

There is **no `sops/` directory** and no `gray-matter` frontmatter parsing.

## ENDPOINTS

Verify against `feature.ts` `routes()` — that is the authoritative list.

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/v1/operations` | List / create operations |
| GET | `/api/v1/operations/:id/status` | Operation state |
| POST | `/api/v1/operations/:id/pause`, `/resume`, `/cancel` | Operation lifecycle |
| GET/POST | `/api/v1/projects/:projectId/tasks` | Tasks, scoped to a project |
| GET | `/api/v1/projects/:projectId/tasks/statistics` | Task statistics |
| GET/POST/PUT/DELETE | `/api/v1/workflows` | Workflow definition CRUD |
| POST | `/api/v1/workflows/:id/execute` | Run a definition now |
| GET | `/api/v1/workflows/:id/executions` | Run history (an `operations` row per run) |
| POST | `/api/v1/workflows/hooks/:routingKey` | Inbound hook for `webhook` triggers (HMAC) |
| POST | `/api/v1/webhooks/github`, `/api/v1/webhooks/jira` | Provider webhooks (HMAC) |
| POST/GET | `/api/v1/dev-loop/...` | Diagnose + read/cancel loop state only |

**Project CRUD is NOT here.** It lives in security-gateway
(`http/projects_elysia.ts`, mounted at `/api/v1/projects`).

## CORE PATTERN: Saga / Compensation

```
Operation → Steps → Execute (each step)
                  → Compensate (on failure, reverse completed steps)
```

`OrchestrationEngine` coordinates `StateManagerService`, `ResourceManagerService`,
`StepExecutorService` and `CompensationService` (the latter three live in
shared-services).

Concurrency comes from `dependsOn` groups: `WorkflowOrchestrator.determineExecutionOrder`
does a real topological sort and runs each group concurrently. **Step type
`parallel` is not implemented and throws** — it used to report every branch
successful without executing any of them.

## EVENT BUS

The previous claim that there are none was wrong. Published:

`operation.started` · `operation.completed` · `operation.failed` ·
`operation.paused` · `operation.resumed` · `operation.cancelled` ·
`operation.suspended` · `operation.state.updated` · `operation.step.completed` ·
`operation.step.failed` · `approval.requested` · `project.workspace.ready` ·
`project.workspace.failed` · `rdlo.board.status.sync` · `rdlo.code.rollback` ·
`rdlo.repo.ingest` · `telescope.notification.stale-pr` ·
`workflow.definition.trigger`

Subscribed: `rdlo.story.status.changed`, and `workflow.definition.trigger`
(consumed by `WorkflowExecutorService`).

Before adding a publish, check that something consumes it. Five topics
(`rdlo.code.generate`, `rdlo.ci.heal`, `rdlo.gate4.trigger`,
`rdlo.healing.trigger`, plus the dev-agent PR topic) were removed on 2026-08-15
because they had publishers and no subscribers, while their log lines announced
that work had been handed off.

## WORKFLOW TRIGGERS

Every `TriggerKind` has a real registration path in `WorkflowEngineService`, and
an unregistrable definition raises rather than being silently skipped:

- `cron` / `every` → a BullMQ **Job Scheduler** on `workflow.definition.trigger`
- `event` → a bus subscription on `trigger.expr`, enqueuing on match
- `webhook` → a routing key resolved by `POST /api/v1/workflows/hooks/:routingKey`,
  which requires `x-navratna-signature-256` and `WORKFLOW_WEBHOOK_SECRET`

**bullmq is v6.** The legacy repeatable-job API (`repeat` on `Queue#add`,
`getRepeatableJobs`, `removeRepeatableByKey`) no longer exists — use
`upsertJobScheduler` / `getJobSchedulers` / `removeJobScheduler`.

## BACKGROUND JOBS

BullMQ (**not** `bull`) over Redis, via `EventBusService` in `@uaip/infra`.

## COMMANDS

```bash
pnpm --filter @uaip/orchestration-pipeline typecheck
pnpm --filter @uaip/orchestration-pipeline test
```

## NOTES

- Task status uses the canonical `StoryStatus` vocabulary
  (`backlog | in-progress | in-review | done | blocked | needs-triage`) and
  transitions are guarded. Legacy values are normalised by `toStoryStatus`.
- `DevAgentService.executeStory` and `HealingAgentService.applyFixes` are **not
  implemented and throw**. `HealingAgentService.diagnose` is real.
- `github_ci_monitor_service` and `github_pr_automation_service` are hardcoded to
  `api.github.com` and do not work against a Gitea-backed deployment.
