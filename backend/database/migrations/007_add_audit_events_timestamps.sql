-- Migration 007: Add Timestamp Columns to Audit Events
-- This migration adds missing created_at and updated_at columns to the audit_events table

-- Add missing timestamp columns to audit_events table
ALTER TABLE audit_events 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add trigger for updated_at on audit_events table
CREATE TRIGGER update_audit_events_updated_at 
    BEFORE UPDATE ON audit_events 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add index for created_at column for performance
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_updated_at ON audit_events(updated_at);

-- Add comments for documentation
COMMENT ON COLUMN audit_events.created_at IS 'Timestamp when the audit event record was created';
COMMENT ON COLUMN audit_events.updated_at IS 'Timestamp when the audit event record was last updated'; 