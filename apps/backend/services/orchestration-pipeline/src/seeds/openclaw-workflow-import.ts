/**
 * OpenClaw workflow import — rehomes the OpenClaw `.lobster` workflows and cron jobs
 * (openclaw-infra/workflows + config/cron-jobs.json) onto Navratna `workflow_definitions`.
 *
 * Each imported definition is the "when + what": a cron trigger plus an ordered list of
 * steps. The WorkflowExecutorService worker turns a fired definition into an Operation and
 * runs each step for real — `bash` via the shell tool, `agentTurn` via a persona + LLM.
 *
 * IMPORTANT — these are seeded DISABLED (`enabled: false`). The original bash steps point at
 * files that no longer exist (lobster-scripts/, nidra-workspace/, …) and the `openclaw` CLI,
 * and the credentials were scrubbed. This import captures the STRUCTURE faithfully; a human
 * rewires the actual script bodies/targets/secrets and then flips `enabled: true`. We do not
 * schedule broken shell on production cron.
 *
 * Step field conventions (must match WorkflowExecutorService):
 *   bash:      { type: 'bash',      id, command }
 *   agentTurn: { type: 'agentTurn', id, agentId?, prompt, model? }
 *   httpCall:  { type: 'httpCall',  id, method, url, headers?, body? }
 */

import { getControlDb } from '@uaip/shared-services';
import { eq } from '@uaip/shared-services/drizzle/clients';
import { workflowDefinitions } from '@uaip/shared-services/drizzle/control';
import { logger } from '@uaip/utils';

type WorkflowStep = { type: 'bash' | 'agentTurn' | 'httpCall'; id: string; [k: string]: unknown };

interface WorkflowSeed {
  name: string;
  description: string;
  trigger: { kind: 'cron' | 'every' | 'webhook' | 'event'; expr: string; tz?: string };
  steps: WorkflowStep[];
  agentId: string;
  model?: string;
  /** When false (default here), registered but not scheduled until a human wires it. */
  enabled?: boolean;
}

const IST = 'Asia/Kolkata';

// The scrubbed WhatsApp targets in the source; kept as a named placeholder rather than a
// bare number so it is obvious these need rewiring before enabling.
const WHATSAPP_TARGET = '${OPENCLAW_WHATSAPP_TARGET}';

