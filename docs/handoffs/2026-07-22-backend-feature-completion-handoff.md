# Backend Feature-Completion Handoff — 2026-07-22

## USER REQUESTS (AS-IS)

- "FIX ALL TYPESCRIPT ERROR, DONT REMOVE THE FEATURE, UNDERSTAND AND FIX, AND COMMIT IN BATCHES, DONT BE LAZY."
- "dont do the frontend changes, only work through the backend errors please. also i solved couple of them, so nx builds the whole project, but only fails on lint."
- "dont remove. see where they were supposed to be used, and consume them. complete the incomplete feature."

## GOAL

Turn every backend lint error into tested, intended behavior without removing, renaming away, suppressing, or weakening features, then commit the work in dependency-ordered batches.

## CURRENT STATE

- Branch: `ci/github-actions-delivery`.
- `HEAD`: `74957705`.
- User says the full Nx build passes. The current RED baseline is backend lint only.
- Backend lint was run uncached with:
  - `CI=true pnpm nx run-many -t lint --exclude=@council/frontend --outputStyle=static`
- Eleven backend/shared projects fail with 88 lint errors total:

| Project                         | Errors | Main disconnected symbols                                                                                |
| ------------------------------- | -----: | -------------------------------------------------------------------------------------------------------- |
| `@uaip/types`                   |      1 | `fieldMeta`                                                                                              |
| `@uaip/middleware`              |      1 | `isAgentExecution`                                                                                       |
| `@uaip/agent-intelligence-core` |      4 | `DomainExpertiseEntry`, `ExpertiseLevel`, `sql`, `portraitRequestSchema`                                 |
| `@uaip/llm-service`             |      1 | `Message`                                                                                                |
| `@uaip/shared-services`         |     41 | Full intent audit still pending                                                                          |
| `@uaip/discussion-core`         |      3 | `Argument`, `Vote`, `ConsensusResult`                                                                    |
| `@uaip/security-gateway`        |     17 | test DB mocks, auth user ownership, error helpers, LLM enums, knowledge query/health types, parser error |
| `@uaip/orchestration-pipeline`  |     12 | webhook/job/event types, drift type, UUIDs, repo context, map index, Linear state/priority mapping       |
| `@uaip/capability-registry`     |      6 | `ToolRelationship`, `Capability`, Notion/Framer `ToolOperation`, `NotionDatabase`, Notion config         |
| `@uaip/questionforge`           |      1 | `CouncilAgentAnalysis`                                                                                   |
| `@uaip/exec-node-coding`        |      1 | `captureListener`                                                                                        |

- Warnings are mostly deliberate sequential `await` loops. Do not parallelize them merely to silence warnings; they are not causing lint failure.
- No implementation from the intent audits has been applied yet.

## BINDING IMPLEMENTATION RULE

Do not solve these errors by deleting imports/declarations, prefixing with `_`, adding lint suppressions, adding `any`, or weakening checks. Each symbol must be traced to its intended caller/data flow and meaningfully consumed. Where it exposes a stub or missing feature, complete that feature with a failing test first.

Some background-agent proposals are hypotheses, not approved implementation. Re-read current source and callers before coding; do not blindly copy suggested APIs or commands.

## COMPLETED INTENT AUDITS

### Shared domain audit (`bg_2f434c57`)

Evidence-backed directions to verify and implement:

