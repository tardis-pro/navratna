import { getControlDb } from '../drizzle/clients/index'
import { workflowDefinitions } from '../../database/drizzle/schemas/control_schema'
import { BaseSeed } from './base_seed'
import { logger } from '@uaip/utils'
import { sql } from 'drizzle-orm'

const OPENCLAW_WORKFLOWS = [
  {
    name: 'amy-mit-evening-report',
    description: 'Generate and send evening report to MIT (CMO/Product Lead)',
    agentId: 'comms',
    sessionKey: 'agent:comms:main',
    model: 'default',
    trigger: { kind: 'cron' as const, expr: '0 18 * * *' },
    steps: [
      { type: 'bash' as const, id: 'generate_report', command: 'python3 /home/pronit/workspace/lobster-scripts/amy-format-report.py' },
      { type: 'bash' as const, id: 'send_whatsapp', command: 'openclaw message send --channel whatsapp --target "+91XXXXXXXXXX" --message "$(cat /tmp/amy-report.txt)"' },
    ],
    delivery: { type: 'webhook' as const, target: 'whatsapp' },
    enabled: true,
  },
  {
    name: 'bhagwan-heartbeat',
    description: 'Deterministic PB check. Zero LLM tokens when idle. Only wakes Bhagwan when there are real tasks.',
    agentId: 'main',
    sessionKey: 'agent:tardis:whatsapp:direct',
    model: 'default',
    trigger: { kind: 'every' as const, expr: '300000' },
    steps: [
      { type: 'bash' as const, id: 'check_and_dispatch', command: 'bash /home/pronit/workspace/lobster-scripts/bhagwan-heartbeat.sh' },
    ],
    delivery: { type: 'webhook' as const, target: 'internal' },
    enabled: true,
  },
  {
    name: 'karna-gist-digest',
    description: 'Publish new Karna leads to the Tardis Daily Digest gist',
    agentId: 'growth',
    sessionKey: 'agent:growth:digest',
    model: 'default',
    trigger: { kind: 'cron' as const, expr: '0 10,12,14,16,18,20,22 * * *' },
    steps: [
      { type: 'bash' as const, id: 'run_digest', command: 'python3 /home/pronit/workspace/growth-workspace/scripts/karna_email.py' },
      { type: 'bash' as const, id: 'notify', command: 'bash /home/pronit/workspace/lobster-scripts/karna-notify.sh' },
    ],
    delivery: { type: 'webhook' as const, target: 'internal' },
    enabled: true,
  },
  {
    name: 'karna-morning-hunt',
    description: 'Karna morning hunt — gov tenders + EU procurement',
    agentId: 'growth',
    sessionKey: 'agent:growth:hunt',
    model: 'zai/glm-5',
    trigger: { kind: 'cron' as const, expr: '0 10 * * *' },
    steps: [
      { type: 'bash' as const, id: 'read_nidra', command: 'bash -c \'ls -t /home/pronit/workspace/nidra-workspace/reports/*.md 2>/dev/null | head -3 | xargs cat || echo "No Nidra reports found"\'' },
      { type: 'agentTurn' as const, id: 'search_leads', command: 'Morning hunt. Read SOUL.md + TOOLS.md. Focus: Gov tenders (GeM/TED) + EU procurement. Search 3-5 qualified leads.' },
    ],
    delivery: { type: 'webhook' as const, target: 'internal' },
    enabled: true,
  },
  {
    name: 'nidra-morning-digest',
    description: 'Compile Nidra overnight reports and publish to R2 + Gist + WhatsApp',
    agentId: 'nidra',
    sessionKey: 'agent:nidra:main',
    model: 'default',
    trigger: { kind: 'cron' as const, expr: '30 7 * * *' },
    steps: [
      { type: 'bash' as const, id: 'compile_digest', command: 'python3 /home/pronit/workspace/lobster-scripts/nidra-compile-digest.py' },
      { type: 'bash' as const, id: 'upload_r2_latest', command: 'bash /home/pronit/workspace/lobster-scripts/r2-upload-wrapper.sh /home/pronit/workspace/nidra-workspace dreams-latest.md' },
      { type: 'bash' as const, id: 'upload_r2_dated', command: 'bash /home/pronit/workspace/lobster-scripts/r2-upload-wrapper.sh /home/pronit/workspace/nidra-workspace digests/$(date +%Y-%m-%d).md' },
      { type: 'bash' as const, id: 'update_gist', command: 'python3 /home/pronit/workspace/scripts/gist_update.py --file nidra.md' },
      { type: 'bash' as const, id: 'send_whatsapp', command: 'openclaw message send --channel whatsapp --target "+91XXXXXXXXXX" --message "$(cat /tmp/nidra-whatsapp.txt)"' },
    ],
    delivery: { type: 'webhook' as const, target: 'whatsapp' },
    enabled: true,
  },
  {
    name: 'todo-enforcer',
    description: 'Deterministic stuck-task reset and zombie session kill. Zero LLM tokens.',
    agentId: 'main',
    sessionKey: 'agent:tardis:enforcer',
    model: 'default',
    trigger: { kind: 'every' as const, expr: '1800000' },
    steps: [
      { type: 'bash' as const, id: 'reset_stuck_tasks', command: 'bash /home/pronit/workspace/lobster-scripts/todo-enforcer-reset.sh' },
      { type: 'bash' as const, id: 'report_if_changed', command: 'bash /home/pronit/workspace/lobster-scripts/todo-enforcer-report.sh' },
    ],
    delivery: { type: 'webhook' as const, target: 'internal' },
    enabled: true,
  },
] as const

export class WorkflowDefinitionSeed extends BaseSeed {
  constructor() {
    super('WorkflowDefinition')
  }

  async seed(): Promise<unknown[]> {
    const db = getControlDb()
    const results: unknown[] = []

    for (const workflow of OPENCLAW_WORKFLOWS) {
      try {
        const [existing] = await db
          .select({ id: workflowDefinitions.id })
          .from(workflowDefinitions)
          .where(sql`${workflowDefinitions.name} = ${workflow.name}`)
          .limit(1)

        if (existing) {
          logger.info(`Workflow "${workflow.name}" already exists, skipping`)
          results.push(existing)
          continue
        }

        const [inserted] = await db
          .insert(workflowDefinitions)
          .values({
            name: workflow.name,
            description: workflow.description,
            agentId: workflow.agentId,
            sessionKey: workflow.sessionKey,
            model: workflow.model,
            trigger: workflow.trigger,
            steps: workflow.steps as unknown as { type: 'bash' | 'agentTurn' | 'httpCall'; [key: string]: unknown }[],
            delivery: workflow.delivery,
            enabled: workflow.enabled,
          })
          .returning()

        results.push(inserted)
        logger.info(`Workflow "${workflow.name}" seeded`, { id: inserted.id })
      } catch (error) {
        logger.error(`Failed to seed workflow "${workflow.name}"`, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    logger.info(`WorkflowDefinition seed complete: ${results.length}/${OPENCLAW_WORKFLOWS.length}`)
    return results
  }
}
