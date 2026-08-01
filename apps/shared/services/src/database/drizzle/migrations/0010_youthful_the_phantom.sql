CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"provider_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"auth_kind" text DEFAULT 'oauth2' NOT NULL,
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"expires_at" timestamp,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"token_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"key" varchar(100) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"oauth_provider_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "integration_providers_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "project_agent_integration_connections" (
	"project_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_agent_integration_connections_project_id_agent_id_provider_id_pk" PRIMARY KEY("project_id","agent_id","provider_id")
);
--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "provider_id" uuid;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "server_key" varchar(100);--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "credential_mode" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "auth_header_name" varchar(100);--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "auth_scheme" varchar(50);--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "catalog_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_provider_id_integration_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."integration_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_providers" ADD CONSTRAINT "integration_providers_oauth_provider_id_oauth_providers_id_fk" FOREIGN KEY ("oauth_provider_id") REFERENCES "public"."oauth_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_agent_integration_connections" ADD CONSTRAINT "project_agent_integration_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_agent_integration_connections" ADD CONSTRAINT "project_agent_integration_connections_provider_id_integration_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."integration_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_agent_integration_connections" ADD CONSTRAINT "project_agent_integration_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_integration_connections_id_provider" ON "integration_connections" USING btree ("id","provider_id");--> statement-breakpoint
ALTER TABLE "project_agent_integration_connections" ADD CONSTRAINT "fk_project_agent_integration_connection" FOREIGN KEY ("connection_id","provider_id") REFERENCES "public"."integration_connections"("id","provider_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_integration_connections_owner" ON "integration_connections" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_integration_connections_provider_status" ON "integration_connections" USING btree ("provider_id","status");--> statement-breakpoint
CREATE INDEX "idx_integration_providers_enabled" ON "integration_providers" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_project_agent_integration_connection" ON "project_agent_integration_connections" USING btree ("connection_id");--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_provider_id_integration_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."integration_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mcp_servers_provider" ON "mcp_servers" USING btree ("provider_id");--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_server_key_unique" UNIQUE("server_key");