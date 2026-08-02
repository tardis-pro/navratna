# PLAN 2 — Tenancy, Config & Security Integrity

> **Theme:** The platform *looks* multi-tenant and *looks* like it centralizes config, but
> both are hollow. Tenant isolation is enforced **nowhere** at the DB layer (RLS is inert),
> a hardcoded `ADMIN_ORG_ID` is the silent catch-all for every unresolved org, and secrets
> have production-live default fallbacks. This is the enterprise-readiness and security
> blocker group.
>
> **Source:** Tech-debt audit 2026-07-18 (config/tenancy + error-handling agents + direct census).
> **Scope:** `navratna/` monorepo. **Owner:** platform/security.
> **Status legend:** ☐ todo · ◐ in progress · ☑ done

---

## Why this group

These findings are one story: **who are you, which tenant are you, and where does that come
from.** Config sprawl (471 raw `process.env` reads) and silent credential fallbacks feed
directly into the tenancy problem — the same `ADMIN_ORG_ID` default that appears in config
also appears as the schema default on 9 tables and as the fallback in auth token minting.
Fixing them separately would be whack-a-mole; they must move together.

Ties to existing memory: #2712 (RLS half-applied in prod — columns exist, policies never
pushed), #2720 (RLS migration files exist outside the Drizzle journal, no tenant-provisioning
API), #2782 (org_id NOT NULL but create paths omit it → 23502 mislabeled as 400).

---

## Evidence summary (counts)

| Finding | Count | Worst offenders |
|---|---|---|
| Direct `process.env` outside `@uaip/config` | ~55 files / ~170 meaningful reads (471 raw incl. config internals) | `discussion/src/config/index.ts` (~55); `capability-registry` has TWO config modules; all `*_adapter.ts` |
| Silent-fallback **credentials/secrets/URLs** | 11 critical | `config.ts:572` `ENCRYPTION_KEY \|\| 'uaip_dev_…change_in_production'`; `config.ts:339/373` hardcoded Redis pw; `working_memory_manager.ts:11` pw-in-URL; `l_l_m_service.ts:186` LAN IP `192.168.1.9` |
| Postgres credential **drift** (3 different defaults) | 3 chains | `@uaip/config` `postgres/password/council_nycea` vs Drizzle `uaip_user/uaip_password/uaip` (×2 files) |
| Hardcoded `ADMIN_ORG_ID` / `00000…001` | 30+ call sites / 13 files (144 raw hits) | `intelligence_schema.ts` `.default(ADMIN_ORG_ID)` ×9 tables; `auth_middleware.ts:62/212`; `enhanced_auth_service.ts:878`; all knowledge-graph services |
| INSERTs omitting `organizationId` | 16 suspicious sites | `semantic_index_service.ts:36–54`; `drift_detection_service.ts:256`; `workflow_executor_service.ts` (SYSTEM_ID as userId) |
| `@ts-expect-error ctx.user.*` auth bypass | 34 occurrences / 10 files | `discussion_routes.ts` (7); `llm_agent_provider_routes.ts` (6); `persona_routes.ts` (5) |
| RLS / `app.tenant_id` set per request | **0 production call sites** | `withTenantContext`/`withTenantDb` defined but never mounted |

---

## Workstream 2A — Kill silent credential/secret fallbacks (security-critical)

**Problem.** Missing env silently swaps in a **production-live default** secret. Worst:
- `config.ts:572` — `ENCRYPTION_KEY || 'uaip_dev_encryption_key_change_in_production'`.
  AES-256-GCM key. Any prod instance that missed this var encrypts with a **public string**.
- `config.ts:339` `REDIS_PASSWORD || 'uaip_redis_password'`; `config.ts:373` fully hardcoded
  `password: 'uaip_redis_password'` (no env at all).
- `working_memory_manager.ts:11` — `REDIS_URL || 'redis://:uaip_redis_password@redis:6379'`
  → password lands in any log line that prints the URL.
- `l_l_m_service.ts:186` — `LLM_STUDIO_URL || 'http://192.168.1.9:1234'` → prod silently
  points at a developer's LAN box.
- `oauth_elysia.ts:20` — `OAUTH_CALLBACK_URL || 'https://api.navratna.tardis.digital/…'`
  → staging silently uses prod callback.

