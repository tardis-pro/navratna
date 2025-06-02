-- Migration: Add additional indexes and constraints
-- Description: Adds performance indexes and data integrity constraints for persona/discussion system

-- ===== ADDITIONAL PERFORMANCE INDEXES =====

-- Cross-table relationship indexes
CREATE INDEX IF NOT EXISTS idx_personas_usage_stats_popularity ON personas(CAST(usage_stats->>'popularityScore' AS numeric)) WHERE CAST(usage_stats->>'popularityScore' AS numeric) > 0;
CREATE INDEX IF NOT EXISTS idx_personas_usage_stats_total_usages ON personas(CAST(usage_stats->>'totalUsages' AS integer)) WHERE CAST(usage_stats->>'totalUsages' AS integer) > 0;
CREATE INDEX IF NOT EXISTS idx_personas_validation_score ON personas(CAST(validation->>'score' AS numeric)) WHERE validation IS NOT NULL;

-- Discussion analytics indexes
CREATE INDEX IF NOT EXISTS idx_discussions_analytics_total_messages ON discussions(CAST(analytics->>'totalMessages' AS integer)) WHERE CAST(analytics->>'totalMessages' AS integer) > 0;
CREATE INDEX IF NOT EXISTS idx_discussions_state_consensus ON discussions(CAST(state->>'consensusLevel' AS numeric)) WHERE CAST(state->>'consensusLevel' AS numeric) > 0;
CREATE INDEX IF NOT EXISTS idx_discussions_state_engagement ON discussions(CAST(state->>'engagementScore' AS numeric)) WHERE CAST(state->>'engagementScore' AS numeric) > 0;

-- Message performance indexes
CREATE INDEX IF NOT EXISTS idx_discussion_messages_tokens ON discussion_messages(tokens) WHERE tokens IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discussion_messages_processing_time ON discussion_messages(processing_time) WHERE processing_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discussion_messages_confidence ON discussion_messages(confidence) WHERE confidence IS NOT NULL;

-- ===== DATA INTEGRITY CONSTRAINTS =====

-- Ensure persona validation scores are within valid range
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_persona_validation_score') THEN
        ALTER TABLE personas ADD CONSTRAINT check_persona_validation_score 
            CHECK (validation IS NULL OR CAST(validation->>'score' AS numeric) BETWEEN 0 AND 100);
    END IF;
END $$;

-- Ensure persona usage stats are non-negative
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_persona_usage_stats_non_negative') THEN
        ALTER TABLE personas ADD CONSTRAINT check_persona_usage_stats_non_negative
            CHECK (
                CAST(usage_stats->>'totalUsages' AS integer) >= 0 AND
                CAST(usage_stats->>'uniqueUsers' AS integer) >= 0 AND
                CAST(usage_stats->>'averageSessionDuration' AS numeric) >= 0 AND
                CAST(usage_stats->>'popularityScore' AS numeric) >= 0 AND
                CAST(usage_stats->>'feedbackCount' AS integer) >= 0
            );
    END IF;
END $$;

-- Ensure persona configuration values are within valid ranges
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_persona_configuration_ranges') THEN
        ALTER TABLE personas ADD CONSTRAINT check_persona_configuration_ranges
            CHECK (
                configuration IS NULL OR (
                    CAST(configuration->>'maxTokens' AS integer) > 0 AND
                    CAST(configuration->>'temperature' AS numeric) BETWEEN 0 AND 2 AND
                    CAST(configuration->>'topP' AS numeric) BETWEEN 0 AND 1 AND
                    CAST(configuration->>'frequencyPenalty' AS numeric) BETWEEN -2 AND 2 AND
                    CAST(configuration->>'presencePenalty' AS numeric) BETWEEN -2 AND 2
                )
            );
    END IF;
END $$;

-- Ensure discussion analytics are non-negative
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_discussion_analytics_non_negative') THEN
        ALTER TABLE discussions ADD CONSTRAINT check_discussion_analytics_non_negative
            CHECK (
                analytics IS NULL OR (
                    CAST(analytics->>'totalMessages' AS integer) >= 0 AND
                    CAST(analytics->>'uniqueUsers' AS integer) >= 0 AND
                    CAST(analytics->>'averageMessageLength' AS numeric) >= 0
                )
            );
    END IF;
END $$;

