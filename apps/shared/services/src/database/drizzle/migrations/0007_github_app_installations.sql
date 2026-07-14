CREATE TABLE "github_app_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" text NOT NULL,
	"account_login" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" varchar(255) NOT NULL,
	"project_id" varchar(255) NOT NULL,
	"repository_id" text NOT NULL,
	"repository_full_name" varchar(512) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_gh_app_install_active_user_proj_repo" ON "github_app_installations" USING btree ("user_id","project_id","repository_id") WHERE "github_app_installations"."active" = TRUE;
--> statement-breakpoint
CREATE INDEX "idx_gh_app_install_user_proj" ON "github_app_installations" USING btree ("user_id","project_id");
--> statement-breakpoint
CREATE INDEX "idx_gh_app_install_repo" ON "github_app_installations" USING btree ("repository_id");
--> statement-breakpoint
CREATE INDEX "idx_gh_app_install_installation_id" ON "github_app_installations" USING btree ("installation_id");
