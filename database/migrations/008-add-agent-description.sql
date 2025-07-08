-- Migration: Add description column to agents table
-- Created: 2025-01-08
-- Description: Add description field to agents table to match API schema

BEGIN;

-- Add description column to agents table
ALTER TABLE agents 
ADD COLUMN description TEXT;

-- Update any existing agents to have null description initially
-- (This is safe since we made the column nullable)

-- Add comment for documentation
COMMENT ON COLUMN agents.description IS 'Optional description of the agent for user reference';

COMMIT;