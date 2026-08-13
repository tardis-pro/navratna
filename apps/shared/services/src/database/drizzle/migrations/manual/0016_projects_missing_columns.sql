-- Idempotent: adds the projects columns declared in control_schema.ts that were
-- never pushed to prod (verified 2026-08-13: prod had only the github_* set).
-- Safe to apply twice.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "slug" varchar(32);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "visibility" varchar(50) NOT NULL DEFAULT 'private';
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "git_provider" varchar(50);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tags" jsonb;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "file_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "artifact_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "total_size_bytes" integer NOT NULL DEFAULT 0;

-- Backfill slug for pre-existing rows with a deterministic 8-char value derived
-- from the row id, then enforce NOT NULL to match the schema declaration.
UPDATE "projects"
SET "slug" = UPPER(SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 8))
WHERE "slug" IS NULL;

ALTER TABLE "projects" ALTER COLUMN "slug" SET NOT NULL;
