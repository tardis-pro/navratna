-- UAIP Database Seeding Script
-- This script seeds the database with default users, roles, and permissions

-- Insert default system roles
INSERT INTO roles (id, name, description, is_system_role) VALUES
    (uuid_generate_v4(), 'admin', 'System Administrator with full access', true),
    (uuid_generate_v4(), 'agent_operator', 'Can operate and manage agents', true),
    (uuid_generate_v4(), 'security_officer', 'Can manage security policies and approvals', true),
    (uuid_generate_v4(), 'user', 'Standard user with basic access', true),
    (uuid_generate_v4(), 'viewer', 'Read-only access to system', true)
ON CONFLICT (name) DO NOTHING;

-- Insert default permissions
INSERT INTO permissions (id, type, resource, operations) VALUES
    -- Admin permissions
    (uuid_generate_v4(), 'system', '*', ARRAY['create', 'read', 'update', 'delete', 'execute', 'approve']),
    
    -- Agent management permissions
    (uuid_generate_v4(), 'agent', 'agents', ARRAY['create', 'read', 'update', 'delete']),
    (uuid_generate_v4(), 'agent', 'operations', ARRAY['create', 'read', 'update', 'execute']),
    (uuid_generate_v4(), 'agent', 'capabilities', ARRAY['read', 'execute']),
    
    -- Security permissions
    (uuid_generate_v4(), 'security', 'users', ARRAY['create', 'read', 'update', 'delete']),
    (uuid_generate_v4(), 'security', 'roles', ARRAY['create', 'read', 'update', 'delete']),
    (uuid_generate_v4(), 'security', 'permissions', ARRAY['create', 'read', 'update', 'delete']),
    (uuid_generate_v4(), 'security', 'approvals', ARRAY['create', 'read', 'update', 'approve', 'reject']),
    (uuid_generate_v4(), 'security', 'audit', ARRAY['read']),
    
    -- User permissions
    (uuid_generate_v4(), 'user', 'agents', ARRAY['read']),
    (uuid_generate_v4(), 'user', 'operations', ARRAY['create', 'read']),
    (uuid_generate_v4(), 'user', 'capabilities', ARRAY['read']),
    
    -- Viewer permissions
    (uuid_generate_v4(), 'viewer', 'agents', ARRAY['read']),
    (uuid_generate_v4(), 'viewer', 'operations', ARRAY['read']),
    (uuid_generate_v4(), 'viewer', 'capabilities', ARRAY['read'])
ON CONFLICT DO NOTHING;

-- Assign permissions to roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE (r.name = 'admin' AND p.type = 'system')
   OR (r.name = 'agent_operator' AND p.type = 'agent')
   OR (r.name = 'security_officer' AND p.type = 'security')
   OR (r.name = 'user' AND p.type = 'user')
   OR (r.name = 'viewer' AND p.type = 'viewer')
ON CONFLICT DO NOTHING;

-- Insert default admin user
INSERT INTO users (id, email, name, role, security_clearance, is_active) VALUES
    (uuid_generate_v4(), 'admin@uaip.local', 'System Administrator', 'admin', 'high', true)
ON CONFLICT (email) DO NOTHING;

-- Assign admin role to admin user
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.email = 'admin@uaip.local' AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Insert default capabilities
INSERT INTO capabilities (id, name, description, type, status, metadata, security_requirements) VALUES
    (uuid_generate_v4(), 'file_operations', 'Basic file system operations', 'tool', 'active', 
     '{"category": "system", "tags": ["filesystem", "basic"]}',
     '{"clearance_required": "low", "approval_required": false}'),
    
    (uuid_generate_v4(), 'code_generation', 'Generate code artifacts', 'artifact', 'active',
     '{"category": "development", "tags": ["code", "generation"]}',
     '{"clearance_required": "medium", "approval_required": false}'),
     
    (uuid_generate_v4(), 'system_analysis', 'Analyze system performance and health', 'hybrid', 'active',
     '{"category": "monitoring", "tags": ["analysis", "system"]}',
     '{"clearance_required": "medium", "approval_required": true}'),
     
    (uuid_generate_v4(), 'database_operations', 'Database query and management operations', 'tool', 'active',
     '{"category": "database", "tags": ["sql", "management"]}',
     '{"clearance_required": "high", "approval_required": true}')
ON CONFLICT DO NOTHING;

-- Create default rate limits
INSERT INTO rate_limits (identifier, limit_type, limit_value, window_seconds, reset_time) VALUES
    ('global', 'requests_per_minute', 1000, 60, NOW() + INTERVAL '1 minute'),
    ('user', 'requests_per_minute', 100, 60, NOW() + INTERVAL '1 minute'),
    ('agent', 'operations_per_hour', 50, 3600, NOW() + INTERVAL '1 hour')
ON CONFLICT (identifier, limit_type) DO NOTHING;

-- Log the seeding completion
INSERT INTO audit_events (event_type, details) VALUES
    ('system_initialization', '{"action": "database_seeded", "timestamp": "' || NOW() || '", "status": "completed"}'); 