**Fix.**
- ☐ Every secret/credential must be **required-or-throw** via the `validateRequiredEnv()`
  gate from Plan 1 §1A. Add `ENCRYPTION_KEY`, `REDIS_PASSWORD` to the required set. No
  in-code default secret, ever.
- ☐ Remove the hardcoded `192.168.1.9` and all embedded-password default URLs. URLs with no
  safe default become required env (no fallback).
- ☐ Grep gate in CI: fail build on a string literal that looks like a secret/password/private
  IP in a `|| '…'` / `?? '…'` position.

**Acceptance.** Booting prod without a real `ENCRYPTION_KEY`/`REDIS_PASSWORD` fails loudly
(Plan 1 manifest). No secret or LAN IP appears as an in-code default. Rotate any secret that
was ever the dev default.

---

## Workstream 2B — Consolidate config through `@uaip/config` (end the sprawl)

**Problem.** ~55 files read `process.env` directly, violating the "all env via `@uaip/config`"
convention. capability-registry has **two** competing config modules; discussion has a third
(~55 reads). Same var drifts across files (below).

**Fix.**
- ☐ Extend `@uaip/config` with typed sub-sections: `integrations` (`JIRA_*`, `GITHUB_*`,
  `SLACK_*`, `CONFLUENCE_*`, `NOTION_*`, `CANVA_*`, `TWILIO_*`, `SENTRY_*`, `OPENAI_*`,
  `TEI_*`, `EMBEDDINGS_*`), `redis.ws`, `oauth`, `mesh`.
- ☐ Migrate the ~55 files to read from `config.*`. Delete `capability-registry/src/config/*`
  and `discussion/src/config/index.ts` duplicates; re-point importers.
- ☐ Add a lint rule / CI grep: `process.env.` is only permitted inside `apps/shared/config/`.

**Acceptance.** `rg 'process\.env\.' apps | grep -v apps/shared/config` returns near-zero
(only the intentional bootstrap in the entrypoint before config import).

---

## Workstream 2C — Fix Postgres credential drift (data-integrity trap)

