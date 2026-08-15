/**
 * One-shot upstream migration runner, built to be uploaded once and run via
 * `tardis dev ... -s navratna-gateway`.
 *
 * Batched deliberately: each `tardis dev` invocation re-uploads the whole tree
 * (~4600 files, minutes), so diagnosing and acting in separate runs is wasteful.
 * This prints its environment first, then does the work, then re-reads the table
 * so the outcome is confirmed by a fresh query rather than by the migration's own
 * report.
 *
 *   bun scripts/upstream_migrate.ts              # diagnose + DRY RUN
 *   bun scripts/upstream_migrate.ts --apply      # actually purge
 */

import { sql } from 'drizzle-orm';

const APPLY = process.argv.includes('--apply');

function line(label: string, value: unknown): void {
  console.log(`UM| ${label}: ${String(value)}`);
}

async function main(): Promise<void> {
  console.log('UM| ===== environment =====');
  for (const name of [
    'POSTGRES_URL',
    'DATABASE_URL',
    'POSTGRES_HOST',
    'POSTGRES_PORT',
    'POSTGRES_DB',
    'POSTGRES_USER',
    'NODE_ENV',
  ]) {
    const v = process.env[name];
    // Never print a password: show only presence and a safe prefix.
    line(name, v ? `present(${v.replace(/:\/\/[^@]*@/, '://<redacted>@').slice(0, 48)})` : 'MISSING');
  }

  const clients = await import('@uaip/shared-services/drizzle/clients');
  const { getControlDb, initializePlanes } = clients as unknown as {
    getControlDb: () => { execute: (q: unknown) => Promise<unknown> };
    initializePlanes: () => Promise<unknown>;
  };

  console.log('UM| ===== connecting =====');
  try {
    await initializePlanes();
    line('initializePlanes', 'ok');
  } catch (error) {
    line('initializePlanes', `FAILED ${error instanceof Error ? error.message : String(error)}`);
    console.log('UM| cannot continue without a database connection');
    process.exit(1);
  }

  const db = getControlDb();
  const rowsOf = (result: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
    const r = (result as { rows?: unknown })?.rows;
    return Array.isArray(r) ? (r as Array<Record<string, unknown>>) : [];
  };

  const dumpProjects = async (label: string): Promise<number> => {
    const res = await db.execute(sql`
      SELECT p.id, p.slug, p.name,
             (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS task_count,
             (SELECT COUNT(*)::int FROM project_members m WHERE m.project_id = p.id) AS member_count,
             (SELECT COUNT(*)::int FROM mcp_servers s WHERE s.project_id = p.id) AS mcp_count
      FROM projects p ORDER BY p.created_at
    `);
    const rows = rowsOf(res);
    console.log(`UM| ===== projects (${label}) = ${rows.length} =====`);
    for (const r of rows) {
      console.log(
        `UM| ROW slug=${String(r.slug)} name=${JSON.stringify(String(r.name))} ` +
          `tasks=${r.task_count} members=${r.member_count} mcp=${r.mcp_count} id=${String(r.id)}`
      );
    }
    return rows.length;
  };

  const before = await dumpProjects('before');

  console.log('UM| ===== task status distribution (before) =====');
  for (const r of rowsOf(await db.execute(sql`SELECT status, COUNT(*)::int c FROM tasks GROUP BY status ORDER BY c DESC`))) {
    console.log(`UM| STATUS ${String(r.status)} -> ${r.c}`);
  }

  console.log('UM| ===== mcp_servers =====');
  for (const r of rowsOf(await db.execute(sql`SELECT server_key, project_id FROM mcp_servers WHERE server_key IS NOT NULL ORDER BY server_key`))) {
    console.log(`UM| MCP ${String(r.server_key)} project_id=${String(r.project_id)}`);
  }

  // ---- 1. normalize task status (idempotent) --------------------------------
  const { NormalizeTaskStatus } = await import(
    '../apps/shared/services/src/database/migrations/normalize_task_status'
  );
  const norm = await new NormalizeTaskStatus().run();
  line('normalize_task_status.updated', JSON.stringify(norm.updated));
  line('normalize_task_status.unrecognised', JSON.stringify(norm.unrecognised));

  // ---- 2. purge UAT projects ------------------------------------------------
  const { PurgeUatProjects } = await import(
    '../apps/shared/services/src/database/migrations/purge_uat_projects'
  );
  const purge = await new PurgeUatProjects().run({
    dumpPath: '/data/uat-projects-dump.json',
    apply: APPLY,
    keepSlugs: ['navratna'],
  });
  line('purge.dryRun', purge.dryRun);
  line('purge.examined', purge.candidates.length);
  line('purge.skipped', JSON.stringify(purge.skipped.map((s) => ({ slug: s.slug, name: s.name }))));
  line('purge.deleted', purge.deleted.length);

  const after = await dumpProjects('after');
  line('projects.before', before);
  line('projects.after', after);
  console.log(APPLY ? 'UM| ===== APPLIED =====' : 'UM| ===== DRY RUN (no changes) =====');
  process.exit(0);
}

void main().catch((error: unknown) => {
  console.log(`UM| FATAL ${error instanceof Error ? `${error.message}\n${error.stack}` : String(error)}`);
  process.exit(1);
});
