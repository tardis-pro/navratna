CREATE TABLE "composition_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent" text NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"definition" jsonb,
	"outcome" varchar(30) NOT NULL,
	"failure_type" varchar(30),
	"failure_details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "composition_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"actor_type" varchar(20) NOT NULL,
	"actor_id" varchar(255) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"previous_hash" varchar(64),
	"current_hash" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" uuid NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"details" jsonb,
	"triggered_by" varchar(50) DEFAULT 'user',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subdomain_name" varchar(255) NOT NULL,
	"repo_url" varchar(512),
	"platform" varchar(50) NOT NULL,
	"app_name" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'provisioned' NOT NULL,
	"current_version" varchar(255),
	"previous_version" varchar(255),
	"url" varchar(512),
	"health_endpoint" varchar(255) DEFAULT '/health',
	"config" jsonb,
	"last_health_check" timestamp,
	"last_deploy_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_confidence_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"agent_id" uuid NOT NULL,
	"domain" varchar(100) NOT NULL,
	"accuracy" numeric(6, 5) DEFAULT '0.5' NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"last_composed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "federated_subdomains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(255) NOT NULL,
	"subdomain" varchar(255) NOT NULL,
	"description" text,
	"mcp_manifest_url" text NOT NULL,
	"mcp_server_url" text NOT NULL,
	"transport" varchar(50) DEFAULT 'streamable-http' NOT NULL,
	"status" text DEFAULT 'discovered' NOT NULL,
	"tools_count" integer DEFAULT 0 NOT NULL,
	"last_crawl_at" timestamp,
	"last_healthy_at" timestamp,
	"health_endpoint" text,
	"icon_url" text,
	"category" varchar(100),
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manifest_version" varchar(50),
	"auth_type" varchar(50) DEFAULT 'tardis-jwt' NOT NULL,
	"auth_config" jsonb,
	"auto_discovered" boolean DEFAULT true NOT NULL,
	"registered_by" uuid,
	"metadata" jsonb,
	CONSTRAINT "federated_subdomains_subdomain_unique" UNIQUE("subdomain")
);
--> statement-breakpoint
CREATE TABLE "federated_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"subdomain_id" uuid NOT NULL,
	"tool_name" varchar(255) NOT NULL,
	"description" text,
	"input_schema" jsonb NOT NULL,
	"category" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"avg_response_ms" integer,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"plan" varchar(50) DEFAULT 'free' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "workflow_compositions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"version" varchar(50) DEFAULT '1.0.0',
	"category" varchar(100),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"definition" jsonb NOT NULL,
	"composed_by" varchar(50),
	"agent_id" uuid,
	"user_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"last_executed_at" timestamp,
	"avg_execution_ms" integer,
	"rating" real,
	"install_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger" jsonb NOT NULL,
	"steps" jsonb NOT NULL,
	"delivery" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"agent_id" text,
	"session_key" text,
	"model" text
);
--> statement-breakpoint
CREATE TABLE "workflow_instance_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"step_id" varchar(100) NOT NULL,
	"step_name" varchar(255),
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"tool_name" varchar(255),
	"input_snapshot" jsonb,
	"output_snapshot" jsonb,
	"error_message" text,
	"latency_ms" integer,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"current_step_id" varchar(100),
	"trigger_type" varchar(30),
	"trigger_data" jsonb,
	"state" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"agent_id" uuid,
	"failed_step_id" varchar(100),
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"total_latency_ms" integer,
	"output_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_items" ALTER COLUMN "type" SET DEFAULT 'FACTUAL';--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "resolved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "deployment_events" ADD CONSTRAINT "deployment_events_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "federated_subdomains" ADD CONSTRAINT "federated_subdomains_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "federated_tools" ADD CONSTRAINT "federated_tools_subdomain_id_federated_subdomains_id_fk" FOREIGN KEY ("subdomain_id") REFERENCES "public"."federated_subdomains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instance_steps" ADD CONSTRAINT "workflow_instance_steps_instance_id_workflow_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_workflow_id_workflow_compositions_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_compositions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_composition_attempts_outcome" ON "composition_attempts" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "idx_composition_attempts_created_at" ON "composition_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_composition_audit_entity_id" ON "composition_audit_events" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "idx_composition_audit_event_type" ON "composition_audit_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_composition_audit_created_at" ON "composition_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_deployment_events_deployment_id" ON "deployment_events" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX "idx_deployment_events_event_type" ON "deployment_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_deployments_subdomain_name" ON "deployments" USING btree ("subdomain_name");--> statement-breakpoint
CREATE INDEX "idx_deployments_platform" ON "deployments" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "idx_deployments_status" ON "deployments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_deployments_app_name" ON "deployments" USING btree ("app_name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_domain_confidence_agent_domain" ON "domain_confidence_profiles" USING btree ("agent_id","domain");--> statement-breakpoint
CREATE INDEX "idx_domain_confidence_domain" ON "domain_confidence_profiles" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_federated_subdomains_subdomain" ON "federated_subdomains" USING btree ("subdomain");--> statement-breakpoint
CREATE INDEX "idx_federated_subdomains_status" ON "federated_subdomains" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_federated_subdomains_category" ON "federated_subdomains" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_federated_tools_subdomain" ON "federated_tools" USING btree ("subdomain_id");--> statement-breakpoint
CREATE INDEX "idx_federated_tools_name" ON "federated_tools" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX "idx_federated_tools_category" ON "federated_tools" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_federated_tools_active" ON "federated_tools" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_organizations_slug" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_organizations_is_active" ON "organizations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_wf_comp_category" ON "workflow_compositions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_wf_comp_active" ON "workflow_compositions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_wf_comp_user" ON "workflow_compositions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_wf_comp_public" ON "workflow_compositions" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "idx_workflow_instance_steps_instance_id" ON "workflow_instance_steps" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_instance_steps_step_id" ON "workflow_instance_steps" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_instance_steps_status" ON "workflow_instance_steps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_workflow_instances_status" ON "workflow_instances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_workflow_instances_workflow_id" ON "workflow_instances" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_instances_started_at" ON "workflow_instances" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_workflow_instances_agent_id" ON "workflow_instances" USING btree ("agent_id");