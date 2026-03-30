CREATE TABLE "agent_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"agent_id" uuid NOT NULL,
	"activity_type" varchar(100) NOT NULL,
	"duration" integer,
	"success" boolean DEFAULT true NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_capability_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"agent_id" uuid NOT NULL,
	"capability" varchar(255) NOT NULL,
	"score" numeric(5,2) NOT NULL,
	"evaluated_at" timestamp NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_llm_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"agent_id" uuid NOT NULL,
	"temperature" numeric(3,2),
	"model_id" uuid,
	"max_tokens" integer,
	"system_prompt" text,
	"preferences" jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_learning_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"agent_id" uuid NOT NULL,
	"lesson_type" varchar(100) NOT NULL,
	"content" jsonb NOT NULL,
	"confidence" numeric(3,2),
	"applied_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"role" text NOT NULL,
	"persona_id" uuid NOT NULL,
	"legacy_persona" jsonb,
	"intelligence_config" jsonb NOT NULL,
	"security_context" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar NOT NULL,
	"last_active_at" timestamp,
	"status" text DEFAULT 'idle' NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capability_scores" jsonb,
	"learning_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"performance_metrics" jsonb,
	"security_level" text DEFAULT 'medium' NOT NULL,
	"compliance_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audit_trail" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"configuration" jsonb,
	"preferences" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"version" varchar(50) DEFAULT '1.0.0' NOT NULL,
	"deployment_environment" varchar(50),
	"total_operations" integer DEFAULT 0 NOT NULL,
	"successful_operations" integer DEFAULT 0 NOT NULL,
	"average_response_time" numeric(10,2),
	"last_performance_review" timestamp,
	"tool_permissions" jsonb,
	"tool_preferences" jsonb,
	"tool_budget" jsonb,
	"max_concurrent_tools" integer DEFAULT 3 NOT NULL,
	"assigned_mcp_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mcp_tool_settings" jsonb,
	"model_id" varchar,
	"api_type" text,
	"user_llm_provider_id" uuid,
	"temperature" numeric(3,2),
	"max_tokens" integer,
	"system_prompt" text,
	CONSTRAINT "agents_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "artifact_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"environment" varchar(100) NOT NULL,
	"status" varchar(50) NOT NULL,
	"deployed_by" varchar NOT NULL,
	"deployed_at" timestamp NOT NULL,
	"rollback_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "artifact_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"reviewer_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"score" numeric(3,2),
	"comments" text,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_at" timestamp,
	"quality_score" numeric(3,2),
	"security_score" numeric(3,2),
	"performance_score" numeric(3,2),
	"maintainability_score" numeric(3,2),
	"documentation_score" numeric(3,2),
	"code_quality_feedback" text,
	"security_feedback" text,
	"performance_feedback" text,
	"documentation_feedback" text,
	"review_duration_minutes" integer,
	"review_type" text DEFAULT 'manual' NOT NULL,
	"review_priority" text DEFAULT 'medium' NOT NULL,
	"requires_follow_up" boolean DEFAULT false NOT NULL,
	"follow_up_date" timestamp,
	"approval_level" text,
	"escalated_to" varchar,
	"escalated_at" timestamp,
	"escalation_reason" text,
	"checklist_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"compliance_checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"security_scan_passed" boolean,
	"automated_tests_passed" boolean,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"review_context" jsonb,
	"external_references" jsonb
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"language" varchar,
	"framework" varchar,
	"target_file" varchar,
	"estimated_effort" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"project_id" uuid,
	"conversation_id" varchar NOT NULL,
	"generated_by" varchar NOT NULL,
	"generated_at" timestamp NOT NULL,
	"generator" varchar(255) NOT NULL,
	"confidence" numeric(3,2) NOT NULL,
	"source_messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation_result" jsonb,
	"validation_status" text DEFAULT 'pending' NOT NULL,
	"validation_score" numeric(3,2),
	"version" varchar(50) DEFAULT '1.0.0' NOT NULL,
	"parent_artifact_id" varchar,
	"iteration_count" integer DEFAULT 1 NOT NULL,
	"is_latest_version" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"deployed_at" timestamp,
	"archived_at" timestamp,
	"quality_score" numeric(3,2),
	"user_rating" numeric(3,2),
	"usage_count" integer DEFAULT 0 NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"content_size_bytes" integer,
	"line_count" integer,
	"complexity_score" numeric(3,2),
	"security_level" text DEFAULT 'medium' NOT NULL,
	"compliance_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"security_scan_result" jsonb,
	"license" varchar,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"system_requirements" jsonb,
	"deployment_config" jsonb,
	"metadata" jsonb,
	"generation_context" jsonb,
	"external_references" jsonb
);
--> statement-breakpoint
CREATE TABLE "conversation_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"agent_id" uuid NOT NULL,
	"discussion_id" uuid,
	"context_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"token_count" integer,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "discussion_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"discussion_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"content" text NOT NULL,
	"message_type" text DEFAULT 'message' NOT NULL,
	"reply_to_message_id" uuid,
	"attachments" text[] DEFAULT '{}' NOT NULL,
	"reactions" jsonb,
	"is_edited" boolean DEFAULT false NOT NULL,
	"edited_at" timestamp,
	"edit_reason" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" uuid,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"pinned_at" timestamp,
	"pinned_by" uuid,
	"metadata" jsonb,
	"confidence" numeric(5,4),
	"agent_id" uuid,
	"processing_info" jsonb
);
--> statement-breakpoint
CREATE TABLE "discussion_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"discussion_id" uuid NOT NULL,
	"agent_id" uuid,
	"user_id" uuid,
	"persona_id" uuid,
	"role" varchar(100),
	"participant_type" varchar(50),
	"joined_at" timestamp,
	"left_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "discussions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"title" varchar(255) NOT NULL,
	"topic" varchar(1000) NOT NULL,
	"description" text,
	"document_id" uuid,
	"operation_id" uuid,
	"state" jsonb,
	"settings" jsonb NOT NULL,
	"turn_strategy" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_by" uuid NOT NULL,
	"organization_id" uuid,
	"team_id" uuid,
	"started_at" timestamp,
	"ended_at" timestamp,
	"scheduled_for" timestamp,
	"estimated_duration" integer,
	"actual_duration" integer,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"objectives" text[] DEFAULT '{}' NOT NULL,
	"outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_discussions" uuid[] DEFAULT '{}' NOT NULL,
	"parent_discussion_id" uuid,
	"child_discussions" uuid[] DEFAULT '{}' NOT NULL,
	"analytics" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"content" text NOT NULL,
	"type" text DEFAULT 'factual' NOT NULL,
	"source_type" text NOT NULL,
	"source_identifier" varchar(255) NOT NULL,
	"source_url" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"confidence" numeric(3,2) DEFAULT 0.8 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" varchar(36),
	"organization_id" varchar(36),
	"access_level" varchar(50) DEFAULT 'public' NOT NULL,
	"user_id" varchar(36),
	"agent_id" varchar(36),
	"summary" text
);
--> statement-breakpoint
CREATE TABLE "knowledge_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"relationship_type" varchar(100) NOT NULL,
	"strength" numeric(3,2),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "llm_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"provider_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"description" text,
	"context_window" integer,
	"max_output_tokens" integer,
	"input_cost_per_1k_tokens" numeric(10,6),
	"output_cost_per_1k_tokens" numeric(10,6),
	"capabilities" jsonb DEFAULT '[]'::jsonb,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "llm_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"type" text DEFAULT 'custom' NOT NULL,
	"base_url" varchar(500) NOT NULL,
	"api_key_encrypted" text,
	"default_model" varchar(255),
	"configuration" json,
	"status" text DEFAULT 'active' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"total_tokens_used" integer DEFAULT 0 NOT NULL,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"total_errors" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"last_health_check_at" timestamp,
	"health_check_result" json,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "llm_providers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "persona_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"persona_id" uuid NOT NULL,
	"period" varchar(50) NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"interactions" integer DEFAULT 0 NOT NULL,
	"success_rate" numeric(5,2),
	"avg_response_time" numeric(10,2),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"background" text NOT NULL,
	"system_prompt" text NOT NULL,
	"traits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expertise" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tone" text,
	"style" text,
	"energy_level" text,
	"chattiness" numeric(3,2),
	"empathy_level" numeric(3,2),
	"parent_personas" jsonb,
	"hybrid_traits" jsonb,
	"dominant_expertise" varchar(255),
	"personality_blend" jsonb,
	"conversational_style" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_by" varchar NOT NULL,
	"organization_id" varchar,
	"team_id" varchar,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_persona_id" varchar,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation" jsonb,
	"usage_stats" jsonb,
	"configuration" jsonb,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"restrictions" jsonb,
	"metadata" jsonb,
	"quality_score" numeric(3,2),
	"consistency_score" numeric(3,2),
	"user_satisfaction" numeric(3,2),
	"total_interactions" integer DEFAULT 0 NOT NULL,
	"successful_interactions" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"last_updated_by" varchar,
	CONSTRAINT "personas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "short_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"short_code" varchar(20) NOT NULL,
	"original_url" text NOT NULL,
	"title" varchar(255),
	"description" text,
	"type" text DEFAULT 'external' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_id" uuid NOT NULL,
	"artifact_id" uuid,
	"project_file_id" uuid,
	"expires_at" timestamp,
	"access_restrictions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"analytics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" json,
	"custom_domain" varchar(500),
	"password" varchar(100),
	"last_clicked_at" timestamp,
	"click_count" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"metadata" json,
	"qr_code" text,
	"track_clicks" boolean DEFAULT true NOT NULL,
	"utm_source" varchar(200),
	"utm_medium" varchar(200),
	"utm_campaign" varchar(200),
	CONSTRAINT "short_links_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "agent_oauth_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"agent_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"expires_at" timestamp,
	"scopes" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"approver_id" varchar NOT NULL,
	"decision" text NOT NULL,
	"reason" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "approval_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"operation_id" varchar NOT NULL,
	"required_approvers" jsonb NOT NULL,
	"current_approvers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"last_reminder_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"entity_type" varchar(100),
	"entity_id" varchar,
	"actor_id" varchar,
	"actor_type" varchar(50),
	"action" varchar(100) NOT NULL,
	"outcome" varchar(50) NOT NULL,
	"details" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" varchar(100) NOT NULL,
	"configuration" jsonb,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "capabilities_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"source" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp,
	"error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"command" text,
	"args" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"env" jsonb,
	"working_directory" varchar,
	"transport_type" varchar(20) DEFAULT 'stdio' NOT NULL,
	"url" text,
	"headers" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"auto_start" boolean DEFAULT false NOT NULL,
	"retry_attempts" integer DEFAULT 3 NOT NULL,
	"health_check_interval" integer DEFAULT 30000 NOT NULL,
	"timeout" integer DEFAULT 30000 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author" varchar(255) NOT NULL,
	"version" varchar(50) NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"security_level" text NOT NULL,
	"status" text DEFAULT 'stopped' NOT NULL,
	"pid" integer,
	"start_time" timestamp,
	"last_health_check" timestamp,
	"error" text,
	"capabilities" jsonb,
	"capabilities_last_updated" timestamp,
	"tool_count" integer DEFAULT 0 NOT NULL,
	"resource_count" integer DEFAULT 0 NOT NULL,
	"prompt_count" integer DEFAULT 0 NOT NULL,
	"stats" jsonb,
	"total_calls" integer DEFAULT 0 NOT NULL,
	"successful_calls" integer DEFAULT 0 NOT NULL,
	"failed_calls" integer DEFAULT 0 NOT NULL,
	"average_response_time" numeric(10, 2),
	"last_call_time" timestamp,
	"uptime_seconds" integer DEFAULT 0 NOT NULL,
	"memory_usage_mb" numeric(10, 2),
	"cpu_usage_percent" numeric(5, 2),
	"restart_count" integer DEFAULT 0 NOT NULL,
	"last_restart_time" timestamp,
	"crash_count" integer DEFAULT 0 NOT NULL,
	"last_crash_time" timestamp,
	"deployment_config" jsonb,
	"environment_variables" jsonb,
	"resource_limits" jsonb,
	"network_config" jsonb,
	"log_level" text DEFAULT 'info' NOT NULL,
	"log_retention_days" integer DEFAULT 7 NOT NULL,
	"debug_mode" boolean DEFAULT false NOT NULL,
	"trace_enabled" boolean DEFAULT false NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"maintenance_message" text,
	"scheduled_maintenance" timestamp,
	"deprecation_date" timestamp,
	"end_of_life_date" timestamp,
	"metadata" jsonb,
	"external_references" jsonb,
	"documentation_url" text,
	"support_contact" varchar,
	CONSTRAINT "mcp_servers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "mcp_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"server_id" uuid NOT NULL,
	"tool_name" varchar(255) NOT NULL,
	"agent_id" uuid,
	"parameters" jsonb,
	"result" jsonb,
	"error" text,
	"status" varchar(50) NOT NULL,
	"duration" integer,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "mfa_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"challenge_type" varchar(50) NOT NULL,
	"challenge_data" jsonb,
	"expires_at" timestamp NOT NULL,
	"verified_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" text NOT NULL,
	"client_id" varchar(255) NOT NULL,
	"client_secret_encrypted" text,
	"authorization_url" varchar(500),
	"token_url" varchar(500),
	"user_info_url" varchar(500),
	"scopes" jsonb DEFAULT '[]'::jsonb,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"configuration" jsonb
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"state" varchar(255) NOT NULL,
	"user_id" uuid,
	"provider_id" uuid,
	"redirect_url" varchar(500),
	"expires_at" timestamp NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "oauth_states_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE "operation_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"operation_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"data" jsonb NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "operation_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"operation_id" uuid NOT NULL,
	"state" jsonb NOT NULL,
	"checkpoint" varchar(255),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"type" varchar(100) NOT NULL,
	"status" text NOT NULL,
	"agent_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"execution_plan" jsonb NOT NULL,
	"context" jsonb,
	"result" jsonb,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"estimated_duration" integer,
	"actual_duration" integer,
	"priority" text DEFAULT 'medium' NOT NULL,
	"progress" numeric(5, 2),
	"current_step" integer DEFAULT 0 NOT NULL,
	"total_steps" integer,
	"step_details" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"retry_delay" integer,
	"timeout_duration" integer,
	"resource_requirements" jsonb,
	"resource_allocation" jsonb,
	"performance_metrics" jsonb,
	"quality_metrics" jsonb,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dependent_operations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp,
	"archived_by" varchar,
	"archive_reason" text
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar(500) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"path" varchar(1000) NOT NULL,
	"mime_type" varchar(255),
	"size_bytes" integer,
	"uploaded_by" uuid,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"agent_id" uuid,
	"role" varchar(100) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"type" varchar(100),
	"owner_id" uuid NOT NULL,
	"organization_id" uuid,
	"settings" jsonb,
	"metadata" jsonb,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar(500) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "security_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"policy_type" varchar(100) NOT NULL,
	"rules" jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"applies_to" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_token" varchar(255) NOT NULL,
	"refresh_token" text,
	"status" text DEFAULT 'active' NOT NULL,
	"user_type" text DEFAULT 'human' NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"device_info" json,
	"location" json,
	"authentication_method" text NOT NULL,
	"oauth_provider" text,
	"agent_capabilities" json,
	"mfa_verified" boolean DEFAULT false NOT NULL,
	"risk_score" numeric(3, 1) DEFAULT '0' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_activity_at" timestamp NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "step_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"operation_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"status" varchar(50) NOT NULL,
	"result" jsonb,
	"error" text,
	"duration" integer,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"priority" varchar(50) DEFAULT 'medium' NOT NULL,
	"assignee_id" uuid,
	"due_at" timestamp,
	"completed_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "tool_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"tool_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"configuration" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "tool_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"return_type" jsonb NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"security_level" text NOT NULL,
	"cost_estimate" numeric(10, 2),
	"execution_time_estimate" integer,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" varchar(50) NOT NULL,
	"author" varchar(255) NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"rate_limits" jsonb,
	"total_executions" integer DEFAULT 0 NOT NULL,
	"successful_executions" integer DEFAULT 0 NOT NULL,
	"average_execution_time" numeric(10, 2),
	"last_used_at" timestamp,
	"documentation_url" text,
	"support_contact" varchar,
	"changelog" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deployment_config" jsonb,
	"environment_requirements" jsonb,
	"reliability_score" numeric(3, 2),
	"user_rating" numeric(3, 2),
	"maintenance_status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "tool_definitions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tool_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"tool_id" uuid NOT NULL,
	"agent_id" uuid,
	"user_id" uuid,
	"operation_id" uuid,
	"status" varchar(50) NOT NULL,
	"parameters" jsonb,
	"result" jsonb,
	"error" text,
	"duration" integer,
	"tokens_used" integer,
	"cost" numeric(10, 4),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "tool_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"tool_id" uuid NOT NULL,
	"agent_id" uuid,
	"user_id" uuid,
	"execution_id" uuid,
	"success" boolean DEFAULT true NOT NULL,
	"duration" integer,
	"cost" numeric(10, 4),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"contact_user_id" uuid,
	"name" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"relationship" varchar(100),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_llm_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"temperature" numeric(3, 2),
	"model_id" uuid,
	"max_tokens" integer,
	"system_prompt" text,
	"preferences" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_llm_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"api_key_encrypted" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"configuration" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"theme" varchar(50) DEFAULT 'dark',
	"language" varchar(10) DEFAULT 'en',
	"timezone" varchar(100),
	"notifications" jsonb,
	"accessibility" jsonb,
	"preferences" jsonb,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'offline' NOT NULL,
	"last_seen_at" timestamp,
	"current_session_id" uuid,
	"metadata" jsonb,
	CONSTRAINT "user_presence_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_tool_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"favorite_tools" jsonb DEFAULT '[]'::jsonb,
	"blocked_tools" jsonb DEFAULT '[]'::jsonb,
	CONSTRAINT "user_tool_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"email" varchar(255) NOT NULL,
	"first_name" varchar(255),
	"last_name" varchar(255),
	"department" varchar(100),
	"role" varchar(50) NOT NULL,
	"user_type" text DEFAULT 'human' NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"security_clearance" text DEFAULT 'medium' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"password_changed_at" timestamp,
	"last_login_at" timestamp,
	"permissions" json,
	"agent_config" json,
	"user_persona" json,
	"onboarding_progress" json,
	"behavioral_patterns" json,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_capability_metrics" ADD CONSTRAINT "agent_capability_metrics_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_llm_preferences" ADD CONSTRAINT "agent_llm_preferences_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_learning_records" ADD CONSTRAINT "agent_learning_records_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_deployments" ADD CONSTRAINT "artifact_deployments_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_reviews" ADD CONSTRAINT "artifact_reviews_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_contexts" ADD CONSTRAINT "conversation_contexts_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_contexts" ADD CONSTRAINT "conversation_contexts_discussion_id_discussions_id_fk" FOREIGN KEY ("discussion_id") REFERENCES "public"."discussions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_messages" ADD CONSTRAINT "discussion_messages_discussion_id_discussions_id_fk" FOREIGN KEY ("discussion_id") REFERENCES "public"."discussions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_messages" ADD CONSTRAINT "discussion_messages_participant_id_discussion_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."discussion_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_participants" ADD CONSTRAINT "discussion_participants_discussion_id_discussions_id_fk" FOREIGN KEY ("discussion_id") REFERENCES "public"."discussions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_participants" ADD CONSTRAINT "discussion_participants_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_participants" ADD CONSTRAINT "discussion_participants_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_source_id_knowledge_items_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_relationships" ADD CONSTRAINT "knowledge_relationships_target_id_knowledge_items_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_models" ADD CONSTRAINT "llm_models_provider_id_llm_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."llm_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_analytics" ADD CONSTRAINT "persona_analytics_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_links" ADD CONSTRAINT "short_links_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_oauth_connections" ADD CONSTRAINT "agent_oauth_connections_provider_id_oauth_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."oauth_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_workflow_id_approval_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."approval_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_calls" ADD CONSTRAINT "mcp_tool_calls_server_id_mcp_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_provider_id_oauth_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."oauth_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_checkpoints" ADD CONSTRAINT "operation_checkpoints_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_states" ADD CONSTRAINT "operation_states_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_results" ADD CONSTRAINT "step_results_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_assignments" ADD CONSTRAINT "tool_assignments_tool_id_tool_definitions_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_tool_id_tool_definitions_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_usage_records" ADD CONSTRAINT "tool_usage_records_tool_id_tool_definitions_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_contacts" ADD CONSTRAINT "user_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_contacts" ADD CONSTRAINT "user_contacts_contact_user_id_users_id_fk" FOREIGN KEY ("contact_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_llm_preferences" ADD CONSTRAINT "user_llm_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_llm_providers" ADD CONSTRAINT "user_llm_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_messages" ADD CONSTRAINT "user_messages_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_messages" ADD CONSTRAINT "user_messages_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tool_preferences" ADD CONSTRAINT "user_tool_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agents_name" ON "agents" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_agents_role_active" ON "agents" USING btree ("role","is_active");--> statement-breakpoint
CREATE INDEX "idx_agents_created_by" ON "agents" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_agents_last_active" ON "agents" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "idx_agents_security_level" ON "agents" USING btree ("security_level");--> statement-breakpoint
CREATE INDEX "idx_agents_persona_id" ON "agents" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "idx_artifacts_type_created" ON "artifacts" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "idx_artifacts_conversation_id" ON "artifacts" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_artifacts_generated_by" ON "artifacts" USING btree ("generated_by");--> statement-breakpoint
CREATE INDEX "idx_artifacts_language_framework" ON "artifacts" USING btree ("language","framework");--> statement-breakpoint
CREATE INDEX "idx_knowledge_items_source" ON "knowledge_items" USING btree ("source_type","source_identifier");--> statement-breakpoint
CREATE INDEX "idx_knowledge_items_type" ON "knowledge_items" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_knowledge_items_confidence" ON "knowledge_items" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "idx_knowledge_items_created_at" ON "knowledge_items" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_knowledge_items_user_type" ON "knowledge_items" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "idx_knowledge_items_agent_type" ON "knowledge_items" USING btree ("agent_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_llm_providers_name" ON "llm_providers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_llm_providers_type_active" ON "llm_providers" USING btree ("type","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_personas_name" ON "personas" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_personas_status_visibility" ON "personas" USING btree ("status","visibility");--> statement-breakpoint
CREATE INDEX "idx_personas_created_by_org" ON "personas" USING btree ("created_by","organization_id");--> statement-breakpoint
CREATE INDEX "idx_personas_dominant_expertise" ON "personas" USING btree ("dominant_expertise");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_short_links_code" ON "short_links" USING btree ("short_code");--> statement-breakpoint
CREATE INDEX "idx_short_links_created_by" ON "short_links" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "idx_short_links_type" ON "short_links" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_short_links_status" ON "short_links" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_short_links_expires_at" ON "short_links" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_approval_workflows_operation_status" ON "approval_workflows" USING btree ("operation_id","status");--> statement-breakpoint
CREATE INDEX "idx_approval_workflows_status_expires" ON "approval_workflows" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_approval_workflows_created" ON "approval_workflows" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_mcp_servers_enabled_autostart" ON "mcp_servers" USING btree ("enabled","auto_start");--> statement-breakpoint
CREATE INDEX "idx_mcp_servers_type" ON "mcp_servers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_mcp_servers_status" ON "mcp_servers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_mcp_servers_security_level" ON "mcp_servers" USING btree ("security_level");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_oauth_providers_name" ON "oauth_providers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_oauth_providers_type" ON "oauth_providers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_operations_status_agent" ON "operations" USING btree ("status","agent_id");--> statement-breakpoint
CREATE INDEX "idx_operations_type_created" ON "operations" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "idx_operations_priority_status" ON "operations" USING btree ("priority","status");--> statement-breakpoint
CREATE INDEX "idx_operations_user_id" ON "operations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_operations_started_completed" ON "operations" USING btree ("started_at","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_refresh_tokens_token" ON "refresh_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_expires_at" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sessions_session_token" ON "sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "idx_sessions_status" ON "sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires_at" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_tool_definitions_category_enabled" ON "tool_definitions" USING btree ("category","is_enabled");--> statement-breakpoint
CREATE INDEX "idx_tool_definitions_security_level" ON "tool_definitions" USING btree ("security_level");--> statement-breakpoint
CREATE INDEX "idx_tool_definitions_author" ON "tool_definitions" USING btree ("author");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_is_active" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");