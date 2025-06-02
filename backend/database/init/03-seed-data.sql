-- UAIP Database Seeding Script
-- This script seeds the database with initial data for development and testing
-- Dependencies are handled in proper order: users -> roles -> personas -> discussions

-- ===== SYSTEM USERS =====
-- Create system and test users first (required for foreign key references)

INSERT INTO users (
    id,
    email,
    name,
    role,
    security_clearance,
    is_active
) VALUES 
-- System user for automated operations
(
    '00000000-0000-0000-0000-000000000001',
    'system@uaip.local',
    'System Administrator',
    'system_admin',
    'high',
    true
),
-- Admin user for management
(
    '00000000-0000-0000-0000-000000000002',
    'admin@uaip.local',
    'Platform Administrator',
    'admin',
    'high',
    true
),
-- Test user for development
(
    '00000000-0000-0000-0000-000000000003',
    'test@uaip.local',
    'Test User',
    'user',
    'medium',
    true
),
-- Demo user for demonstrations
(
    '00000000-0000-0000-0000-000000000004',
    'demo@uaip.local',
    'Demo User',
    'user',
    'medium',
    true
)
ON CONFLICT (email) DO NOTHING;

-- ===== SYSTEM ROLES =====
-- Create basic roles for the platform

INSERT INTO roles (
    id,
    name,
    description,
    is_system_role
) VALUES 
(
    '10000000-0000-0000-0000-000000000001',
    'system_admin',
    'Full system administration privileges',
    true
),
(
    '10000000-0000-0000-0000-000000000002',
    'admin',
    'Platform administration privileges',
    true
),
(
    '10000000-0000-0000-0000-000000000003',
    'user',
    'Standard user privileges',
    true
),
(
    '10000000-0000-0000-0000-000000000004',
    'persona_creator',
    'Can create and manage personas',
    false
),
(
    '10000000-0000-0000-0000-000000000005',
    'discussion_moderator',
    'Can moderate discussions',
    false
)
ON CONFLICT (name) DO NOTHING;

-- ===== BASIC PERMISSIONS =====
-- Create fundamental permissions

INSERT INTO permissions (
    id,
    type,
    resource,
    operations
) VALUES 
(
    '20000000-0000-0000-0000-000000000001',
    'resource',
    'personas',
    ARRAY['create', 'read', 'update', 'delete']
),
(
    '20000000-0000-0000-0000-000000000002',
    'resource',
    'discussions',
    ARRAY['create', 'read', 'update', 'delete']
),
(
    '20000000-0000-0000-0000-000000000003',
    'resource',
    'users',
    ARRAY['read', 'update']
),
(
    '20000000-0000-0000-0000-000000000004',
    'system',
    'administration',
    ARRAY['manage_users', 'manage_system', 'view_audit']
)
ON CONFLICT (id) DO NOTHING;

-- ===== ROLE PERMISSIONS =====
-- Assign permissions to roles

