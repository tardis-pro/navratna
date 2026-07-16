# RLS Tenant Isolation — Staged Cutover Runbook

**Status:** deploy-later (do NOT run against prod without completing the preflight).
**Owner:** platform. **Blast radius:** the entire intelligence plane. A wrong flip is a **total data blackout** (see §0).

## 0. Why this is dangerous

The RLS policies (`migrations/enable_rls.sql`, `migrations/rls_policies.sql`) filter every
intelligence-plane row by `organization_id = current_setting('app.tenant_id', true)::uuid`.

- Every intelligence row already has `organization_id` NOT NULL (defaults to `ADMIN_ORG_ID`) — there is **no NULL backfill problem**.
- The danger is the opposite: with `FORCE ROW LEVEL SECURITY` and **no `app.tenant_id` set on the connection**, `current_setting(...)` returns NULL and `organization_id = NULL` is false for every row → **every table returns zero rows for every user**. The app looks broken, not leaky.

Therefore RLS must be enabled **only after** every intelligence-plane request runs inside a transaction that sets `app.tenant_id`.

## 1. What is already in place (code)

- **`runInTenantTransaction(tenantId, fn)`** (`apps/shared/services/.../drizzle/clients/index.ts`): opens ONE intelligence-plane transaction, runs `set_config('app.tenant_id', $1, true)` (parameterized), and binds the transaction into `AsyncLocalStorage`. `getIntelligenceDb()` returns that transaction inside `fn`, so **all existing repository code runs on the tenant connection with the GUC set** — no per-repo changes.
- **`createTenantMiddlewarePlugin(runInTenant)`** (`@uaip/middleware`): exposes `setTenantContext(fn)` on the request context, calling `runInTenant(user.organizationId, fn)`.
- **Org propagation**: the RS256 access token carries `orgId`; the edge worker injects `X-User-Org`; `attachNginxAuth` reads it into `UserContext.organizationId` (falls back to `ADMIN_ORG_ID`).
- **Provisioning**: `POST /api/v1/organizations` + `/:id/members` (admin) create orgs and assign users (`users.organizationId` + `org_members`).
- **RLS scripts** cover all **9** org-scoped intelligence tables (incl. `discussion_messages`).
- **Verification gate**: `CrossTenantProbeJob` (`security-gateway/src/jobs/cross_tenant_probe_job.ts`) is wired and runs every 6h.

## 2. Remaining work BEFORE enabling RLS (not yet done)

1. **Adopt tenant context on intelligence routes.** Wrap intelligence-plane request handling in `runInTenantTransaction` (via the middleware or a composition-root wrap in `navratna-core`) so the GUC is set for every read/write. Until this is done, enabling RLS blackouts the plane.
   - Recommended: mount `createTenantMiddlewarePlugin(runInTenantTransaction)` in the navratna-core composition and wrap intelligence route groups so the handler executes inside `setTenantContext`.
2. **Thread tenant into background/service paths that bypass request context** (they will read/write with no GUC → blocked by RLS once on):
   - `knowledge_sync_service.ts` (syncs as `tenantId='system'`, org `undefined`; TODOs ~:318/:581)
   - `enhanced_rag_service.ts:~90` (hardcoded placeholder org UUID)
   - `capability_controller.ts:~197` (securityContext has no org)
   - Any BullMQ worker / cron that writes intelligence tables must run inside `runInTenantTransaction` for the relevant org, or use a role with `BYPASSRLS` **only** for system maintenance jobs (documented + audited).

## 3. Preflight (prod, read-only checks)

1. **App DB role must NOT have `BYPASSRLS`** (else policies are ignored entirely):
   ```sql
   SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user;
   ```
   Both `rolbypassrls` and `rolsuper` must be false for the app role. Grant `BYPASSRLS` to a **separate migration/owner role** used only to apply these scripts.
2. **Confirm pooler mode.** Prod Postgres is the Supabase pooler. If it is **transaction mode (port 6543)**, `set_config(..., true)` is transaction-local and safe **only** because `runInTenantTransaction` wraps the whole request in one transaction (§1). Ad-hoc `SET LOCAL` outside an explicit transaction would NOT survive on a transaction-pooled connection. Verify the app connects with `runInTenantTransaction` in the path before flipping. Session mode (5432) is also fine.
3. **Confirm every org-scoped row has a real `organization_id`** (no stray other value):
   ```sql
   SELECT count(*) FROM agents WHERE organization_id IS NULL;  -- expect 0 (repeat per table)
   ```

## 4. Cutover (low-traffic window)

Nothing auto-applies these files (there is no `drizzle:migrate` script). Apply manually as the **owner/migration role**:

```bash
psql "$POSTGRES_URL_MIGRATION" -f apps/shared/services/src/database/drizzle/migrations/enable_rls.sql
psql "$POSTGRES_URL_MIGRATION" -f apps/shared/services/src/database/drizzle/migrations/rls_policies.sql
```

Then verify (as the migration role):
```sql
SELECT count(*) FROM pg_policies WHERE policyname LIKE 'tenant_isolation_%';  -- expect 36 (9 tables x 4)
SELECT relname FROM pg_class WHERE relrowsecurity;                            -- expect the 9 tables
```

## 5. Post-cutover verification (as the APP role, through the edge)

1. **No blackout:** an authenticated user in org A can list their agents/discussions/artifacts (non-empty where they have data). If everything is empty, the GUC is not being set → **roll back immediately** (§6) and finish §2.
2. **Isolation:** create a second org B with its own user; confirm B sees none of A's rows and vice-versa.
3. **Probe gate:** `CrossTenantProbeJob` reports green (no cross-tenant reads).
4. Manual probe:
   ```sql
   SELECT set_config('app.tenant_id', '<org-A-uuid>', true);
   SELECT count(*) FROM agents;   -- only org-A rows
   ```

## 6. Rollback

```sql
ALTER TABLE agents              DISABLE ROW LEVEL SECURITY;
-- ...repeat for personas, discussions, discussion_messages, artifacts,
--    knowledge_items, llm_providers, llm_models, short_links
```
Policies can be left in place (inert while RLS is disabled) or dropped:
```sql
DROP POLICY IF EXISTS tenant_isolation_select ON agents;  -- etc.
```

## 7. Sequencing summary

`provisioning API (done)` → `adopt runInTenantTransaction on all intelligence paths (§2.1)` →
`thread background/service tenants (§2.2)` → `preflight (§3)` → `apply RLS (§4)` →
`verify no-blackout + isolation via probe (§5)`. RLS is the LAST step, never the first.
