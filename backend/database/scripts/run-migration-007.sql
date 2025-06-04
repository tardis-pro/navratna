-- Script to run Migration 007: Add Timestamp Columns to Audit Events
-- This script adds missing created_at and updated_at columns to audit_events table

\echo 'Starting Migration 007: Add Timestamp Columns to Audit Events'

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