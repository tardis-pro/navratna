# PLAN 3 — Type Safety, Dead Code & Migration Debt

> **Theme:** Stop lying to the compiler and stop shipping ghosts. This group covers the
> quieter, accumulating rot: type escapes that mask runtime shape mismatches, catch blocks
> that swallow or mislabel failures, half-finished migrations (TypeORM→Drizzle, RabbitMQ→
> BullMQ, 7→2 consolidation), stub services that *look* functional but produce nothing, and
> orphaned code from removed features. Individually survivable; collectively they erode trust
> in the codebase and hide real bugs.
>
> **Source:** Tech-debt audit 2026-07-18 (error-handling + stubs/dead-code agents + direct census).
> **Scope:** `navratna/` monorepo. **Owner:** backend + frontend.
> **Status legend:** ☐ todo · ◐ in progress · ☑ done

---

## Why this group

Two shared properties: **none of it changes runtime behavior when fixed correctly** (it's
cleanup + hardening, not feature work), and **all of it hides real failures** — a swallowed
catch, an `as unknown as` that masks a shape change, a stub that returns `[]` so a feature
silently does nothing, a dead test that gives false coverage confidence. Grouped so a cleanup
sprint can burn it down category by category with regression tests locking behavior first.

---

## Evidence summary (counts)

| Finding | Count | Worst offenders |
|---|---|---|
| Empty / swallowing `catch {}` | 3 | `knowledge_elysia.ts:736,1046`; `qdrant_service.ts:175` |
| Misleading error re-labeling (DB error → generic 500) | ~15 endpoint groups (100+ routes) | all legacy `*_elysia.ts` CRUD; `event_bus.ts:758` returns HTTP 200 `{success:false}` on bus failure |
| `as unknown as` (production, non-test) | ~48 instances / 24 files | `composition/*` (JSONB roundtrips); `oauth_provider_service.ts` (DB row→domain, ×6); `artifact-service/llm/index.ts:133` (error struct as `T`) |
| `!` non-null assertions (prod critical paths) | ~32 / 8 files | `security_gateway_service.ts` (10× on `RiskAssessment`); `mcp_client_service.ts` (~15 on process handles) |
| `@ts-expect-error`/`@ts-nocheck` (real debt) | 2 | `l_l_m_service.ts:807` (schema misalignment); `mock_services.ts:1` (@ts-nocheck whole file) |
| Stub methods / TODO placeholders | ~69 items / 20+ files | `WidgetService` (14 stubs, fully nonfunctional); `DatabaseService` (10); `ToolRegistry` (8); vision-module (13 throws); OIE workers (4 no-op) |
| Legacy ORM artifacts | 11 | entity shims + 2 broken skip-tests using `.getRepository()` on `pg.Pool`; stale TypeORM README |
| RabbitMQ remnants | 0 in TS source / ~8 infra+docs | `monitoring/*.yml` scrape+rules; `docker-compose.enterprise.yml`; stale docs |
| Marketplace orphans (service deleted) | ~13 | `tsconfig.json:26` dead path; `frontend/src/components/marketplace/` (7 files); `shared-types/src/marketplace.ts` |
| Dead/deprecated frontend | ~5 | `chat_persistence_service.ts` (280-line @deprecated); committed `base-widget.js/.d.ts/.map` build artifacts in `src/` |
| `CrossPlaneGuard` defined, never called | 1 | `drizzle/clients/index.ts:273–294` — cross-plane writes unguarded |

---

## Workstream 3A — Stop swallowing & mislabeling errors