- `fieldMeta`: `adaptV1BlockToUINode()` computes field projections then drops them. Extend the canonical `UINode` contract/schema and preserve typed field metadata through adaptation. RED test: adapted form block retains key/label/type/format.
- `isAgentExecution`: the guard exists but `trackAgentOperation` reads `ctx.agentExecution` without validating unknown runtime state. RED test: malformed injected execution state is rejected safely; valid state records results.
- `DomainExpertiseEntry` and `ExpertiseLevel`: cognitive portrait chat-history aggregation is stubbed and returns no expertise. Complete evidence-backed domain aggregation rather than creating dummy entries. RED tests must prove domain, level, confidence, evidence count, and recency are derived from history.
- `portraitRequestSchema`: defined but bypassed by a manual string comparison. Wire query parsing with explicit boolean coercion and reject malformed values. RED tests: `true`, `false`, absent, and malformed query values.
- `Message`: LLM service imports the canonical type while context management uses a structural duplicate and an existing `@ts-expect-error` masks timestamp mismatch. Normalize `ChatMessage` to canonical context messages and remove the mismatch through real conversion. RED tests: string timestamps become valid `Date` values while optional timestamps remain supported.
- `Argument`, `Vote`, `ConsensusResult`: discussion event handlers forward raw records instead of validating canonical debate payloads. Validate at the WebSocket/event boundary and reject malformed events. RED tests per event kind.
- `sql`: no evidence-backed intended use was found by the audit. Before implementation, inspect route requirements/history and identify the missing database behavior; do not invent a raw-SQL expression solely to consume the import.

### Security-gateway audit (`bg_e2754af8`)

Highest-value confirmed gap:

- `/my-providers/:id/stats` reads the authenticated user but does not use it to enforce provider ownership. Treat as an IDOR fix: RED cross-user test must return not-found/forbidden without leaking provider existence; owner path returns stats.

Other directions:

- Use `getErrorMessage` in the three route files that currently import it but discard structured failure context. Keep public error responses safe; detailed internal messages belong in structured logs, not automatically in client responses.
- Consume the four `mockDatabaseService` variables with meaningful interaction assertions, not tautological reads.
- Bind knowledge-route query interfaces to validated Elysia/Zod query inputs so the route contract and runtime parser agree.
- Consume `ServicesHealthStatus` in the aggregated health response.
- Preserve document-parser failures as structured warning/error context before the fallback to raw text; do not silently swallow the caught error.
- Use `LLMProviderType` and `LLMProviderStatus` in explicit validation/defaulting or typed mapping behavior; verify current enum contract first.

### Capability, QuestionForge, and coding audit (`bg_2eb80604`)

- `ToolRelationship`: construct and pass a canonical typed relationship object at the controller boundary; RED test verifies source, target, type, strength, reason, and metadata reach the registry.
- `Capability`: type/validate controller output against the canonical capability contract rather than adding a cosmetic annotation.
- Notion/Framer `ToolOperation`: build named operation objects that satisfy the adapter operation contract; RED tests verify registration and execution shape.
- `NotionDatabase`: add evidence-backed database metadata retrieval only if the adapter/tool contract requires it; test mapping from Notion API response to canonical database metadata.
- Notion `adapterConfig`: honor integration token/workspace configuration instead of ignoring it and relying only on process env. RED tests must prove credential precedence and workspace scoping without exposing secrets.
- `CouncilAgentAnalysis`: use the canonical type in the debate-to-question extraction boundary and test provenance from agent analysis to generated stakeholder questions.
- `captureListener`: use the helper in the existing Wave 3 event test to assert listener registration/fan-out/replay behavior; do not replace it with a meaningless invocation.

### Orchestration audit (`bg_8610efc4`)

The audit produced useful hypotheses but its exact 12-item list must be reconciled with the authoritative uncached lint output before coding. Confirmed current errors are:

- `JiraWebhookEventType`
- `RepeatableJob`
- `EventBusMessage` in architect/dev agent services
- `DriftSignalType`
- unused `randomUUID` imports in dev/Jira/Linear paths
- `RepoContext`
- unused map callback index
- `LinearIssueState`
- `LINEAR_PRIORITY_THRESHOLDS`

Implementation direction:

- Type webhook topic maps with canonical event unions and add unknown-event tests; do not weaken provider compatibility.
- Map BullMQ repeatable jobs into the shared contract and test registration/unregistration idempotency.
- Use `EventBusMessage` at subscription boundaries and test malformed/duplicate events.
- Use `DriftSignalType` and configured thresholds in actual signal construction; test threshold boundaries.
- Use UUIDs only where stable local correlation/idempotency IDs are required. Do not replace provider IDs.
- Use `RepoContext` data in the intended repository-aware orchestration behavior, not a no-op annotation.
- Use the map index only if it carries deterministic step ordering; otherwise locate the missing ordering field before coding.
- Replace hard-coded Linear state/priority behavior with canonical `LinearIssueState` and `LINEAR_PRIORITY_THRESHOLDS`, preserving provider semantics with boundary tests.

