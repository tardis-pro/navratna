# PLAN 1 — Boot & Runtime Resilience

> **Theme:** Kill every "silent death" and "silent 500." Today the fleet can die at ESM
> import time with **zero logs**, `process.exit(1)` before the log sink flushes, or serve
> a route that 500s on **every** request because of a TypeBox format footgun. This plan
> makes boot deterministic, observable, and fail-loud-with-a-reason.
>
> **Source:** Tech-debt audit 2026-07-18 (5 parallel explore agents + direct rg census).
> **Scope:** `navratna/` monorepo. **Owner:** backend/platform.
> **Status legend:** ☐ todo · ◐ in progress · ☑ done

---

## Why this group

Three failure classes, one shared symptom — the container dies or degrades and the Fly
dashboard shows **nothing useful**:

1. **Module-load-time throws** — code that runs during `import`, before `main()`, before
   the logger exists. Miss one env var → logless death.
2. **Fatal-exit sprawl** — 35 `process.exit()` sites; many fire before Winston (async)
   flushes, so the crash reason is dropped.
3. **Elysia/TypeBox footguns** — routes registered after `.listen()` are never served;
   `t.String({ format: 'uuid'|'email' })` 500s on every request in the prod Bun AOT build;
   static routes shadowed by `/:param` wildcards return 404.

These are grouped together because they share a **remediation shape**: move work out of
import time, validate loudly in one place, and make `/health` tell the truth.

---

## Evidence summary (counts)

| Finding | Count | Worst offenders |
|---|---|---|
| Module-scope `throw` (die on import) | 3 IIFE + 1 `process.exit` at module scope | `apps/shared/config/src/config.ts:513/520/526`; `capability-registry/src/config/config.ts:100–106` |
| `process.exit()` sites | 35 total (12 service entrypoints + 2 real debt) | all `services/*/src/index.ts`; `middleware/src/metrics.ts:388`; `production_hardening_service.ts` |
| Module-scope singletons w/ side effects (timers/crypto/I-O) | ~18 | `production_hardening_service.ts:980` (2× setInterval + SIGTERM on import); `api_key_auth.ts:407` (7× crypto.randomBytes on import) |
| `dotenv.config()` at module scope | 2 | `config.ts:10–11` |
| TypeBox `format:` → prod-500 | 2 live (+1 already fixed) | `github_app_installation_routes.ts:56` (uuid); `workspace_routes.ts:165` (uuid) |
| Route shadowing (static after wildcard) | 3 confirmed | `knowledge_elysia.ts` `/:itemId`↔`/tags/:tag`; gateway `/api/v1/projects/analytics` |
| Duplicate route registration | 3 confirmed | gateway `/api/v1/projects` (security shadows orchestration); `/health` ×2 |
| `setupEventSubscriptions` ordering | 2 | subscriptions fire before `initialize()`; gateway 1500ms socket-auth timeout tax |

---

## Workstream 1A — Fail-fast env validation (eliminates logless death)

