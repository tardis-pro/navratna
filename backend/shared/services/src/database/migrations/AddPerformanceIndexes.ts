import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1704592800000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1704592800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // User indexes
    await queryRunner.query(`CREATE INDEX "IDX_user_email" ON "users" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_role" ON "users" ("role")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_created_at" ON "users" ("createdAt")`);

    // Agent indexes
    await queryRunner.query(`CREATE INDEX "IDX_agent_status" ON "agents" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_agent_role" ON "agents" ("role")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_agent_model_provider" ON "agents" ("modelProvider")`
    );
    await queryRunner.query(`CREATE INDEX "IDX_agent_created_at" ON "agents" ("createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_agent_name" ON "agents" ("name")`);

    // Tool indexes
    await queryRunner.query(`CREATE INDEX "IDX_tool_name" ON "tool_definitions" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_tool_category" ON "tool_definitions" ("category")`);
    await queryRunner.query(`CREATE INDEX "IDX_tool_is_active" ON "tool_definitions" ("isActive")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_tool_security_level" ON "tool_definitions" ("securityLevel")`
    );

    // Tool execution indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_tool_execution_tool_id" ON "tool_executions" ("toolId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tool_execution_agent_id" ON "tool_executions" ("agentId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tool_execution_user_id" ON "tool_executions" ("userId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tool_execution_status" ON "tool_executions" ("status")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tool_execution_started_at" ON "tool_executions" ("startedAt")`
    );

    // Discussion indexes
    await queryRunner.query(`CREATE INDEX "IDX_discussion_status" ON "discussions" ("status")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_discussion_created_at" ON "discussions" ("createdAt")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_discussion_moderator_id" ON "discussions" ("moderatorId")`
    );

    // Operation indexes
    await queryRunner.query(`CREATE INDEX "IDX_operation_status" ON "operations" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_operation_type" ON "operations" ("type")`);
    await queryRunner.query(`CREATE INDEX "IDX_operation_agent_id" ON "operations" ("agentId")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_operation_created_at" ON "operations" ("createdAt")`
    );

    // Audit event indexes
    await queryRunner.query(`CREATE INDEX "IDX_audit_event_type" ON "audit_events" ("eventType")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_event_user_id" ON "audit_events" ("userId")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_event_resource_type" ON "audit_events" ("resourceType")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_event_resource_id" ON "audit_events" ("resourceId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_event_timestamp" ON "audit_events" ("timestamp")`
    );

    // Approval workflow indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_approval_workflow_status" ON "approval_workflows" ("status")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_approval_workflow_requester_id" ON "approval_workflows" ("requesterId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_approval_workflow_created_at" ON "approval_workflows" ("createdAt")`
    );

    // Session indexes
    await queryRunner.query(`CREATE INDEX "IDX_session_token" ON "sessions" ("token")`);
    await queryRunner.query(`CREATE INDEX "IDX_session_user_id" ON "sessions" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_session_expires_at" ON "sessions" ("expiresAt")`);

    // Refresh token indexes
    await queryRunner.query(`CREATE INDEX "IDX_refresh_token_token" ON "refresh_tokens" ("token")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_token_user_id" ON "refresh_tokens" ("userId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_token_expires_at" ON "refresh_tokens" ("expiresAt")`
    );

    // Project indexes
    await queryRunner.query(`CREATE INDEX "IDX_project_owner_id" ON "projects" ("ownerId")`);
    await queryRunner.query(`CREATE INDEX "IDX_project_status" ON "projects" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_project_visibility" ON "projects" ("visibility")`);
    await queryRunner.query(`CREATE INDEX "IDX_project_created_at" ON "projects" ("createdAt")`);

    // Project member indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_project_member_project_id" ON "project_members" ("projectId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_member_user_id" ON "project_members" ("userId")`
    );
    await queryRunner.query(`CREATE INDEX "IDX_project_member_role" ON "project_members" ("role")`);

    // Artifact indexes
    await queryRunner.query(`CREATE INDEX "IDX_artifact_type" ON "artifacts" ("type")`);
    await queryRunner.query(`CREATE INDEX "IDX_artifact_created_by" ON "artifacts" ("createdBy")`);
    await queryRunner.query(`CREATE INDEX "IDX_artifact_created_at" ON "artifacts" ("createdAt")`);

    // Composite indexes for common queries
    await queryRunner.query(`CREATE INDEX "IDX_agent_status_role" ON "agents" ("status", "role")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_tool_category_active" ON "tool_definitions" ("category", "isActive")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_user_timestamp" ON "audit_events" ("userId", "timestamp")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_owner_status" ON "projects" ("ownerId", "status")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop composite indexes
    await queryRunner.query(`DROP INDEX "IDX_project_owner_status"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_user_timestamp"`);
    await queryRunner.query(`DROP INDEX "IDX_tool_category_active"`);
    await queryRunner.query(`DROP INDEX "IDX_agent_status_role"`);

    // Drop artifact indexes
    await queryRunner.query(`DROP INDEX "IDX_artifact_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_artifact_created_by"`);
    await queryRunner.query(`DROP INDEX "IDX_artifact_type"`);

    // Drop project member indexes
    await queryRunner.query(`DROP INDEX "IDX_project_member_role"`);
    await queryRunner.query(`DROP INDEX "IDX_project_member_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_project_member_project_id"`);

    // Drop project indexes
    await queryRunner.query(`DROP INDEX "IDX_project_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_project_visibility"`);
    await queryRunner.query(`DROP INDEX "IDX_project_status"`);
    await queryRunner.query(`DROP INDEX "IDX_project_owner_id"`);

    // Drop refresh token indexes
    await queryRunner.query(`DROP INDEX "IDX_refresh_token_expires_at"`);
    await queryRunner.query(`DROP INDEX "IDX_refresh_token_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_refresh_token_token"`);

    // Drop session indexes
    await queryRunner.query(`DROP INDEX "IDX_session_expires_at"`);
    await queryRunner.query(`DROP INDEX "IDX_session_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_session_token"`);

    // Drop approval workflow indexes
    await queryRunner.query(`DROP INDEX "IDX_approval_workflow_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_approval_workflow_requester_id"`);
    await queryRunner.query(`DROP INDEX "IDX_approval_workflow_status"`);

    // Drop audit event indexes
    await queryRunner.query(`DROP INDEX "IDX_audit_event_timestamp"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_event_resource_id"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_event_resource_type"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_event_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_event_type"`);

    // Drop operation indexes
    await queryRunner.query(`DROP INDEX "IDX_operation_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_operation_agent_id"`);
    await queryRunner.query(`DROP INDEX "IDX_operation_type"`);
    await queryRunner.query(`DROP INDEX "IDX_operation_status"`);

    // Drop discussion indexes
    await queryRunner.query(`DROP INDEX "IDX_discussion_moderator_id"`);
    await queryRunner.query(`DROP INDEX "IDX_discussion_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_discussion_status"`);

    // Drop tool execution indexes
    await queryRunner.query(`DROP INDEX "IDX_tool_execution_started_at"`);
    await queryRunner.query(`DROP INDEX "IDX_tool_execution_status"`);
    await queryRunner.query(`DROP INDEX "IDX_tool_execution_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_tool_execution_agent_id"`);
    await queryRunner.query(`DROP INDEX "IDX_tool_execution_tool_id"`);

    // Drop tool indexes
    await queryRunner.query(`DROP INDEX "IDX_tool_security_level"`);
    await queryRunner.query(`DROP INDEX "IDX_tool_is_active"`);
    await queryRunner.query(`DROP INDEX "IDX_tool_category"`);
    await queryRunner.query(`DROP INDEX "IDX_tool_name"`);

    // Drop agent indexes
    await queryRunner.query(`DROP INDEX "IDX_agent_name"`);
    await queryRunner.query(`DROP INDEX "IDX_agent_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_agent_model_provider"`);
    await queryRunner.query(`DROP INDEX "IDX_agent_role"`);
    await queryRunner.query(`DROP INDEX "IDX_agent_status"`);

    // Drop user indexes
    await queryRunner.query(`DROP INDEX "IDX_user_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_user_role"`);
    await queryRunner.query(`DROP INDEX "IDX_user_email"`);
  }
}