-- Ensure discussion state values are within valid ranges
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_discussion_state_ranges') THEN
        ALTER TABLE discussions ADD CONSTRAINT check_discussion_state_ranges
            CHECK (
                state IS NULL OR (
                    CAST(state->>'messageCount' AS integer) >= 0 AND
                    CAST(state->>'activeParticipants' AS integer) >= 0 AND
                    CAST(state->>'consensusLevel' AS numeric) BETWEEN 0 AND 1 AND
                    CAST(state->>'engagementScore' AS numeric) BETWEEN 0 AND 100 AND
                    CAST(state->>'topicDrift' AS numeric) BETWEEN 0 AND 1
                )
            );
    END IF;
END $$;

-- Ensure discussion settings are valid
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_discussion_settings_valid') THEN
        ALTER TABLE discussions ADD CONSTRAINT check_discussion_settings_valid
            CHECK (
                settings IS NULL OR (
                    CAST(settings->>'maxParticipants' AS integer) BETWEEN 2 AND 50 AND
                    CAST(settings->>'turnTimeout' AS integer) >= 0 AND
                    CAST(settings->>'responseTimeout' AS integer) >= 0
                )
            );
    END IF;
END $$;

-- Ensure discussion dates are logical
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_discussion_dates_logical') THEN
        ALTER TABLE discussions ADD CONSTRAINT check_discussion_dates_logical
            CHECK (
                (started_at IS NULL OR ended_at IS NULL OR started_at <= ended_at) AND
                (scheduled_start IS NULL OR scheduled_end IS NULL OR scheduled_start <= scheduled_end)
            );
    END IF;
END $$;

-- Ensure participant message count matches actual messages
-- Note: This will be maintained by triggers, but we add a constraint for safety
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_participant_message_count_non_negative') THEN
        ALTER TABLE discussion_participants ADD CONSTRAINT check_participant_message_count_non_negative
            CHECK (message_count >= 0);
    END IF;
END $$;

-- Ensure participant dates are logical
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_participant_dates_logical') THEN
        ALTER TABLE discussion_participants ADD CONSTRAINT check_participant_dates_logical
            CHECK (joined_at <= last_active_at);
    END IF;
END $$;

-- ===== REFERENTIAL INTEGRITY ENHANCEMENTS =====

-- Add foreign key constraint for persona capabilities (assuming capabilities table exists)
-- This will be added when capabilities are properly linked
-- ALTER TABLE personas ADD CONSTRAINT fk_personas_capabilities 
--     FOREIGN KEY (capabilities) REFERENCES capabilities(id);

-- ===== PERFORMANCE VIEWS =====

-- View for active discussions with participant counts
DROP VIEW IF EXISTS active_discussions_summary;
CREATE VIEW active_discussions_summary AS
SELECT 
    d.id,
    d.title,
    d.topic,
    d.status,
    d.created_by,
    d.started_at,
    COUNT(dp.id) as participant_count,
    COUNT(CASE WHEN dp.is_active THEN 1 END) as active_participant_count,
    CAST(d.state->>'messageCount' AS integer) as message_count,
    CAST(d.state->>'consensusLevel' AS numeric) as consensus_level,
    CAST(d.state->>'engagementScore' AS numeric) as engagement_score,
    d.created_at,
    d.updated_at
FROM discussions d
LEFT JOIN discussion_participants dp ON d.id = dp.discussion_id
WHERE d.status IN ('active', 'paused')
GROUP BY d.id;

-- View for persona usage statistics
DROP VIEW IF EXISTS persona_usage_summary;
CREATE VIEW persona_usage_summary AS
SELECT 
    p.id,
    p.name,
    p.role,
    p.status,
    p.visibility,
    p.created_by,
    CAST(p.usage_stats->>'totalUsages' AS integer) as total_usages,
    CAST(p.usage_stats->>'uniqueUsers' AS integer) as unique_users,
    CAST(p.usage_stats->>'popularityScore' AS numeric) as popularity_score,
    CAST(p.usage_stats->>'feedbackCount' AS integer) as feedback_count,
    CAST(p.validation->>'score' AS numeric) as validation_score,
    p.created_at,
    p.updated_at
FROM personas p
WHERE p.status = 'active';

-- View for discussion message statistics
DROP VIEW IF EXISTS discussion_message_stats;
CREATE VIEW discussion_message_stats AS
SELECT 
    dm.discussion_id,
    COUNT(*) as total_messages,
    COUNT(DISTINCT dm.participant_id) as unique_participants,
    AVG(LENGTH(dm.content)) as avg_message_length,
    AVG(dm.tokens) as avg_tokens,
    AVG(dm.processing_time) as avg_processing_time,
    COUNT(CASE WHEN dm.sentiment = 'positive' THEN 1 END) as positive_messages,
    COUNT(CASE WHEN dm.sentiment = 'negative' THEN 1 END) as negative_messages,
    COUNT(CASE WHEN dm.sentiment = 'neutral' THEN 1 END) as neutral_messages,
    MIN(dm.created_at) as first_message_at,
    MAX(dm.created_at) as last_message_at
