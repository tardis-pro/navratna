/**
 * Migration: give an agent chat thread a project, so the dock can group threads
 * under the project they belong to instead of one flat list.
 *
 * Production is NOT built by the drizzle migrate chain — drizzle.__drizzle_migrations
 * is empty because the schema was created with `drizzle-kit push`, so replaying
 * 0000..N is impossible, and .sql files never reach the runtime image (tsc emits
 * only .js into dist/). So the DDL lives here in TypeScript, mirroring
 * EnsureAgentChatThreads: compiled into dist, invoked at boot, idempotent.
 *
 * Intelligence plane.
 *
 * Standalone: bun apps/shared/services/src/database/migrations/ensure_agent_chat_projects.ts
 * Programmatic: await new EnsureAgentChatProjects().run();
 */

import { createLogger } from '@uaip/utils';
import { initializePlanes, getIntelligencePool } from '../drizzle/clients/index';

const logger = createLogger({
  serviceName: 'migration:ensure-agent-chat-projects',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

/**
 * project_id stays NULLABLE and carries no foreign key on purpose:
 *   - control.projects lives in the OTHER plane, which may be a different
 *     database entirely, so a FK is not expressible here. CrossPlaneGuard
 *     covers the write path instead.
 *   - NULL is a real state, not a missing value: a loose thread that belongs to
 *     no project is the default, and it is also where a thread lands when its
 *     project is deleted.
 *
 * The index leads with (organization, user) to match the existing thread-list
 * index, then project_id, then updated_at — the dock filters by project and
 * orders by recency in the same query, so updated_at has to come last.
 */
export const AGENT_CHAT_PROJECT_STATEMENTS: readonly string[] = [
  `ALTER TABLE "agent_chat_conversations" ADD COLUMN IF NOT EXISTS "project_id" uuid`,

  `CREATE INDEX IF NOT EXISTS "idx_agent_chat_thread_project" ON "agent_chat_conversations" USING btree ("organization_id","user_id","project_id","updated_at")`,
];

/** Arbitrary but FIXED — every booting machine must derive the same number. */
export const AGENT_CHAT_PROJECT_LOCK_KEY = 8_531_209;

export class EnsureAgentChatProjects {
  /**
   * `IF NOT EXISTS` is check-then-act: two machines booting together can both
   * pass the check and both run the DDL. A session-level advisory lock serializes
   * them, and one transaction makes the statements all-or-nothing so a failure
   * can never leave the service running against half a schema.
   */
  async run(): Promise<void> {
    const client = await getIntelligencePool().connect();

    try {
      await client.query('SELECT pg_advisory_lock($1)', [AGENT_CHAT_PROJECT_LOCK_KEY]);
      await client.query('BEGIN');

      try {
        for (const statement of AGENT_CHAT_PROJECT_STATEMENTS) {
          await client.query(statement);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      logger.info('Agent chat project schema ensured', {
        statements: AGENT_CHAT_PROJECT_STATEMENTS.length,
      });
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [AGENT_CHAT_PROJECT_LOCK_KEY]);
      client.release();
    }
  }
}

async function main(): Promise<void> {
  try {
    await initializePlanes();
    await new EnsureAgentChatProjects().run();
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
