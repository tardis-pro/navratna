---
# OpenClaw Extraction Specification — Navratna v3.0

## Document Control
- **Version**: 1.0
- **Date**: 2026-03-21
- **Purpose**: Define exactly what gets extracted from OpenClaw, where it goes in Navratna, and the extraction process

## Extraction Philosophy

OpenClaw is the **donor**. We harvest every valuable piece — agent personas, SOPs, skills, model configs, cron schedules, workflow logic — and transplant them into Navratna's native services. Then OpenClaw is archived. Nothing is lost; everything is elevated.

## Agent Persona Extraction

### Source Files
All agent personas live in `/openclaw-infra/markdowns/{agent}/SOUL.md` with supplementary identity docs.

### Extraction Table

| Agent | Source Files | Target: Agent Intelligence Service |
|---|---|---|
| **Tardis** | `markdowns/tardis/SOUL.md`, `agents/tardis/models.json` | Persona record: identity, tools, spawn capabilities |
| **Bhagwan (PM)** | `markdowns/pm/SOUL.md`, `PROJECT_SOP.md`, `STATUS.md`, `ENHANCEMENT_PLAN.md` | Persona + orchestration rules in Orchestration Pipeline |
| **Amy (Comms)** | `markdowns/comms/SOUL.md`, identity docs | Persona + channel config + hard boundaries (NO code, NO execution) |
| **Karna (Growth)** | `markdowns/growth/SOUL.md` | Persona + scheduled events (10AM, 2PM, 6PM hunts) |
| **Nidra (Research)** | `markdowns/nidra/SOUL.md`, `taste-profile.md`, `dream-seeds.md`, `visited-links.json` | Persona + memory seeds + taste profile → Qdrant vectors |
| **Rishi (Content)** | `markdowns/content/SOUL.md` | Persona + LinkedIn schedule + anti-AI-writing skill ref |
| **Sharma (DevOps)** | `markdowns/devops/SOUL.md`, `CLOUDFLARE_PAGES_RULES.md`, `DEVOPS_CONFIG.md`, `ALERT_SYSTEM.md` | Persona + deploy policies + CF constraints |
| **Veda (Code Review)** | `markdowns/code-review/SOUL.md` | Persona + GitHub integration skill |
| **Rana (QA)** | `markdowns/browser-test/SOUL.md` | Persona + Playwright skill + evidence capture |
| **Pixel (Frontend)** | agent config | Persona + UI skill |
| **Qadir (Tests)** | agent config | Persona + test-writer skill |
| **Mahadev (Research)** | `markdowns/research/SOUL.md` | Persona + web search + GOG Gmail skill |
| **Mirror (RSS)** | agent config | Persona + RSS feed config |
| **Pronit-Mirror** | agent config | Persona + personal context (limited tools) |

### Persona Record Schema (Navratna)

```typescript
interface AgentPersona {
  id: string;                    // UUID
  name: string;                  // e.g., "tardis"
  displayName: string;           // e.g., "Tardis"
  title: string;                 // e.g., "On-Demand Main Assistant"
  icon: string;                  // emoji identifier
  identity: string;              // Full SOUL.md content (markdown)
  communicationStyle: string;    // How the agent communicates
  principles: string[];          // Decision-making philosophy
  capabilities: string[];        // What this agent can do
  authorizedTools: string[];     // Tool IDs this agent can use
  authorizedProjects: string[];  // Project IDs this agent can access
  spawnableAgents: string[];     // Agent IDs this agent can spawn
  hardBoundaries: string[];      // Things this agent must NEVER do
  modelConfig: {
    primary: string;             // Primary model ID
    fallback: string[];          // Fallback chain
    trustLevel: 'ring-0' | 'ring-1' | 'ring-2';
  };
  schedule?: {                   // For scheduled agents
    cron: string;                // Cron expression
    timezone: string;            // e.g., "Asia/Kolkata"
    task: string;                // What to do on schedule
  }[];
  memorySeeds?: {                // Initial memory/context
    tasteProfile?: string;       // Nidra's taste-profile.md
    dreamSeeds?: string;         // Nidra's dream-seeds.md
    visitedLinks?: string[];     // Nidra's visited-links.json
  };
}
```

### Extraction Process (Per Agent)