**Problem.** `config.ts` lines 513/520/526 are IIFE throws evaluated while the
`export const config = {…}` object literal is being constructed — i.e. at **import time**.
`@uaip/config` is imported by every service, so a missing `JWT_SECRET` /
`JWT_REFRESH_SECRET` / `DELETION_HASH_SALT` kills the process during ESM graph resolution,
before any logger exists → **no output on Fly**. (Memory #2454 documents this exact class.)

**Fix.**
- ☐ In `apps/shared/config/src/config.ts`: replace the 3 IIFE throws with tolerant reads
  (`process.env.X ?? ''`). Importing config must NEVER throw.
- ☐ Add `apps/shared/config/src/validateEnv.ts` exporting `validateRequiredEnv(): void`
  that checks all hard-required vars and prints a **single readable manifest** of every
  missing var (not just the first), then `process.exit(1)` with `console.error` (sync).
- ☐ Call `validateRequiredEnv()` as the **first statement** of each service entrypoint
  (`apps/backend/services/*/src/index.ts`), before any other import that touches config.
- ☐ Include the non-config hard blocker too: `POSTGRES_URL` (Postgres is the only other
  hard boot blocker per memory #2456).
- ☐ Required-var registry must document each var's owning service (e.g. `NEO4J_*` only
  required by capability-registry, see 1B).

**Acceptance.** Booting with a missing secret prints
`FATAL missing env: JWT_REFRESH_SECRET, DELETION_HASH_SALT` and exits 1 — visible in
`fly logs`. Importing `@uaip/config` with vars absent does **not** throw.

---

## Workstream 1B — Remove module-scope `process.exit` in capability-registry

**Problem.** `capability-registry/src/config/config.ts:100–106` runs `validateConfig()` in a
module-scope try/catch that calls `process.exit(1)` on missing `NEO4J_*`. Any importer of
this config (or `@uaip/capability-registry`) exits at import time.

**Fix.**
- ☐ Delete the module-scope try/catch + `process.exit`.
- ☐ Move the Neo4j-cred check into `validateRequiredEnv()` (1A), scoped to the gateway
  process only (capability-registry is consolidated into navratna-gateway).
- ☐ Reconcile the **two** competing config modules in this service
  (`src/config/config.ts` + `src/config/index.ts`) — see Plan 2, config consolidation.

**Acceptance.** Importing capability-registry code never exits the process.

---

## Workstream 1C — Flush-before-exit for all fatal paths

**Problem.** 12 service entrypoints + `base_service.ts:501` call `process.exit(1)` in
`catch`. Winston transports are async → the last error log is frequently dropped, so Fly
shows exit code 1 with no reason.

**Fix.**
- ☐ Add a `fatalExit(err, logger)` helper in `@uaip/utils`: `console.error` (sync) the
  error + stack, attempt `await logger.flush?.()` with a short timeout, then `process.exit(1)`.
- ☐ Replace every service-entrypoint `catch { … process.exit(1) }` with `await fatalExit(...)`.
- ☐ `apps/shared/middleware/src/metrics.ts:388` — metrics init failure must **degrade**,
  not `process.exit(1)`. Downgrade to `logger.error` + disable metrics.
- ☐ Audit `production_hardening_service.ts` `process.exit(0)` mid-flow (agent flagged a
  non-startup exit at ~line 897) — confirm intentional or remove.

**Acceptance.** Every crash leaves a synchronous `console.error` with the reason in Fly logs.

---

## Workstream 1D — De-side-effect module-scope singletons

**Problem.** Importing certain modules does real work immediately:
- `production_hardening_service.ts:980` — `export const productionHardening = new …()` starts
  **two `setInterval` timers** and registers a SIGTERM handler that `process.exit(0)` 5s after
  signal — on import, even in tests.
- `api_key_auth.ts:407` — constructor runs `crypto.randomBytes(16)` ×7 on import, generating
  non-deterministic key IDs each restart.
- ~15 route/service files instantiate services or resolve `getInstance()` at module scope
  (`tool_preferences_elysia.ts:8`, `persona_elysia.ts:13`, `llm_agent_provider_routes.ts:8`,
  `artifact_factory.ts:371`, `onboarding_routes.ts:23–24`, `conversation_flow_service.ts:171`, …).

**Fix.**
- ☐ `production_hardening_service.ts` — export the **class**, not a constructed instance.
  Each service constructs it inside `initialize()` and disposes timers in `shutdown()`.
- ☐ `api_key_auth.ts` — move `initializeDefaultKeys()` out of the constructor into an
  explicit `init()` called from service startup; keys deterministic from config/secret.
- ☐ Route files — move `new Service()` / `getInstance()` out of module scope into the route
  factory function body (or inject via params). No side-effectful construction at import.
- ☐ **Verify (do not assume):** `redis_cache_service.ts:325` `getInstance()` — confirm the
  constructor does NOT `new Redis()` (must defer to `initialize()`). `pgService`, `drizzleService`,
  `serviceFactory` were confirmed lazy/safe by the audit — leave as-is.

**Acceptance.** Importing any module opens no connections, starts no timers, spawns no crypto
work, and registers no signal handlers. Side effects happen only inside explicit `init()`/`start()`.

---

## Workstream 1E — TypeBox format footguns (every-request 500s)

**Problem.** `t.String({ format: 'uuid' })` (and `'email'`, etc.) is unregistered in
TypeBox's `FormatRegistry` in the prod Bun AOT build → the compiled validator rejects
**every** body, 500ing the route regardless of input. Two live prod-500s:
- `github_app_installation_routes.ts:56` — `userId: t.String({ format: 'uuid' })`
- `workspace_routes.ts:165` — `bindingId: t.String({ minLength: 1, format: 'uuid' })`
  → **every coding-session start 500s** in prod.
(`auth_elysia.ts` `format:'email'` was already fixed — keep as the reference pattern.)

**Fix.**
- ☐ Register formats globally at startup: in a shared bootstrap, `FormatRegistry.Set('uuid', …)`,
  `FormatRegistry.Set('email', …)`, `FormatRegistry.Set('date-time', …)` — one place, imported
  by both consolidated services before route registration. **This is the durable fix** (any
  future `format:` use just works).
- ☐ AND swap the 2 live sites to `pattern:` regex now (immediate unblock), matching the
  `installationId`/`repositoryId` pattern already used in the same file.
- ☐ Add a lint/CI grep gate: fail the build if `format:\s*'…'` appears without the registry
  bootstrap present.

**Acceptance.** A build-time check enforces formats are registered; the 2 endpoints accept
valid UUIDs. Add a boot smoke test (1G) that POSTs a valid UUID and asserts non-500.

---

## Workstream 1F — Route ordering & duplicate registration

**Problem.**
- **Shadowing:** static routes registered after `/:param` wildcards are unreachable.
  Confirmed: `knowledge_elysia.ts` (`/:itemId` before `/tags/:tag`); gateway
  `/api/v1/projects/analytics` shadowed by security-gateway's `/:projectId`.
- **Duplicates:** `/api/v1/projects` group registered by **both** security-gateway and
  orchestration features in navratna-gateway → security wins, orchestration's
  `POST /projects`, `GET /projects`, `/analytics`, `GET /:projectId` are silently dead.
  `GET /health` registered twice (latent test risk).

**Fix.**
- ☐ Full ordering audit of `knowledge_elysia.ts` (1316 lines): every static route must
  precede same-depth `/:param` in the same group. Reorder offenders.
- ☐ Resolve the `/api/v1/projects` collision: pick ONE canonical project router. Either
  remove `registerProjectRoutes` from the security feature, or namespace it (`/api/v1/pm/projects`).
  Verify `GET /api/v1/projects/analytics` is reachable after the fix.
- ☐ De-dupe `POST /api/v1/projects/:projectId/tasks` (registered in both `task_routes.ts:22`
  and `project_routes.ts:326`).
- ☐ Add a startup assertion (dev/CI mode) that scans the compiled route table for
  `(METHOD, path)` duplicates and static-after-wildcard shadows, and logs warnings.

**Acceptance.** No `(method, path)` duplicate in the route table; shadowed endpoints
reachable; a CI check guards against regressions.

---

## Workstream 1G — Boot smoke check in the deploy path (prevents drift)

**Problem.** The `format:'email'` 500 and the RS256/Worker drift (#2776) both shipped
because **nothing exercised boot before deploy**. Symptom-fixing won't hold without a gate.

**Fix.**
- ☐ Add a `scripts/boot-smoke.sh` that builds the runtime image and boots it with dummy
  env, asserting the process reaches `"listening on port"` within N seconds (module-load
  throws fail here, on the dev machine, not prod). Reuse the multi-stage runtime image from
  `deploy/fly/Dockerfile.{core,gateway}`.
- ☐ Extend it to hit `/health` and a couple of representative routes (including one
  `format`-validated POST) and assert non-500.
- ☐ Wire it as a preflight in `deploy/fly/fast-deploy.sh` (opt-out via env for hotfixes).

**Acceptance.** `fast-deploy.sh` refuses to deploy an image that can't boot + serve `/health`.

---

## Workstream 1H — Honest health & startup ordering

**Problem.** `base_service.ts` `start()` is all-or-nothing: any throw in
`initializeDatabase()`/`initializeEventBus()`/`initialize()`/`setupRoutes()` → `process.exit(1)`.
A transient managed-DB cold start (Neon/Supabase waking) kills the machine. Also
`setupEventSubscriptions()` runs (via `initializeEventBus`) **before** `initialize()`, so a
BullMQ message can hit a handler whose service isn't constructed yet; and navratna-gateway's
empty subscriptions impose a 1500ms socket-auth timeout tax per connection.

**Fix.**
- ☐ Wrap `initializeDatabase()` in bounded retry-with-backoff (e.g. 5 attempts / ~15s) so a
  transient DB blip degrades instead of killing the machine. Redis/Neo4j/Qdrant already
  non-fatal (#2456) — keep, but ensure `/health` reports `degraded` vs `dead` distinctly so
  Fly's healthcheck distinguishes "starting" from "broken."
- ☐ Restructure `start()` so event subscriptions are registered **after** `initialize()`
  (service state ready), not inside `initializeEventBus()`. Preserve the listen()-LAST rule
  (memory #2462 — routes after `.listen()` are never served).
- ☐ Investigate the navratna-gateway `security.auth.validate` event gap (1500ms socket-auth
  fallback tax): either wire the handler or make the HTTP path primary (no 1500ms wait).

**Acceptance.** A cold managed DB no longer kills boot; `/health` returns `degraded` while
deps connect and `200` when ready; no handler executes before its service is initialized.

---

## Suggested execution order

1. **1A + 1B** (fail-fast env; kills the logless-death class) — highest leverage, low risk.
2. **1E** (TypeBox 500s) — 2 endpoints are broken in prod *right now*.
3. **1F** (route dupes/shadows) — orchestration project routes are dead in prod *right now*.
4. **1C + 1G** (flush-before-exit + boot smoke gate) — makes the above durable.
5. **1D** (de-side-effect singletons) — larger surface, do after the acute fixes.
6. **1H** (retry + honest health + ordering) — the "make it genuinely resilient" capstone.

## Cross-plan dependencies
- Env consolidation detail lives in **Plan 2** (config sprawl). 1A defines the *required*
  set; Plan 2 removes the *sprawl*.
- The `@ts-expect-error` route-context pattern (also touched by 1F) is owned by **Plan 2 §2E**.