export const OPENCLAW_WORKFLOWS: WorkflowSeed[] = [
  {
    name: 'amy-mit-evening-report',
    description: 'Amy: generate and send the evening report to MIT (CMO/Product Lead). Cron 6PM IST.',
    trigger: { kind: 'cron', expr: '0 18 * * *', tz: IST },
    agentId: 'comms',
    model: 'zai/glm-5',
    steps: [
      { type: 'bash', id: 'generate_report', command: 'python3 lobster-scripts/amy-format-report.py' },
      {
        type: 'bash',
        id: 'send_whatsapp',
        command: `bash -c 'openclaw message send --channel whatsapp --target "${WHATSAPP_TARGET}" --message "$(cat /tmp/amy-report.txt)"'`,
      },
    ],
  },
  {
    name: 'rishi-linkedin-post',
    description: 'Rishi: research + draft + publish one LinkedIn post on the next content pillar. Cron 10AM IST.',
    trigger: { kind: 'cron', expr: '0 10 * * *', tz: IST },
    agentId: 'content',
    model: 'anthropic/claude-sonnet-4-6',
    steps: [
      {
        type: 'agentTurn',
        id: 'draft_and_publish',
        agentId: 'content',
        model: 'anthropic/claude-sonnet-4-6',
        prompt:
          'Rishi LinkedIn. Read SOUL.md + COMPANY.md + content-log.json + anti-ai-writing SKILL.md. Read yesterday Karna report. Pick next pillar (rotation). Research + draft + publish via scripts/linkedin_post.py. Update content-log.json. One post.',
      },
    ],
  },
  {
    name: 'karna-morning-hunt',
    description: 'Karna morning hunt — gov tenders (GeM/TED) + EU procurement. Cron 10AM IST.',
    trigger: { kind: 'cron', expr: '0 10 * * *', tz: IST },
    agentId: 'growth',
    model: 'zai/glm-5',
    steps: [
      {
        type: 'bash',
        id: 'read_nidra',
        command:
          `bash -c 'ls -t nidra-workspace/reports/*.md 2>/dev/null | head -3 | xargs cat || echo "No Nidra reports found"'`,
      },
      {
        type: 'agentTurn',
        id: 'search_leads',
        agentId: 'growth',
        model: 'zai/glm-5',
        prompt:
          'Morning hunt. Read SOUL.md + TOOLS.md. Focus: Gov tenders (GeM/TED) + EU procurement. Search 3-5 qualified leads. APPEND to leads/<date>.md. Update scrape-log.json. Upload to R2.',
      },
    ],
  },
  {
    name: 'karna-afternoon-hunt',
    description: 'Karna afternoon hunt — HN jobs + LinkedIn groups + funding signals. Cron 2PM IST.',
    trigger: { kind: 'cron', expr: '0 14 * * *', tz: IST },
    agentId: 'growth',
    model: 'zai/glm-5',
    steps: [
      {
        type: 'agentTurn',
        id: 'afternoon_hunt',
        agentId: 'growth',
        model: 'zai/glm-5',
        prompt:
          'Afternoon hunt. HN jobs + LinkedIn groups + funding signals. Leads → leads/<date>.md, jobs → jobs/<date>.md. Upload R2. Update scrape-log.',
      },
    ],
  },
  {
    name: 'karna-evening-hunt',
    description: 'Karna evening hunt — HN + Reddit + competitors, then report. Cron 6PM IST.',
    trigger: { kind: 'cron', expr: '0 18 * * *', tz: IST },
    agentId: 'growth',
    model: 'zai/glm-5',
    steps: [
      {
        type: 'agentTurn',
        id: 'evening_hunt',
        agentId: 'growth',
        model: 'zai/glm-5',
        prompt:
          'Evening hunt. Read SOUL.md + memory/. HN + Reddit + competitors. Leads → leads/<date>.md, report → reports/<date>.md. Then upload to R2.',
      },
    ],
  },
  {
    name: 'nidra-morning-digest',
    description: 'Nidra: compile overnight reports and publish to R2 + Gist + WhatsApp. Schedule TBD (suggest ~7AM IST).',
    trigger: { kind: 'cron', expr: '0 7 * * *', tz: IST },
    agentId: 'nidra',
    steps: [
      { type: 'bash', id: 'compile_digest', command: 'python3 lobster-scripts/nidra-compile-digest.py' },
      {
        type: 'bash',
        id: 'upload_r2_latest',
        command: 'bash lobster-scripts/r2-upload-wrapper.sh nidra-workspace dreams-latest.md nidra-workspace/digests/<date>.md',
      },
      {
        type: 'bash',
        id: 'update_gist',
        command: 'python3 scripts/gist_update.py --file nidra.md --content-file nidra-workspace/digests/<date>.md',
      },
      {
        type: 'bash',
        id: 'send_whatsapp',
        command: `bash -c 'openclaw message send --channel whatsapp --target "${WHATSAPP_TARGET}" --message "$(cat /tmp/nidra-whatsapp.txt)"'`,
      },
    ],
  },
  {
    name: 'karna-gist-digest',
    description: 'Karna: publish new leads to the Tardis Daily Digest gist. Schedule TBD.',
    trigger: { kind: 'cron', expr: '30 10 * * *', tz: IST },
    agentId: 'growth',
    steps: [
      { type: 'bash', id: 'run_digest', command: 'python3 growth-workspace/scripts/karna_email.py' },
      { type: 'bash', id: 'notify', command: 'bash lobster-scripts/karna-notify.sh' },
    ],
  },
  {
    name: 'bhagwan-heartbeat',
    description: 'Deterministic PB check — wakes the dispatch cron only when there are actionable tasks. Zero LLM when idle. Suggest every 10m.',
    trigger: { kind: 'every', expr: '600000', tz: IST },
    agentId: 'main',
    steps: [
      {
        type: 'bash',
        id: 'check_and_dispatch',
        command:
          'bash -c \'RESULT=$(curl -s "$PB_URL/api/collections/tasks/records?filter=(status=\'"\'"\'design_ready\'"\'"\'||status=\'"\'"\'review_qa\'"\'"\')&perPage=1" -H "Authorization: Bearer $PB_TOKEN_BHAGWAN"); echo "$RESULT"\'',
      },
    ],
  },
  {
    name: 'todo-enforcer',
    description: 'Deterministic stuck-task reset (in_progress > 2h → design_ready). Zero LLM. Suggest every 30m.',
    trigger: { kind: 'every', expr: '1800000', tz: IST },
    agentId: 'main',
    steps: [
      {
        type: 'bash',
        id: 'reset_stuck_tasks',
        command:
          'bash -c \'sqlite3 "$OPSDB" "UPDATE tasks SET status=\'"\'"\'design_ready\'"\'"\', started_at=\'"\'"\'\'"\'"\' WHERE status=\'"\'"\'in_progress\'"\'"\' AND started_at != \'"\'"\'\'"\'"\' AND datetime(started_at) < datetime(\'"\'"\'now\'"\'"\',\'"\'"\'-2 hours\'"\'"\');"\'',
      },
    ],
  },
];

/**
 * Idempotent: upserts each workflow by name, always seeding `enabled: false` unless the caller
 * forces otherwise. Returns the count inserted vs updated.
 */
export async function importOpenClawWorkflows(
  opts: { enable?: boolean } = {}
): Promise<{ inserted: number; updated: number }> {
  const db = getControlDb();
  let inserted = 0;
  let updated = 0;

  for (const wf of OPENCLAW_WORKFLOWS) {
    const enabled = opts.enable ?? wf.enabled ?? false;
    const row = {
      name: wf.name,
      description: wf.description,
      trigger: wf.trigger,
      steps: wf.steps,
      delivery: null,
      enabled,
      agentId: wf.agentId,
      sessionKey: `agent:${wf.agentId}:main`,
      model: wf.model ?? null,
    };

    // oxlint-disable-next-line no-await-in-loop -- small fixed set, run sequentially
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

  logger.info('OpenClaw workflows imported', { inserted, updated, total: OPENCLAW_WORKFLOWS.length });
  return { inserted, updated };
}
