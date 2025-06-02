-- Migration: Create personas table
-- Description: Creates the personas table with all required fields from PersonaSchema

CREATE TABLE personas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    description TEXT NOT NULL CHECK (char_length(description) <= 2000),
    traits JSONB DEFAULT '[]'::jsonb,
    expertise JSONB DEFAULT '[]'::jsonb,
    background TEXT NOT NULL CHECK (char_length(background) <= 5000),
    system_prompt TEXT NOT NULL CHECK (char_length(system_prompt) <= 10000),
    conversational_style JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'archived', 'deprecated')),
    visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'organization', 'public')),
    created_by UUID NOT NULL REFERENCES users(id),
    organization_id UUID REFERENCES users(id), -- Assuming organization links to users for now
    team_id UUID,
    version INTEGER NOT NULL DEFAULT 1,
    parent_persona_id UUID REFERENCES personas(id),
    tags TEXT[] DEFAULT '{}',
    validation JSONB,
    usage_stats JSONB DEFAULT '{
        "totalUsages": 0,
        "uniqueUsers": 0,
        "averageSessionDuration": 0,
        "popularityScore": 0,
        "feedbackCount": 0
    }'::jsonb,
    configuration JSONB DEFAULT '{
        "maxTokens": 4000,
        "temperature": 0.7,
        "topP": 0.9,
        "frequencyPenalty": 0,
        "presencePenalty": 0,
        "stopSequences": []
    }'::jsonb,
    capabilities UUID[] DEFAULT '{}',
    restrictions JSONB DEFAULT '{
        "allowedTopics": [],
        "forbiddenTopics": [],
        "requiresApproval": false
    }'::jsonb,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_personas_name ON personas(name);
CREATE INDEX idx_personas_role ON personas(role);
CREATE INDEX idx_personas_status ON personas(status);
CREATE INDEX idx_personas_visibility ON personas(visibility);
CREATE INDEX idx_personas_created_by ON personas(created_by);
CREATE INDEX idx_personas_organization_id ON personas(organization_id);
CREATE INDEX idx_personas_team_id ON personas(team_id);
CREATE INDEX idx_personas_parent_persona_id ON personas(parent_persona_id);
CREATE INDEX idx_personas_created_at ON personas(created_at);
CREATE INDEX idx_personas_updated_at ON personas(updated_at);

-- GIN indexes for JSONB fields
CREATE INDEX idx_personas_traits_gin ON personas USING GIN (traits);
CREATE INDEX idx_personas_expertise_gin ON personas USING GIN (expertise);
CREATE INDEX idx_personas_conversational_style_gin ON personas USING GIN (conversational_style);
CREATE INDEX idx_personas_validation_gin ON personas USING GIN (validation);
CREATE INDEX idx_personas_usage_stats_gin ON personas USING GIN (usage_stats);
CREATE INDEX idx_personas_configuration_gin ON personas USING GIN (configuration);
CREATE INDEX idx_personas_restrictions_gin ON personas USING GIN (restrictions);
CREATE INDEX idx_personas_metadata_gin ON personas USING GIN (metadata);

-- GIN index for tags array
CREATE INDEX idx_personas_tags_gin ON personas USING GIN (tags);

-- GIN index for capabilities array
CREATE INDEX idx_personas_capabilities_gin ON personas USING GIN (capabilities);

-- Trigger for updated_at
CREATE TRIGGER update_personas_updated_at 
    BEFORE UPDATE ON personas 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 