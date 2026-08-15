/**
 * The nightly triage definition — N2 of the loop plan.
 *
 * Gathers evidence from the tardis agent's MCP surface, then has a reasoning step
 * rank what it found. This ships as a seed rather than being inserted by hand
 * because the platform has no exec path into the database: the only way a row
 * arrives on a deployed stack is with the code.
 *
 * WHAT THIS SLICE IS NOT. The plan's group B (explain_finding fanned over every
 * finding) and group D (create_task per survivor) are absent, and not by oversight:
 * WorkflowExecutorService runs a flat, ordered list of steps with no fan-out, so
 * "one call per finding" is not expressible. What remains is still the thing the
 * plan called worth having on its own — a ranked digest of a codebase nobody is
 * triaging — delivered rather than filed.
 *
 * `code_quality` was absent for exactly as long as tardis T2 did not exist — a
 * step naming a tool the registry cannot resolve fails, and a failed step ends
 * the run, so it would have taken the four gather steps down with it. T2 has
 * since landed and the tool is registered as
 * `mcp-navratna-tardis-agent-code_quality`, so the gather step is in. It matters
 * more than its one line suggests: without it this workflow sees only runtime
 * symptoms, and "what is wrong with this code" is answered by the static half.
 *
 * SEEDED DISABLED. Same discipline as the OpenClaw import: nothing reaches
 * production cron before a human has watched it run once. Enable with
 * `--enable`, or by flipping `enabled` on the row.
 *
 * Run: bun apps/backend/services/orchestration-pipeline/src/seeds/nightly-triage-workflow.ts [--enable]
 */

import { getControlDb } from '@uaip/shared-services';
import { eq } from '@uaip/shared-services/drizzle/clients';
import { workflowDefinitions, projects } from '@uaip/shared-services/drizzle/control';
import { logger } from '@uaip/utils';

/** The MCP server key the tardis agent is registered under. */
const TARDIS_SERVER = process.env.TARDIS_MCP_SERVER_KEY ?? 'navratna-tardis-agent';

/** Which project's facts to gather. Resolved to an id by slug — never hardcoded. */
const TRIAGE_PROJECT_SLUG = process.env.TRIAGE_PROJECT_SLUG ?? 'navratna';

export const NIGHTLY_TRIAGE_NAME = 'nightly-triage';

const TRIAGE_PROMPT = [
  'You are triaging one codebase overnight. The evidence below was gathered from',
  'its runtime a moment ago.',
  '',
  'Rank what deserves a human tomorrow morning. Rules:',
  '- BLOCKER and newly-appeared CRITICAL only. Everything else is noise tonight.',
  '- Deduplicate: one entry per underlying cause, not per symptom.',
  '- For each survivor write ONE paragraph of "why now" — what changed, what it',
  '  correlates with, and what it will cost if it waits.',
  '- Cite the evidence you used. An item you cannot ground in the evidence below',
  '  does not belong in the list.',
  '- If nothing clears the bar, say so plainly. A short honest list beats a padded one.',
].join('\n');

function steps(): Array<Record<string, unknown>> {
  const gather = (id: string, tool: string, args: Record<string, unknown> = {}) => ({
    type: 'toolCall',
    id,
    toolId: `mcp-${TARDIS_SERVER}-${tool}`,
    arguments: args,
  });

  return [
    gather('gather.runtime', 'find_anomalies'),
    gather('gather.errors', 'recent_errors'),
    gather('gather.http', 'http_errors'),
    gather('gather.releases', 'release_history'),
    // Bounded at the call rather than in the prompt: tardis-navratna carries
    // 3,670 open issues, 243 of them BLOCKER or CRITICAL, so asking for
    // everything would spend the reasoning step's whole context on a list the
    // prompt then discards most of.
    gather('gather.quality', 'code_quality', { severities: 'BLOCKER,CRITICAL', limit: 30 }),
    { type: 'agentTurn', id: 'triage', prompt: TRIAGE_PROMPT },
  ];
}

/** Idempotent upsert by name, so a redeploy updates the row rather than adding one. */
export async function seedNightlyTriageWorkflow(
  opts: { enable?: boolean } = {}
): Promise<{ action: 'inserted' | 'updated' | 'skipped'; projectId: string | null }> {
  const db = getControlDb();

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, TRIAGE_PROJECT_SLUG))
    .limit(1);

  if (!project) {
    // Refused rather than seeded project-less. Every gather step here is a
    // project-scoped MCP tool, so a row without a scope is one that can only fail
    // at 3am — and a definition that exists is far easier to mistake for a working
    // one than a definition that was never created.
    logger.warn('Nightly triage not seeded — no project with that slug', {
      slug: TRIAGE_PROJECT_SLUG,
    });
    return { action: 'skipped', projectId: null };
  }

  const row = {
    name: NIGHTLY_TRIAGE_NAME,
    description: `Nightly ranked digest of ${TRIAGE_PROJECT_SLUG} from its own runtime evidence`,
    trigger: { kind: 'cron' as const, expr: '0 6 * * *', tz: process.env.TRIAGE_TZ ?? 'UTC' },
    steps: steps() as never,
    delivery: null,
    enabled: opts.enable ?? false,
    agentId: null,
    sessionKey: null,
    model: null,
    projectId: project.id,
  };

  const existing = await db
    .select({ id: workflowDefinitions.id })
    .from(workflowDefinitions)
    .where(eq(workflowDefinitions.name, NIGHTLY_TRIAGE_NAME))
    .limit(1);

  if (existing.length > 0) {
    await db.update(workflowDefinitions).set(row).where(eq(workflowDefinitions.id, existing[0].id));
    logger.info('Nightly triage workflow updated', { projectId: project.id });
    return { action: 'updated', projectId: project.id };
  }

  await db.insert(workflowDefinitions).values(row);
  logger.info('Nightly triage workflow seeded', { projectId: project.id, enabled: row.enabled });
  return { action: 'inserted', projectId: project.id };
}

if (import.meta.main) {
  const { initializePlanes, closePlanes } = await import('@uaip/shared-services/drizzle/clients');
  await initializePlanes();
  const result = await seedNightlyTriageWorkflow({ enable: process.argv.includes('--enable') });
  // eslint-disable-next-line no-console
  console.log('Nightly triage seed:', result);
  await closePlanes();
  process.exit(0);
}
