-- =============================================================================
-- Council of Nycea - Security Database Initialization
-- Level 4 Restricted Security Database (Port 5433)
-- SOC 2, HIPAA, PCI DSS, ISO 27001 Compliance
-- =============================================================================

-- Enable required extensions for enterprise security
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- ROW LEVEL SECURITY SETUP
-- =============================================================================

-- Enable RLS globally for this database
ALTER DATABASE uaip_security SET row_security = on;

-- =============================================================================
-- SECURITY SCHEMA CREATION
-- =============================================================================

-- Create security-specific schemas
CREATE SCHEMA IF NOT EXISTS security_core;
CREATE SCHEMA IF NOT EXISTS audit_logs;
CREATE SCHEMA IF NOT EXISTS compliance;
CREATE SCHEMA IF NOT EXISTS access_control;

-- Set search path for security operations
ALTER DATABASE uaip_security SET search_path = security_core, audit_logs, compliance, access_control, public;

-- =============================================================================
-- SECURITY ROLES AND PERMISSIONS
-- =============================================================================

-- Create security-specific roles
DO $$
BEGIN
    -- Security Admin Role (highest privilege)
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uaip_security_admin') THEN
        CREATE ROLE uaip_security_admin WITH LOGIN ENCRYPTED PASSWORD 'uaip_sec_admin_2025_change_in_prod';
    END IF;
    
    -- Security Auditor Role (read-only for compliance)
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uaip_security_auditor') THEN
        CREATE ROLE uaip_security_auditor WITH LOGIN ENCRYPTED PASSWORD 'uaip_sec_auditor_2025_change_in_prod';
    END IF;
    
    -- Security Service Role (for security-gateway service)
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uaip_security_service') THEN
        CREATE ROLE uaip_security_service WITH LOGIN ENCRYPTED PASSWORD 'uaip_sec_service_2025_change_in_prod';
    END IF;
END
$$;

-- Grant schema permissions
GRANT ALL ON SCHEMA security_core TO uaip_security_admin;
GRANT ALL ON SCHEMA audit_logs TO uaip_security_admin;
GRANT ALL ON SCHEMA compliance TO uaip_security_admin;
GRANT ALL ON SCHEMA access_control TO uaip_security_admin;

GRANT USAGE ON SCHEMA security_core TO uaip_security_service;
GRANT USAGE ON SCHEMA audit_logs TO uaip_security_service;
GRANT USAGE ON SCHEMA access_control TO uaip_security_service;

GRANT USAGE ON SCHEMA audit_logs TO uaip_security_auditor;
GRANT USAGE ON SCHEMA compliance TO uaip_security_auditor;

-- =============================================================================
-- SECURITY CORE TABLES
-- =============================================================================

-- User Authentication and Session Management
CREATE TABLE IF NOT EXISTS security_core.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    failed_login_attempts INTEGER DEFAULT 0,
    last_failed_login TIMESTAMP WITH TIME ZONE,
    account_locked_until TIMESTAMP WITH TIME ZONE,
    password_last_changed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_secret TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    data_classification INTEGER DEFAULT 4, -- Level 4 Restricted
    CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES security_core.users(id)
);

-- Enable RLS on users table
ALTER TABLE security_core.users ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for users
CREATE POLICY users_rls_policy ON security_core.users
    FOR ALL TO uaip_security_service
    USING (data_classification <= 4);

-- Sessions Management
CREATE TABLE IF NOT EXISTS security_core.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES security_core.users(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    refresh_token TEXT UNIQUE,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_classification INTEGER DEFAULT 4
);

-- Enable RLS on sessions table
ALTER TABLE security_core.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_rls_policy ON security_core.sessions
    FOR ALL TO uaip_security_service
    USING (data_classification <= 4);

