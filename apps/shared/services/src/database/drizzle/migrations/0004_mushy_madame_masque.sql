CREATE TYPE "public"."erasure_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."erasure_surface" AS ENUM('pg_control', 'pg_intelligence', 'neo4j', 'qdrant', 'redis');--> statement-breakpoint
CREATE TABLE "erasure_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"erasure_id" uuid NOT NULL,
	"surface" "erasure_surface" NOT NULL,
	"deleted_count" integer DEFAULT 0 NOT NULL,
	"hashed_subject" varchar(64) NOT NULL,
	"confirmed_at" timestamp DEFAULT now() NOT NULL,
	"certificate_hash" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erasure_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"status" "erasure_status" DEFAULT 'pending' NOT NULL,
	"stores_completed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "erasure_ledger" ADD CONSTRAINT "erasure_ledger_erasure_id_erasure_outbox_id_fk" FOREIGN KEY ("erasure_id") REFERENCES "public"."erasure_outbox"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_erasure_ledger_erasure_id" ON "erasure_ledger" USING btree ("erasure_id");--> statement-breakpoint
CREATE INDEX "idx_erasure_ledger_surface" ON "erasure_ledger" USING btree ("surface");--> statement-breakpoint
CREATE INDEX "idx_erasure_ledger_hashed_subject" ON "erasure_ledger" USING btree ("hashed_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_erasure_ledger_erasure_surface" ON "erasure_ledger" USING btree ("erasure_id","surface");--> statement-breakpoint
CREATE INDEX "idx_erasure_outbox_user_id" ON "erasure_outbox" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_erasure_outbox_status" ON "erasure_outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_erasure_outbox_requested_at" ON "erasure_outbox" USING btree ("requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_erasure_outbox_user_id_pending" ON "erasure_outbox" USING btree ("user_id","status") WHERE status = 'pending';