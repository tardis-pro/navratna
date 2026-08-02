CREATE TABLE IF NOT EXISTS "user_agent_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"organization_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"assigned_by" varchar(100) DEFAULT 'system' NOT NULL,
	"source" varchar(50) DEFAULT 'onboarding' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('user_agent_assignments_user_id_users_id_fk', 63)) THEN
    ALTER TABLE "user_agent_assignments" ADD CONSTRAINT "user_agent_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('user_agent_assignments_organization_id_organizations_id_fk', 63)) THEN
    ALTER TABLE "user_agent_assignments" ADD CONSTRAINT "user_agent_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_agent_assignments_user_agent" ON "user_agent_assignments" USING btree ("user_id","agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_agent_assignments_user" ON "user_agent_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_agent_assignments_org" ON "user_agent_assignments" USING btree ("organization_id");