INSERT INTO role_permissions (role_id, permission_id) VALUES 
-- System admin gets all permissions
('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002'),
('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003'),
('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004'),
-- Admin gets most permissions
('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002'),
('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003'),
-- Users get basic permissions
('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003'),
-- Persona creators can manage personas
('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001'),
-- Discussion moderators can manage discussions
('10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ===== USER ROLES =====
-- Assign roles to users

INSERT INTO user_roles (user_id, role_id) VALUES 
-- System user gets system admin role
('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
-- Admin user gets admin role
('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002'),
-- Test user gets user role and persona creator
('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003'),
('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004'),
-- Demo user gets user role
('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ===== CAPABILITIES =====
-- Create some basic capabilities for personas

INSERT INTO capabilities (
    id,
    name,
    description,
    type,
    status,
    metadata,
    security_requirements
) VALUES 
(
    '30000000-0000-0000-0000-000000000001',
    'text_analysis',
    'Analyze and understand text content',
    'tool',
    'active',
    '{"category": "analysis", "complexity": "medium"}',
    '{"clearance_required": "medium", "audit_required": false}'
),
(
    '30000000-0000-0000-0000-000000000002',
    'creative_writing',
    'Generate creative content and ideas',
    'tool',
    'active',
    '{"category": "generation", "complexity": "high"}',
    '{"clearance_required": "medium", "audit_required": false}'
),
(
    '30000000-0000-0000-0000-000000000003',
    'logical_reasoning',
    'Apply logical reasoning and analysis',
    'tool',
    'active',
    '{"category": "reasoning", "complexity": "high"}',
    '{"clearance_required": "medium", "audit_required": true}'
),
(
    '30000000-0000-0000-0000-000000000004',
    'data_visualization',
    'Create charts and visual representations',
    'tool',
    'active',
    '{"category": "visualization", "complexity": "medium"}',
    '{"clearance_required": "low", "audit_required": false}'
)
ON CONFLICT (id) DO NOTHING;

-- ===== PERSONAS =====
-- Create diverse personas for testing and demonstration

INSERT INTO personas (
    id,
    name,
    role,
    description,
    traits,
    expertise,
    background,
    system_prompt,
    conversational_style,
    status,
    visibility,
    created_by,
    organization_id,
    tags,
    capabilities
) VALUES 
-- Socratic Philosopher
(
    '40000000-0000-0000-0000-000000000001',
    'Socratic Philosopher',
    'Philosophical Guide',
    'A thoughtful philosopher who asks probing questions to help others discover truth through dialogue.',
    '["analytical", "patient", "inquisitive", "wise", "methodical"]',
    '["philosophy", "ethics", "logic", "critical thinking", "epistemology"]',
    'Trained in classical philosophy with expertise in Socratic method, epistemology, and ethics. Has studied the works of Plato, Aristotle, and modern philosophers.',
    'You are a Socratic philosopher. Your role is to guide discussions through thoughtful questioning rather than providing direct answers. Help participants discover insights through dialogue. Ask probing questions that lead to deeper understanding.',
    '{
        "tone": "formal",
        "verbosity": "moderate", 
        "formality": "formal",
        "empathy": 0.7,
        "assertiveness": 0.6,
        "creativity": 0.8,
        "analyticalDepth": 0.9,
        "questioningStyle": "socratic",
        "responsePattern": "structured"
    }',
    'active',
    'public',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    ARRAY['philosophy', 'education', 'critical thinking', 'dialogue'],
    ARRAY['30000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000003'::uuid]
),
-- Creative Brainstormer
(
    '40000000-0000-0000-0000-000000000002',
    'Creative Brainstormer',
    'Innovation Catalyst',
    'An energetic creative thinker who generates novel ideas and encourages out-of-the-box thinking.',
    '["creative", "energetic", "optimistic", "spontaneous", "imaginative"]',
    '["design thinking", "innovation", "brainstorming", "creative problem solving", "ideation"]',
    'Background in design thinking, innovation methodologies, and creative problem-solving. Has worked with startups and established companies to drive innovation.',
    'You are a creative brainstormer. Your role is to generate innovative ideas, encourage creative thinking, and help teams break through conventional limitations. Think outside the box and inspire others.',
    '{
        "tone": "friendly",
        "verbosity": "detailed",
        "formality": "casual", 
        "empathy": 0.8,
        "assertiveness": 0.7,
        "creativity": 0.95,
        "analyticalDepth": 0.6,
        "questioningStyle": "exploratory",
        "responsePattern": "flowing"
    }',
    'active',
    'public',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    ARRAY['creativity', 'innovation', 'brainstorming', 'design thinking'],
    ARRAY['30000000-0000-0000-0000-000000000002'::uuid, '30000000-0000-0000-0000-000000000004'::uuid]
),
-- Data Analyst
(
    '40000000-0000-0000-0000-000000000003',
    'Data Analyst',
    'Evidence-Based Advisor',
    'A methodical analyst who focuses on data-driven insights and logical reasoning.',
    '["analytical", "precise", "objective", "methodical", "detail-oriented"]',
    '["statistics", "data analysis", "research methodology", "evidence-based reasoning", "quantitative analysis"]',
    'Expertise in statistics, data analysis, research methodology, and evidence-based decision making. Has experience in various industries analyzing complex datasets.',
    'You are a data analyst. Your role is to provide evidence-based insights, question assumptions with data, and ensure discussions are grounded in facts and logical reasoning. Always ask for data to support claims.',
    '{
        "tone": "professional",
        "verbosity": "concise",
        "formality": "formal",
        "empathy": 0.4,
        "assertiveness": 0.8,
        "creativity": 0.3,
        "analyticalDepth": 0.95,
        "questioningStyle": "direct",
        "responsePattern": "structured"
    }',
    'active',
    'public',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    ARRAY['data analysis', 'statistics', 'research', 'evidence-based'],
    ARRAY['30000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000003'::uuid, '30000000-0000-0000-0000-000000000004'::uuid]
),
-- Empathetic Mediator
(
    '40000000-0000-0000-0000-000000000004',
    'Empathetic Mediator',
    'Conflict Resolution Specialist',
    'A compassionate mediator who helps resolve conflicts and build understanding between different perspectives.',
    '["empathetic", "patient", "diplomatic", "understanding", "balanced"]',
    '["conflict resolution", "mediation", "emotional intelligence", "communication", "psychology"]',
    'Trained in conflict resolution, mediation, and psychology. Has experience helping teams and individuals work through disagreements and find common ground.',
    'You are an empathetic mediator. Your role is to help resolve conflicts, understand different perspectives, and guide discussions toward mutual understanding and resolution. Focus on finding common ground.',
    '{
        "tone": "warm",
        "verbosity": "moderate",
        "formality": "semi-formal",
        "empathy": 0.95,
        "assertiveness": 0.5,
        "creativity": 0.6,
        "analyticalDepth": 0.7,
        "questioningStyle": "gentle",
        "responsePattern": "adaptive"
    }',
    'active',
    'public',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    ARRAY['mediation', 'conflict resolution', 'empathy', 'communication'],
    ARRAY['30000000-0000-0000-0000-000000000001'::uuid]
),
-- Technical Architect
(
    '40000000-0000-0000-0000-000000000005',
    'Technical Architect',
    'System Design Expert',
    'A technical expert who designs robust, scalable systems and provides architectural guidance.',
    '["systematic", "logical", "thorough", "pragmatic", "detail-oriented"]',
    '["system architecture", "software design", "scalability", "performance", "security"]',
    'Senior technical architect with experience designing large-scale systems. Expert in distributed systems, microservices, and cloud architecture.',
    'You are a technical architect. Your role is to provide technical guidance, design robust systems, and help teams make sound architectural decisions. Focus on scalability, maintainability, and best practices.',
    '{
        "tone": "professional",
        "verbosity": "detailed",
        "formality": "formal",
        "empathy": 0.5,
        "assertiveness": 0.8,
        "creativity": 0.7,
        "analyticalDepth": 0.9,
        "questioningStyle": "technical",
        "responsePattern": "structured"
    }',
    'active',
    'team',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000002',
    ARRAY['architecture', 'technical', 'systems', 'scalability'],
    ARRAY['30000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000003'::uuid]
)
ON CONFLICT (id) DO NOTHING;

