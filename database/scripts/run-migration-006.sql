-- ORPHANED RUNNER SCRIPT — DO NOT EXECUTE
--
-- This script references ../migrations/006_add_authentication_columns_and_tables.sql
-- which no longer exists in the repository (was never committed to git).
--
-- Canonical schema initialisation: pnpm --filter @uaip/shared-services drizzle:migrate
-- See: docs/database-hygiene/PM-245-fresh-install-procedure.md
--
-- Retained for historical reference only. Executing this script will fail.

\echo 'ORPHANED SCRIPT — 006_add_authentication_columns_and_tables.sql does not exist. Use Drizzle migrate instead.'
\quit

-- Start transaction
BEGIN;

-- Run the migration
\i ../migrations/006_add_authentication_columns_and_tables.sql

-- Verify the changes
\echo 'Verifying migration results...'

-- Check if columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('password_hash', 'password_changed_at', 'failed_login_attempts', 'locked_until', 'first_name', 'last_name', 'department')
ORDER BY column_name;

-- Check if tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('refresh_tokens', 'password_reset_tokens')
  AND table_schema = 'public';

-- Check if indexes were created
SELECT indexname 
FROM pg_indexes 
WHERE tablename IN ('users', 'refresh_tokens', 'password_reset_tokens')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

\echo 'Migration 006 completed successfully!'

-- Commit transaction
COMMIT; 