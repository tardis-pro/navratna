-- =============================================================================
-- Navratna - Application Database Initialization
-- Level 3 Confidential Application Database (Port 5432)
-- Business Logic and Application Data
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- =============================================================================
-- SCHEMA CREATION
-- =============================================================================

-- Create application-specific schemas
CREATE SCHEMA IF NOT EXISTS agents;
CREATE SCHEMA IF NOT EXISTS capabilities;
CREATE SCHEMA IF NOT EXISTS discussions;
CREATE SCHEMA IF NOT EXISTS artifacts;
CREATE SCHEMA IF NOT EXISTS knowledge;

-- Set search path for application operations
ALTER DATABASE uaip_application SET search_path = agents, capabilities, discussions, artifacts, knowledge, public;

-- =============================================================================
-- APPLICATION ROLES
-- =============================================================================

DO $$
BEGIN
    -- Application Service Role
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uaip_app_service') THEN
        CREATE ROLE uaip_app_service WITH LOGIN ENCRYPTED PASSWORD 'uaip_app_service_2025_change_in_prod';
    END IF;
    
    -- Read-only Application Role
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uaip_app_readonly') THEN
        CREATE ROLE uaip_app_readonly WITH LOGIN ENCRYPTED PASSWORD 'uaip_app_readonly_2025_change_in_prod';
    END IF;
END
$$;

-- Grant schema permissions
GRANT ALL ON SCHEMA agents TO uaip_app_service;
GRANT ALL ON SCHEMA capabilities TO uaip_app_service;
GRANT ALL ON SCHEMA discussions TO uaip_app_service;
GRANT ALL ON SCHEMA artifacts TO uaip_app_service;
GRANT ALL ON SCHEMA knowledge TO uaip_app_service;

GRANT USAGE ON SCHEMA agents TO uaip_app_readonly;
GRANT USAGE ON SCHEMA capabilities TO uaip_app_readonly;
GRANT USAGE ON SCHEMA discussions TO uaip_app_readonly;
GRANT USAGE ON SCHEMA artifacts TO uaip_app_readonly;
GRANT USAGE ON SCHEMA knowledge TO uaip_app_readonly;

-- =============================================================================
-- AGENTS SCHEMA TABLES
-- =============================================================================

-- Agent Definitions
CREATE TABLE IF NOT EXISTS agents.agent_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL, -- 'conversational', 'task', 'specialist', etc.
    description TEXT,
    persona JSONB, -- Personality, behavior, style
    capabilities JSONB, -- Array of capability IDs
    configuration JSONB, -- Agent-specific settings
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, -- Reference to security database user
    data_classification INTEGER DEFAULT 3 -- Level 3 Confidential
);

CREATE INDEX idx_agents_name ON agents.agent_definitions(name);
CREATE INDEX idx_agents_type ON agents.agent_definitions(type);
CREATE INDEX idx_agents_active ON agents.agent_definitions(is_active);

-- Agent Instances (Runtime instances of agent definitions)
CREATE TABLE IF NOT EXISTS agents.agent_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_definition_id UUID NOT NULL REFERENCES agents.agent_definitions(id),
    session_id UUID, -- Reference to security database session
    context JSONB, -- Current conversation/task context
    state JSONB, -- Runtime state information
    memory JSONB, -- Agent memory/learning data
    status VARCHAR(50) DEFAULT 'idle', -- 'idle', 'active', 'busy', 'error'
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_classification INTEGER DEFAULT 3
);

CREATE INDEX idx_agent_instances_definition ON agents.agent_instances(agent_definition_id);
CREATE INDEX idx_agent_instances_session ON agents.agent_instances(session_id);
CREATE INDEX idx_agent_instances_status ON agents.agent_instances(status);

-- Agent Learning and Adaptation
CREATE TABLE IF NOT EXISTS agents.agent_learning (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents.agent_definitions(id),
    learning_type VARCHAR(100) NOT NULL, -- 'feedback', 'outcome', 'preference'
    learning_data JSONB NOT NULL,
    confidence_score FLOAT,
    applied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_classification INTEGER DEFAULT 3
);

