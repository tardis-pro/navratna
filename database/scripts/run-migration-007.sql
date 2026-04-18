-- ORPHANED RUNNER SCRIPT — DO NOT EXECUTE
--
-- This script references ../migrations/007_add_audit_events_timestamps.sql
-- which no longer exists in the repository (was never committed to git).
--
-- Canonical schema initialisation: pnpm --filter @uaip/shared-services drizzle:migrate
-- See: docs/database-hygiene/PM-245-fresh-install-procedure.md
--
-- Retained for historical reference only. Executing this script will fail.

\echo 'ORPHANED SCRIPT — 007_add_audit_events_timestamps.sql does not exist. Use Drizzle migrate instead.'
\quit

-- Start transaction
BEGIN;

-- Run the migration
\i ../migrations/007_add_audit_events_timestamps.sql

-- Verify the changes
\echo 'Verifying migration results...'

-- Check if columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'audit_events' 
  AND column_name IN ('created_at', 'updated_at')
ORDER BY column_name;

-- Check if indexes were created
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'audit_events'
  AND indexname LIKE 'idx_audit_events_%'
ORDER BY indexname;

-- Check if trigger was created
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'audit_events'
  AND trigger_name = 'update_audit_events_updated_at';

\echo 'Migration 007 completed successfully!'

-- Commit transaction
COMMIT; 