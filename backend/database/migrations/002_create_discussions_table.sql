-- Migration: Create discussions table
-- Description: Creates the discussions table with all required fields from DiscussionSchema

CREATE TABLE discussions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    topic VARCHAR(500) NOT NULL,
    objective TEXT,
    context JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled', 'archived')),
    visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'organization', 'public')),
    created_by UUID NOT NULL REFERENCES users(id),
    organization_id UUID REFERENCES users(id), -- Assuming organization links to users for now
    team_id UUID,
    settings JSONB DEFAULT '{
        "maxParticipants": 10,
        "autoModeration": true,
        "requireApproval": false,
        "allowInvites": true,
        "allowFileSharing": true,
        "allowAnonymous": false,
        "recordTranscript": true,
        "enableAnalytics": true,
        "turnTimeout": 300,
        "responseTimeout": 60,
        "moderationRules": []
    }'::jsonb,
    turn_strategy JSONB DEFAULT '{
        "type": "round_robin",
        "config": {}
    }'::jsonb,
    state JSONB DEFAULT '{
        "currentTurn": {
            "turnNumber": 0
        },
        "phase": "initialization",
        "messageCount": 0,
        "activeParticipants": 0,
        "consensusLevel": 0,
        "engagementScore": 0,
        "topicDrift": 0,
        "keyPoints": [],
        "decisions": [],
        "actionItems": []
    }'::jsonb,
    analytics JSONB DEFAULT '{
        "totalMessages": 0,
        "uniqueParticipants": 0,
        "averageMessageLength": 0,
        "participationDistribution": {},
        "sentimentDistribution": {},
        "topicProgression": []
    }'::jsonb,
    summary JSONB,
    tags TEXT[] DEFAULT '{}',
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    scheduled_start TIMESTAMP,
    scheduled_end TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_discussions_title ON discussions(title);
CREATE INDEX idx_discussions_topic ON discussions(topic);
CREATE INDEX idx_discussions_status ON discussions(status);
CREATE INDEX idx_discussions_visibility ON discussions(visibility);
CREATE INDEX idx_discussions_created_by ON discussions(created_by);
CREATE INDEX idx_discussions_organization_id ON discussions(organization_id);
CREATE INDEX idx_discussions_team_id ON discussions(team_id);
CREATE INDEX idx_discussions_started_at ON discussions(started_at);
CREATE INDEX idx_discussions_ended_at ON discussions(ended_at);
CREATE INDEX idx_discussions_scheduled_start ON discussions(scheduled_start);
CREATE INDEX idx_discussions_scheduled_end ON discussions(scheduled_end);
CREATE INDEX idx_discussions_created_at ON discussions(created_at);
CREATE INDEX idx_discussions_updated_at ON discussions(updated_at);

-- GIN indexes for JSONB fields
CREATE INDEX idx_discussions_context_gin ON discussions USING GIN (context);
CREATE INDEX idx_discussions_settings_gin ON discussions USING GIN (settings);
CREATE INDEX idx_discussions_turn_strategy_gin ON discussions USING GIN (turn_strategy);
CREATE INDEX idx_discussions_state_gin ON discussions USING GIN (state);
CREATE INDEX idx_discussions_analytics_gin ON discussions USING GIN (analytics);
CREATE INDEX idx_discussions_summary_gin ON discussions USING GIN (summary);
CREATE INDEX idx_discussions_metadata_gin ON discussions USING GIN (metadata);

-- GIN index for tags array
CREATE INDEX idx_discussions_tags_gin ON discussions USING GIN (tags);

-- Trigger for updated_at
CREATE TRIGGER update_discussions_updated_at 
    BEFORE UPDATE ON discussions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 