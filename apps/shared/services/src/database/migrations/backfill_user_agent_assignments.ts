/**
 * Migration: Backfill user_agent_assignments for existing users
 *
 * GET /api/v1/agents is moving from "return every active agent" to "return
 * only agents with a user_agent_assignments row for the caller". Without this
 * backfill, every pre-existing user sees ZERO agents the moment that ships.
 *
 * CROSS-PLANE CONSTRAINT: `users`/`user_agent_assignments` live in the
 * CONTROL plane and `agents` in the INTELLIGENCE plane — physically
 * separable Postgres hosts. No single SQL statement may reference both
 * tables; agent ids are read from the intelligence pool first, then inserted
 * per user through the control pool.
 *
 * The onboarding guide agent is EXCLUDED: it stays deliberately unassigned
 * and is reachable via the carve-out in agent_access_service.
 *
 * Standalone: bun apps/shared/services/src/database/migrations/backfill_user_agent_assignments.ts
 * Programmatic:
 *   const result = await new BackfillUserAgentAssignments().run();
 */

import { createLogger } from '@uaip/utils';
import { eq, getControlDb, getControlPool, getIntelligenceDb, initializePlanes } from '../drizzle/clients/index';
import { agents } from '../drizzle/schemas/intelligence_schema';
import { dataMigrations, userAgentAssignments, users } from '../drizzle/schemas/control_schema';
import { ONBOARDING_GUIDE_AGENT_ID, isOfferableToOrg } from '../drizzle/constants';
import { PROVISIONAL_ASSIGNMENT_SOURCE } from '../repositories/user_agent_assignment_repository';

const logger = createLogger({
  serviceName: 'migration:backfill-user-agent-assignments',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export const BACKFILL_MIGRATION_NAME = 'backfill_user_agent_assignments';

/** Fixed key — every booting machine must derive the same number or nothing serializes. */
export const BACKFILL_LOCK_KEY = 8_531_208;

export interface BackfillUserAgentAssignmentsResult {
  usersProcessed: number;
  assignmentsCreated: number;
  agentsFound: number;
  skipped: number;
  alreadyApplied: boolean;
}

interface PoolClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
  release(): void;
}

export class BackfillUserAgentAssignments {
  /**
   * COMPLETION IS LEDGERED, NOT INFERRED. An earlier version treated its own
   * output rows as the "already ran" marker, which is wrong twice over: a run
   * that crashed after the first user looked complete forever, and a run where
   * every insert hit ON CONFLICT wrote no marker at all and re-ran on the next
   * boot. `data_migrations` is written once, at the end, only when every user
   * succeeded — so a partial run is retried and a finished one never repeats.
   *
   * Re-running is not merely wasteful: it would re-grant every agent to every
   * user, including accounts created after the visibility flip, restoring the
   * "everyone sees everything" leak that scoping exists to close.
   *
   * The advisory lock serializes concurrent Fly machines, which would
   * otherwise both pass the ledger probe and both backfill.
   */
  async run(): Promise<BackfillUserAgentAssignmentsResult> {
    const client = (await getControlPool().connect()) as PoolClient;

    try {
      // Drizzle exposes no advisory-lock API; this is the one statement that
      // must stay raw, and it must run on a single pinned connection because
      // a session lock is released only by the connection that took it.
      await client.query('SELECT pg_advisory_lock($1)', [BACKFILL_LOCK_KEY]);
      return await this.runLocked();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [BACKFILL_LOCK_KEY]);
      client.release();
    }
  }

  private async runLocked(): Promise<BackfillUserAgentAssignmentsResult> {
    const db = getControlDb();

    const ledgerRows = await db
      .select({ name: dataMigrations.name })
      .from(dataMigrations)
      .where(eq(dataMigrations.name, BACKFILL_MIGRATION_NAME))
      .limit(1);

    if (ledgerRows.length > 0) {
      logger.info('Backfill already applied — skipping');
      return {
        usersProcessed: 0,
        assignmentsCreated: 0,
        agentsFound: 0,
        skipped: 0,
        alreadyApplied: true,
      };
    }

    // Step 1 — intelligence plane only: which active agents exist?
    const agentRows = await getIntelligenceDb()
      .select({ id: agents.id, organizationId: agents.organizationId })
      .from(agents)
      .where(eq(agents.isActive, true));

    const candidateAgents = agentRows.filter((row) => row.id !== ONBOARDING_GUIDE_AGENT_ID);

    if (candidateAgents.length === 0) {
      logger.info('Backfill skipped — no active agents found in the intelligence plane');
      return {
        usersProcessed: 0,
        assignmentsCreated: 0,
        agentsFound: 0,
        skipped: 0,
        alreadyApplied: false,
      };
    }

    // Step 2 — control plane only: which users need grants?
    const userRowsResult = await db
      .select({ id: users.id, organizationId: users.organizationId })
      .from(users);

    let assignmentsCreated = 0;
    let skipped = 0;

    // Step 3 — one multi-VALUES insert per user. Grants are filtered to the
    // agents that tenant may actually hold: platform agents (admin org) plus
    // its own. Granting another tenant's private agent here would write the
    // very cross-tenant access this table exists to prevent.
    for (const user of userRowsResult) {
      const agentIds = candidateAgents
        .filter((agent) => isOfferableToOrg(agent.organizationId, user.organizationId))
        .map((agent) => agent.id);

      if (agentIds.length === 0) continue;

      try {
        const inserted = await db
          .insert(userAgentAssignments)
          .values(
            agentIds.map((agentId) => ({
              userId: user.id,
              agentId,
              organizationId: user.organizationId,
              source: PROVISIONAL_ASSIGNMENT_SOURCE,
            }))
          )
          .onConflictDoNothing({
            target: [userAgentAssignments.userId, userAgentAssignments.agentId],
          })
          .returning({ id: userAgentAssignments.id });
        assignmentsCreated += inserted.length;
      } catch (error) {
        skipped += 1;
        logger.error('Backfill failed for user — continuing', {
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const result: BackfillUserAgentAssignmentsResult = {
      usersProcessed: userRowsResult.length,
      assignmentsCreated,
      agentsFound: candidateAgents.length,
      skipped,
      alreadyApplied: false,
    };

    // Only a run that covered EVERY user is final. Marking a partial run
    // complete would strand the skipped users with an empty roster forever.
    if (skipped === 0) {
      await db
        .insert(dataMigrations)
        .values({ name: BACKFILL_MIGRATION_NAME, details: result })
        .onConflictDoNothing({ target: dataMigrations.name });
    } else {
      logger.warn('Backfill incomplete — not marking as applied, will retry on next boot', {
        skipped,
      });
    }

    logger.info('User agent assignment backfill complete', result);

    return result;
  }
}

async function main(): Promise<void> {
  try {
    await initializePlanes();
    const result = await new BackfillUserAgentAssignments().run();
    logger.info('Migration finished', result);
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
