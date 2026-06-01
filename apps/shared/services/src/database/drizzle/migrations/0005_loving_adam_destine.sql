CREATE INDEX "idx_audit_events_actor_id" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_audit_events_event_type" ON "audit_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_audit_events_created_at" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_events_entity_id" ON "audit_events" USING btree ("entity_id");