-- OAuth Provider Configuration
CREATE TABLE IF NOT EXISTS security_core.oauth_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    provider_type VARCHAR(100) NOT NULL, -- 'github', 'google', 'microsoft', etc.
    client_id TEXT NOT NULL,
    client_secret_encrypted TEXT NOT NULL, -- Encrypted with enterprise key
    authorization_url TEXT NOT NULL,
    token_url TEXT NOT NULL,
    user_info_url TEXT NOT NULL,
    scopes JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_classification INTEGER DEFAULT 4
);

ALTER TABLE security_core.oauth_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY oauth_providers_rls_policy ON security_core.oauth_providers
    FOR ALL TO uaip_security_service
    USING (data_classification <= 4);

-- OAuth State Management (CSRF protection)
CREATE TABLE IF NOT EXISTS security_core.oauth_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    state_token TEXT UNIQUE NOT NULL,
    provider_id UUID NOT NULL REFERENCES security_core.oauth_providers(id),
    user_id UUID REFERENCES security_core.users(id),
    redirect_uri TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_classification INTEGER DEFAULT 4
);

ALTER TABLE security_core.oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY oauth_states_rls_policy ON security_core.oauth_states
    FOR ALL TO uaip_security_service
    USING (data_classification <= 4);

-- MFA Challenges
CREATE TABLE IF NOT EXISTS security_core.mfa_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES security_core.users(id) ON DELETE CASCADE,
    challenge_type VARCHAR(50) NOT NULL, -- 'totp', 'sms', 'email'
    challenge_data JSONB, -- Type-specific data (encrypted)
    is_verified BOOLEAN DEFAULT false,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE,
    data_classification INTEGER DEFAULT 4
);

ALTER TABLE security_core.mfa_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY mfa_challenges_rls_policy ON security_core.mfa_challenges
    FOR ALL TO uaip_security_service
    USING (data_classification <= 4);

-- =============================================================================
-- ACCESS CONTROL TABLES
-- =============================================================================

-- Roles and Permissions
CREATE TABLE IF NOT EXISTS access_control.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB, -- Array of permission strings
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_classification INTEGER DEFAULT 4
);

ALTER TABLE access_control.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_rls_policy ON access_control.roles
    FOR ALL TO uaip_security_service
    USING (data_classification <= 4);

-- User Role Assignments
CREATE TABLE IF NOT EXISTS access_control.user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES security_core.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES access_control.roles(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES security_core.users(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    data_classification INTEGER DEFAULT 4,
    UNIQUE(user_id, role_id)
);

ALTER TABLE access_control.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_roles_rls_policy ON access_control.user_roles
    FOR ALL TO uaip_security_service
    USING (data_classification <= 4);

-- Agent OAuth Connections
CREATE TABLE IF NOT EXISTS access_control.agent_oauth_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES security_core.users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES security_core.oauth_providers(id),
    provider_user_id TEXT NOT NULL,
    access_token_encrypted TEXT NOT NULL, -- Encrypted with enterprise key
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    scopes JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    data_classification INTEGER DEFAULT 4,
    UNIQUE(agent_id, provider_id)
);

ALTER TABLE access_control.agent_oauth_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_oauth_connections_rls_policy ON access_control.agent_oauth_connections
    FOR ALL TO uaip_security_service
    USING (data_classification <= 4);

-- =============================================================================
-- AUDIT LOGGING TABLES
-- =============================================================================

-- Comprehensive Audit Trail
CREATE TABLE IF NOT EXISTS audit_logs.security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL, -- 'authentication', 'authorization', 'data_access', etc.
    user_id UUID REFERENCES security_core.users(id),
    session_id UUID REFERENCES security_core.sessions(id),
    ip_address INET,
    user_agent TEXT,
    resource_type VARCHAR(100),
    resource_id TEXT,
    action VARCHAR(100) NOT NULL,
    outcome VARCHAR(20) NOT NULL, -- 'success', 'failure', 'error'
    details JSONB,
    risk_score INTEGER, -- 1-100 risk assessment
    compliance_flags JSONB, -- SOC2, HIPAA, PCI flags
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_classification INTEGER DEFAULT 4
);

