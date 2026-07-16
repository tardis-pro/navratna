-- Migration: RLS tenant isolation policies for all 9 intelligence-plane tables
-- Run AFTER enable_rls.sql and AFTER all organization_id columns are uuid type.
--
-- Policy predicate: organization_id = current_setting('app.tenant_id', true)::uuid
--   Set per-request via: SET LOCAL app.tenant_id = '<org-uuid>';
--   The `true` argument makes current_setting() return NULL instead of raising
--   an error when the variable is not set, so requests without a tenant context
--   produce no rows rather than a runtime error.
--
-- Policy names follow: tenant_isolation_{select|insert|update|delete}
--
-- IMPORTANT: App DB user must NOT have BYPASSRLS — RLS is bypassed entirely
--   for roles with BYPASSRLS regardless of these policies.

-- ─── agents ───────────────────────────────────────────────────────────────

CREATE POLICY tenant_isolation_select ON agents
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_insert ON agents
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_update ON agents
  FOR UPDATE
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_delete ON agents
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

-- ─── personas ─────────────────────────────────────────────────────────────

CREATE POLICY tenant_isolation_select ON personas
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_insert ON personas
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_update ON personas
  FOR UPDATE
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_delete ON personas
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

-- ─── discussions ──────────────────────────────────────────────────────────

CREATE POLICY tenant_isolation_select ON discussions
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_insert ON discussions
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_update ON discussions
  FOR UPDATE
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_delete ON discussions
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

-- ─── discussion_messages ──────────────────────────────────────────────────

CREATE POLICY tenant_isolation_select ON discussion_messages
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_insert ON discussion_messages
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_update ON discussion_messages
  FOR UPDATE
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_delete ON discussion_messages
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

-- ─── artifacts ────────────────────────────────────────────────────────────

CREATE POLICY tenant_isolation_select ON artifacts
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_insert ON artifacts
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_update ON artifacts
  FOR UPDATE
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_delete ON artifacts
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

-- ─── knowledge_items ──────────────────────────────────────────────────────

CREATE POLICY tenant_isolation_select ON knowledge_items
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_insert ON knowledge_items
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_update ON knowledge_items
  FOR UPDATE
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_delete ON knowledge_items
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

-- ─── llm_providers ────────────────────────────────────────────────────────

CREATE POLICY tenant_isolation_select ON llm_providers
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_insert ON llm_providers
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_update ON llm_providers
  FOR UPDATE
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_delete ON llm_providers
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

-- ─── llm_models ───────────────────────────────────────────────────────────

CREATE POLICY tenant_isolation_select ON llm_models
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_insert ON llm_models
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_update ON llm_models
  FOR UPDATE
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_delete ON llm_models
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

-- ─── short_links ──────────────────────────────────────────────────────────

CREATE POLICY tenant_isolation_select ON short_links
  FOR SELECT
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_insert ON short_links
  FOR INSERT
  WITH CHECK (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_update ON short_links
  FOR UPDATE
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_delete ON short_links
  FOR DELETE
  USING (organization_id = current_setting('app.tenant_id', true)::uuid);
