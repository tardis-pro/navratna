/**
 * The nightly triage definition — N2 of the loop plan.
 *
 * Gathers evidence from the tardis agent's MCP surface, then has a reasoning step
 * rank what it found. This ships as a seed rather than being inserted by hand
 * because the platform has no exec path into the database: the only way a row
 * arrives on a deployed stack is with the code.
 *
 * WHAT THIS SLICE IS NOT. The plan's group B — `explain_finding` fanned over every
 * finding, so ranking happens on evidence rather than on titles — is still absent.
 * That one needs a fan-out whose RESULTS feed a later reasoning step, and `forEach`
 * currently fans out to a terminal action.
 *
 * Group D (create_task per survivor) is no longer absent. It was missing because
 * WorkflowExecutorService ran a flat, ordered step list, so "one call per finding"
 * could not be expressed and the night's whole digest went onto the board as a
 * single task body. `forEach` removed that limit, and the reasoning step now emits
 * clustered GROUPS for it to iterate — see TRIAGE_PROMPT for what one group is,
 * which is the judgment this workflow exists to apply.
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

/**
 * The clustering rule, which is the judgment this whole workflow exists to apply.
 *
 * The output is no longer prose for a human to read — it is the INPUT to a
 * `forEach` step, so its shape is load-bearing. Three properties of the executor
 * shape what this prompt has to say:
 *
 *  - Unparseable output THROWS. Prose here fails the run rather than quietly
 *    filing nothing, which is why the format instruction is blunt and repeated.
 *  - `[]` is recorded as `requested: 0` and is NOT an error. "Nothing cleared the
 *    bar" and "the model broke" are therefore distinguishable, and the prompt has
 *    to make the empty answer feel permitted or the model will pad to avoid it.
 *  - An unknown placeholder is left VISIBLE on the board rather than blanked, so a
 *    group missing `title` or `why` announces itself instead of filing a task with
 *    an empty body.
 */
