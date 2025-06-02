-- Migration: Create discussion_messages table
-- Description: Creates the discussion_messages table with all required fields from DiscussionMessageSchema

CREATE TABLE discussion_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES discussion_participants(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) <= 10000),
    message_type VARCHAR(20) NOT NULL DEFAULT 'message' CHECK (message_type IN ('message', 'question', 'answer', 'clarification', 'objection', 'agreement', 'summary', 'decision', 'action_item', 'system')),
    reply_to_id UUID REFERENCES discussion_messages(id),
    thread_id UUID REFERENCES discussion_messages(id),
    sentiment VARCHAR(10) CHECK (sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
    confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
    tokens INTEGER CHECK (tokens >= 0),
    processing_time INTEGER CHECK (processing_time >= 0), -- milliseconds
    attachments JSONB DEFAULT '[]'::jsonb,
    mentions UUID[] DEFAULT '{}', -- Mentioned participant IDs
    tags TEXT[] DEFAULT '{}',
    reactions JSONB DEFAULT '[]'::jsonb,
    edit_history JSONB DEFAULT '[]'::jsonb,
    is_edited BOOLEAN NOT NULL DEFAULT false,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_discussion_messages_discussion_id ON discussion_messages(discussion_id);
CREATE INDEX idx_discussion_messages_participant_id ON discussion_messages(participant_id);
CREATE INDEX idx_discussion_messages_message_type ON discussion_messages(message_type);
CREATE INDEX idx_discussion_messages_reply_to_id ON discussion_messages(reply_to_id);
CREATE INDEX idx_discussion_messages_thread_id ON discussion_messages(thread_id);
CREATE INDEX idx_discussion_messages_sentiment ON discussion_messages(sentiment);
CREATE INDEX idx_discussion_messages_is_deleted ON discussion_messages(is_deleted);
CREATE INDEX idx_discussion_messages_created_at ON discussion_messages(created_at);
CREATE INDEX idx_discussion_messages_updated_at ON discussion_messages(updated_at);
CREATE INDEX idx_discussion_messages_deleted_at ON discussion_messages(deleted_at);

-- Composite indexes for common queries
CREATE INDEX idx_discussion_messages_discussion_created ON discussion_messages(discussion_id, created_at);
CREATE INDEX idx_discussion_messages_discussion_not_deleted ON discussion_messages(discussion_id, is_deleted, created_at);
CREATE INDEX idx_discussion_messages_participant_created ON discussion_messages(participant_id, created_at);
CREATE INDEX idx_discussion_messages_thread_created ON discussion_messages(thread_id, created_at) WHERE thread_id IS NOT NULL;

-- GIN indexes for JSONB fields
CREATE INDEX idx_discussion_messages_attachments_gin ON discussion_messages USING GIN (attachments);
CREATE INDEX idx_discussion_messages_reactions_gin ON discussion_messages USING GIN (reactions);
CREATE INDEX idx_discussion_messages_edit_history_gin ON discussion_messages USING GIN (edit_history);
CREATE INDEX idx_discussion_messages_metadata_gin ON discussion_messages USING GIN (metadata);

-- GIN indexes for arrays
CREATE INDEX idx_discussion_messages_mentions_gin ON discussion_messages USING GIN (mentions);
CREATE INDEX idx_discussion_messages_tags_gin ON discussion_messages USING GIN (tags);

-- Full-text search index on content
CREATE INDEX idx_discussion_messages_content_fts ON discussion_messages USING GIN (to_tsvector('english', content));

-- Trigger for updated_at
CREATE TRIGGER update_discussion_messages_updated_at 
    BEFORE UPDATE ON discussion_messages 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update participant message count
CREATE OR REPLACE FUNCTION update_participant_message_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE discussion_participants 
        SET message_count = message_count + 1,
            last_active_at = NOW()
        WHERE id = NEW.participant_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE discussion_participants 
        SET message_count = GREATEST(message_count - 1, 0)
        WHERE id = OLD.participant_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_participant_message_count_trigger
    AFTER INSERT OR DELETE ON discussion_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_participant_message_count();

-- Trigger to update discussion state
CREATE OR REPLACE FUNCTION update_discussion_state_on_message()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE discussions 
        SET state = jsonb_set(
            jsonb_set(state, '{messageCount}', (COALESCE((state->>'messageCount')::integer, 0) + 1)::text::jsonb),
            '{lastActivity}', to_jsonb(NOW())
        )
        WHERE id = NEW.discussion_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE discussions 
        SET state = jsonb_set(state, '{messageCount}', GREATEST(COALESCE((state->>'messageCount')::integer, 0) - 1, 0)::text::jsonb)
        WHERE id = OLD.discussion_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_discussion_state_on_message_trigger
    AFTER INSERT OR DELETE ON discussion_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_discussion_state_on_message(); 