1. Read SOUL.md from `/openclaw-infra/markdowns/{agent}/SOUL.md`
2. Read model config from `/openclaw-infra/agents/{agent}/models.json`
3. Read auth profiles from `/openclaw-infra/agents/{agent}/auth-profiles.json`
4. Parse identity, communication style, principles from SOUL.md
5. Map OpenClaw skills to Navratna Capability Registry tool IDs
6. Map OpenClaw spawn permissions to Navratna agent authorization
7. Create AgentPersona record in PostgreSQL (Agent Intelligence Service)
8. Index identity + principles in Qdrant for semantic agent selection
9. Create Agent node in Neo4j with relationships (CAN_USE tools, CAN_SPAWN agents)
10. Verify: agent appears in Telescope, responds in character

## SOP Extraction

### Source: PROJECT_SOP.md
Location: `/openclaw-infra/markdowns/pm/PROJECT_SOP.md`

Contains the critical task lifecycle:
```
Internal: inception → design_ready → in_progress → review_qa → deploying → done
Client: ... → pr_submitted → done (client merges)
```

### Target: Orchestration Pipeline Configuration

```yaml
# navratna/config/task-lifecycle.yaml
lifecycles:
  internal:
    states: [inception, design_ready, in_progress, review_qa, deploying, done]
    transitions:
      inception → design_ready:
        trigger: amy_creates_task
        approval: none
      design_ready → in_progress:
        trigger: bhagwan_dispatches
        approval: none
      in_progress → review_qa:
        trigger: coding_agent_creates_pr
        approval: none
      review_qa → deploying:
        trigger: veda_approves_pr
        approval: owner_approval_required
      deploying → done:
        trigger: rana_validates + sharma_deploys
        approval: owner_approval_required

  client:
    states: [inception, design_ready, in_progress, review_qa, pr_submitted, done]
    transitions:
      # ... same as internal until review_qa
      review_qa → pr_submitted:
        trigger: veda_approves
        approval: owner_approval_required
      pr_submitted → done:
        trigger: client_merges
        approval: external

# Critical dispatch rules (from OpenClaw SOP):
dispatch_rules:
  - rule: "Tardis NEVER directly spawns coders"
    flow: "Tardis → design_ready → Bhagwan → Bhagwan dispatches coder"
    reason: "Even for CRITICAL bugs, follow this flow"

  - rule: "Amy NEVER writes code or deploys"
    boundary: "Intake only: create PB tasks + notify"
    reason: "Comms agent must stay in comms lane"
```

## Skill Extraction

### Source: /openclaw-infra/skills/
13 skills to migrate to Navratna's Capability Registry.

| Skill | Source Path | Navratna Registration | Execution Model |
|---|---|---|---|
| capability-evolver | `skills/capability-evolver/` | Tool: `navratna.capability-evolver` | OpenShell sandbox (needs write access) |
| anti-ai-writing | `skills/anti-ai-writing/` | Tool: `navratna.anti-ai-writing` | Inline (text analysis, no sandbox) |
| browser-automation | `skills/browser-automation/` | Tool: `navratna.browser-automation` | OpenShell sandbox (Playwright) |
| cloudflare-deploy | `skills/cloudflare-deploy/` | Tool: `navratna.cf-deploy` | OpenShell sandbox (wrangler CLI) |
| github | `skills/github/` | Tool: `navratna.github` | OpenShell sandbox (gh CLI) |
| project-context-sync | `skills/project-context-sync/` | Tool: `navratna.project-context` | Inline (file ops) |
| browser-test | `skills/browser-test/` | Tool: `navratna.browser-test` | OpenShell sandbox (Playwright) |
| image-analyzer | `skills/image-analyzer/` | Tool: `navratna.image-analyzer` | API call (vision model) |
| project-context | `skills/project-context/` | Tool: `navratna.project-context-inject` | Inline (context injection) |
| shashwatgtm content skills | `skills/shashwatgtm/` | Multiple tools under `navratna.content.*` | Inline + API calls |
| GOG (Gmail) | Referenced in agent SOULs | Tool: `navratna.gog-gmail` | OpenShell sandbox (read-only policy) |
| goplaces | Referenced in agent SOULs | Tool: `navratna.goplaces` | API call (Ring 2) |

### Tool Registration Schema

```typescript
interface ToolRegistration {
  id: string;                      // e.g., "navratna.browser-automation"
  name: string;                    // Human-readable name
  description: string;             // What this tool does
  executionModel: 'inline' | 'openshell-sandbox' | 'api-call';
  sandboxPolicy?: string;          // Path to OpenShell YAML policy
  requiredProviders?: string[];    // Credentials needed (e.g., ["github", "cloudflare"])
  trustLevel: 'ring-0' | 'ring-1' | 'ring-2';
  approvalRequired: boolean;       // Does execution need owner approval?
  authorizedAgents: string[];      // Which agents can use this tool
}
```

