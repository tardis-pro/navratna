-- UAIP Database Initialization Script
-- This script creates the PostgreSQL schema for the Unified Agent Intelligence Platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users and Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    security_clearance VARCHAR(20) DEFAULT 'medium',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Agent Configurations
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    persona JSONB NOT NULL,
    intelligence_config JSONB NOT NULL,
    security_context JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    last_active_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Operations and Execution
CREATE TABLE operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'medium',
    agent_id UUID REFERENCES agents(id),
    user_id UUID REFERENCES users(id),
    plan JSONB NOT NULL,
    context JSONB NOT NULL,
    current_step INTEGER DEFAULT 0,
    progress JSONB DEFAULT '{"completedSteps": 0, "totalSteps": 0, "percentage": 0}',
    results JSONB,
    error TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Permissions System
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    resource VARCHAR(255) NOT NULL,
    operations TEXT[] NOT NULL,
    conditions JSONB,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE user_permissions (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    PRIMARY KEY (user_id, permission_id)
);

-- Approval Workflows
CREATE TABLE approval_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_id UUID REFERENCES operations(id) ON DELETE CASCADE,
    required_approvers UUID[] NOT NULL,
    current_approvers UUID[] DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE approval_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID REFERENCES approval_workflows(id) ON DELETE CASCADE,
    approver_id UUID REFERENCES users(id),
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('approve', 'reject')),
    conditions TEXT[],
    feedback TEXT,
    decided_at TIMESTAMP DEFAULT NOW()
);

-- Capabilities Registry
CREATE TABLE capabilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('tool', 'artifact', 'hybrid')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'disabled', 'experimental')),
    metadata JSONB NOT NULL,
    tool_config JSONB,
    artifact_config JSONB,
    dependencies UUID[],
    security_requirements JSONB NOT NULL,
    resource_requirements JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit Trail
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES users(id),
    agent_id UUID REFERENCES agents(id),
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    details JSONB NOT NULL,
    ip_address INET,
    user_agent TEXT,
    risk_level VARCHAR(20),
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Sessions for JWT token management
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255) UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP DEFAULT NOW()
);

-- Rate limiting
CREATE TABLE rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier VARCHAR(255) NOT NULL,
    limit_type VARCHAR(50) NOT NULL,
    limit_value INTEGER NOT NULL,
    window_seconds INTEGER NOT NULL,
    current_count INTEGER DEFAULT 0,
    reset_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(identifier, limit_type)
);

-- Indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_agents_created_by ON agents(created_by);
CREATE INDEX idx_agents_name ON agents(name);
CREATE INDEX idx_operations_agent_id ON operations(agent_id);
CREATE INDEX idx_operations_user_id ON operations(user_id);
CREATE INDEX idx_operations_status ON operations(status);
CREATE INDEX idx_operations_type ON operations(type);
CREATE INDEX idx_operations_created_at ON operations(created_at);
CREATE INDEX idx_capabilities_type ON capabilities(type);
CREATE INDEX idx_capabilities_status ON capabilities(status);
CREATE INDEX idx_capabilities_name ON capabilities(name);
CREATE INDEX idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX idx_audit_events_timestamp ON audit_events(timestamp);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_session_token ON user_sessions(session_token);
CREATE INDEX idx_rate_limits_identifier ON rate_limits(identifier);

-- Add GIN indexes for JSONB columns
CREATE INDEX idx_agents_persona_gin ON agents USING GIN (persona);
CREATE INDEX idx_agents_intelligence_config_gin ON agents USING GIN (intelligence_config);
CREATE INDEX idx_operations_plan_gin ON operations USING GIN (plan);
CREATE INDEX idx_operations_context_gin ON operations USING GIN (context);
CREATE INDEX idx_operations_results_gin ON operations USING GIN (results);
CREATE INDEX idx_capabilities_metadata_gin ON capabilities USING GIN (metadata);
CREATE INDEX idx_audit_events_details_gin ON audit_events USING GIN (details);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_operations_updated_at BEFORE UPDATE ON operations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_permissions_updated_at BEFORE UPDATE ON permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_approval_workflows_updated_at BEFORE UPDATE ON approval_workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_capabilities_updated_at BEFORE UPDATE ON capabilities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rate_limits_updated_at BEFORE UPDATE ON rate_limits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 