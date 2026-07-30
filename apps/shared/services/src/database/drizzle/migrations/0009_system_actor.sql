-- Ensure the system actor identity exists.
--
-- Platform-initiated work (workflow firing, RDLO approval gates, the dev loop)
-- creates operations with no human actor. operations.agent_id is verified by
-- CrossPlaneGuard, so without these rows those flows fail closed.
--
-- Delivered as a migration, not a seeder: DatabaseSeeder.seedAll() refuses to
-- run in production, so a seeder can never deliver a production-required row.
--
-- DO UPDATE rather than DO NOTHING on users: a row left active, or with a
-- usable password hash by an earlier partial run, would stay exploitable.
-- is_active=false is what makes the account unauthenticatable.

INSERT INTO "organizations" ("id", "name", "slug")
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

INSERT INTO "users" ("id", "email", "first_name", "last_name", "role", "organization_id", "password_hash", "is_active")
VALUES (
  '00000000-0000-0000-0000-0000000000a1',
  'system@uaip.internal',
  'System',
  'Actor',
  'system',
  '00000000-0000-0000-0000-000000000001',
  'x',
  false
)
ON CONFLICT ("id") DO UPDATE
  SET "is_active" = false,
      "password_hash" = 'x',
      "email" = EXCLUDED."email",
      "role" = 'system',
      "organization_id" = EXCLUDED."organization_id";
--> statement-breakpoint

-- personas before agents: agents.persona_id is NOT NULL and references personas.id
INSERT INTO "personas" ("id", "name", "role", "description", "background", "system_prompt", "created_by", "organization_id")
VALUES (
  '00000000-0000-0000-0000-0000000000a2',
  'System',
  'system',
  'Platform-initiated work',
  'Automated platform actor.',
  'You are the platform system actor.',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

INSERT INTO "agents" ("id", "name", "description", "role", "persona_id", "intelligence_config", "security_context", "created_by", "organization_id", "is_active")
VALUES (
  '00000000-0000-0000-0000-0000000000a3',
  'System',
  'Platform-initiated work',
  'assistant',
  '00000000-0000-0000-0000-0000000000a2',
  '{}'::jsonb,
  '{}'::jsonb,
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000001',
  true
)
ON CONFLICT ("id") DO UPDATE
  SET "is_active" = true,
      "persona_id" = EXCLUDED."persona_id",
      "organization_id" = EXCLUDED."organization_id";
