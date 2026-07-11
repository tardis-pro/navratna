/**
 * Seed / upsert ALL 15 OpenClaw agents into the Navratna INTELLIGENCE plane.
 *
 * For each agent this writes:
 *   - one `personas` row (identity + system prompt sourced from openclaw-infra SOUL.md,
 *     LLM routing stored in `configuration.llmRouting`)
 *   - one `agents` row linking to that persona, owned by the admin user.
 *
 * Idempotent: safe to re-run. Rows are matched by the unique `name` column
 * (the curated display name) and updated in place — never duplicated.
 *
 * Persona/system-prompt text is read from `openclaw-infra/markdowns/<dir>/SOUL.md`
 * (NOT `agents/<name>/SOUL.md` — that path never held SOUL files; it was the old
 * importer's bug). Model routing is read from `openclaw-infra/agents/<name>/models.json`
 * (top-level `default`, falling back to the first provider's first model).
 *
 * Required env:
 *   POSTGRES_URL (or POSTGRES_URL_INTELLIGENCE) — the same DB the app uses.
 *     personas + agents live in the intelligence plane; a single POSTGRES_URL is enough.
 * Optional env:
 *   OPENCLAW_INFRA_DIR — override the openclaw-infra root (default: sibling of the repo).
 *
 * Run (from repo root, with the prod POSTGRES_URL injected):
 *   POSTGRES_URL=postgres://... pnpm tsx database/scripts/seed-openclaw-agents.ts
 * Dry run (no DB connection needed — logs the rows it WOULD upsert):
 *   pnpm tsx database/scripts/seed-openclaw-agents.ts --dry-run
 *
 * Note: imports reach into the shared-services package via relative paths so the
 * package's own deps (drizzle-orm, pg, @uaip/*) resolve from ITS node_modules context —
 * bare '@uaip/*' specifiers are not resolvable from the repo-root scripts dir. Enum
 * string values are inlined as literals (cast to the Drizzle insert types) for the same
 * reason; they match the @uaip/types enums exactly.
 */
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  closePlanes,
  initializePlanes,
} from '../../apps/shared/services/src/database/drizzle/clients/index';
import {
  agents,
  personas,
} from '../../apps/shared/services/src/database/drizzle/schemas/intelligence_schema';

// ── Constants ────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = '7cbc4960-e35e-4758-ad01-0bb7855b9d43'; // admin1@uaip.dev

const OPENCLAW_INFRA_DIR =
  process.env.OPENCLAW_INFRA_DIR ??
  fileURLToPath(new URL('../../../openclaw-infra', import.meta.url));
const AGENTS_DIR = join(OPENCLAW_INFRA_DIR, 'agents');
const MARKDOWNS_DIR = join(OPENCLAW_INFRA_DIR, 'markdowns');

const DRY_RUN = process.argv.includes('--dry-run');

// Drizzle insert row types (structural) — used to cast enum string literals so we
// don't need a bare '@uaip/types' import that won't resolve from this dir.
type PersonaInsert = typeof personas.$inferInsert;
type AgentInsert = typeof agents.$inferInsert;

const PERSONA_STATUS_ACTIVE = 'active' as PersonaInsert['status']; // PersonaStatus.ACTIVE
const PERSONA_VISIBILITY_ORG = 'organization' as PersonaInsert['visibility']; // PersonaVisibility.ORGANIZATION

// AgentRole enum values (apps/packages/shared-types/src/agent.ts)
const ROLE = {
  ASSISTANT: 'assistant',
  ANALYZER: 'analyzer',
  ORCHESTRATOR: 'orchestrator',
  SPECIALIST: 'specialist',
  STRATEGIST: 'strategist',
  COMMUNICATOR: 'communicator',
  VALIDATOR: 'validator',
  REVIEWER: 'reviewer',
  DESIGNER: 'designer',
} as const;

// ── Agent definitions ────────────────────────────────────────────────────────
// `slug` = openclaw agent dir under agents/. `soulDir` = markdowns/<dir>/SOUL.md
// (undefined ⇒ no SOUL.md exists; a synthetic identity is generated and FLAGGED).
// Display names + persona details follow the curated reference where one exists;
// the extras (main → Sutra, coder → Vishwakarma) get sensible names and are kept.

interface AgentDef {
  slug: string;
  displayName: string;
  soulDir: string | undefined;
  agentRole: string;
  personaRole: string;
  description: string;
  traits: string[];
  expertise: string[];
  capabilities: string[];
}

