-- Script to fix tool_executions table schema mismatch
-- Adds missing columns that are defined in the entity but missing from the database

\echo 'Starting fix for tool_executions table schema mismatch'

-- Start transaction
BEGIN;

-- Add missing columns to tool_executions table
ALTER TABLE tool_executions 
ADD COLUMN IF NOT EXISTS operation_id UUID,
ADD COLUMN IF NOT EXISTS conversation_id UUID,
ADD COLUMN IF NOT EXISTS user_id UUID,
ADD COLUMN IF NOT EXISTS session_id UUID,
ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS user_satisfaction DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS performance_score DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS memory_usage_mb DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS cpu_usage_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS network_bytes_sent INTEGER,
ADD COLUMN IF NOT EXISTS network_bytes_received INTEGER,
ADD COLUMN IF NOT EXISTS security_level VARCHAR(20) DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS compliance_tags JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS audit_trail JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS cancelled_by UUID,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cleanup_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cleanup_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS external_references JSONB,
ADD COLUMN IF NOT EXISTS execution_context JSONB;

-- Create enum for security_level if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'execution_security_level_enum') THEN
        CREATE TYPE execution_security_level_enum AS ENUM ('low', 'medium', 'high', 'critical');
    END IF;
END $$;

-- Update the security_level column to use the enum
ALTER TABLE tool_executions 
ALTER COLUMN security_level TYPE execution_security_level_enum 
USING security_level::execution_security_level_enum;

-- Verify the changes
\echo 'Verifying schema changes...'

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'tool_executions' 
  AND column_name IN (
    'operation_id', 'conversation_id', 'user_id', 'session_id',
    'quality_score', 'user_satisfaction', 'performance_score',
    'memory_usage_mb', 'cpu_usage_percent', 'network_bytes_sent',
    'network_bytes_received', 'security_level', 'compliance_tags',
    'audit_trail', 'cancelled_at', 'cancelled_by', 'cancellation_reason',
    'cleanup_completed', 'cleanup_at', 'tags', 'external_references',
    'execution_context'
  )
ORDER BY column_name;

\echo 'tool_executions table schema fix completed successfully!'

-- Commit transaction
COMMIT; 