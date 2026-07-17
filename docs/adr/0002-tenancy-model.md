# ADR 0002 — Multi-tenancy model (org-in-JWT + RLS via request transaction)

**Status:** Accepted (2026-07-16). **Context:** Convergence sprint, Wave 3.

## Decision

Tenancy is partitioned by **organization**, carried as the `orgId` claim in the
RS256 access token (ADR 0001), propagated by the edge as `X-User-Org`, and read
into `UserContext.organizationId`. Postgres **Row Level Security** enforces
isolation on the 9 org-scoped intelligence-plane tables.

RLS reads `current_setting('app.tenant_id')`, which is only visible on the
connection it was set on. Therefore every intelligence-plane request runs inside
**one transaction** that sets the GUC, via `runInTenantTransaction(tenantId, fn)`
— it binds the transaction into `AsyncLocalStorage` so `getIntelligenceDb()`
returns it for the whole request. No per-repository change is needed.

Organizations and memberships are created through the admin **provisioning API**
(`/api/v1/organizations`, `/:id/members`), which replaces the prod-throwing
`OrganizationSeed`. `users.organizationId` is the user's active org (what RLS
keys off); `org_members` records membership.

## Non-decisions / boundaries

- `*.tardis.digital` subdomains are **fleet apps**, never tenants. Orgs live in
  the token/DB, not in subdomain space.
- No org-switcher UI / auto-personal-orgs this cycle (the 4 users are one trust
  domain).
- RLS is enabled **last**, via the staged cutover in
  `docs/runbooks/rls-tenant-cutover.md`. Enabling it before the request-transaction
  adoption is complete blacks out the whole plane (all rows share `ADMIN_ORG_ID`
  and a NULL GUC filters everything). Deferred, not skipped.

## Consequences

- Deploy-later work is enumerated in the runbook §2 (adopt `runInTenantTransaction`
  on all intelligence request + background paths; thread tenant into
  knowledge-sync / enhanced-rag / capability paths) and §3 (BYPASSRLS +
  transaction-pooler preflight).
- `CrossTenantProbeJob` is the cutover go/no-go gate.
