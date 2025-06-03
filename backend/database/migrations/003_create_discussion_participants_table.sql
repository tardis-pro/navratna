-- Migration: Create discussion_participants table
-- Description: Creates the discussion_participants table with all required fields from DiscussionParticipantSchema

CREATE TABLE discussion_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    persona_id UUID NOT NULL REFERENCES personas(id),
    agent_id VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id), -- Human user if applicable
    role VARCHAR(20) NOT NULL DEFAULT 'participant' CHECK (role IN ('participant', 'moderator', 'observer', 'facilitator', 'expert')),
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMP NOT NULL DEFAULT NOW(),
    message_count INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    permissions JSONB DEFAULT '{
        "canSendMessages": true,
        "canModerate": false,
        "canInviteOthers": false,
        "canEndDiscussion": false
    }'::jsonb,
    preferences JSONB DEFAULT '{
        "notificationLevel": "all",
        "autoRespond": true,
        "responseDelay": 0
    }'::jsonb,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_discussion_participants_discussion_id ON discussion_participants(discussion_id);
CREATE INDEX idx_discussion_participants_persona_id ON discussion_participants(persona_id);
CREATE INDEX idx_discussion_participants_agent_id ON discussion_participants(agent_id);
CREATE INDEX idx_discussion_participants_user_id ON discussion_participants(user_id);
CREATE INDEX idx_discussion_participants_role ON discussion_participants(role);
CREATE INDEX idx_discussion_participants_joined_at ON discussion_participants(joined_at);
CREATE INDEX idx_discussion_participants_last_active_at ON discussion_participants(last_active_at);
CREATE INDEX idx_discussion_participants_is_active ON discussion_participants(is_active);
CREATE INDEX idx_discussion_participants_created_at ON discussion_participants(created_at);
CREATE INDEX idx_discussion_participants_updated_at ON discussion_participants(updated_at);

-- Composite indexes for common queries
CREATE INDEX idx_discussion_participants_discussion_active ON discussion_participants(discussion_id, is_active);
CREATE INDEX idx_discussion_participants_discussion_role ON discussion_participants(discussion_id, role);

-- GIN indexes for JSONB fields
CREATE INDEX idx_discussion_participants_permissions_gin ON discussion_participants USING GIN (permissions);
CREATE INDEX idx_discussion_participants_preferences_gin ON discussion_participants USING GIN (preferences);
CREATE INDEX idx_discussion_participants_metadata_gin ON discussion_participants USING GIN (metadata);

-- Unique constraint to prevent duplicate participants in same discussion
CREATE UNIQUE INDEX idx_discussion_participants_unique ON discussion_participants(discussion_id, persona_id, agent_id) WHERE is_active = true;

-- Trigger for updated_at
CREATE TRIGGER update_discussion_participants_updated_at 
    BEFORE UPDATE ON discussion_participants 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 