const AGENT_DEFS: AgentDef[] = [
  {
    slug: 'tardis',
    displayName: 'Tardis',
    soulDir: 'tardis',
    agentRole: ROLE.ORCHESTRATOR,
    personaRole: 'main-orchestrator',
    description:
      'Main orchestrator and universal assistant for request understanding, delegation, and response delivery',
    traits: ['helpful', 'versatile', 'proactive', 'opinionated'],
    expertise: ['orchestration', 'general-assistance', 'task-routing'],
    capabilities: ['chat', 'search', 'task_delegation', 'reasoning'],
  },
  {
    slug: 'main',
    displayName: 'Sutra',
    soulDir: undefined, // no SOUL.md — synthetic identity, FLAGGED
    agentRole: ROLE.ORCHESTRATOR,
    personaRole: 'router-orchestrator',
    description:
      'Default routing/orchestration agent (OpenClaw "main") — general request handler and dispatcher',
    traits: ['adaptive', 'efficient', 'reliable'],
    expertise: ['routing', 'orchestration', 'general-assistance'],
    capabilities: ['chat', 'routing', 'task_delegation'],
  },
  {
    slug: 'comms',
    displayName: 'Amy',
    soulDir: 'comms',
    agentRole: ROLE.COMMUNICATOR,
    personaRole: 'stakeholder-comms-intake',
    description:
      'Stakeholder-facing comms and intake specialist who converts intent into actionable task specifications',
    traits: ['thorough', 'warm', 'precise', 'boundary-aware'],
    expertise: ['requirements-capture', 'stakeholder-communication', 'intake-quality-gates'],
    capabilities: ['intake', 'stakeholder_comms', 'requirements'],
  },
  {
    slug: 'growth',
    displayName: 'Karna',
    soulDir: 'growth',
    agentRole: ROLE.STRATEGIST,
    personaRole: 'growth-hacker',
    description:
      'Growth and market intelligence specialist for lead hunting and high-signal outreach planning',
    traits: ['relentless', 'strategic', 'data-driven', 'selective'],
    expertise: ['market-intelligence', 'lead-scoring', 'demand-discovery'],
    capabilities: ['market_research', 'lead_generation', 'outreach'],
  },
  {
    slug: 'nidra',
    displayName: 'Nidra',
    soulDir: 'nidra',
    agentRole: ROLE.ANALYZER,
    personaRole: 'overnight-research',
    description:
      'Autonomous overnight researcher for high-conviction opportunity discovery and synthesis',
    traits: ['clinical', 'independent', 'evidence-first', 'non-hype'],
    expertise: ['regulatory-arbitrage', 'research-gap-analysis', 'trend-collision-detection'],
    capabilities: ['deep_research', 'synthesis', 'overnight_delivery'],
  },
  {
    slug: 'pixel',
    displayName: 'Pixel',
    soulDir: undefined, // no SOUL.md — synthetic identity from curated persona, FLAGGED
    agentRole: ROLE.SPECIALIST,
    personaRole: 'frontend-engineer',
    description:
      'Frontend implementation specialist for UI delivery, design systems, and responsive interfaces',
    traits: ['creative', 'implementation-focused', 'detail-oriented', 'pragmatic'],
    expertise: ['ui-implementation', 'design-systems', 'responsive-frontends'],
    capabilities: ['ui_implementation', 'design_system', 'responsive'],
  },
  {
    slug: 'coder',
    displayName: 'Vishwakarma',
    soulDir: undefined, // no SOUL.md AND no models.json — synthetic identity, FLAGGED
    agentRole: ROLE.SPECIALIST,
    personaRole: 'software-engineer',
    description:
      'General software engineer / coder agent (OpenClaw "coder") for backend and full-stack implementation',
    traits: ['methodical', 'pragmatic', 'detail-oriented'],
    expertise: ['software-engineering', 'backend', 'implementation'],
    capabilities: ['coding', 'implementation', 'debugging'],
  },
  {
    slug: 'code-review',
    displayName: 'Veda',
    soulDir: 'code-review',
    agentRole: ROLE.REVIEWER,
    personaRole: 'code-reviewer',
    description:
      'Code review specialist enforcing architecture, security, and quality gates before release',
    traits: ['thorough', 'direct', 'fair', 'quality-focused'],
    expertise: ['pr-review', 'code-analysis', 'security-review'],
    capabilities: ['pr_review', 'code_analysis', 'security_scan'],
  },
  {
    slug: 'test-writer',
    displayName: 'Qadir',
    soulDir: 'test-writer',
    agentRole: ROLE.VALIDATOR,
    personaRole: 'test-writer',
    description:
      'Test-writer specialist generating unit, integration, and edge-case suites from acceptance criteria',
    traits: ['meticulous', 'paranoid', 'systematic', 'coverage-focused'],
    expertise: ['test-generation', 'edge-case-design', 'coverage-expansion'],
    capabilities: ['test_generation', 'coverage_improvement'],
  },
  {
    slug: 'research',
    displayName: 'Mahadev',
    soulDir: 'research',
    agentRole: ROLE.ANALYZER,
    personaRole: 'research-analyst',
    description:
      'Deep research analyst for primary-source intelligence, synthesis, and recommendation reports',
    traits: ['methodical', 'thorough', 'evidence-first', 'opinionated'],
    expertise: ['deep-research', 'technical-analysis', 'competitive-intelligence'],
    capabilities: ['research', 'analysis', 'reporting'],
  },
  {
    slug: 'content',
    displayName: 'Rishi',
    soulDir: 'content',
    agentRole: ROLE.COMMUNICATOR,
    personaRole: 'content-engine',
    description:
      'LinkedIn content strategist and publisher focused on authority building and conversion-ready narratives',
    traits: ['strategic', 'builder-first', 'skeptical', 'brand-aware'],
    expertise: ['content-strategy', 'linkedin-writing', 'thought-leadership'],
    capabilities: ['content_creation', 'linkedin_posting', 'scheduling'],
  },
  {
    slug: 'lead-converter',
    displayName: 'Riya',
    soulDir: 'lead-converter',
    agentRole: ROLE.STRATEGIST,
    personaRole: 'lead-converter',
    description:
      'Lead conversion and CRM agent — nurtures qualified leads through the pipeline to conversion',
    traits: ['persuasive', 'persistent', 'relationship-driven', 'data-aware'],
    expertise: ['lead-conversion', 'crm', 'pipeline-management'],
    capabilities: ['lead_conversion', 'crm', 'outreach'],
  },
  {
    slug: 'mirror',
    displayName: 'Mirror',
    soulDir: 'mirror',
    agentRole: ROLE.ANALYZER,
    personaRole: 'news-intelligence',
    description:
      'News intelligence aggregator and bias-mapping analyst for digest generation and narrative tracking',
    traits: ['objective', 'cold-eyed', 'pattern-oriented', 'silent-operator'],
    expertise: ['rss-analysis', 'bias-detection', 'causal-threading'],
    capabilities: ['rss_fetch', 'digest_generation', 'summarization'],
  },
  {
    slug: 'pronit-mirror',
    displayName: 'Pronit-Mirror',
    soulDir: undefined, // no SOUL.md — synthetic identity from curated persona, FLAGGED
    agentRole: ROLE.ASSISTANT,
    personaRole: 'personal-assistant',
    description:
      'Personal assistant agent tuned to owner preferences, memory, and private operational support',
    traits: ['adaptive', 'contextual', 'privacy-aware', 'supportive'],
    expertise: ['personal-assistance', 'preference-modeling', 'memory-aware-support'],
    capabilities: ['personal_assistance', 'preference_learning'],
  },
  {
    slug: 'pm',
    displayName: 'Bhagwan',
    soulDir: 'pm',
    agentRole: ROLE.ORCHESTRATOR,
    personaRole: 'project-manager',
    description:
      'Strategic PM orchestrator responsible for decomposition, delegation, and delivery pipeline health',
    traits: ['strategic', 'direct', 'resilient', 'accountability-driven'],
    expertise: ['task-orchestration', 'priority-management', 'risk-management'],
    capabilities: ['task_creation', 'priority_scoring', 'resource_allocation'],
  },
];

