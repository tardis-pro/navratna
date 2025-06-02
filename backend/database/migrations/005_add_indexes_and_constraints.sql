-- Migration: Add additional indexes and constraints
-- Description: Adds performance indexes and data integrity constraints for persona/discussion system

-- ===== ADDITIONAL PERFORMANCE INDEXES =====

-- Cross-table relationship indexes
CREATE INDEX idx_personas_usage_stats_popularity ON personas((usage_stats->>'popularityScore')::numeric) WHERE (usage_stats->>'popularityScore')::numeric > 0;
CREATE INDEX idx_personas_usage_stats_total_usages ON personas((usage_stats->>'totalUsages')::integer) WHERE (usage_stats->>'totalUsages')::integer > 0;
CREATE INDEX idx_personas_validation_score ON personas((validation->>'score')::numeric) WHERE validation IS NOT NULL;

-- Discussion analytics indexes
CREATE INDEX idx_discussions_analytics_total_messages ON discussions((analytics->>'totalMessages')::integer) WHERE (analytics->>'totalMessages')::integer > 0;
CREATE INDEX idx_discussions_state_consensus ON discussions((state->>'consensusLevel')::numeric) WHERE (state->>'consensusLevel')::numeric > 0;
CREATE INDEX idx_discussions_state_engagement ON discussions((state->>'engagementScore')::numeric) WHERE (state->>'engagementScore')::numeric > 0;

-- Message performance indexes
CREATE INDEX idx_discussion_messages_tokens ON discussion_messages(tokens) WHERE tokens IS NOT NULL;
CREATE INDEX idx_discussion_messages_processing_time ON discussion_messages(processing_time) WHERE processing_time IS NOT NULL;
CREATE INDEX idx_discussion_messages_confidence ON discussion_messages(confidence) WHERE confidence IS NOT NULL;

-- ===== DATA INTEGRITY CONSTRAINTS =====

-- Ensure persona validation scores are within valid range
ALTER TABLE personas ADD CONSTRAINT check_persona_validation_score 
    CHECK (validation IS NULL OR (validation->>'score')::numeric BETWEEN 0 AND 100);

-- Ensure persona usage stats are non-negative
ALTER TABLE personas ADD CONSTRAINT check_persona_usage_stats_non_negative
    CHECK (
        (usage_stats->>'totalUsages')::integer >= 0 AND
        (usage_stats->>'uniqueUsers')::integer >= 0 AND
        (usage_stats->>'averageSessionDuration')::numeric >= 0 AND
        (usage_stats->>'popularityScore')::numeric >= 0 AND
        (usage_stats->>'feedbackCount')::integer >= 0
    );

-- Ensure persona configuration values are within valid ranges
ALTER TABLE personas ADD CONSTRAINT check_persona_configuration_ranges
    CHECK (
        configuration IS NULL OR (
            (configuration->>'maxTokens')::integer > 0 AND
            (configuration->>'temperature')::numeric BETWEEN 0 AND 2 AND
            (configuration->>'topP')::numeric BETWEEN 0 AND 1 AND
            (configuration->>'frequencyPenalty')::numeric BETWEEN -2 AND 2 AND
            (configuration->>'presencePenalty')::numeric BETWEEN -2 AND 2
        )
    );

-- Ensure discussion analytics are non-negative
ALTER TABLE discussions ADD CONSTRAINT check_discussion_analytics_non_negative
    CHECK (
        analytics IS NULL OR (
            (analytics->>'totalMessages')::integer >= 0 AND
            (analytics->>'uniqueParticipants')::integer >= 0 AND
            (analytics->>'averageMessageLength')::numeric >= 0
        )
    );

-- Ensure discussion state values are within valid ranges
ALTER TABLE discussions ADD CONSTRAINT check_discussion_state_ranges
    CHECK (
        state IS NULL OR (
            (state->>'messageCount')::integer >= 0 AND
            (state->>'activeParticipants')::integer >= 0 AND
            (state->>'consensusLevel')::numeric BETWEEN 0 AND 1 AND
            (state->>'engagementScore')::numeric BETWEEN 0 AND 100 AND
            (state->>'topicDrift')::numeric BETWEEN 0 AND 1
        )
    );

-- Ensure discussion settings are valid
ALTER TABLE discussions ADD CONSTRAINT check_discussion_settings_valid
    CHECK (
        settings IS NULL OR (
            (settings->>'maxParticipants')::integer BETWEEN 2 AND 50 AND
            (settings->>'turnTimeout')::integer >= 0 AND
            (settings->>'responseTimeout')::integer >= 0
        )
    );

-- Ensure discussion dates are logical
ALTER TABLE discussions ADD CONSTRAINT check_discussion_dates_logical
    CHECK (
        (started_at IS NULL OR ended_at IS NULL OR started_at <= ended_at) AND
        (scheduled_start IS NULL OR scheduled_end IS NULL OR scheduled_start <= scheduled_end)
    );

-- Ensure participant message count matches actual messages
-- Note: This will be maintained by triggers, but we add a constraint for safety
ALTER TABLE discussion_participants ADD CONSTRAINT check_participant_message_count_non_negative
    CHECK (message_count >= 0);

-- Ensure participant dates are logical
ALTER TABLE discussion_participants ADD CONSTRAINT check_participant_dates_logical
    CHECK (joined_at <= last_active_at);

-- ===== REFERENTIAL INTEGRITY ENHANCEMENTS =====

-- Add foreign key constraint for persona capabilities (assuming capabilities table exists)
-- This will be added when capabilities are properly linked
-- ALTER TABLE personas ADD CONSTRAINT fk_personas_capabilities 
--     FOREIGN KEY (capabilities) REFERENCES capabilities(id);

-- ===== PERFORMANCE VIEWS =====

-- View for active discussions with participant counts
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
    (d.state->>'messageCount')::integer as message_count,
    (d.state->>'consensusLevel')::numeric as consensus_level,
    (d.state->>'engagementScore')::numeric as engagement_score,
    d.created_at,
    d.updated_at
FROM discussions d
LEFT JOIN discussion_participants dp ON d.id = dp.discussion_id
WHERE d.status IN ('active', 'paused')
GROUP BY d.id;

-- View for persona usage statistics
CREATE VIEW persona_usage_summary AS
SELECT 
    p.id,
    p.name,
    p.role,
    p.status,
    p.visibility,
    p.created_by,
    (p.usage_stats->>'totalUsages')::integer as total_usages,
    (p.usage_stats->>'uniqueUsers')::integer as unique_users,
    (p.usage_stats->>'popularityScore')::numeric as popularity_score,
    (p.usage_stats->>'feedbackCount')::integer as feedback_count,
    (p.validation->>'score')::numeric as validation_score,
    p.created_at,
    p.updated_at
FROM personas p
WHERE p.status = 'active';

-- View for discussion message statistics
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
            COALESCE((usage_stats->>'totalUsages')::integer, 0) * 0.4 +
            COALESCE((usage_stats->>'uniqueUsers')::integer, 0) * 0.3 +
            COALESCE((usage_stats->>'feedbackCount')::integer, 0) * 0.3
        ))::text::jsonb
    )
    WHERE status = 'active';
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql; 