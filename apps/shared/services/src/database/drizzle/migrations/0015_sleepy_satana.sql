CREATE TABLE "agent_chat_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"organization_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_migrations" (
	"name" varchar(200) PRIMARY KEY NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"details" json
);
--> statement-breakpoint
DROP INDEX "uq_agent_chat_conversation";--> statement-breakpoint
DROP INDEX "uq_agent_chat_turn_role";--> statement-breakpoint
ALTER TABLE "agent_chat_conversations" ALTER COLUMN "agent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_chat_conversations" ADD COLUMN "thread_key" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_chat_conversations" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "agent_chat_conversations" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "agent_chat_conversations" ADD COLUMN "user_llm_provider_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_chat_conversations" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD COLUMN "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD COLUMN "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD COLUMN "total_tokens" integer;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD COLUMN "cost_usd" numeric(12,6);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "github_repo" varchar(255);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "github_repo_id" varchar(50);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "github_repo_full_name" varchar(255);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "github_clone_url" varchar(500);--> statement-breakpoint
ALTER TABLE "agent_chat_participants" ADD CONSTRAINT "agent_chat_participants_conversation_id_agent_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_participants" ADD CONSTRAINT "agent_chat_participants_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_chat_participant" ON "agent_chat_participants" USING btree ("conversation_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_chat_thread" ON "agent_chat_conversations" USING btree ("organization_id","user_id","thread_key");--> statement-breakpoint
CREATE INDEX "idx_agent_chat_thread_list" ON "agent_chat_conversations" USING btree ("organization_id","user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_chat_user_turn" ON "agent_chat_messages" USING btree ("conversation_id","client_turn_id") WHERE "agent_chat_messages"."role" = 'user';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_chat_assistant_turn" ON "agent_chat_messages" USING btree ("conversation_id","client_turn_id","agent_id") WHERE "agent_chat_messages"."role" = 'assistant';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_chat_assistant_reply_agent" ON "agent_chat_messages" USING btree ("reply_to_message_id","agent_id") WHERE "agent_chat_messages"."role" = 'assistant';