**Problem.** 3 empty catches drop failures entirely (`knowledge_elysia.ts:736` silently
returns a partial graph; `qdrant_service.ts:175` returns `undefined` URL → downstream NPE).
~100+ route handlers collapse every failure into a generic `500 "Failed to X"` with no error
code/correlation ID (memory #2782: this is how 23502 org-id errors got mislabeled as 400).
Worst: `event_bus.ts:758` returns **HTTP 200** `{success:false}` on a BullMQ/Redis outage, so
callers checking `.success` silently proceed after infra failure.

**Fix.**
- ☐ The 3 empty catches: at minimum `logger.warn(..., err)`; better, propagate or return a
  typed partial-result marker so consumers know data is incomplete.
- ☐ `event_bus.ts:758` — throw or return a distinguishable error tag; never HTTP 200 on a
  bus failure.
- ☐ Introduce a shared typed `ApiError { code, message, correlationId }`. Route catches map
  known domain errors (constraint/timeout/auth) to the right status + code; unknown → 500 with
  correlation ID. Sweep the legacy `*_elysia.ts` CRUD groups.
- ☐ DB constraint errors (esp. `23502`, `23505`) must map to 4xx with a real reason, not a
  blanket 500/400 (memory #2782 pattern).

**Acceptance.** No empty catch without a log; bus failures are never HTTP 200; a client can
branch on `error.code` instead of string-matching messages.

---

## Workstream 3B — Retire type escapes on real data paths

**Problem.** ~48 production `as unknown as` casts, concentrated in (a) `composition/*` JSONB
roundtrips (`workflow_composition_service.ts` ×6, `composition_replay_buffer.ts` ×3 —
schema evolution not type-checked), (b) DB-row→domain casts (`oauth_provider_service.ts` ×6 —
bypasses validation, schema drift = silent corruption), (c) `artifact-service/llm/index.ts:133`
`return errorResponse as unknown as T` (caller expecting an artifact gets an error struct).
Plus ~32 `!` non-null assertions in critical paths — 10 on `RiskAssessment` in the **security
validation hotpath** (`security_gateway_service.ts`), ~15 on MCP process handles
(`mcp_client_service.ts` — `server.process!.stdin` NPEs if spawn failed).

**Fix.**
- ☐ DB-row→domain and JSON-parse casts: replace `as unknown as T` with Zod `.parse()` or a
  typed mapper. Start with `oauth_provider_service.ts` and the `composition/*` JSONB reads
  (align with Plan 2 so tenant fields aren't cast away).
- ☐ `artifact-service/llm/index.ts:133`: return a `Result<T, LLMErrorResponse>` (or discriminated
  union) so callers handle the error path explicitly — no lying cast.
- ☐ `security_gateway_service.ts`: either make `RiskAssessment` fields required (if `assessRisk()`
  always sets them) or add null guards before each `.score!`/`.overallRisk!` — a partial
  assessment currently throws in the security hotpath.
- ☐ `mcp_client_service.ts`: guard `config.command!`/`server.process!` with explicit
  `ExternalServiceError` throws instead of `!`.
- ☐ Resolve the 1 real `@ts-expect-error` (`l_l_m_service.ts:807`, `ChatMessage.timestamp`
  string vs `Message.timestamp` Date) with an adapter; drop `@ts-nocheck` in `mock_services.ts`.

**Acceptance.** No `as unknown as` on a DB-row/JSON boundary without a validating parse; the
security hotpath and MCP client cannot NPE on partial/missing data. (Note: `as any` is only 10
occurrences and well-controlled — leave unless trivially removable.)

---

## Workstream 3C — Finish or delete the stub services

**Problem.** ~69 stub/TODO items. Several are **exported and look functional but do nothing**:
- `WidgetService` — 14 stubbed private DB methods; the whole class is nonfunctional yet exported.
- `DatabaseService` — 10 delegation stubs (permissions/risk/agent-state return hardcoded empties).
- `ToolRegistry` — 8 recommendation methods `return []` (recommendations silently disabled).
- OIE pipeline — 4 workers (`analyst`, `fix_proposer`, `verifier`, `learner`) consume queue
  events but emit `[STUB]`/`0.0`/no DB write. Appears wired, produces nothing.
- vision-module — 13 `throw 'Not implemented'` across 4 files, **not exported** = dead.
- `workflow_extractor_service.ts:1333/1341` — 2 throws **inside a live service path** → crash
  if reached.

**Fix.**
- ☐ Triage each stub: **wire**, **ticket as explicit FOLLOW-UP**, or **delete**. Do not leave
  exported nonfunctional classes.
- ☐ vision-module (4 files, unreachable): delete now, or add to the package index behind a
  tracked follow-up. No dead-but-present code.
- ☐ `workflow_extractor_service.ts` runtime throws: implement or guard the calling path so it
  can't crash the knowledge pipeline.
- ☐ OIE stubs: either mark the feature clearly `experimental/disabled` (so it's not mistaken
  for functional) or implement the analyst/fix/verify/learn bodies. Respect the honored
  AGENTS.md note that `databaseService.ts`/`widgetService.ts`/`toolRegistry.ts` stubs are
  **known placeholders** — coordinate before filling (don't re-implement blindly).

**Acceptance.** No exported class is silently nonfunctional; every remaining stub is either
implemented or has a linked FOLLOW-UP ticket and is unreachable-by-design.

---

## Workstream 3D — Close out the TypeORM→Drizzle migration

**Problem.** Migration is ~99% done in source (Drizzle everywhere) but leaves:
- 5 `src/entities/*_entity.ts` re-export shims still imported via pre-consolidation relative
  paths by `user_service.ts` and `task_service.ts`.
- 2 integration tests (`oauth_flow_integration.test.ts`, `security_validation_integration.test.ts`)
  call `.getRepository(Entity)` / `.destroy()` **on a `pg.Pool`** (TypeORM API that cannot
  exist) and reference phantom entities — both `describe.skip`, so OAuth/security flows have
  **zero integration coverage**.
- Tombstone `getDataSource()`/`getRepository()` throws (fine to keep as guards).
- 100% stale TypeORM README + `SERVICE_ARCHITECTURE.md`.

**Fix.**
- ☐ Repoint `user_service.ts`/`task_service.ts` imports to `@uaip/types` directly; delete the
  5 entity shims (no source or types outside `apps/packages/` — memory #1587).
- ☐ Rewrite the 2 skip-tests against Drizzle (`getControlDb()` + raw SQL); un-skip. This
  restores OAuth + security-validation integration coverage.
- ☐ Rewrite `apps/shared/services/README.md` (remove all TypeORM/`AppDataSource` docs); mark
  `apps/backend/SERVICE_ARCHITECTURE.md` current or delete.
- ☐ Delete the `@deprecated` `seed_database.ts` re-export shim.

**Acceptance.** No `src/entities/` shim imports; OAuth + security integration tests run and
pass; no doc references TypeORM.

---

## Workstream 3E — RabbitMQ remnants (infra/docs only)

**Problem.** 0 in TS source (clean!) but ~8 infra/doc/monitoring artifacts still reference
RabbitMQ: `monitoring/prometheus.yml` scrape `rabbitmq:15692`, `performance_rules.yml` +
`logging_rules.yml` recording rules, `docker-compose.enterprise.yml` `rabbitmq-enterprise`
service + `RABBITMQ_URL` injection, `docs/TESTING_E2E.md` port 5673, stale
`SERVICE_ARCHITECTURE.md`. (Event bus is BullMQ-on-Redis only.)

**Fix.**
- ☐ Remove the `rabbitmq-enterprise` service + `RABBITMQ_URL` from
  `docker-compose.enterprise.yml`.
- ☐ Strip rabbitmq scrape target + recording rules from `monitoring/*.yml`.
- ☐ Purge RabbitMQ from `docs/TESTING_E2E.md` and `SERVICE_ARCHITECTURE.md`.

**Acceptance.** `rg -i rabbitmq` returns only intentional references (e.g. a stack-detector
regex hint, if kept). No RabbitMQ in compose/monitoring/docs.

---

## Workstream 3F — Remove marketplace-service orphans (service already deleted)

**Problem.** The service dir is gone, but orphans remain: `tsconfig.json:26` path alias to a
non-existent dir, `scripts/tmux-dev.sh:29` pane, `shared-types/src/marketplace.ts` (still
exported from `@uaip/types`), `frontend/src/components/marketplace/` (7 files) +
`MarketplaceHubWidget.tsx`, `docs/features/MARKETPLACE.md`, refactoring-plan doc refs.

**Fix.**
- ☐ Remove the `tsconfig.json` path alias and `tmux-dev.sh` pane.
- ☐ Delete `shared-types/src/marketplace.ts` + its `@uaip/types` index export **after**
  confirming the frontend marketplace components are also removed (they consume it).
- ☐ Delete `frontend/src/components/marketplace/` (7 files) + `MarketplaceHubWidget.tsx` +
  `docs/features/MARKETPLACE.md` — unless the marketplace UI is intentionally retained, in
  which case ticket it as "UI kept, backend removed" and document the decision.

**Acceptance.** `rg -i marketplace` returns zero results in build config, source, and docs
(or only an explicit "intentionally retained" note).

---

## Workstream 3G — Dead frontend & build-artifact hygiene

**Problem.**
- `frontend/src/services/chat_persistence_service.ts` — 280-line `@deprecated` file, callers
  should use `discussionsAPI`.
- Committed **build artifacts in source**: `frontend/src/components/ui/base-widget.js` +
  `.d.ts` + `.d.ts.map`; and (from the direct census) compiled `.d.ts/.js/.map` polluting
  `apps/packages/shared-types/src/` (not git-tracked, but dirties the tree and inflated our
  God-object metrics). The Dockerfile already `find … -delete`s these — but they shouldn't be
  generated into `src/` in the first place.
- `CrossPlaneGuard` (`drizzle/clients/index.ts:273–294`) fully implemented, **never called** →
  cross-plane writes unguarded (data-integrity risk; also noted in Plan 2 context).

**Fix.**
- ☐ Delete `chat_persistence_service.ts`; repoint callers to `discussionsAPI`.
- ☐ Delete committed `base-widget.js/.d.ts/.d.ts.map` from `src/`; fix the build config so
  declarations/JS emit to `dist/`, not `src/`. Add `*.d.ts`/`*.js` artifact patterns under
  package `src/` to `.gitignore` where appropriate.
- ☐ `CrossPlaneGuard`: identify cross-plane writes (control-plane `agent_id`/`user_id` written
  into intelligence-plane tables) and add `await CrossPlaneGuard.verify(...)` before each
  (memory notes it's defined but not yet called in prod).

**Acceptance.** No `@deprecated` dead file; no compiled artifacts under any `src/`; cross-plane
writes are guarded.

---

## Suggested execution order

1. **3G delete-only items** + **3F** + **3E** — pure deletions/cleanup, no behavior change,
   fast wins that shrink the surface.
2. **3A** (error handling) — highest bug-hiding risk; lock behavior with tests first.
3. **3B** (type escapes on data paths) — prevents silent shape-drift corruption.
4. **3D** (TypeORM close-out) — restores OAuth/security integration coverage.
5. **3C** (stubs triage) — largest, most judgment-heavy; do last, coordinate on known-placeholder stubs.

## Cross-plan dependencies
- 3A's org-id error mapping and 3B's DB-row casts overlap **Plan 2** (tenancy) — sequence so
  tenant fields survive the mapper rewrite.
- `CrossPlaneGuard` (3G) is also referenced by Plan 2 §2D context — one owner, do it once.
- Test-locking behavior before refactors uses the existing Vitest setup (per repo AGENTS.md).