**Problem.** Three different default credential sets. `@uaip/config` defaults
`postgres/password/council_nycea`; Drizzle clients + `drizzle.config.ts` default
`uaip_user/uaip_password/uaip`. Whichever import path wins silently changes which DB you hit
(memory #2455). `clients/index.ts:141` even falls back the *URL* to the string `'localhost'`.

**Fix.**
- ☐ Single source of truth: `drizzle/clients/index.ts` and `drizzle.config.ts` must read the
  Postgres URL from `@uaip/config`, not raw env with their own defaults.
- ☐ Remove all default credentials; `POSTGRES_URL` is required (Plan 1 gate).
- ☐ Delete the `'localhost'` string fallback at `clients/index.ts:141`.

**Acceptance.** Exactly one place resolves Postgres connection info; no default credentials
anywhere; missing `POSTGRES_URL` fails at the boot gate.

---

## Workstream 2D — Make tenant isolation real (RLS + per-request context)

**Problem.** The entire RLS layer is **architecturally present but operationally dead**:
- `withTenantContext()` (`tenant_middleware.ts:30`) and `withTenantDb()`
  (`drizzle/clients/index.ts:186–203`) set `app.tenant_id` — but are **called from zero
  production routes** (only a probe job).
- No Postgres policy is ever triggered because the GUC is never set on real requests.
- `intelligence_schema.ts` puts `.default(ADMIN_ORG_ID)` on **9 tables** → any INSERT missing
  `organizationId` silently writes to the admin org at the DB level (a tenant-escape time bomb).
- Prod reality (memory #2712/#2720): org columns exist, but the RLS enable + 32 policies were
  never pushed to Supabase; no tenant-provisioning API exists.

**Fix.**
- ☐ Mount tenant context per request: add an Elysia `.derive()`/plugin that, after
  `withNginxAuth`, opens the request's DB work inside `withTenantDb(orgId, …)` so
  `SET LOCAL app.tenant_id` is set for every query. Wire it into both consolidated services.
- ☐ Land the RLS migration into the numbered Drizzle journal (memory #2720:
  `enable_rls.sql` + `rls_policies.sql` currently outside it) and push to Supabase prod.
  Ensure the app DB role does **not** have `BYPASSRLS`.
- ☐ Remove `.default(ADMIN_ORG_ID)` from the 9 intelligence-plane tables. Missing
  `organizationId` must **error**, not silently default.
- ☐ Build the missing tenant-provisioning HTTP API (org CRUD + `organization_id` assignment)
  — RLS is inert without it (memory #2720). Coordinate with the enterprise-isolation bootstrap
  doc already in `_bmad-output/planning-artifacts/enterprise-isolation-bootstrap.md`.

**Acceptance.** A request scoped to org A cannot read/write org B's rows (verified by a
cross-tenant probe test against prod-shaped RLS). No table carries an `ADMIN_ORG_ID` default.

---

## Workstream 2E — Eliminate `ADMIN_ORG_ID` fallbacks & missing-org INSERTs

**Problem.** `ADMIN_ORG_ID = '00000…001'` is the silent catch-all whenever an org can't be
resolved: `auth_middleware.ts:62/212` (unauth/broken token → admin org),
`enhanced_auth_service.ts:878` + `auth_elysia.ts:277/376` (token minting),
all knowledge-graph services (search/sync default to admin tenant),
`workflow_executor_service.ts:27` (`SYSTEM_ID` used as `userId` for all operations).
Plus 16 INSERT sites that omit `organizationId` entirely (e.g. `semantic_index_service.ts`,
`drift_detection_service.ts` → knowledge items written to admin org for everyone).

**Fix.**
- ☐ Replace fallbacks on **write/auth paths** with fail-closed behavior (memory #1623: agent/
  discussion write paths must fail closed on missing user/org — no `system`/`anonymous`/admin
  fallback). Unresolved org on a write → 401/403, not admin org.
- ☐ Apply the memory #2782 fix pattern to every create route: pull
  `{ id: userId, organizationId } = getNginxUser(ctx)` and pass `organizationId` into the
  create call **and** into the service-layer `createPayload` (some services drop it internally,
  e.g. `AgentIntelligenceService.createAgent`). Sweep the 16 INSERT sites.
- ☐ Read-path defaults (knowledge-graph search) may keep a *scoped* default only after the
  per-request tenant context (2D) is mounted — then the caller always has a real org and the
  hardcoded fallback is deleted.

**Acceptance.** No `00000…001` literal remains on a write/auth path; every create route passes
a real `organizationId`; a request with no resolvable org is rejected, not silently admin'd.

---

## Workstream 2F — Type-safe auth context (retire `@ts-expect-error ctx.user`)

**Problem.** 34 `@ts-expect-error` suppressions across 10 route files inject
`ctx.user.id/role` because Elysia can't infer the middleware-injected user through nested
groups. Some access `user.id` without a null check (`llm_agent_provider_routes.ts:51`). Any
Elysia version bump that changes context propagation silently breaks type safety fleet-wide.

**Fix.**
- ☐ Build a typed `withNginxAuth` plugin/macro that extends the Elysia context type so
  `getNginxUser(ctx)` is the single, type-safe access pattern (it already exists and is used
  in newer routes — make it universal).
- ☐ Delete all 34 `@ts-expect-error` user-context suppressions; route through `getNginxUser`.
- ☐ This directly enables 2E (getNginxUser exposes `organizationId` with the ADMIN_ORG_ID
  fallback centralized in one place we can then fail-close).

**Acceptance.** Zero `@ts-expect-error` for user context; `getNginxUser(ctx)` is the only way
user/org is read in routes; a type error surfaces if the context contract changes.

---

## Suggested execution order

1. **2A** (secret fallbacks) — active security exposure; pair with Plan 1 §1A gate.
2. **2C** (Postgres drift) — quick, removes a data-integrity trap.
3. **2F** (typed auth context) — unblocks 2E cleanly.
4. **2E** (fail-close org + missing-org INSERTs) — closes the tenant-escape write paths.
5. **2D** (RLS live + provisioning API) — the enterprise-readiness capstone; largest effort.
6. **2B** (config consolidation) — broad but mechanical; do continuously alongside the above.

## Cross-plan dependencies
- Required-env gate + flush-before-exit come from **Plan 1** (§1A, §1C).
- `as unknown as` on DB-row→domain casts (some in `oauth_provider_service.ts`) are owned by
  **Plan 3 §3B** but overlap here — coordinate so tenant fields aren't cast away.