// ── Source loading ───────────────────────────────────────────────────────────

interface Routing {
  providerAlias: string;
  modelId: string;
  raw: string; // "provider/model"
}

interface ResolvedAgent extends AgentDef {
  systemPrompt: string;
  soulPath: string | null; // absolute path if a SOUL.md was read, else null
  soulFound: boolean;
  routing: Routing | null;
  flags: string[];
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Resolve the default routing: top-level `default`, else first provider's first model. */
function resolveRouting(models: unknown): Routing | null {
  if (!isRecord(models)) return null;

  const parse = (raw: string): Routing | null => {
    const [providerAlias, ...rest] = raw.split('/');
    const modelId = rest.join('/').trim();
    if (!providerAlias || modelId.length === 0) return null;
    return { providerAlias: providerAlias.trim(), modelId, raw };
  };

  if (typeof models.default === 'string' && models.default.length > 0) {
    const r = parse(models.default);
    if (r) return r;
  }

  if (isRecord(models.providers)) {
    for (const [alias, prov] of Object.entries(models.providers)) {
      if (!isRecord(prov) || !Array.isArray(prov.models)) continue;
      const first = prov.models.find(
        (m): m is Record<string, unknown> => isRecord(m) && typeof m.id === 'string'
      );
      if (first) {
        const id = first.id as string;
        return { providerAlias: alias, modelId: id, raw: `${alias}/${id}` };
      }
    }
  }

  return null;
}

function syntheticSystemPrompt(def: AgentDef): string {
  return [
    `You are ${def.displayName}, the ${def.personaRole} agent (OpenClaw "${def.slug}").`,
    '',
    def.description,
    '',
    `Defining traits: ${def.traits.join(', ')}.`,
    `Core expertise: ${def.expertise.join(', ')}.`,
    '',
    '(NOTE: No SOUL.md persona file was found for this agent under',
    'openclaw-infra/markdowns/. This identity was synthesized from the agent role.',
    'Replace with an authored SOUL.md when one becomes available.)',
  ].join('\n');
}

async function resolveAgent(def: AgentDef): Promise<ResolvedAgent> {
  const flags: string[] = [];

  // Persona / system prompt from SOUL.md
  let systemPrompt: string;
  let soulPath: string | null = null;
  let soulFound = false;

  if (def.soulDir) {
    const p = join(MARKDOWNS_DIR, def.soulDir, 'SOUL.md');
    if (await fileExists(p)) {
      systemPrompt = await readFile(p, 'utf-8');
      soulPath = p;
      soulFound = true;
    } else {
      flags.push(`SOUL.md expected at ${p} but MISSING — using synthetic identity`);
      systemPrompt = syntheticSystemPrompt(def);
    }
  } else {
    flags.push('No SOUL.md exists for this agent — using synthetic identity');
    systemPrompt = syntheticSystemPrompt(def);
  }

  // Model routing from agents/<slug>/models.json
  let routing: Routing | null = null;
  const modelsPath = join(AGENTS_DIR, def.slug, 'models.json');
  if (await fileExists(modelsPath)) {
    try {
      routing = resolveRouting(JSON.parse(await readFile(modelsPath, 'utf-8')));
      if (!routing) flags.push(`models.json present but no resolvable default at ${modelsPath}`);
    } catch (e) {
      flags.push(`models.json parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    flags.push('No models.json — persona seeded without LLM routing');
  }

  return { ...def, systemPrompt, soulPath, soulFound, routing, flags };
}

// ── Payload builders ─────────────────────────────────────────────────────────

function buildPersonaPayload(a: ResolvedAgent): PersonaInsert {
  return {
    name: a.displayName,
    role: a.personaRole,
    description: a.description,
    background: `OpenClaw agent "${a.slug}" imported into Navratna. Role: ${a.personaRole}.`,
    systemPrompt: a.systemPrompt,
    expertise: a.expertise,
    dominantExpertise: a.expertise[0],
    status: PERSONA_STATUS_ACTIVE,
    visibility: PERSONA_VISIBILITY_ORG,
    createdBy: ADMIN_USER_ID,
    tags: ['openclaw-import', a.slug],
    capabilities: a.capabilities,
    configuration: {
      source: 'openclaw-infra',
      openclawSlug: a.slug,
      llmRouting: a.routing
        ? {
            providerAlias: a.routing.providerAlias,
            modelId: a.routing.modelId,
            default: a.routing.raw,
          }
        : null,
    },
    metadata: {
      source: 'openclaw-infra',
      importedBy: 'seed-openclaw-agents',
      personality: { traits: a.traits },
      soulFound: a.soulFound,
      soulPath: a.soulPath,
    },
    lastUpdatedBy: ADMIN_USER_ID,
  };
}

function buildAgentPayload(a: ResolvedAgent, personaId: string): AgentInsert {
  return {
    name: a.displayName,
    description: a.description,
    role: a.agentRole as AgentInsert['role'],
    personaId,
    intelligenceConfig: {
      analysisDepth: 'intermediate',
      contextWindowSize: 4000,
      decisionThreshold: 0.7,
      learningEnabled: true,
      collaborationMode: 'collaborative',
    },
    securityContext: {
      securityLevel: 'medium',
      allowedCapabilities: a.capabilities,
      approvalRequired: false,
      auditLevel: 'standard',
    },
    createdBy: ADMIN_USER_ID,
    capabilities: a.capabilities,
    tags: ['openclaw-import', a.slug],
    systemPrompt: a.systemPrompt,
    modelId: a.routing?.raw,
    configuration: {
      source: 'openclaw-infra',
      openclawSlug: a.slug,
      llmRouting: a.routing
        ? {
            providerAlias: a.routing.providerAlias,
            modelId: a.routing.modelId,
            default: a.routing.raw,
          }
        : null,
    },
    metadata: {
      source: 'openclaw-infra',
      importedBy: 'seed-openclaw-agents',
      soulFound: a.soulFound,
    },
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`OpenClaw agent seed — ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log(`openclaw-infra: ${OPENCLAW_INFRA_DIR}\n`);

  const resolved = await Promise.all(AGENT_DEFS.map(resolveAgent));

  // Report resolution up front
  for (const a of resolved) {
    const model = a.routing ? a.routing.raw : '(none)';
    const soul = a.soulPath ?? '(synthetic — no SOUL.md)';
    console.log(`• ${a.displayName.padEnd(14)} slug=${a.slug.padEnd(14)} model=${model}`);
    console.log(`    soul: ${soul}`);
    for (const f of a.flags) console.log(`    FLAG: ${f}`);
  }
  console.log('');

  if (DRY_RUN) {
    for (const a of resolved) {
      const persona = buildPersonaPayload(a);
      const agent = buildAgentPayload(a, '<persona-id-resolved-at-runtime>');
      console.log(`── ${a.displayName} ─────────────────────────────`);
      console.log('persona:', JSON.stringify({ ...persona, systemPrompt: `<${persona.systemPrompt.length} chars>` }, null, 2));
      console.log('agent:', JSON.stringify({ ...agent, systemPrompt: `<${(agent.systemPrompt ?? '').length} chars>` }, null, 2));
      console.log('');
    }
    console.log(`Dry run complete. ${resolved.length} agents would be upserted (personas + agents).`);
    return;
  }

  const { intelligenceDb: db } = await initializePlanes();
  let count = 0;

  for (const a of resolved) {
    const personaPayload = buildPersonaPayload(a);

    const [personaRow] = await db
      .insert(personas)
      .values(personaPayload)
      .onConflictDoUpdate({
        target: personas.name,
        set: {
          role: personaPayload.role,
          description: personaPayload.description,
          background: personaPayload.background,
          systemPrompt: personaPayload.systemPrompt,
          expertise: personaPayload.expertise,
          dominantExpertise: personaPayload.dominantExpertise,
          status: personaPayload.status,
          visibility: personaPayload.visibility,
          tags: personaPayload.tags,
          capabilities: personaPayload.capabilities,
          configuration: personaPayload.configuration,
          metadata: personaPayload.metadata,
          lastUpdatedBy: ADMIN_USER_ID,
          updatedAt: new Date(),
        },
      })
      .returning({ id: personas.id });

    const personaId = personaRow.id;
    const agentPayload = buildAgentPayload(a, personaId);

    await db
      .insert(agents)
      .values(agentPayload)
      .onConflictDoUpdate({
        target: agents.name,
        set: {
          description: agentPayload.description,
          role: agentPayload.role,
          personaId,
          intelligenceConfig: agentPayload.intelligenceConfig,
          securityContext: agentPayload.securityContext,
          capabilities: agentPayload.capabilities,
          tags: agentPayload.tags,
          systemPrompt: agentPayload.systemPrompt,
          modelId: agentPayload.modelId,
          configuration: agentPayload.configuration,
          metadata: agentPayload.metadata,
          updatedAt: new Date(),
        },
      });

    count += 1;
    console.log(`[ok] ${a.displayName} upserted (persona=${personaId})`);
  }

  console.log(`\nDone. ${count}/${resolved.length} agents seeded (personas + agents).`);
  await closePlanes();
}

main().catch(async (err) => {
  console.error('Failed to seed OpenClaw agents:', err);
  if (!DRY_RUN) await closePlanes().catch(() => {});
  process.exit(1);
});