## Model Routing Extraction

### Source: /openclaw-infra/config/openclaw.json
Contains 6 providers, 30+ models, per-agent model assignments with fallback chains.

### Target: LLM Service Configuration

```yaml
# navratna/config/llm-providers.yaml
providers:
  anthropic:
    models:
      - id: claude-opus-4-6
        context: 200000
        maxTokens: 32000
        reasoning: true
      - id: claude-sonnet-4-6
        context: 200000
        maxTokens: 64000
      - id: claude-haiku-4-5
        context: 200000
        maxTokens: 64000
    auth: vault://anthropic/api-key

  minimax:
    models:
      - id: minimax-m2.5
        context: 204800
        maxTokens: 64000
        reasoning: true
    auth: vault://minimax/api-key

  zai:
    models:
      - id: glm-5
        context: 204800
        maxTokens: 131000
        reasoning: true
        free: true
      - id: glm-4.7-flash
        context: 204800
        reasoning: true
        free: true
    auth: vault://zai/api-key

  kimi:
    models:
      - id: kimi-k2p5
        context: 262000
        maxTokens: 32700
        reasoning: true
        free: true
    auth: vault://kimi/api-key

  google:
    models:
      - id: gemini-2.5-pro
        context: 1000000
        maxTokens: 65000
      - id: gemini-2.5-flash
        context: 1000000
        maxTokens: 65000
      - id: gemini-3.1-pro-preview
        context: 1000000
        maxTokens: 65000
    auth: vault://google/oauth

  ollama:
    models:
      - id: llama-3.1-70b
        context: 131072
        local: true
      - id: codestral-22b
        context: 32768
        local: true
    endpoint: http://pc-a.navratna.ts:11434

# Default fallback chain
defaultFallback:
  - glm-5        # Free, reasoning
  - minimax-m2.5 # Cost-effective, reasoning
  - kimi-k2p5    # Free, reasoning
  - claude-sonnet-4-6
  - gemini-2.5-pro

# Per-agent overrides (from openclaw.json agent configs)
agentModels:
  tardis:
    primary: claude-sonnet-4-6
    fallback: [minimax-m2.5, glm-5, kimi-k2p5]
  bhagwan:
    primary: kimi-k2p5
    fallback: [minimax-m2.5, claude-haiku-4-5, gemini-2.5-pro]
  karna:
    primary: gemini-2.5-pro
    fallback: [minimax-m2.5, glm-5]
  nidra:
    primary: gemini-2.5-pro
    fallback: [minimax-m2.5, glm-5]
  rishi:
    primary: gemini-2.5-flash
    fallback: [minimax-m2.5]
  # ... (all 14 agents mapped)
```

## Cron Job Migration

### Source: /openclaw-infra/config/cron-jobs.json (21 jobs)

### Target: BullMQ Scheduled Events

| Job | Cron | Agent | BullMQ Queue |
|---|---|---|---|
| Bhagwan Heartbeat | */5 * * * * | bhagwan | `scheduled:bhagwan-heartbeat` |
| Todo Enforcer | */30 * * * * | bhagwan | `scheduled:todo-enforcer` |
| Amy Evening Report | 0 18 * * * Asia/Kolkata | amy | `scheduled:amy-evening-report` |
| Rishi LinkedIn Post | 0 10 * * * Asia/Kolkata | rishi | `scheduled:rishi-linkedin` |
| Karna Morning Hunt | 0 10 * * * Asia/Kolkata | karna | `scheduled:karna-morning` |
| Karna Afternoon Hunt | 0 14 * * * Asia/Kolkata | karna | `scheduled:karna-afternoon` |
| Karna Evening Hunt | 0 18 * * * Asia/Kolkata | karna | `scheduled:karna-evening` |
| Karna Gist Digest | 0 */2 10-22 * * * Asia/Kolkata | karna | `scheduled:karna-gist` |
| Nidra Slot 1 | 0 23 * * * Asia/Kolkata | nidra | `scheduled:nidra-slot1` |
| Nidra Slot 2 | 0 2 * * * Asia/Kolkata | nidra | `scheduled:nidra-slot2` |
| Nidra Slot 3 | 0 5 * * * Asia/Kolkata | nidra | `scheduled:nidra-slot3` |
| Nidra Morning Digest | 30 7 * * * Asia/Kolkata | nidra | `scheduled:nidra-digest` |
| Mirror Daily Digest | 30 6 * * * Asia/Kolkata | mirror | `scheduled:mirror-digest` |
| PM Event Trigger | event:design_ready | bhagwan | `event:task-design-ready` |
| Browser Test Trigger | event:deploying | rana | `event:task-deploying` |
| Tardis Weekly Evolution | 0 10 * * 3 | tardis | `scheduled:tardis-evolve` |
| Bhagwan Weekly Evolution | 0 10 * * 3 | bhagwan | `scheduled:bhagwan-evolve` |
| Amy Weekly Evolution | 0 10 * * 3 | amy | `scheduled:amy-evolve` |
| Profile Engine | 30 9 * * 3 | system | `scheduled:profile-engine` |