-- =============================================================================
-- CAPABILITIES SCHEMA TABLES
-- =============================================================================

-- Capability Registry
CREATE TABLE IF NOT EXISTS capabilities.capability_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    category VARCHAR(100) NOT NULL, -- 'llm', 'tool', 'api', 'workflow'
    description TEXT,
    specification JSONB NOT NULL, -- OpenAPI spec, tool definition, etc.
    security_requirements JSONB, -- Security constraints and requirements
    rate_limits JSONB, -- Usage rate limits
    is_active BOOLEAN DEFAULT true,
    version VARCHAR(50) DEFAULT '1.0.0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_classification INTEGER DEFAULT 3
);

CREATE INDEX idx_capabilities_name ON capabilities.capability_definitions(name);
CREATE INDEX idx_capabilities_category ON capabilities.capability_definitions(category);

-- Capability Executions (Audit trail of capability usage)
CREATE TABLE IF NOT EXISTS capabilities.capability_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    capability_id UUID NOT NULL REFERENCES capabilities.capability_definitions(id),
    agent_id UUID REFERENCES agents.agent_instances(id),
    session_id UUID, -- Reference to security database session
    input_data JSONB,
    output_data JSONB,
    execution_time_ms INTEGER,
    status VARCHAR(50) NOT NULL, -- 'success', 'failure', 'timeout', 'error'
    error_message TEXT,
    security_context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_classification INTEGER DEFAULT 3
);

CREATE INDEX idx_capability_executions_capability ON capabilities.capability_executions(capability_id);
CREATE INDEX idx_capability_executions_agent ON capabilities.capability_executions(agent_id);
CREATE INDEX idx_capability_executions_status ON capabilities.capability_executions(status);
CREATE INDEX idx_capability_executions_created_at ON capabilities.capability_executions(created_at);

-- =============================================================================
-- DISCUSSIONS SCHEMA TABLES
-- =============================================================================

-- Discussion Threads
CREATE TABLE IF NOT EXISTS discussions.discussion_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500),
    description TEXT,
    thread_type VARCHAR(100) DEFAULT 'conversation', -- 'conversation', 'task', 'collaboration'
    participants JSONB, -- Array of participant IDs (users + agents)
    metadata JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, -- Reference to security database user
    data_classification INTEGER DEFAULT 3
);

CREATE INDEX idx_discussions_type ON discussions.discussion_threads(thread_type);
CREATE INDEX idx_discussions_active ON discussions.discussion_threads(is_active);
CREATE INDEX idx_discussions_created_at ON discussions.discussion_threads(created_at);

-- Discussion Messages
CREATE TABLE IF NOT EXISTS discussions.discussion_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES discussions.discussion_threads(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL, -- User or agent ID
    sender_type VARCHAR(50) NOT NULL, -- 'user', 'agent'
    message_type VARCHAR(100) DEFAULT 'text', -- 'text', 'file', 'action', 'system'
    content TEXT,
    content_data JSONB, -- Structured content (files, actions, etc.)
    reply_to_id UUID REFERENCES discussions.discussion_messages(id),
    reactions JSONB, -- Array of reactions/acknowledgments
    is_edited BOOLEAN DEFAULT false,
    edited_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_classification INTEGER DEFAULT 3
);

CREATE INDEX idx_messages_thread ON discussions.discussion_messages(thread_id);
CREATE INDEX idx_messages_sender ON discussions.discussion_messages(sender_id, sender_type);
CREATE INDEX idx_messages_created_at ON discussions.discussion_messages(created_at);

-- =============================================================================
-- ARTIFACTS SCHEMA TABLES
-- =============================================================================

