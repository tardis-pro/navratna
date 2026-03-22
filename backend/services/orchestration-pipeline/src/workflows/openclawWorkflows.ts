import type { ExecutionStep } from '@uaip/types';
import { StepStatus } from '@uaip/types';
import { logger } from '@uaip/utils';

export interface OpenClawWorkflow {
  id: string;
  name: string;
  description: string;
  agentId: string;
  steps: ExecutionStep[];
}

function makeStep(
  id: string,
  name: string,
  command: string,
  dependsOn: string[] = [],
  extra: Partial<ExecutionStep> = {}
): ExecutionStep {
  return {
    id,
    name,
    type: 'tool-execution',
    status: StepStatus.PENDING,
    timeout: 600000,
    retryCount: 0,
    maxRetries: 3,
    required: true,
    parameters: { command, tool: 'bash' },
    dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
    ...extra,
  };
}

export const AMY_MIT_EVENING_REPORT: OpenClawWorkflow = {
  id: 'amy-mit-evening-report',
  name: 'Amy MIT Evening Report',
  description: 'Generate and send evening report to MIT (CMO/Product Lead)',
  agentId: 'comms',
  steps: [
    makeStep(
      'generate_report',
      'Generate Report',
      'python3 /home/pronit/workspace/lobster-scripts/amy-format-report.py'
    ),
    makeStep(
      'send_whatsapp',
      'Send WhatsApp Message',
      'openclaw message send --channel whatsapp --target "+91XXXXXXXXXX" --message "$(cat /tmp/amy-report.txt)"',
      ['generate_report']
    ),
  ],
};

export const NIDRA_MORNING_DIGEST: OpenClawWorkflow = {
  id: 'nidra-morning-digest',
  name: 'Nidra Morning Digest',
  description: 'Compile Nidra overnight reports and publish to R2 + Gist + WhatsApp',
  agentId: 'nidra',
  steps: [
    makeStep(
      'compile_digest',
      'Compile Digest',
      'python3 /home/pronit/workspace/lobster-scripts/nidra-compile-digest.py'
    ),
    makeStep(
      'upload_r2_latest',
      'Upload R2 Latest',
      'bash /home/pronit/workspace/lobster-scripts/r2-upload-wrapper.sh /home/pronit/workspace/nidra-workspace dreams-latest.md /home/pronit/workspace/nidra-workspace/digests/$(date +%Y-%m-%d).md',
      ['compile_digest']
    ),
    makeStep(
      'upload_r2_dated',
      'Upload R2 Dated',
      'bash /home/pronit/workspace/lobster-scripts/r2-upload-wrapper.sh /home/pronit/workspace/nidra-workspace digests/$(date +%Y-%m-%d).md /home/pronit/workspace/nidra-workspace/digests/$(date +%Y-%m-%d).md',
      ['compile_digest']
    ),
    makeStep(
      'update_gist',
      'Update Gist',
      'python3 /home/pronit/workspace/scripts/gist_update.py --file nidra.md --content-file /home/pronit/workspace/nidra-workspace/digests/$(date +%Y-%m-%d).md',
      ['compile_digest']
    ),
    makeStep(
      'send_whatsapp',
      'Send WhatsApp Message',
      'openclaw message send --channel whatsapp --target "+91XXXXXXXXXX" --message "$(cat /tmp/nidra-whatsapp.txt)"',
      ['compile_digest']
    ),
  ],
};

export const KARNA_GIST_DIGEST: OpenClawWorkflow = {
  id: 'karna-gist-digest',
  name: 'Karna Gist Digest',
  description: 'Publish new Karna leads to the Tardis Daily Digest gist',
  agentId: 'growth',
  steps: [
    makeStep(
      'run_digest',
      'Run Digest Script',
      'python3 /home/pronit/workspace/growth-workspace/scripts/karna_email.py'
    ),
    makeStep(
      'notify',
      'Send Notification',
      'bash /home/pronit/workspace/lobster-scripts/karna-notify.sh',
      ['run_digest'],
      {
        parameters: {
          command: 'bash /home/pronit/workspace/lobster-scripts/karna-notify.sh',
          tool: 'bash',
          stdinFrom: 'run_digest',
        },
      }
    ),
  ],
};

export const BHAGWAN_HEARTBEAT: OpenClawWorkflow = {
  id: 'bhagwan-heartbeat',
  name: 'Bhagwan Heartbeat',
  description:
    'Deterministic PB check — zero LLM tokens when idle. Only wakes Bhagwan when real tasks exist.',
  agentId: 'main',
  steps: [
    {
      id: 'check_and_dispatch',
      name: 'Check PocketBase and Dispatch',
      type: 'tool-execution',
      status: StepStatus.PENDING,
      timeout: 120000,
      retryCount: 0,
      maxRetries: 0,
      required: true,
      parameters: {
        command: [
          'source /home/pronit/workspace/devops-workspace/.env',
          'export PB_URL="${PB_URL:-http://localhost:8091}"',
          'RESULT=$(curl -s "$PB_URL/api/collections/tasks/records?filter=(status=\'design_ready\'%7C%7Cstatus=\'review_qa\')&perPage=1" -H "Authorization: Bearer $PB_TOKEN_BHAGWAN" 2>/dev/null)',
          'COUNT=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get(\'totalItems\',0))" 2>/dev/null || echo "0")',
          'if [ "$COUNT" -gt 0 ]; then echo "TASKS_FOUND: $COUNT — waking Bhagwan dispatch"; openclaw cron run 7552968f-a460-49e5-bfb4-a5caeab0ef08 --timeout 120000 2>/dev/null || true; else echo "IDLE"; fi',
        ].join(' && '),
        tool: 'bash',
      },
    },
  ],
};

