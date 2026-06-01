ALTER TABLE "discussions" ALTER COLUMN "organization_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "discussions" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_items" ALTER COLUMN "organization_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "knowledge_items" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "personas" ALTER COLUMN "organization_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "personas" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "discussion_messages" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_models" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_providers" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "short_links" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "organization_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agents_organization_id" ON "agents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_artifacts_organization_id" ON "artifacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_discussion_messages_organization_id" ON "discussion_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_discussions_organization_id" ON "discussions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_items_organization_id" ON "knowledge_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_llm_models_organization_id" ON "llm_models" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_llm_providers_organization_id" ON "llm_providers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_short_links_organization_id" ON "short_links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_users_organization_id" ON "users" USING btree ("organization_id");