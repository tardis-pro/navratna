# Navratna Tech-Debt Remediation — Plan Index

**Audit date:** 2026-07-18
**Method:** 5 parallel `explore` agents (module-load side effects · error-handling & type
safety · stubs/dead-code/migrations · config/env & multi-tenancy · Elysia routing & startup
ordering) + direct `rg`/`ast-grep` census, cross-validated.

This is a **real tech-debt audit**, not the boot-time band-aids that preceded it. It groups
~430+ discrete findings into 3 remediation plans by *remediation shape*, so each can be burned
down as a focused sprint.

## The three plans

| Plan | Theme | What it fixes | Acute prod bugs inside |
|---|---|---|---|
| **[PLAN 1](./PLAN-1-boot-and-runtime-resilience.md)** | Boot & Runtime Resilience | Silent logless deaths (module-load throws), `process.exit` before log flush, module-scope side effects, TypeBox `format:` 500s, route shadowing/dupes, honest health + startup ordering | TypeBox `format:'uuid'` 500s **every** coding-session start & GitHub-App binding; gateway `/api/v1/projects/analytics` unreachable |
| **[PLAN 2](./PLAN-2-tenancy-config-and-security-integrity.md)** | Tenancy, Config & Security Integrity | `ENCRYPTION_KEY`/Redis-pw silent default secrets, Postgres credential drift, config sprawl (~55 files), inert RLS + `ADMIN_ORG_ID` tenant-escape, missing-org INSERTs, `@ts-expect-error` auth bypass | Dev encryption key usable in prod; tenant isolation enforced **nowhere** at DB layer |
| **[PLAN 3](./PLAN-3-type-safety-dead-code-and-migration-debt.md)** | Type Safety, Dead Code & Migration Debt | Error swallowing/mislabeling, `as unknown as` on data paths, `!` in security hotpath, stub services that look functional, TypeORM/RabbitMQ/marketplace/consolidation remnants, build-artifact hygiene | `event_bus` returns HTTP 200 on infra failure; OAuth/security integration tests permanently `describe.skip` |

## Headline numbers (direct census + agents)

- **Boot fragility:** 3 module-scope IIFE throws + 1 module-scope `process.exit`; 35 total
  `process.exit`; ~18 side-effectful module-scope singletons; 2 live TypeBox-format 500s.
- **Tenancy/config:** ~55 files read `process.env` directly (~170 meaningful reads); 11 silent
  credential/secret fallbacks; 3 Postgres credential defaults; **144** raw `ADMIN_ORG_ID` hits
  (30+ real call sites + 9 schema defaults); RLS set on **0** production requests; 16 INSERTs
  omit `organizationId`; 34 `@ts-expect-error` auth bypasses.
- **Type safety/dead code:** 3 empty catches; ~100+ mislabeling catches; ~48 prod `as unknown as`;
  ~32 `!` in critical paths; ~69 stub/TODO items; 11 TypeORM artifacts; 0 RabbitMQ in TS source
  (~8 infra/doc); ~13 marketplace orphans; 280-line dead frontend service; `CrossPlaneGuard`
  never called.

## Suggested global sequencing

1. **Plan 1 §1E + §1F** and **Plan 2 §2A** — things broken/exposed in prod *right now*.
2. **Plan 1 §1A/§1B/§1C/§1G** — fail-fast env + flush-before-exit + boot smoke gate (durable base).
3. **Plan 2 §2C/§2F/§2E/§2D** — Postgres drift → typed auth → fail-close org → live RLS.
4. **Plan 3** — cleanup + hardening, deletions first, stub triage last.
5. **Plan 1 §1D/§1H** and **Plan 2 §2B** — larger surfaces, continuous.

## Related existing artifacts
- `_bmad-output/planning-artifacts/enterprise-isolation-bootstrap.md` — tenancy bootstrap (feeds Plan 2 §2D).
- Project memories: #2454/#2456/#2462 (boot blockers), #2712/#2720/#2782 (RLS + org-id gaps),
  #2455 (Postgres fallback chains), #1587/#1623 (type-location & fail-closed rules).

> Status is tracked inline in each plan with ☐ / ◐ / ☑. Update the plan files as work lands.