## Workflow Logic Migration

### Source: /openclaw-infra/workflows/*.lobster (6 files)

Lobster workflows are deterministic (no LLM tokens) — they're shell scripts wrapped in YAML.

### Target: Orchestration Pipeline Workflow Definitions

Each Lobster workflow becomes a Navratna operation definition:

```typescript
// Example: nidra-morning-digest
const nidraMorningDigest: OperationDefinition = {
  id: 'nidra-morning-digest',
  name: 'Nidra Morning Digest',
  trigger: { type: 'schedule', cron: '30 7 * * *', timezone: 'Asia/Kolkata' },
  steps: [
    {
      type: 'tool',
      tool: 'navratna.nidra-compile-digest',
      input: { minScore: 15 },
    },
    {
      type: 'tool',
      tool: 'navratna.r2-upload',
      input: { bucket: 'digests', key: 'latest.md' },
    },
    {
      type: 'tool',
      tool: 'navratna.gist-update',
      input: { gistId: '${config.nidra.gistId}' },
    },
    {
      type: 'notify',
      channel: 'whatsapp',
      message: 'Morning digest compiled: ${steps[0].output.ideaCount} ideas above threshold',
    },
  ],
};
```

## Script Migration

### Source: /openclaw-infra/scripts/ (5 files)

| Script | Language | Target |
|---|---|---|
| `nidra-compile-digest.py` | Python | Tool: `navratna.nidra-compile-digest` (runs in OpenShell) |
| `karna-hunt-wrapper.sh` | Bash | Tool: `navratna.karna-hunt` (runs in OpenShell) |
| `karna-notify.sh` | Bash | Notification action in Orchestration Pipeline |
| `amy-format-report.py` | Python | Tool: `navratna.amy-format-report` (inline) |
| `r2-upload-wrapper.sh` | Bash | Tool: `navratna.r2-upload` (API call to R2) |

## Channel Configuration Migration

### Source: /openclaw-infra/config/openclaw-channels-config.json

### Target: Navratna Channel Gateway (new service module in Gateway)

```yaml
# navratna/config/channels.yaml
channels:
  whatsapp:
    enabled: true
    mode: open-dm
    maxMedia: 50MB
    trustLevel: ring-0  # PII-bearing, local only

  discord:
    enabled: true
    guildId: "673555055399534598"
    mentionRequired: false
    trustLevel: ring-1

  gateway:
    port: 18789
    auth: token
    mode: local
    trustLevel: ring-0

session:
  scope: per-channel-peer
  idleTimeout: 300  # minutes
  dailyReset: true

memory:
  backend: qdrant  # upgraded from LanceDB
  autoCapture: true
  autoRecall: true
```

## Extraction Verification Checklist

After all extractions, verify:

- [ ] All 14 agents respond correctly in Navratna Agent Intelligence
- [ ] All agents maintain their original communication style
- [ ] All hard boundaries enforced (Amy never writes code, Tardis never spawns coders directly)
- [ ] All 13 skills registered in Capability Registry
- [ ] All 21 cron jobs firing on schedule via BullMQ
- [ ] All 6 Lobster workflows converted to operation definitions
- [ ] All model routing configs loaded in LLM Service
- [ ] All channel configs loaded in Channel Gateway
- [ ] All scripts runnable in OpenShell sandboxes
- [ ] PocketBase task data migrated to PostgreSQL
- [ ] LanceDB memory data migrated to Qdrant

## Post-Extraction: Archive OpenClaw

After verification:
```bash
git add -A openclaw-infra/
git commit -m "archive: OpenClaw infrastructure - all content extracted to Navratna native services"
# Move to archive branch or tag
git tag openclaw-archive-v1
# Remove from working tree
rm -rf openclaw-infra/
git add -A
git commit -m "remove: OpenClaw directory - fully migrated to Navratna"
```

OpenClaw lives forever in git history. Nothing is truly deleted.

---