-- ===== DISCUSSIONS =====
-- Create sample discussions for testing

INSERT INTO discussions (
    id,
    title,
    description,
    topic,
    objective,
    created_by,
    status,
    settings,
    state
) VALUES 
-- AI Ethics Discussion
(
    '50000000-0000-0000-0000-000000000001',
    'AI Ethics in Healthcare',
    'A comprehensive discussion about the ethical implications of AI systems in healthcare decision-making, exploring bias, transparency, and patient autonomy.',
    'AI Ethics',
    'Explore the key ethical considerations and develop guidelines for responsible AI use in healthcare.',
    '00000000-0000-0000-0000-000000000003',
    'draft',
    '{
        "maxParticipants": 10,
        "isPublic": true,
        "allowAnonymous": false,
        "moderationLevel": "light",
        "turnTimeout": 300,
        "responseTimeout": 600
    }',
    '{
        "messageCount": 0,
        "activeParticipants": 0,
        "consensusLevel": 0,
        "engagementScore": 0,
        "topicDrift": 0
    }'
),
-- Innovation Workshop
(
    '50000000-0000-0000-0000-000000000002',
    'Future of Remote Work',
    'Brainstorming session to explore innovative solutions for the challenges and opportunities in remote work environments.',
    'Innovation',
    'Generate creative solutions for improving remote work productivity, collaboration, and employee satisfaction.',
    '00000000-0000-0000-0000-000000000003',
    'draft',
    '{
        "maxParticipants": 8,
        "isPublic": true,
        "allowAnonymous": false,
        "moderationLevel": "minimal",
        "turnTimeout": 240,
        "responseTimeout": 480
    }',
    '{
        "messageCount": 0,
        "activeParticipants": 0,
        "consensusLevel": 0,
        "engagementScore": 0,
        "topicDrift": 0
    }'
),
-- Technical Architecture Review
(
    '50000000-0000-0000-0000-000000000003',
    'Microservices Architecture Review',
    'Technical discussion reviewing the proposed microservices architecture for the new platform.',
    'Architecture',
    'Review and refine the microservices architecture design, addressing scalability, security, and maintainability concerns.',
    '00000000-0000-0000-0000-000000000003',
    'draft',
    '{
        "maxParticipants": 6,
        "isPublic": false,
        "allowAnonymous": false,
        "moderationLevel": "moderate",
        "turnTimeout": 600,
        "responseTimeout": 900
    }',
    '{
        "messageCount": 0,
        "activeParticipants": 0,
        "consensusLevel": 0,
        "engagementScore": 0,
        "topicDrift": 0
    }'
)
ON CONFLICT (id) DO NOTHING;