export const TODO_ENFORCER: OpenClawWorkflow = {
  id: 'todo-enforcer',
  name: 'Todo Enforcer',
  description: 'Deterministic stuck-task reset and zombie session kill. Zero LLM tokens.',
  agentId: 'main',
  steps: [
    {
      id: 'reset_stuck_tasks',
      name: 'Reset Stuck Tasks',
      type: 'tool-execution',
      status: StepStatus.PENDING,
      timeout: 30000,
      retryCount: 0,
      maxRetries: 0,
      required: true,
      parameters: {
        command: [
          'DB="/home/pronit/workspace/opsdb/pb_data/data.db"',
          "STUCK=$(sqlite3 \"$DB\" \"SELECT id || '|' || title FROM tasks WHERE status='in_progress' AND started_at != '' AND started_at IS NOT NULL AND datetime(started_at) < datetime('now', '-2 hours');\" 2>/dev/null)",
          'if [ -z "$STUCK" ]; then echo "OK: 0 stuck tasks"; exit 0; fi',
          'COUNT=0',
          'while IFS=\'|\' read -r TASK_ID TASK_TITLE; do [ -z "$TASK_ID" ] && continue; sqlite3 "$DB" "UPDATE tasks SET status=\'design_ready\', blocked_reason=\'Auto-reset: agent timed out after 2h\', started_at=\'\' WHERE id=\'$TASK_ID\';" 2>/dev/null; echo "RESET: $TASK_ID ($TASK_TITLE)"; COUNT=$((COUNT + 1)); done <<< "$STUCK"',
          'echo "RESET $COUNT stuck tasks — Bhagwan will re-dispatch on next heartbeat"',
        ].join(' && '),
        tool: 'bash',
      },
    },
    {
      id: 'report_if_changed',
      name: 'Report If Changed',
      type: 'conditional',
      status: StepStatus.PENDING,
      timeout: 10000,
      retryCount: 0,
      maxRetries: 0,
      required: false,
      dependsOn: ['reset_stuck_tasks'],
      condition: 'reset_stuck_tasks.stdout includes "RESET:"',
      parameters: {
        command: [
          'COUNT=$(echo "$reset_stuck_tasks_stdout" | grep -c "^RESET:" || echo "0")',
          'echo "⚠️ Todo Enforcer reset $COUNT stuck task(s). Check pipeline."',
        ].join(' && '),
        tool: 'bash',
      },
    },
  ],
};

export const KARNA_MORNING_HUNT: OpenClawWorkflow = {
  id: 'karna-morning-hunt',
  name: 'Karna Morning Hunt',
  description: 'Karna morning hunt — gov tenders + EU procurement',
  agentId: 'growth',
  steps: [
    makeStep(
      'read_nidra',
      'Read Nidra Reports',
      'bash -c \'ls -t /home/pronit/workspace/nidra-workspace/reports/*.md 2>/dev/null | head -3 | xargs cat || echo "No Nidra reports found"\''
    ),
    makeStep(
      'search_leads',
      'Search for Leads',
      'openclaw chat --agent growth --message "Morning hunt. Read SOUL.md + TOOLS.md. Focus: Gov tenders (GeM/TED) + EU procurement. Search 3-5 qualified leads. APPEND to leads/$(date +%Y-%m-%d).md. Update scrape-log.json. Upload to R2: python3 scripts/r2_upload.py --file leads-latest.md + leads/$(date +%Y-%m-%d).md" --model "zai/glm-5" --no-history',
      ['read_nidra']
    ),
  ],
};

export const ALL_OPENCLAW_WORKFLOWS: OpenClawWorkflow[] = [
  AMY_MIT_EVENING_REPORT,
  NIDRA_MORNING_DIGEST,
  KARNA_GIST_DIGEST,
  BHAGWAN_HEARTBEAT,
  TODO_ENFORCER,
  KARNA_MORNING_HUNT,
];

export function getWorkflow(id: string): OpenClawWorkflow | undefined {
  return ALL_OPENCLAW_WORKFLOWS.find((w) => w.id === id);
}

export function logWorkflowSummary(): void {
  for (const wf of ALL_OPENCLAW_WORKFLOWS) {
    logger.info(`OpenClaw workflow loaded: ${wf.id}`, {
      name: wf.name,
      agent: wf.agentId,
      steps: wf.steps.length,
    });
  }
}
