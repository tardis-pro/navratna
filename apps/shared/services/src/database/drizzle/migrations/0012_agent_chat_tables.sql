CREATE TABLE "agent_chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"organization_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"organization_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"client_turn_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"generation_status" text,
	"processing_token" uuid,
	"reply_to_message_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_chat_conversations" ADD CONSTRAINT "agent_chat_conversations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_conversation_id_agent_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_reply_to_message_id_fk" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."agent_chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_role_check" CHECK ("role" IN ('user', 'assistant'));--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_generation_status_check" CHECK ("generation_status" IS NULL OR "generation_status" IN ('pending', 'processing', 'completed', 'failed'));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_chat_conversation" ON "agent_chat_conversations" USING btree ("organization_id","user_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_chat_turn_role" ON "agent_chat_messages" USING btree ("conversation_id","client_turn_id","role");--> statement-breakpoint
-- One assistant reply per user turn, enforced by the database: completeTurn's
-- lease check can only lose to a caller holding the same token, so this is the
-- last line of defence against a duplicated reply.
CREATE UNIQUE INDEX "uq_agent_chat_assistant_reply" ON "agent_chat_messages" USING btree ("reply_to_message_id") WHERE "role" = 'assistant';--> statement-breakpoint
CREATE INDEX "idx_agent_chat_history" ON "agent_chat_messages" USING btree ("conversation_id","created_at","id");