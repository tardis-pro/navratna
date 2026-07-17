/**
 * OpenClaw workflow import — rehomes ALL OpenClaw cron jobs + `.lobster` workflows
 * (openclaw-infra/config/cron-jobs.json + workflows/) onto Navratna `workflow_definitions`.
 *
 * The definitions live in the generated `openclaw_workflows.json` next to this file (one
 * row per cron job, faithful trigger + agent + model + steps). This importer just upserts
 * them — the substrate stays ignorant of OpenClaw; this script is the only thing that knows.
 *
 * Each definition is the "when + what": a trigger plus ordered steps. The
 * WorkflowExecutorService turns a fired definition into an Operation and runs each step —
 * `bash` via the shell tool, `agentTurn` via a persona + LLM, `httpCall` via http-request.
 *
 * Seeded DISABLED by default: an INLINE agentTurn's prompt is faithful and runnable, but
 * many bash steps still reference scrubbed script bodies/paths. A human wires those and
 * flips `enabled: true` (or pass { enable: true } to force). We do not schedule broken
 * shell on production cron.
 *
 * Run:  bun apps/backend/services/orchestration-pipeline/src/seeds/openclaw-workflow-import.ts
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getControlDb } from '@uaip/shared-services';
import { eq } from '@uaip/shared-services/drizzle/clients';
import { workflowDefinitions } from '@uaip/shared-services/drizzle/control';
import { logger } from '@uaip/utils';

interface WorkflowSeed {
  name: string;
  description: string;
  trigger: { kind: 'cron' | 'every' | 'webhook' | 'event'; expr: string; tz?: string };
  steps: Array<{ type: 'bash' | 'agentTurn' | 'httpCall'; id: string; [k: string]: unknown }>;
  agentId: string;
  model?: string | null;
  enabled?: boolean;
}

function loadDefinitions(): WorkflowSeed[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, 'openclaw_workflows.json'), 'utf8');
  return JSON.parse(raw) as WorkflowSeed[];
}

/** Idempotent upsert by name. Seeds DISABLED unless `enable` is passed. */
export async function importOpenClawWorkflows(
  opts: { enable?: boolean } = {}
): Promise<{ inserted: number; updated: number; total: number }> {
  const db = getControlDb();
  const defs = loadDefinitions();
  let inserted = 0;
  let updated = 0;

  for (const wf of defs) {
    const row = {
      name: wf.name,
      description: wf.description,
      trigger: wf.trigger,
      steps: wf.steps,
      delivery: null,
      enabled: opts.enable ?? wf.enabled ?? false,
      agentId: wf.agentId,
      sessionKey: `agent:${wf.agentId}:main`,
      model: wf.model ?? null,
    };

    // oxlint-disable-next-line no-await-in-loop -- fixed small set, run sequentially
    const existing = await db
      .select({ id: workflowDefinitions.id })
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.name, wf.name))
      .limit(1);

    if (existing.length > 0) {
      // oxlint-disable-next-line no-await-in-loop
      await db.update(workflowDefinitions).set(row).where(eq(workflowDefinitions.id, existing[0].id));
      updated += 1;
    } else {
      // oxlint-disable-next-line no-await-in-loop
      await db.insert(workflowDefinitions).values(row);
      inserted += 1;
    }
  }

  logger.info('OpenClaw workflows imported', { inserted, updated, total: defs.length });
  return { inserted, updated, total: defs.length };
}

if (import.meta.main) {
  const { initializePlanes, closePlanes } = await import('@uaip/shared-services/drizzle/clients');
  await initializePlanes();
  const result = await importOpenClawWorkflows({ enable: process.argv.includes('--enable') });
  // eslint-disable-next-line no-console
  console.log('OpenClaw workflow import:', result);
  await closePlanes();
  process.exit(0);
}