## PENDING BACKGROUND AUDIT

- `bg_9d7bbfb6` — shared-services intent audit for all 41 errors is still running at handoff time.
- Do not poll it in the old session. When the completion notification arrives, collect it with `background_output(task_id="bg_9d7bbfb6")` and append verified findings to this document or a follow-up implementation plan.

## REQUIRED TEST SCENARIOS

For each completed feature batch, define and capture RED → GREEN evidence for:

1. Happy path: the formerly disconnected value changes or validates observable backend behavior.
2. Edge/security path: malformed, absent, cross-user, duplicate, or boundary input is rejected or handled deterministically.
3. Adjacent regression: existing service tests plus its Nx build/lint target remain green.

Lint-only invocation is not a behavior test. Every behavior change needs a targeted Vitest test first. Pure type annotations may use compile-time contract tests only when there is genuinely no runtime behavior.

## RECOMMENDED COMMIT BATCHES

1. `fix(types): preserve workflow field metadata`
2. `fix(middleware): validate agent execution state`
3. `fix(agent-intelligence): complete portrait validation and expertise flow`
4. `fix(llm-service): normalize canonical context messages`
5. `fix(discussion-orchestration): validate debate event payloads`
6. `fix(security-gateway): enforce provider stats ownership`
7. `fix(security-gateway): complete error and knowledge route contracts`
8. `fix(orchestration-pipeline): complete typed webhook and job semantics`
9. `fix(orchestration-pipeline): complete Linear adapter mappings`
10. `fix(capability-registry): complete adapter configuration and metadata contracts`
11. `test(exec-node-coding): exercise captured session listener`
12. Shared-services batches determined after `bg_9d7bbfb6` is collected.

Each commit must contain its targeted tests and pass its project lint/test/build before the next batch.

## VERIFICATION SEQUENCE

1. Re-run each changed project lint uncached.
2. Run each changed project's targeted Vitest suite.
3. Run all backend lint targets, excluding frontend and the aggregate duplicate project if needed.
4. Run backend tests through Nx.
5. Run `pnpm build` to confirm the user-reported green build remains green.
6. Confirm `git diff --name-only origin/main..HEAD` contains no new frontend TypeScript/component changes.
7. Review all commits and only then proceed to workflow validation and PR creation.

## KEY FILES

- `apps/packages/shared-types/src/workflow_composition.ts`
- `apps/shared/middleware/src/agent_middleware.ts`
- `apps/shared/agent-intelligence/src/services/cognitive_portrait_service.ts`
- `apps/shared/agent-intelligence/src/routes/cognitive_portrait_routes.ts`
- `apps/shared/llm-service/src/l_l_m_service.ts`
- `apps/shared/discussion/src/handlers/debate_handler.ts`
- `apps/backend/services/security-gateway/src/http/providers_elysia.ts`
- `apps/backend/services/security-gateway/src/http/knowledge_elysia.ts`
- `apps/backend/services/orchestration-pipeline/src/adapters/linear_board_adapter.ts`
- `apps/backend/services/capability-registry/src/adapters/notion_adapter.ts`

## EXPLICIT CONSTRAINTS

- "FIX ALL TYPESCRIPT ERROR, DONT REMOVE THE FEATURE, UNDERSTAND AND FIX, AND COMMIT IN BATCHES, DONT BE LAZY."
- "dont do the frontend changes, only work through the backend errors please."
- "dont remove. see where they were supposed to be used, and consume them. complete the incomplete feature."

## CONTEXT FOR CONTINUATION

- The user's backend fixes and the two workflow commits are authoritative; do not resurrect older local edits.
- Do not touch frontend TypeScript/components during this backend work.
- Do not treat background-agent proposals as facts until current code/tests confirm them.
- Do not stage `_bmad-output/` or the untracked frontend artifacts.
- The shared-services audit is the only missing research input at handoff time.