-- Artifact Registry (Documents, Code, Files generated by agents)
CREATE TABLE IF NOT EXISTS artifacts.artifact_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(500) NOT NULL,
    artifact_type VARCHAR(100) NOT NULL, -- 'document', 'code', 'image', 'data'
    mime_type VARCHAR(100),
    file_size BIGINT,
    content_hash VARCHAR(128), -- SHA-256 hash for integrity
    storage_location TEXT, -- File system path or object storage key
    metadata JSONB,
    generated_by_agent_id UUID REFERENCES agents.agent_instances(id),
    discussion_id UUID REFERENCES discussions.discussion_threads(id),
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, -- Reference to security database user
    data_classification INTEGER DEFAULT 3
);

CREATE INDEX idx_artifacts_type ON artifacts.artifact_registry(artifact_type);
CREATE INDEX idx_artifacts_agent ON artifacts.artifact_registry(generated_by_agent_id);
CREATE INDEX idx_artifacts_discussion ON artifacts.artifact_registry(discussion_id);
CREATE INDEX idx_artifacts_hash ON artifacts.artifact_registry(content_hash);

-- Artifact Versions
CREATE TABLE IF NOT EXISTS artifacts.artifact_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artifact_id UUID NOT NULL REFERENCES artifacts.artifact_registry(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content_hash VARCHAR(128) NOT NULL,
    storage_location TEXT NOT NULL,
    change_summary TEXT,
    diff_data JSONB, -- Structured diff information
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    data_classification INTEGER DEFAULT 3,
    UNIQUE(artifact_id, version_number)
);

-- =============================================================================
-- KNOWLEDGE SCHEMA TABLES
-- =============================================================================

-- Knowledge Base Articles
CREATE TABLE IF NOT EXISTS knowledge.knowledge_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    content_vector VECTOR(1536), -- For similarity search (if using pgvector)
    article_type VARCHAR(100) DEFAULT 'general', -- 'faq', 'howto', 'reference', 'policy'
    tags JSONB, -- Array of tags
    categories JSONB, -- Hierarchical categories
    source_type VARCHAR(100), -- 'manual', 'generated', 'imported'
    source_metadata JSONB,
    is_published BOOLEAN DEFAULT false,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    data_classification INTEGER DEFAULT 3
);

CREATE INDEX idx_knowledge_title ON knowledge.knowledge_articles USING gin(to_tsvector('english', title));
CREATE INDEX idx_knowledge_content ON knowledge.knowledge_articles USING gin(to_tsvector('english', content));
CREATE INDEX idx_knowledge_type ON knowledge.knowledge_articles(article_type);
CREATE INDEX idx_knowledge_published ON knowledge.knowledge_articles(is_published);

