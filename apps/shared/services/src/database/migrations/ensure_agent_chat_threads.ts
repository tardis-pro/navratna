/**
 * Migration: widen agent chat from one permanent 1:1 conversation into threads
 * that can hold several agents, carry a model selection, and record token usage.
 *
 * Production is NOT built by the drizzle migrate chain — drizzle.__drizzle_migrations
 * is empty because the schema was created with `drizzle-kit push`, so replaying
 * 0000..N is impossible, and .sql files never reach the runtime image (tsc emits
 * only .js into dist/). So the DDL lives here in TypeScript, mirroring
 * EnsureOnboardingSchema: compiled into dist, invoked at boot, idempotent.
 *
 * Intelligence plane.
 *
 * Standalone: bun apps/shared/services/src/database/migrations/ensure_agent_chat_threads.ts
 * Programmatic: await new EnsureAgentChatThreads().run();
 */

import { createLogger } from '@uaip/utils';
import { initializePlanes, getIntelligencePool } from '../drizzle/clients/index';

const logger = createLogger({
  serviceName: 'migration:ensure-agent-chat-threads',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

/**
 * Ordering is load-bearing:
 *   1. add thread_key nullable, backfill it, only then set NOT NULL — a column
 *      cannot be added NOT NULL to a table that already has rows.
 *   2. create the new unique index BEFORE dropping the old one, so the table is
 *      never momentarily unconstrained.
 *   3. backfill messages.agent_id before creating the assistant partial index,
 *      otherwise pre-existing assistant rows all share agent_id NULL and, since
 *      Postgres treats NULLs as distinct, the index would build but enforce
 *      nothing for them.
 *
 * thread_key := agent_id is collision-free by construction: uq_agent_chat_conversation
 * already guaranteed at most one row per (organization, user, agent). It also keeps
 * old clients working — one that sends no threadKey resolves to agentId and lands
 * on its existing thread.
 */
export const AGENT_CHAT_THREAD_STATEMENTS: readonly string[] = [
  `ALTER TABLE "agent_chat_conversations" ADD COLUMN IF NOT EXISTS "thread_key" uuid`,
  `ALTER TABLE "agent_chat_conversations" ADD COLUMN IF NOT EXISTS "title" text`,
  `ALTER TABLE "agent_chat_conversations" ADD COLUMN IF NOT EXISTS "model" text`,
  `ALTER TABLE "agent_chat_conversations" ADD COLUMN IF NOT EXISTS "user_llm_provider_id" uuid`,
  `ALTER TABLE "agent_chat_conversations" ADD COLUMN IF NOT EXISTS "archived_at" timestamp`,

  `UPDATE "agent_chat_conversations" SET "thread_key" = "agent_id" WHERE "thread_key" IS NULL`,
  `ALTER TABLE "agent_chat_conversations" ALTER COLUMN "thread_key" SET NOT NULL`,

  // A thread may hold several agents, so the conversation's own agent becomes the
  // optional primary responder rather than the thread's identity.
  `ALTER TABLE "agent_chat_conversations" ALTER COLUMN "agent_id" DROP NOT NULL`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_agent_chat_thread" ON "agent_chat_conversations" USING btree ("organization_id","user_id","thread_key")`,
  `CREATE INDEX IF NOT EXISTS "idx_agent_chat_thread_list" ON "agent_chat_conversations" USING btree ("organization_id","user_id","updated_at")`,
  `DROP INDEX IF EXISTS "uq_agent_chat_conversation"`,

  `CREATE TABLE IF NOT EXISTS "agent_chat_participants" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "conversation_id" uuid NOT NULL,
    "agent_id" uuid NOT NULL,
    "organization_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL
  )`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('agent_chat_participants_conversation_id_fk', 63)) THEN
      ALTER TABLE "agent_chat_participants" ADD CONSTRAINT "agent_chat_participants_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_chat_conversations"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = left('agent_chat_participants_agent_id_fk', 63)) THEN
      ALTER TABLE "agent_chat_participants" ADD CONSTRAINT "agent_chat_participants_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END $$`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_agent_chat_participant" ON "agent_chat_participants" USING btree ("conversation_id","agent_id")`,

  `INSERT INTO "agent_chat_participants" ("conversation_id","agent_id","organization_id")
    SELECT c."id", c."agent_id", c."organization_id"
    FROM "agent_chat_conversations" c
    WHERE c."agent_id" IS NOT NULL
    ON CONFLICT ("conversation_id","agent_id") DO NOTHING`,

  `ALTER TABLE "agent_chat_messages" ADD COLUMN IF NOT EXISTS "agent_id" uuid`,
  `ALTER TABLE "agent_chat_messages" ADD COLUMN IF NOT EXISTS "model" text`,
  `ALTER TABLE "agent_chat_messages" ADD COLUMN IF NOT EXISTS "prompt_tokens" integer`,
  `ALTER TABLE "agent_chat_messages" ADD COLUMN IF NOT EXISTS "completion_tokens" integer`,
  `ALTER TABLE "agent_chat_messages" ADD COLUMN IF NOT EXISTS "total_tokens" integer`,
  `ALTER TABLE "agent_chat_messages" ADD COLUMN IF NOT EXISTS "cost_usd" numeric(12, 6)`,

  `UPDATE "agent_chat_messages" m
    SET "agent_id" = c."agent_id"
    FROM "agent_chat_conversations" c
    WHERE m."conversation_id" = c."id"
      AND m."role" = 'assistant'
      AND m."agent_id" IS NULL`,

  /**
   * Two PARTIAL indexes replace uq_agent_chat_turn_role: a turn has exactly one
   * user row but may have N assistant rows, one per responding agent. A single
   * (conversation, turn, role, agent) index would not constrain the user row at
   * all — user rows carry agent_id NULL and Postgres treats NULLs as distinct,
   * so duplicates would pass and silently break retry idempotency.
   */
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_agent_chat_user_turn" ON "agent_chat_messages" USING btree ("conversation_id","client_turn_id") WHERE role = 'user'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_agent_chat_assistant_turn" ON "agent_chat_messages" USING btree ("conversation_id","client_turn_id","agent_id") WHERE role = 'assistant'`,
  `DROP INDEX IF EXISTS "uq_agent_chat_turn_role"`,
];

/** Arbitrary but FIXED — every booting machine must derive the same number. */
export const AGENT_CHAT_THREAD_LOCK_KEY = 8_531_208;

export class EnsureAgentChatThreads {
  /**
   * `IF NOT EXISTS` is check-then-act: two Fly machines booting together can both
   * pass the check and both run the DDL. A session-level advisory lock serializes
   * them, and one transaction makes the statements all-or-nothing so a failure
   * can never leave the service running against half a schema.
   */
  async run(): Promise<void> {
    const client = await getIntelligencePool().connect();

    try {
      await client.query('SELECT pg_advisory_lock($1)', [AGENT_CHAT_THREAD_LOCK_KEY]);
      await client.query('BEGIN');

      try {
        for (const statement of AGENT_CHAT_THREAD_STATEMENTS) {
          await client.query(statement);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      logger.info('Agent chat thread schema ensured', {
        statements: AGENT_CHAT_THREAD_STATEMENTS.length,
      });
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [AGENT_CHAT_THREAD_LOCK_KEY]);
      client.release();
    }
  }
}

async function main(): Promise<void> {
  try {
    await initializePlanes();
    await new EnsureAgentChatThreads().run();
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
