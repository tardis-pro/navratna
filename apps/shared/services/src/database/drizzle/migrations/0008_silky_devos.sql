ALTER TABLE "llm_providers" ADD COLUMN "usage_type" text DEFAULT 'chat' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_llm_providers" ADD COLUMN "usage_type" text;