-- ===== DISCUSSION PARTICIPANTS =====
-- Add personas as participants to discussions

INSERT INTO discussion_participants (
    discussion_id,
    persona_id,
    agent_id,
    role,
    is_active,
    message_count
) VALUES 
-- AI Ethics Discussion participants
('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'socratic-philosopher-agent', 'participant', true, 0),
('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'data-analyst-agent', 'participant', true, 0),
('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'empathetic-mediator-agent', 'moderator', true, 0),
-- Innovation Workshop participants
('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'creative-brainstormer-agent', 'facilitator', true, 0),
('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'socratic-philosopher-agent', 'participant', true, 0),
-- Technical Architecture Review participants
('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000005', 'technical-architect-agent', 'expert', true, 0),
('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 'data-analyst-agent', 'participant', true, 0);

-- ===== AUDIT LOG =====
-- Log the seeding operation

INSERT INTO audit_events (
    event_type,
    user_id,
    resource_type,
    details,
    risk_level
) VALUES (
    'database_seeded',
    '00000000-0000-0000-0000-000000000001',
    'system',
    '{
        "operation": "database_seeding",
        "users_created": 4,
        "personas_created": 5,
        "discussions_created": 3,
        "capabilities_created": 4,
        "roles_created": 5,
        "permissions_created": 4
    }',
    'low'
);

-- ===== COMPLETION LOG =====
-- Log successful completion with statistics

DO $$
DECLARE
    user_count INTEGER;
    persona_count INTEGER;
    discussion_count INTEGER;
    capability_count INTEGER;
    role_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO persona_count FROM personas;
    SELECT COUNT(*) INTO discussion_count FROM discussions;
    SELECT COUNT(*) INTO capability_count FROM capabilities;
    SELECT COUNT(*) INTO role_count FROM roles;
    
    RAISE NOTICE '=== UAIP Database Seeding Completed Successfully ===';
    RAISE NOTICE 'Users: %', user_count;
    RAISE NOTICE 'Personas: %', persona_count;
    RAISE NOTICE 'Discussions: %', discussion_count;
    RAISE NOTICE 'Capabilities: %', capability_count;
    RAISE NOTICE 'Roles: %', role_count;
    RAISE NOTICE '=== Database is ready for use ===';
END $$; 