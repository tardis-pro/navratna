-- Migration: Enable Row Level Security on all intelligence-plane tables
-- Run ONCE per environment by the DB owner / migration user.
--
-- IMPORTANT: The application DB user must NOT have BYPASSRLS.
--   Grant the owner role BYPASSRLS for migrations only; app user must not.
--   RLS is enforced at the role level; a superuser or role with BYPASSRLS
--   bypasses all policies regardless.
--
-- Tables: agents, personas, discussions, discussion_messages, artifacts,
--         knowledge_items, llm_providers, llm_models, short_links
--         (intelligence plane, PC-A)

ALTER TABLE agents          ENABLE  ROW LEVEL SECURITY;
ALTER TABLE agents          FORCE   ROW LEVEL SECURITY;

ALTER TABLE personas        ENABLE  ROW LEVEL SECURITY;
ALTER TABLE personas        FORCE   ROW LEVEL SECURITY;

ALTER TABLE discussions     ENABLE  ROW LEVEL SECURITY;
ALTER TABLE discussions     FORCE   ROW LEVEL SECURITY;

ALTER TABLE discussion_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_messages FORCE  ROW LEVEL SECURITY;

ALTER TABLE artifacts       ENABLE  ROW LEVEL SECURITY;
ALTER TABLE artifacts       FORCE   ROW LEVEL SECURITY;

ALTER TABLE knowledge_items ENABLE  ROW LEVEL SECURITY;
ALTER TABLE knowledge_items FORCE   ROW LEVEL SECURITY;

ALTER TABLE llm_providers   ENABLE  ROW LEVEL SECURITY;
ALTER TABLE llm_providers   FORCE   ROW LEVEL SECURITY;

ALTER TABLE llm_models      ENABLE  ROW LEVEL SECURITY;
ALTER TABLE llm_models      FORCE   ROW LEVEL SECURITY;

ALTER TABLE short_links     ENABLE  ROW LEVEL SECURITY;
ALTER TABLE short_links     FORCE   ROW LEVEL SECURITY;