-- Knowledge Relationships (Links between articles, concepts, etc.)
CREATE TABLE IF NOT EXISTS knowledge.knowledge_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES knowledge.knowledge_articles(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES knowledge.knowledge_articles(id) ON DELETE CASCADE,
    relationship_type VARCHAR(100) NOT NULL, -- 'related', 'prerequisite', 'supersedes', 'references'
    strength FLOAT DEFAULT 1.0, -- Relationship strength (0.0 - 1.0)
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    data_classification INTEGER DEFAULT 3,
    UNIQUE(source_id, target_id, relationship_type)
);

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Function to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER agents_definitions_updated_at BEFORE UPDATE ON agents.agent_definitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER discussion_threads_updated_at BEFORE UPDATE ON discussions.discussion_threads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER artifacts_updated_at BEFORE UPDATE ON artifacts.artifact_registry
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER knowledge_updated_at BEFORE UPDATE ON knowledge.knowledge_articles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function for full-text search across knowledge base
CREATE OR REPLACE FUNCTION knowledge.search_articles(search_query TEXT)
RETURNS TABLE(
    id UUID,
    title VARCHAR(500),
    content TEXT,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ka.id,
        ka.title,
        ka.content,
        ts_rank(to_tsvector('english', ka.title || ' ' || ka.content), plainto_tsquery('english', search_query)) as rank
    FROM knowledge.knowledge_articles ka
    WHERE ka.is_published = true
    AND to_tsvector('english', ka.title || ' ' || ka.content) @@ plainto_tsquery('english', search_query)
    ORDER BY rank DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant table permissions to application service
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA agents TO uaip_app_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA capabilities TO uaip_app_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA discussions TO uaip_app_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA artifacts TO uaip_app_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA knowledge TO uaip_app_service;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA agents TO uaip_app_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA capabilities TO uaip_app_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA discussions TO uaip_app_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA artifacts TO uaip_app_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA knowledge TO uaip_app_service;

-- Grant read-only permissions
GRANT SELECT ON ALL TABLES IN SCHEMA agents TO uaip_app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA capabilities TO uaip_app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA discussions TO uaip_app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA artifacts TO uaip_app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA knowledge TO uaip_app_readonly;

-- Grant function execution permissions
GRANT EXECUTE ON FUNCTION knowledge.search_articles TO uaip_app_service;
GRANT EXECUTE ON FUNCTION knowledge.search_articles TO uaip_app_readonly;

-- =============================================================================
-- INITIAL DATA SETUP
-- =============================================================================

-- Insert default capability categories
INSERT INTO capabilities.capability_definitions (name, category, description, specification) VALUES
    ('llm_chat', 'llm', 'Large Language Model Chat Capability', '{"type": "llm", "model": "gpt-4", "max_tokens": 4096}'),
    ('web_search', 'tool', 'Web Search Tool', '{"type": "tool", "api": "search", "rate_limit": "100/hour"}'),
    ('file_operations', 'tool', 'File System Operations', '{"type": "tool", "permissions": ["read", "write"], "sandbox": true}'),
    ('data_analysis', 'workflow', 'Data Analysis Workflow', '{"type": "workflow", "steps": ["load", "process", "analyze", "report"]}')
ON CONFLICT (name) DO NOTHING;

-- Insert sample agent definitions
INSERT INTO agents.agent_definitions (name, type, description, persona, capabilities) VALUES
    ('General Assistant', 'conversational', 'General purpose conversational agent', 
     '{"personality": "helpful", "style": "professional", "expertise": "general"}',
     '["llm_chat", "web_search"]'),
    ('Code Assistant', 'specialist', 'Software development specialist agent',
     '{"personality": "analytical", "style": "technical", "expertise": "programming"}',
     '["llm_chat", "file_operations"]'),
    ('Data Analyst', 'task', 'Data analysis and reporting agent',
     '{"personality": "methodical", "style": "analytical", "expertise": "data_science"}',
     '["llm_chat", "data_analysis", "file_operations"]')
ON CONFLICT (name) DO NOTHING;

-- Insert sample knowledge articles
INSERT INTO knowledge.knowledge_articles (title, content, article_type, tags, is_published) VALUES
    ('Getting Started with UAIP', 'This article explains how to get started with the Unified Agent Intelligence Platform...', 'howto', '["getting-started", "tutorial"]', true),
    ('Agent Configuration Guide', 'Learn how to configure and customize agents for your specific needs...', 'reference', '["agents", "configuration"]', true),
    ('Security Best Practices', 'Important security considerations when working with UAIP...', 'policy', '["security", "best-practices"]', true)
ON CONFLICT (title) DO NOTHING;

-- =============================================================================
-- PERFORMANCE OPTIMIZATION
-- =============================================================================

-- Analyze tables for query optimization
ANALYZE agents.agent_definitions;
ANALYZE agents.agent_instances;
ANALYZE capabilities.capability_definitions;
ANALYZE capabilities.capability_executions;
ANALYZE discussions.discussion_threads;
ANALYZE discussions.discussion_messages;
ANALYZE artifacts.artifact_registry;
ANALYZE knowledge.knowledge_articles;

COMMENT ON DATABASE uaip_application IS 'Level 3 Confidential - Application Database for Business Logic and Data';