-- Audit logs are append-only, no RLS needed for compliance
CREATE INDEX idx_audit_events_created_at ON audit_logs.security_events(created_at);
CREATE INDEX idx_audit_events_user_id ON audit_logs.security_events(user_id);
CREATE INDEX idx_audit_events_event_type ON audit_logs.security_events(event_type);
CREATE INDEX idx_audit_events_outcome ON audit_logs.security_events(outcome);

-- Login Attempts Tracking
CREATE TABLE IF NOT EXISTS audit_logs.login_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255),
    email VARCHAR(255),
    ip_address INET NOT NULL,
    user_agent TEXT,
    outcome VARCHAR(20) NOT NULL, -- 'success', 'failure'
    failure_reason VARCHAR(100),
    mfa_used BOOLEAN DEFAULT false,
    session_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_classification INTEGER DEFAULT 4
);

CREATE INDEX idx_login_attempts_created_at ON audit_logs.login_attempts(created_at);
CREATE INDEX idx_login_attempts_ip_address ON audit_logs.login_attempts(ip_address);
CREATE INDEX idx_login_attempts_outcome ON audit_logs.login_attempts(outcome);

-- =============================================================================
-- COMPLIANCE TABLES
-- =============================================================================

-- SOC 2 Control Evidence
CREATE TABLE IF NOT EXISTS compliance.soc2_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    control_id VARCHAR(20) NOT NULL, -- CC6.1, CC6.2, etc.
    evidence_type VARCHAR(100) NOT NULL,
    evidence_data JSONB NOT NULL,
    collection_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    validation_status VARCHAR(20) DEFAULT 'pending',
    validated_by UUID REFERENCES security_core.users(id),
    validated_at TIMESTAMP WITH TIME ZONE,
    retention_until TIMESTAMP WITH TIME ZONE,
    data_classification INTEGER DEFAULT 4
);

-- HIPAA Audit Log
CREATE TABLE IF NOT EXISTS compliance.hipaa_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    safeguard_type VARCHAR(50) NOT NULL, -- 'administrative', 'physical', 'technical'
    safeguard_id VARCHAR(20) NOT NULL, -- §164.312(a)(1), etc.
    user_id UUID REFERENCES security_core.users(id),
    action VARCHAR(100) NOT NULL,
    phi_accessed BOOLEAN DEFAULT false,
    access_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_classification INTEGER DEFAULT 4
);

-- =============================================================================
-- SECURITY FUNCTIONS
-- =============================================================================

