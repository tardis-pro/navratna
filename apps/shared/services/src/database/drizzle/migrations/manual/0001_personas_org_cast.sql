-- Manual migration: personas.organization_id varchar → uuid
-- Run AFTER applying the Drizzle-generated migration that adds NOT NULL + DEFAULT.
-- DO NOT run drizzle-kit push on this file — execute manually via psql.

UPDATE personas
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL OR organization_id = '';

ALTER TABLE personas
  ALTER COLUMN organization_id TYPE uuid USING organization_id::uuid,
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
