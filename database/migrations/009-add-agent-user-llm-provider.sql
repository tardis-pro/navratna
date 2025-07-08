-- Migration: Add user_llm_provider_id to agents table
-- Created: 2025-01-08
-- Description: Add user LLM provider reference to agents table for agent-specific provider configuration

BEGIN;

-- Add user_llm_provider_id column to agents table
ALTER TABLE agents 
ADD COLUMN user_llm_provider_id UUID REFERENCES user_llm_providers(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX idx_agents_user_llm_provider_id ON agents(user_llm_provider_id);

-- Add comment for documentation
COMMENT ON COLUMN agents.user_llm_provider_id IS 'Reference to user LLM provider for agent-specific model configuration';

COMMIT;