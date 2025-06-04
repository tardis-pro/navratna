-- Migration: Create Tools Tables
-- Description: Creates tables for the capability registry tools system
-- Author: UAIP Team
-- Date: 2024-12-04

-- Tools table for core tool definitions
CREATE TABLE IF NOT EXISTS tools (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}',
    return_type JSONB,
    security_level VARCHAR(50) DEFAULT 'safe' CHECK (security_level IN ('safe', 'moderate', 'restricted', 'dangerous')),
    requires_approval BOOLEAN DEFAULT FALSE,
    is_enabled BOOLEAN DEFAULT TRUE,
    execution_time_estimate INTEGER DEFAULT 1000,
    cost_estimate DECIMAL(10,4) DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    author VARCHAR(255),
    tags TEXT[] DEFAULT '{}',
    dependencies TEXT[] DEFAULT '{}',
    rate_limits JSONB,
    examples JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tool executions table for tracking execution history
CREATE TABLE IF NOT EXISTS tool_executions (
    id VARCHAR(255) PRIMARY KEY,
    tool_id VARCHAR(255) NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    agent_id VARCHAR(255) NOT NULL,
    parameters JSONB,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'approval-required')),
    result JSONB,
    error_type VARCHAR(100),
    error_message TEXT,
    error_details JSONB,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    execution_time_ms INTEGER,
    cost DECIMAL(10,4),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    approval_required BOOLEAN DEFAULT FALSE,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tool usage records for analytics and monitoring
CREATE TABLE IF NOT EXISTS tool_usage_records (
    id SERIAL PRIMARY KEY,
    tool_id VARCHAR(255) NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    agent_id VARCHAR(255) NOT NULL,
    execution_id VARCHAR(255) REFERENCES tool_executions(id) ON DELETE SET NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    execution_time_ms INTEGER,
    cost DECIMAL(10,4),
    error_type VARCHAR(100),
    parameters_hash VARCHAR(64), -- For pattern analysis without storing sensitive data
    context_tags TEXT[] DEFAULT '{}'
);

-- Tool permissions for agent access control
CREATE TABLE IF NOT EXISTS tool_permissions (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(255) NOT NULL,
    tool_id VARCHAR(255) REFERENCES tools(id) ON DELETE CASCADE,
    permission_type VARCHAR(50) NOT NULL CHECK (permission_type IN ('allow', 'deny', 'require_approval')),
    max_cost_per_hour DECIMAL(10,4),
    max_executions_per_hour INTEGER,
    granted_by VARCHAR(255),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    
    UNIQUE(agent_id, tool_id)
);

-- Tool budgets for cost management
CREATE TABLE IF NOT EXISTS tool_budgets (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(255) NOT NULL UNIQUE,
    daily_limit DECIMAL(10,4),
    hourly_limit DECIMAL(10,4),
    current_daily_spent DECIMAL(10,4) DEFAULT 0,
    current_hourly_spent DECIMAL(10,4) DEFAULT 0,
    daily_reset_time TIMESTAMP WITH TIME ZONE,
    hourly_reset_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category);
CREATE INDEX IF NOT EXISTS idx_tools_enabled ON tools(is_enabled);
CREATE INDEX IF NOT EXISTS idx_tools_security_level ON tools(security_level);
CREATE INDEX IF NOT EXISTS idx_tools_tags ON tools USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_tools_created_at ON tools(created_at);

CREATE INDEX IF NOT EXISTS idx_tool_executions_tool_id ON tool_executions(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_agent_id ON tool_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_status ON tool_executions(status);
CREATE INDEX IF NOT EXISTS idx_tool_executions_start_time ON tool_executions(start_time);
CREATE INDEX IF NOT EXISTS idx_tool_executions_created_at ON tool_executions(created_at);

CREATE INDEX IF NOT EXISTS idx_tool_usage_records_tool_id ON tool_usage_records(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_usage_records_agent_id ON tool_usage_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_tool_usage_records_timestamp ON tool_usage_records(timestamp);
CREATE INDEX IF NOT EXISTS idx_tool_usage_records_success ON tool_usage_records(success);

CREATE INDEX IF NOT EXISTS idx_tool_permissions_agent_id ON tool_permissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_tool_permissions_tool_id ON tool_permissions(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_permissions_active ON tool_permissions(is_active);

CREATE INDEX IF NOT EXISTS idx_tool_budgets_agent_id ON tool_budgets(agent_id);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tools_updated_at BEFORE UPDATE ON tools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tool_budgets_updated_at BEFORE UPDATE ON tool_budgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE tools IS 'Core tool definitions and metadata';
COMMENT ON TABLE tool_executions IS 'Individual tool execution records with results and timing';
COMMENT ON TABLE tool_usage_records IS 'Aggregated usage data for analytics and monitoring';
COMMENT ON TABLE tool_permissions IS 'Agent-specific tool access permissions and limits';
COMMENT ON TABLE tool_budgets IS 'Cost budgets and spending tracking per agent';

COMMENT ON COLUMN tools.parameters IS 'JSON Schema defining tool input parameters';
COMMENT ON COLUMN tools.return_type IS 'JSON Schema defining tool return type';
COMMENT ON COLUMN tools.rate_limits IS 'Rate limiting configuration (maxCallsPerMinute, maxCallsPerHour, etc.)';
COMMENT ON COLUMN tools.examples IS 'Array of example inputs/outputs for documentation';
COMMENT ON COLUMN tool_executions.metadata IS 'Additional execution context and debugging information';
COMMENT ON COLUMN tool_usage_records.parameters_hash IS 'Hash of parameters for pattern analysis without storing sensitive data'; 