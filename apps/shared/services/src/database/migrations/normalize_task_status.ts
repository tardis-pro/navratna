/**
 * Migration: collapse `tasks.status` onto the single canonical StoryStatus
 * vocabulary.
 *
 * THREE vocabularies were being written into one varchar column:
 *
 *   TaskService           todo | in_progress | in_review | blocked | completed | cancelled
 *   InternalBoardAdapter  backlog | in-progress | in-review | done | blocked | needs-triage
 *   ProjectTaskToolService (the MCP tool surface agents call)
 *                         pending | in_progress | blocked | completed | cancelled
 *
 * ...and the column itself defaulted to 'pending', a value none of the three
 * ever wrote deliberately. What a row's status *meant* therefore depended on
 * which writer touched it last, and a status filter could only ever match one
 * writer's rows.
 *
 * StoryStatus wins because four board adapters (internal, github, jira, linear)
 * already conform to it and it can express 'needs-triage', which escalation
 * needs and the other two vocabularies cannot.
 *
 * The mapping is deliberately the same one `toStoryStatus` applies at read time,
 * so this migration converges rows that the application would otherwise keep
 * translating on every read.
 *
 * NOTE on 'cancelled': it maps to 'done' because StoryStatus has no cancelled
 * state and 'done' is the only terminal one. That loses the distinction between
 * finished and abandoned. Row counts are low, which is why this is acceptable
 * now and would not be later.
 *
 * Idempotent: re-running maps already-canonical values to themselves and the
 * UPDATE matches nothing.
 *
 * Standalone: bun apps/shared/services/src/database/migrations/normalize_task_status.ts
 * Programmatic: await new NormalizeTaskStatus().run();
 */

import { sql } from 'drizzle-orm';
import { createLogger } from '@uaip/utils';
import { STORY_STATUSES } from '@uaip/types';
import { getControlDb, initializePlanes } from '../drizzle/clients/index';

const logger = createLogger({
  serviceName: 'normalize-task-status',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

/** Legacy value → canonical StoryStatus. Mirrors LEGACY_STATUS_ALIASES. */
const STATUS_MAP: Record<string, string> = {
  todo: 'backlog',
  pending: 'backlog',
  in_progress: 'in-progress',
  inprogress: 'in-progress',
  in_review: 'in-review',
  completed: 'done',
  cancelled: 'done',
  needs_triage: 'needs-triage',
};

export interface NormalizeTaskStatusResult {
  /** Rows changed, keyed by `<from> -> <to>`. */
  updated: Record<string, number>;
  /** Distinct values left that are still not canonical. */
  unrecognised: Array<{ status: string; count: number }>;
}

export class NormalizeTaskStatus {
  async run(): Promise<NormalizeTaskStatusResult> {
    const db = getControlDb();
    const updated: Record<string, number> = {};

    for (const [from, to] of Object.entries(STATUS_MAP)) {
      // oxlint-disable-next-line no-await-in-loop -- a small fixed map; sequential keeps the log attributable
      const result = await db.execute(
        sql`UPDATE tasks SET status = ${to}, updated_at = now() WHERE status = ${from}`
      );
      const count = this.rowCount(result);
      if (count > 0) {
        updated[`${from} -> ${to}`] = count;
        logger.info('Normalised task status', { from, to, rows: count });
      }
    }

    const unrecognised = await this.findUnrecognised();
    if (unrecognised.length > 0) {
      // Left alone rather than defaulted to 'backlog': silently rewriting a
      // status nobody anticipated is how this column got into three vocabularies
      // in the first place.
      logger.warn('Task rows carry statuses outside the canonical set and were left unchanged', {
        unrecognised,
        canonical: STORY_STATUSES,
      });
    }

    return { updated, unrecognised };
  }

  /** Distinct non-canonical statuses still present, with row counts. */
  async findUnrecognised(): Promise<Array<{ status: string; count: number }>> {
    const db = getControlDb();
    const rows = await db.execute(
      sql`SELECT status, COUNT(*)::int AS count
          FROM tasks
          WHERE status NOT IN (${sql.join(
            STORY_STATUSES.map((status) => sql`${status}`),
            sql`, `
          )})
          GROUP BY status
          ORDER BY count DESC`
    );

    return this.rows(rows).map((row) => ({
      status: String(row.status),
      count: Number(row.count),
    }));
  }

  private rows(result: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
    const rows = (result as { rows?: unknown })?.rows;
    return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
  }

  private rowCount(result: unknown): number {
    const count = (result as { rowCount?: unknown })?.rowCount;
    if (typeof count === 'number') return count;
    return this.rows(result).length;
  }
}

async function main(): Promise<void> {
  try {
    await initializePlanes();
    const result = await new NormalizeTaskStatus().run();
    logger.info('Migration finished', {
      updated: result.updated,
      unrecognised: result.unrecognised,
    });
    process.exit(result.unrecognised.length > 0 ? 2 : 0);
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
