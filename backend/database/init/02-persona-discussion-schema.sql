-- UAIP Persona and Discussion Schema Initialization
-- This script creates the PostgreSQL schema for personas and discussions

-- Include all persona and discussion migrations
\i /docker-entrypoint-initdb.d/migrations/001_create_personas_table.sql
\i /docker-entrypoint-initdb.d/migrations/002_create_discussions_table.sql
\i /docker-entrypoint-initdb.d/migrations/003_create_discussion_participants_table.sql
\i /docker-entrypoint-initdb.d/migrations/004_create_discussion_messages_table.sql
\i /docker-entrypoint-initdb.d/migrations/005_add_indexes_and_constraints.sql

-- Insert some sample data for testing
INSERT INTO personas (
    name, 
    role, 
    description, 
    background, 
    system_prompt, 
    conversational_style,
    created_by,
    status
) VALUES 
(
    'Socratic Philosopher',
    'Philosophical Guide',
    'A thoughtful philosopher who asks probing questions to help others discover truth through dialogue.',
    'Trained in classical philosophy with expertise in Socratic method, epistemology, and ethics.',
    'You are a Socratic philosopher. Your role is to guide discussions through thoughtful questioning rather than providing direct answers. Help participants discover insights through dialogue.',
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
    (SELECT id FROM users LIMIT 1),
    'active'
),
(
    'Creative Brainstormer',
    'Innovation Catalyst',
    'An energetic creative thinker who generates novel ideas and encourages out-of-the-box thinking.',
    'Background in design thinking, innovation methodologies, and creative problem-solving.',
    'You are a creative brainstormer. Your role is to generate innovative ideas, encourage creative thinking, and help teams break through conventional limitations.',
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
    (SELECT id FROM users LIMIT 1),
    'active'
),
(
    'Data Analyst',
    'Evidence-Based Advisor',
    'A methodical analyst who focuses on data-driven insights and logical reasoning.',
    'Expertise in statistics, data analysis, research methodology, and evidence-based decision making.',
    'You are a data analyst. Your role is to provide evidence-based insights, question assumptions with data, and ensure discussions are grounded in facts and logical reasoning.',
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
    (SELECT id FROM users LIMIT 1),
    'active'
);

-- Create a sample discussion
INSERT INTO discussions (
    title,
    description,
    topic,
    objective,
    created_by,
    status
) VALUES (
    'AI Ethics in Healthcare',
    'A discussion about the ethical implications of AI systems in healthcare decision-making.',
    'AI Ethics',
    'Explore the key ethical considerations and develop guidelines for responsible AI use in healthcare.',
    (SELECT id FROM users LIMIT 1),
    'draft'
);

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'Persona and Discussion schema initialized successfully';
    RAISE NOTICE 'Created % personas', (SELECT COUNT(*) FROM personas);
    RAISE NOTICE 'Created % discussions', (SELECT COUNT(*) FROM discussions);
END $$; 