FROM discussion_messages dm
WHERE dm.is_deleted = false
GROUP BY dm.discussion_id;

-- ===== CLEANUP AND MAINTENANCE FUNCTIONS =====

-- Function to cleanup old deleted messages
CREATE OR REPLACE FUNCTION cleanup_deleted_messages(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM discussion_messages 
    WHERE is_deleted = true 
    AND deleted_at < NOW() - INTERVAL '1 day' * days_old;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update persona popularity scores
CREATE OR REPLACE FUNCTION update_persona_popularity_scores()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE personas 
    SET usage_stats = jsonb_set(
        usage_stats,
        '{popularityScore}',
        LEAST(100, (
            COALESCE(CAST(usage_stats->>'totalUsages' AS integer), 0) * 0.4 +
            COALESCE(CAST(usage_stats->>'uniqueUsers' AS integer), 0) * 0.3 +
            COALESCE(CAST(usage_stats->>'feedbackCount' AS integer), 0) * 0.3
        ))::text::jsonb
    )
    WHERE status = 'active';
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ===== TRIGGERS FOR AUTOMATIC MAINTENANCE =====

-- Trigger to update discussion analytics when messages are added
CREATE OR REPLACE FUNCTION update_discussion_analytics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update discussion state with new message count and analytics
    UPDATE discussions 
    SET 
        state = jsonb_set(
            COALESCE(state, '{}'::jsonb),
            '{messageCount}',
            (
                SELECT COUNT(*)::text::jsonb 
                FROM discussion_messages 
                WHERE discussion_id = NEW.discussion_id 
                AND is_deleted = false
            )
        ),
        analytics = jsonb_set(
            jsonb_set(
                COALESCE(analytics, '{}'::jsonb),
                '{totalMessages}',
                (
                    SELECT COUNT(*)::text::jsonb 
                    FROM discussion_messages 
                    WHERE discussion_id = NEW.discussion_id 
                    AND is_deleted = false
                )
            ),
            '{uniqueParticipants}',
            (
                SELECT COUNT(DISTINCT participant_id)::text::jsonb 
                FROM discussion_messages 
                WHERE discussion_id = NEW.discussion_id 
                AND is_deleted = false
            )
        ),
        updated_at = NOW()
    WHERE id = NEW.discussion_id;
    
    -- Update participant message count
    UPDATE discussion_participants 
    SET 
        message_count = (
            SELECT COUNT(*) 
            FROM discussion_messages 
            WHERE discussion_id = NEW.discussion_id 
            AND participant_id = NEW.participant_id 
            AND is_deleted = false
        ),
        last_active_at = NOW()
    WHERE discussion_id = NEW.discussion_id 
    AND participant_id = NEW.participant_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for discussion message analytics
DROP TRIGGER IF EXISTS trigger_update_discussion_analytics ON discussion_messages;
CREATE TRIGGER trigger_update_discussion_analytics
    AFTER INSERT OR UPDATE ON discussion_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_discussion_analytics();

-- Trigger to update persona usage statistics
CREATE OR REPLACE FUNCTION update_persona_usage_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- This would be called when a persona is used in a discussion
    -- Implementation depends on how persona usage is tracked
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===== INDEXES FOR PERFORMANCE =====

-- Additional composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_discussions_status_created_by ON discussions(status, created_by);
CREATE INDEX IF NOT EXISTS idx_discussions_status_started_at ON discussions(status, started_at) WHERE started_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discussion_participants_active ON discussion_participants(discussion_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_discussion_messages_discussion_created ON discussion_messages(discussion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_personas_status_visibility ON personas(status, visibility);
CREATE INDEX IF NOT EXISTS idx_personas_created_by_status ON personas(created_by, status);

-- Partial indexes for better performance on filtered queries
CREATE INDEX IF NOT EXISTS idx_active_discussions ON discussions(id, title, created_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_public_personas ON personas(id, name, role) WHERE visibility = 'public' AND status = 'active';
-- Note: Removed idx_recent_messages as NOW() function is not immutable and cannot be used in index predicates
-- For recent messages queries, use a regular index on created_at and filter in the WHERE clause 