/**
 * Migration: add `workflow_definitions.project_id`.
 *
 * MUST SHIP WITH THE CODE THAT READS IT. WorkflowExecutorService.runDefinition()
 * now selects the whole definition row and forwards `project_id` as the project
 * scope of every tool call the run makes. Against a database without the column
 * the select still succeeds — drizzle names its columns — but the scope arrives
 * as undefined and every MCP step in the run is refused by UnifiedToolRegistry
 * for want of a project context. The column and the code that reads it therefore
 * arrive in the same deploy.
 *
 * Production is NOT built by the drizzle migrate chain — the schema was created
 * with `drizzle-kit push`, so drizzle.__drizzle_migrations is empty and .sql
 * files never reach the runtime image. The DDL lives here in TypeScript,
 * compiled into dist, idempotent. Same reasoning and shape as
 * EnsureMcpServerProjectScope.
 *
 * Control plane.
 *
 * Standalone: bun apps/shared/services/src/database/migrations/ensure_workflow_definition_project_scope.ts
 * Programmatic: await new EnsureWorkflowDefinitionProjectScope().run();
 */

import { createLogger } from '@uaip/utils';
import { initializePlanes, getControlPool } from '../drizzle/clients/index';

const logger = createLogger({
  serviceName: 'migration:ensure-workflow-definition-project-scope',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

/**
 * `project_id` is NULLABLE and that is a real state, not a missing value: NULL
 * means the definition is not bound to a project, which is correct for the
 * bash/httpCall/agentTurn steps that predate this column and never needed one.
 * Such a definition simply cannot run an MCP step — it is refused at dispatch
 * rather than silently borrowing another project's scope.
 *
 * Both tables live in the CONTROL plane, so the reference is expressible as a
 * real foreign key. ON DELETE CASCADE: a deleted project should not leave behind
 * a scheduled definition that fires nightly into a scope that no longer exists.
 */
export const WORKFLOW_DEFINITION_PROJECT_STATEMENTS: readonly string[] = [
  `ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "project_id" uuid`,

  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'workflow_definitions_project_id_projects_id_fk'
     ) THEN
       ALTER TABLE "workflow_definitions"
         ADD CONSTRAINT "workflow_definitions_project_id_projects_id_fk"
         FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
     END IF;
   END $$`,

  // Serves the "what does this project schedule" direction, which is how a
  // per-project digest is listed and how a provisioned project's definitions are
  // found again after the fact.
  `CREATE INDEX IF NOT EXISTS "idx_workflow_definitions_project" ON "workflow_definitions" USING btree ("project_id")`,
];

/** Arbitrary but FIXED — every booting machine must derive the same number. */
export const WORKFLOW_DEFINITION_PROJECT_LOCK_KEY = 8_617_233;

export class EnsureWorkflowDefinitionProjectScope {
  /**
   * `IF NOT EXISTS` is check-then-act: two machines booting together can both
   * pass the check and both run the DDL. A session-level advisory lock serializes
   * them, and one transaction makes the statements all-or-nothing so a failure
   * can never leave the service running against half a schema.
   */
  async run(): Promise<void> {
    const client = await getControlPool().connect();

    try {
      await client.query('SELECT pg_advisory_lock($1)', [WORKFLOW_DEFINITION_PROJECT_LOCK_KEY]);
      await client.query('BEGIN');

      try {
        for (const statement of WORKFLOW_DEFINITION_PROJECT_STATEMENTS) {
          // oxlint-disable-next-line no-await-in-loop -- DDL must run in order inside one transaction
          await client.query(statement);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      logger.info('Workflow definition project scope ensured', {
        statements: WORKFLOW_DEFINITION_PROJECT_STATEMENTS.length,
      });
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [WORKFLOW_DEFINITION_PROJECT_LOCK_KEY]);
      client.release();
    }
  }
}

async function main(): Promise<void> {
  try {
    await initializePlanes();
    await new EnsureWorkflowDefinitionProjectScope().run();
    logger.info('Migration finished');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

const isBunRuntime = 'Bun' in globalThis;
const isMain = isBunRuntime
  ? (import.meta as { main?: boolean }).main === true
  : typeof require !== 'undefined' && require.main === module;

if (isMain) {
  void main();
}