-- Function to encrypt sensitive data
CREATE OR REPLACE FUNCTION security_core.encrypt_sensitive_data(data TEXT, key_id TEXT DEFAULT 'default')
RETURNS TEXT AS $$
BEGIN
    -- Use pgcrypto for AES-256 encryption
    RETURN encode(encrypt(data::bytea, key_id, 'aes'), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrypt sensitive data
CREATE OR REPLACE FUNCTION security_core.decrypt_sensitive_data(encrypted_data TEXT, key_id TEXT DEFAULT 'default')
RETURNS TEXT AS $$
BEGIN
    -- Use pgcrypto for AES-256 decryption
    RETURN convert_from(decrypt(decode(encrypted_data, 'base64'), key_id, 'aes'), 'UTF8');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log security events
CREATE OR REPLACE FUNCTION audit_logs.log_security_event(
    p_event_type VARCHAR(100),
    p_event_category VARCHAR(50),
    p_user_id UUID DEFAULT NULL,
    p_session_id UUID DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_resource_type VARCHAR(100) DEFAULT NULL,
    p_resource_id TEXT DEFAULT NULL,
    p_action VARCHAR(100),
    p_outcome VARCHAR(20),
    p_details JSONB DEFAULT NULL,
    p_risk_score INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO audit_logs.security_events (
        event_type, event_category, user_id, session_id, ip_address,
        user_agent, resource_type, resource_id, action, outcome,
        details, risk_score
    ) VALUES (
        p_event_type, p_event_category, p_user_id, p_session_id, p_ip_address,
        p_user_agent, p_resource_type, p_resource_id, p_action, p_outcome,
        p_details, p_risk_score
    ) RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- TRIGGERS FOR AUTOMATIC AUDITING
-- =============================================================================

-- Trigger to log user table changes
CREATE OR REPLACE FUNCTION audit_logs.user_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM audit_logs.log_security_event(
            'USER_CREATED', 'user_management', NEW.id, NULL, NULL, NULL,
            'user', NEW.id::TEXT, 'CREATE', 'success',
            jsonb_build_object('username', NEW.username, 'email', NEW.email)
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM audit_logs.log_security_event(
            'USER_UPDATED', 'user_management', NEW.id, NULL, NULL, NULL,
            'user', NEW.id::TEXT, 'UPDATE', 'success',
            jsonb_build_object('changes', jsonb_build_object(
                'old', to_jsonb(OLD), 'new', to_jsonb(NEW)
            ))
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM audit_logs.log_security_event(
            'USER_DELETED', 'user_management', OLD.id, NULL, NULL, NULL,
            'user', OLD.id::TEXT, 'DELETE', 'success',
            jsonb_build_object('username', OLD.username, 'email', OLD.email)
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON security_core.users
    FOR EACH ROW EXECUTE FUNCTION audit_logs.user_audit_trigger();

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant table permissions to security service
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA security_core TO uaip_security_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA access_control TO uaip_security_service;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA audit_logs TO uaip_security_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA security_core TO uaip_security_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA access_control TO uaip_security_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit_logs TO uaip_security_service;

-- Grant read-only access to auditor
GRANT SELECT ON ALL TABLES IN SCHEMA audit_logs TO uaip_security_auditor;
GRANT SELECT ON ALL TABLES IN SCHEMA compliance TO uaip_security_auditor;

-- Grant function execution permissions
GRANT EXECUTE ON FUNCTION security_core.encrypt_sensitive_data TO uaip_security_service;
GRANT EXECUTE ON FUNCTION security_core.decrypt_sensitive_data TO uaip_security_service;
GRANT EXECUTE ON FUNCTION audit_logs.log_security_event TO uaip_security_service;

-- =============================================================================
-- INITIAL DATA SETUP
-- =============================================================================

-- Insert default admin user (password: 'admin' - CHANGE IN PRODUCTION)
INSERT INTO security_core.users (id, username, email, password_hash, salt, is_active, mfa_enabled)
VALUES (
    uuid_generate_v4(),
    'admin',
    'admin@council-of-nycea.local',
    crypt('admin', gen_salt('bf', 12)),
    gen_salt('bf', 12),
    true,
    false
) ON CONFLICT (username) DO NOTHING;

-- Insert default roles
INSERT INTO access_control.roles (name, description, permissions) VALUES
    ('super_admin', 'Super Administrator with full system access', '["*"]'),
    ('security_admin', 'Security Administrator', '["security:*", "audit:read", "compliance:*"]'),
    ('user_admin', 'User Administrator', '["users:*", "roles:read"]'),
    ('auditor', 'Security Auditor', '["audit:read", "compliance:read"]'),
    ('user', 'Standard User', '["profile:read", "profile:update"]')
ON CONFLICT (name) DO NOTHING;

-- Assign super_admin role to admin user
INSERT INTO access_control.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM security_core.users u, access_control.roles r
WHERE u.username = 'admin' AND r.name = 'super_admin'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- =============================================================================
-- SECURITY HARDENING
-- =============================================================================

-- Revoke unnecessary public permissions
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;

-- Set secure defaults
ALTER DATABASE uaip_security SET log_statement = 'all';
ALTER DATABASE uaip_security SET log_min_duration_statement = 0;
ALTER DATABASE uaip_security SET log_connections = on;
ALTER DATABASE uaip_security SET log_disconnections = on;

COMMENT ON DATABASE uaip_security IS 'Level 4 Restricted - Security Database for SOC 2/HIPAA/PCI DSS/ISO 27001 Compliance';