/**
 * Migration: add `mcp_servers.project_id`, and align `tasks.status` with the
 * canonical StoryStatus default.
 *
 * MUST SHIP WITH THE CODE THAT READS IT. McpConnectionResolver.loadServer() now
 * selects `project_id`; against a database without that column the query errors
 * and EVERY MCP resolution fails — catalog discovery and every tool call alike.
 * That is why this runs at boot from capabilityFeature.initialize() rather than
 * being left as a manual step: the column and the code that selects it arrive in
 * the same deploy.
 *
 * Production is NOT built by the drizzle migrate chain — the schema was created
 * with `drizzle-kit push`, so drizzle.__drizzle_migrations is empty and .sql
 * files never reach the runtime image. The DDL therefore lives here in
 * TypeScript, compiled into dist, idempotent. Same reasoning and shape as
 * EnsureAgentChatProjects.
 *
 * Control plane.
 *
 * Standalone: bun apps/shared/services/src/database/migrations/ensure_mcp_server_project_scope.ts
 * Programmatic: await new EnsureMcpServerProjectScope().run();
 */

import { createLogger } from '@uaip/utils';
import { initializePlanes, getControlPool } from '../drizzle/clients/index';

const logger = createLogger({
  serviceName: 'migration:ensure-mcp-server-project-scope',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

/**
 * `project_id` is NULLABLE and that is a real state, not a missing value: NULL
 * means "shared across every project", which is how a public docs server stays
 * reachable from anywhere. A non-null value is an ownership boundary that
 * McpConnectionResolver.resolve() enforces.
 *
 * It does carry a real foreign key — unlike agent_chat_conversations.project_id,
 * both tables here live in the CONTROL plane, so the reference is expressible.
 * ON DELETE CASCADE: a deleted project should not leave a server row that no
 * caller can ever satisfy.
 *
 * The `tasks.status` statements finish the StoryStatus consolidation: the column
 * defaulted to 'pending', a value none of the three writers ever produced
 * deliberately. Existing rows are converted by normalize_task_status; this only
 * fixes what NEW rows get.
 */
export const MCP_SERVER_PROJECT_STATEMENTS: readonly string[] = [
  `ALTER TABLE "mcp_servers" ADD COLUMN IF NOT EXISTS "project_id" uuid`,

  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'mcp_servers_project_id_projects_id_fk'
     ) THEN
       ALTER TABLE "mcp_servers"
         ADD CONSTRAINT "mcp_servers_project_id_projects_id_fk"
         FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
     END IF;
   END $$`,

  // Resolution is by server_key; this index serves the "what does this project
  // own" direction, which the fleet listing needs.
  `CREATE INDEX IF NOT EXISTS "idx_mcp_servers_project" ON "mcp_servers" USING btree ("project_id")`,

  `ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'backlog'`,
];

/** Arbitrary but FIXED — every booting machine must derive the same number. */
export const MCP_SERVER_PROJECT_LOCK_KEY = 8_531_477;

export class EnsureMcpServerProjectScope {
  /**
   * `IF NOT EXISTS` is check-then-act: two machines booting together can both
   * pass the check and both run the DDL. A session-level advisory lock serializes
   * them, and one transaction makes the statements all-or-nothing so a failure
   * can never leave the service running against half a schema.
   */
  async run(): Promise<void> {
    const client = await getControlPool().connect();

    try {
      await client.query('SELECT pg_advisory_lock($1)', [MCP_SERVER_PROJECT_LOCK_KEY]);
      await client.query('BEGIN');

      try {
        for (const statement of MCP_SERVER_PROJECT_STATEMENTS) {
          // oxlint-disable-next-line no-await-in-loop -- DDL must run in order inside one transaction
          await client.query(statement);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      logger.info('MCP server project scope ensured', {
        statements: MCP_SERVER_PROJECT_STATEMENTS.length,
      });
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MCP_SERVER_PROJECT_LOCK_KEY]);
      client.release();
    }
  }
}

async function main(): Promise<void> {
  try {
    await initializePlanes();
    await new EnsureMcpServerProjectScope().run();
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
