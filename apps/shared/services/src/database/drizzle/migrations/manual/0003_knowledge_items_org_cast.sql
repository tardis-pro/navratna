-- Manual migration: knowledge_items.organization_id varchar(36) → uuid
-- Run AFTER applying the Drizzle-generated migration that changes the column type.
-- DO NOT run drizzle-kit push on this file — execute manually via psql.

UPDATE knowledge_items
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL OR organization_id = '';

ALTER TABLE knowledge_items
  ALTER COLUMN organization_id TYPE uuid USING organization_id::uuid,
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
