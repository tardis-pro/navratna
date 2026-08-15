/**
 * Migration: remove UAT test rows from `projects`.
 *
 * The table held 8 rows of test data and nothing else — no row corresponded to
 * any real project. One of them is a literal `<script>alert(1)</script>`, left
 * over from an XSS probe. Harmless while nothing enumerates projects; actively
 * confusing the moment something does, and a stored-XSS payload sitting in a
 * name column is not something to leave lying around either.
 *
 * SAFETY: every row it is about to delete is written to a JSON file first, and
 * the file is written BEFORE the delete runs. Nothing is deleted if the dump
 * cannot be written.
 *
 * Rows are only deleted if they have no dependents that would cascade into real
 * data — projects cascade to tasks, project_members and
 * project_agent_integration_connections, so a row with any of those is reported
 * and skipped rather than quietly taking them along.
 *
 * Standalone:
 *   bun apps/shared/services/src/database/migrations/purge_uat_projects.ts --dump /data/uat-projects.json
 *   bun apps/shared/services/src/database/migrations/purge_uat_projects.ts --dump /data/uat-projects.json --apply
 *
 * Without --apply it is a DRY RUN: it dumps and reports, and deletes nothing.
 */

import { writeFileSync } from 'node:fs';
import { inArray, sql } from 'drizzle-orm';
import { createLogger } from '@uaip/utils';
import { getControlDb, initializePlanes } from '../drizzle/clients/index';
import { projects } from '../drizzle/schemas/control_schema';

const logger = createLogger({
  serviceName: 'purge-uat-projects',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export interface PurgeCandidate {
  id: string;
  slug: string | null;
  name: string;
  taskCount: number;
  memberCount: number;
  integrationCount: number;
  mcpServerCount: number;
}

export interface PurgeResult {
  candidates: PurgeCandidate[];
  /** Rows with dependents; reported and left alone. */
  skipped: PurgeCandidate[];
  deleted: string[];
  dryRun: boolean;
}

export class PurgeUatProjects {
  /**
   * @param keepSlugs slugs to preserve regardless — pass the real project slug
   *                  so a re-run after provisioning cannot remove it.
   */
  async run(options: {
    dumpPath: string;
    apply: boolean;
    keepSlugs?: string[];
  }): Promise<PurgeResult> {
    const db = getControlDb();
    const keep = new Set(options.keepSlugs ?? []);

    const rows = await db.execute(sql`
      SELECT p.id,
             p.slug,
             p.name,
             (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS task_count,
             (SELECT COUNT(*)::int FROM project_members m WHERE m.project_id = p.id) AS member_count,
             (SELECT COUNT(*)::int FROM project_agent_integration_connections c
                WHERE c.project_id = p.id) AS integration_count,
             (SELECT COUNT(*)::int FROM mcp_servers s WHERE s.project_id = p.id) AS mcp_server_count
      FROM projects p
      ORDER BY p.created_at
    `);

    const all: PurgeCandidate[] = this.rows(rows).map((row) => ({
      id: String(row.id),
      slug: row.slug === null ? null : String(row.slug),
      name: String(row.name),
      taskCount: Number(row.task_count),
      memberCount: Number(row.member_count),
      integrationCount: Number(row.integration_count),
      mcpServerCount: Number(row.mcp_server_count),
    }));

    const candidates = all.filter((row) => !(row.slug && keep.has(row.slug)));
    const skipped = candidates.filter(
      (row) =>
        row.taskCount > 0 ||
        row.memberCount > 0 ||
        row.integrationCount > 0 ||
        row.mcpServerCount > 0
    );
    const deletable = candidates.filter((row) => !skipped.includes(row));

    // Dump BEFORE deleting. A failure to write aborts the whole thing.
    writeFileSync(
      options.dumpPath,
      JSON.stringify({ takenAt: new Date().toISOString(), all }, null, 2),
      'utf8'
    );
    logger.info('Wrote project dump', { dumpPath: options.dumpPath, rows: all.length });

    if (skipped.length > 0) {
      logger.warn('Skipping projects that have dependent rows', { skipped });
    }

    if (!options.apply) {
      logger.info('DRY RUN — nothing deleted. Re-run with --apply to delete.', {
        wouldDelete: deletable.map((row) => ({ id: row.id, name: row.name })),
      });
      return { candidates, skipped, deleted: [], dryRun: true };
    }

    if (deletable.length === 0) {
      return { candidates, skipped, deleted: [], dryRun: false };
    }

    const ids = deletable.map((row) => row.id);
    await db.delete(projects).where(inArray(projects.id, ids));
    logger.info('Deleted UAT projects', { count: ids.length, ids });

    return { candidates, skipped, deleted: ids, dryRun: false };
  }

  private rows(result: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
    const rows = (result as { rows?: unknown })?.rows;
    return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
  }
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  try {
    const dumpPath = arg('dump');
    if (!dumpPath) {
      logger.error('Usage: --dump <path> [--apply] [--keep <slug,slug>]');
      process.exit(1);
    }

    await initializePlanes();
    const result = await new PurgeUatProjects().run({
      dumpPath,
      apply: process.argv.includes('--apply'),
      keepSlugs: (arg('keep') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    });

    logger.info('Migration finished', {
      dryRun: result.dryRun,
      examined: result.candidates.length,
      skipped: result.skipped.length,
      deleted: result.deleted.length,
    });
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