export const TRIAGE_PROMPT = [
  'You are triaging one codebase overnight. The evidence below was gathered from',
  'its runtime a moment ago.',
  '',
  'Group what deserves a human tomorrow morning into UNITS OF WORK, and return',
  'them as JSON.',
  '',
  'What ONE group is:',
  '- One underlying cause, with one remediation, that one person could pick up in',
  '  one sitting and land as one pull request.',
  '- NOT one finding. Findings that share a cause are ONE group even when they',
  '  arrive from different evidence sources — a 500 in the HTTP errors, the',
  '  exception behind it, and the static rule that predicted it are one item.',
  '- NOT one file, and NOT one severity bucket. "17 BLOCKERs in auth" is a bucket,',
  '  not a unit of work; say what the change is.',
  '',
  'What clears the bar:',
  '- BLOCKER and newly-appeared CRITICAL only. Everything else is noise tonight.',
  '- Every group must be grounded in the evidence below. A group you cannot cite',
  '  does not belong in the list.',
  '',
  'Return between 0 and 8 groups, ranked most urgent first. Fewer well-grounded',
  'groups beat a padded list.',
  '',
  'OUTPUT FORMAT — a JSON array and nothing else:',
  '[',
  '  {',
  '    "key": "stable slug of the underlying CAUSE — lowercase, hyphenated,',
  '            2-5 words, e.g. auth-token-refresh-race",',
  '    "title": "imperative and specific, under 80 characters — name the CHANGE,',
  '              not the symptom",',
  '    "why": "one paragraph: what changed, what it correlates with, what it will',
  '            cost if it waits, and the evidence you used"',
  '  }',
  ']',
  '',
  'ABOUT "key" — this is the one field that must not change between nights.',
  'It is what stops tonight\'s groups being filed a second time tomorrow, so slug',
  'the CAUSE and never the wording: if you describe the same underlying problem',
  'differently tomorrow, the key must still come out identical. Do not put dates,',
  'counts, severities or run ids in it — all of those change while the cause',
  'stays put.',
  '',
  'All three fields are required on every group. A missing one is not silently',
  'dropped — it arrives on the board as a literal placeholder.',
  '',
  'If nothing clears the bar, return exactly []. An empty array is a real and',
  'useful answer, and it is recorded as such. Do not pad the list to avoid it, and',
  'do not explain the emptiness in prose — prose fails the run.',
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
    // FILE THEM, so there is something to accept or reject.
    //
    // A digest that only exists in a run record is a report nobody acts on. This
    // puts the night's groups on the project's own board, where each can be
    // approved, rejected, or turned into work like anything else — and where the
    // outcome is recorded rather than remembered.
    //
    // ONE TASK PER GROUP, not one per finding and no longer one for the lot.
    // The single-task form was a limit of the engine, not a choice: the executor
    // ran a flat step list, so "a task per survivor" was not expressible and the
    // whole digest went onto the board as one body. `forEach` removes that limit.
    //
    // `maxItems` is 8 to AGREE with the prompt's own bound rather than to back it
    // up from a distance. The executor's hard cap is 25; a truncation at 8 means
    // the model ignored an instruction it was given, and that is worth seeing as
    // a loud truncation rather than absorbing silently 17 items later.
    {
      type: 'forEach',
      id: 'file',
      // The reasoning step's JSON array. Prose here throws, `[]` completes as
      // zero — the two are deliberately not the same outcome.
      itemsFrom: '{{steps.triage.output}}',
      toolId: `mcp-${TARDIS_SERVER}-create_task`,
      arguments: {
        // If any of these ever reaches the board with the placeholder still in
        // it, the group was missing that field — which is the point of leaving
        // unknown placeholders intact rather than blanking them.
        //
        // `key` is what makes a second run of the same night idempotent:
        // create_task files as `[key] title` and SKIPS when that key already
        // exists, returning created:false. It matches over open and closed
        // tasks alike, so closing an item does not invite it back tomorrow.
        // Skipping rather than updating is deliberate on the tardis side —
        // refreshing the body of a task a human has already picked up is a
        // worse failure than a stale description.
        key: '{{item.key}}',
        title: '{{item.title}}',
        body: '{{item.why}}',
        labels: ['auto-detected'],
      },
      maxItems: 8,
    },
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
    // The schedule is overridable because a workflow that can only run at 06:00
    // can only be VERIFIED at 06:00. Proving this end to end — that the digest
    // actually reaches the board — otherwise means either waiting for dawn or
    // trusting that it works, and the second is how a nightly job runs broken for
    // a fortnight.
    trigger: {
      kind: 'cron' as const,
      expr: process.env.TRIAGE_CRON ?? '0 6 * * *',
      tz: process.env.TRIAGE_TZ ?? 'UTC',
    },
    steps: steps() as never,
    delivery: null,
    enabled: opts.enable ?? false,
    agentId: null,
    sessionKey: null,
    model: null,
    projectId: project.id,
  };

  const existing = await db
    .select({ id: workflowDefinitions.id, enabled: workflowDefinitions.enabled })
    .from(workflowDefinitions)
    .where(eq(workflowDefinitions.name, NIGHTLY_TRIAGE_NAME))
    .limit(1);

  if (existing.length > 0) {
    // AN UPDATE MUST NOT CLOBBER `enabled`.
    //
    // This seed runs at every gateway boot, and it used to write
    // `enabled: opts.enable ?? false` on the update path too — so an operator who
    // followed this file's own instruction ("enable with --enable, or by
    // flipping `enabled` on the row") had the flag silently reverted by the next
    // restart. It was flipped, the engine reported `loaded: 0`, and nothing said
    // why.
    //
    // Seeding owns the DEFINITION — steps, trigger, description. Whether the
    // thing is switched on is an operator decision and belongs to whoever made
    // it. Only an explicit `--enable` may change it from here.
    const preserved = opts.enable === undefined ? existing[0].enabled : opts.enable;
    await db
      .update(workflowDefinitions)
      .set({ ...row, enabled: preserved })
      .where(eq(workflowDefinitions.id, existing[0].id));
    logger.info('Nightly triage workflow updated', { projectId: project.id, enabled: preserved });
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
