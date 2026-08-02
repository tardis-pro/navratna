CREATE TABLE IF NOT EXISTS "onboarding_extraction_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"interview_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"trigger_message_id" uuid NOT NULL,
	"source_message_ids" uuid[],
	"client_turn_id" varchar(100),
	"attempt_no" integer DEFAULT 1 NOT NULL,
	"outcome" varchar(20) NOT NULL,
	"model" varchar(100),
	"provider" varchar(50),
	"prompt_version" varchar(20),
	"schema_version" integer DEFAULT 1 NOT NULL,
	"source_state_version" integer,
	"resulting_state_version" integer,
	"resulting_status" varchar(20),
	"next_objective" varchar(50),
	"raw_response" text,
	"accepted_updates" jsonb,
	"rejected_updates" jsonb,
	"validation_errors" jsonb,
	"latency_ms" integer,
	"tokens_used" integer,
	CONSTRAINT "chk_onboarding_extraction_runs_outcome" CHECK (outcome IN ('accepted','rejected','failed')),
	CONSTRAINT "chk_onboarding_extraction_runs_accepted" CHECK (outcome <> 'accepted' OR (resulting_state_version = source_state_version + 1 AND resulting_status IN ('active','review'))),
	CONSTRAINT "chk_onboarding_extraction_runs_not_accepted" CHECK (outcome = 'accepted' OR (resulting_state_version IS NULL AND resulting_status IS NULL AND next_objective IS NULL)),
	CONSTRAINT "chk_onboarding_extraction_runs_attempt_no" CHECK (attempt_no >= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"organization_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"user_id" uuid NOT NULL,
	"guide_agent_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"current_objective" varchar(50),
	"turn_count" integer DEFAULT 0 NOT NULL,
	"state_version" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "chk_onboarding_interviews_status" CHECK (status IN ('active','paused','review','completed','abandoned')),
	CONSTRAINT "chk_onboarding_interviews_objective" CHECK (current_objective IS NOT NULL OR status NOT IN ('active','paused')),
	CONSTRAINT "chk_onboarding_interviews_completed_at" CHECK ((completed_at IS NOT NULL) = (status = 'completed')),
	CONSTRAINT "chk_onboarding_interviews_counters" CHECK (turn_count >= 0 AND state_version >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_slot_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"interview_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"slot_key" varchar(50) NOT NULL,
	"slot_revision" integer NOT NULL,
	"source_kind" varchar(20) NOT NULL,
	"source_message_id" uuid,
	"evidence_text" text NOT NULL,
	CONSTRAINT "chk_onboarding_slot_evidence_source_kind" CHECK (source_kind IN ('chat_message','review_edit')),
	CONSTRAINT "chk_onboarding_slot_evidence_chat_message" CHECK (source_kind <> 'chat_message' OR source_message_id IS NOT NULL),
	CONSTRAINT "chk_onboarding_slot_evidence_review_edit" CHECK (source_kind <> 'review_edit' OR source_message_id IS NULL),
	CONSTRAINT "chk_onboarding_slot_evidence_text" CHECK (length(btrim(evidence_text)) > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_slot_values" (
	"interview_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"slot_key" varchar(50) NOT NULL,
	"status" varchar(30) DEFAULT 'unanswered' NOT NULL,
	"value" jsonb,
	"confidence" numeric(6, 5),
	"attempts" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"clarification_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_slot_values_interview_id_slot_key_pk" PRIMARY KEY("interview_id","slot_key"),
	CONSTRAINT "chk_onboarding_slot_values_status" CHECK (status IN ('unanswered','answered','needs_clarification','declined','not_applicable')),
	CONSTRAINT "chk_onboarding_slot_values_answered_value" CHECK (status <> 'answered' OR value IS NOT NULL),
	CONSTRAINT "chk_onboarding_slot_values_empty_value" CHECK (status NOT IN ('unanswered','declined','not_applicable') OR value IS NULL),
	CONSTRAINT "chk_onboarding_slot_values_confidence" CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
	CONSTRAINT "chk_onboarding_slot_values_counters" CHECK (attempts >= 0 AND revision >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('uq_onboarding_interviews_id_org', 63)) THEN
    ALTER TABLE "onboarding_interviews" ADD CONSTRAINT "uq_onboarding_interviews_id_org" UNIQUE("id","organization_id");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('fk_onboarding_extraction_runs_interview', 63)) THEN
    ALTER TABLE "onboarding_extraction_runs" ADD CONSTRAINT "fk_onboarding_extraction_runs_interview" FOREIGN KEY ("interview_id","organization_id") REFERENCES "public"."onboarding_interviews"("id","organization_id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('onboarding_interviews_organization_id_organizations_id_fk', 63)) THEN
    ALTER TABLE "onboarding_interviews" ADD CONSTRAINT "onboarding_interviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('onboarding_interviews_user_id_users_id_fk', 63)) THEN
    ALTER TABLE "onboarding_interviews" ADD CONSTRAINT "onboarding_interviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('fk_onboarding_slot_evidence_interview', 63)) THEN
    ALTER TABLE "onboarding_slot_evidence" ADD CONSTRAINT "fk_onboarding_slot_evidence_interview" FOREIGN KEY ("interview_id","organization_id") REFERENCES "public"."onboarding_interviews"("id","organization_id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('fk_onboarding_slot_values_interview', 63)) THEN
    ALTER TABLE "onboarding_slot_values" ADD CONSTRAINT "fk_onboarding_slot_values_interview" FOREIGN KEY ("interview_id","organization_id") REFERENCES "public"."onboarding_interviews"("id","organization_id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_onboarding_extraction_runs_attempt" ON "onboarding_extraction_runs" USING btree ("interview_id","trigger_message_id","attempt_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_onboarding_extraction_runs_accepted" ON "onboarding_extraction_runs" USING btree ("interview_id","trigger_message_id") WHERE outcome = 'accepted';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_onboarding_extraction_runs_client_turn" ON "onboarding_extraction_runs" USING btree ("interview_id","client_turn_id") WHERE outcome = 'accepted';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_onboarding_interviews_user_guide" ON "onboarding_interviews" USING btree ("organization_id","user_id","guide_agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_onboarding_interviews_dropoff" ON "onboarding_interviews" USING btree ("organization_id","status","current_objective","last_activity_at") WHERE status IN ('active','paused');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_onboarding_slot_evidence_chat" ON "onboarding_slot_evidence" USING btree ("interview_id","slot_key","slot_revision","source_message_id") WHERE source_kind = 'chat_message';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_onboarding_slot_evidence_slot" ON "onboarding_slot_evidence" USING btree ("interview_id","slot_key","slot_revision");