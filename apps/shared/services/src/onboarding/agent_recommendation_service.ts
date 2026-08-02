import { ONBOARDING_GUIDE_AGENT_ID } from '../agent_access_service.js';
import type { InterviewSlot, OnboardingSlot } from './types.js';

/**
 * Agent recommendation from a completed onboarding interview.
 *
 * Pure functions only — no I/O, no database, no LLM. Given the interview slot
 * state and a list of candidate agents, decide WHICH agents this user should
 * be provisioned. Matching is done exclusively on capability TAGS, never on
 * agent names: names are seed data and deployments may rename or add agents,
 * so the matcher degrades to "no match" (and then the fallback roster) rather
 * than breaking.
 *
 * Only four slots carry signal about WHAT WORK the user does (identity,
 * scope_of_work, always_surface, vision). The other six describe interaction
 * style and are deliberately never read here.
 */

export interface AgentCandidate {
  id: string;
  name: string;
  capabilities: string[];
  role: string;
}

export interface RecommendAgentsParams {
  slots: Record<OnboardingSlot, InterviewSlot>;
  candidates: AgentCandidate[];
}

export interface AgentRecommendation {
  agentId: string;
  agentName: string;
  score: number;
  matchedCapabilities: string[];
  rationale: string;
}

export interface RecommendationResult {
  recommendations: AgentRecommendation[];
  matchedDomains: string[];
  usedFallback: boolean;
}

export interface DomainSignal {
  domain: string;
  phrases: string[];
  capabilities: string[];
}

/**
 * Ceiling on how many agents one interview may provision. A user whose
 * answers touch every domain still gets a focused roster, not the full seed
 * set — handing back everything would defeat the point of scoping.
 */
export const MAX_RECOMMENDED_AGENTS = 5;

/** The four interview slots that describe the user's work, not their style. */
const SIGNAL_SLOTS: readonly OnboardingSlot[] = [
  'identity',
  'scope_of_work',
  'always_surface',
  'vision',
];

/**
 * Domain detection table. Phrases are matched with word boundaries against
 * the lowercased signal-slot text; capabilities are the tags a detected
 * domain implies. Phrase lists intentionally include role nouns ("designer",
 * "analyst") and technology names ("react", "kubernetes") because users
 * describe themselves in those terms, not in domain keys.
 */
export const DOMAIN_SIGNALS: DomainSignal[] = [
  {
    domain: 'software-engineering',
    phrases: [
      'software',
      'engineer',
      'engineering',
      'developer',
      'development',
      'programming',
      'coding',
      'code',
      'api',
      'apis',
      'full-stack',
      'full stack',
      'fullstack',
      'web app',
      'web application',
      'saas',
      'typescript',
      'javascript',
      'python',
      'golang',
      'rust',
    ],
    capabilities: ['full-stack-development', 'api-design', 'testing'],
  },
  {
    domain: 'frontend',
    phrases: [
      'frontend',
      'front-end',
      'front end',
      'react',
      'vue',
      'angular',
      'svelte',
      'ui',
      'css',
      'html',
      'next.js',
      'nextjs',
      'tailwind',
      'web design',
      'responsive',
      'component library',
    ],
    capabilities: ['frontend-development', 'ui-ux-design'],
  },
  {
    domain: 'backend',
    phrases: [
      'backend',
      'back-end',
      'back end',
      'server',
      'server-side',
      'database',
      'databases',
      'sql',
      'postgres',
      'postgresql',
      'mysql',
      'mongodb',
      'redis',
      'microservice',
      'microservices',
      'distributed systems',
      'system architecture',
      'node.js',
      'nodejs',
      'django',
      'rails',
    ],
    capabilities: [
      'backend-development',
      'system-architecture',
      'database-optimization',
      'api-design',
    ],
  },
  {
    domain: 'devops',
    phrases: [
      'devops',
      'infrastructure',
      'kubernetes',
      'k8s',
      'docker',
      'terraform',
      'ci/cd',
      'cicd',
      'deploy',
      'deployment',
      'deployments',
      'sre',
      'site reliability',
      'monitoring',
      'observability',
      'cloud',
      'aws',
      'gcp',
      'azure',
      'ansible',
      'pipeline',
      'pipelines',
    ],
    capabilities: ['devops', 'infrastructure-automation', 'monitoring', 'deployment'],
  },
  {
    domain: 'data',
    phrases: [
      'data',
      'data analysis',
      'data analytics',
      'analytics',
      'data science',
      'data scientist',
      'analyst',
      'statistics',
      'statistical',
      'machine learning',
      'dashboard',
      'dashboards',
      'reporting',
      'reports',
      'metrics',
      'kpi',
      'kpis',
      'business intelligence',
      'visualization',
      'visualisation',
      'spreadsheets',
    ],
    capabilities: ['data-analysis', 'visualization', 'statistical-modeling', 'reporting'],
  },
  {
    domain: 'design',
    phrases: [
      'design',
      'designer',
      'ux',
      'ui',
      'user experience',
      'user interface',
      'brand',
      'branding',
      'brand strategy',
      'visual identity',
      'figma',
      'typography',
      'illustration',
      'graphic',
      'creative direction',
      'design system',
      'design systems',
      'wireframe',
      'wireframes',
      'prototyping',
      'mockups',
    ],
    capabilities: ['ui-ux-design', 'creative-direction', 'brand-strategy', 'design-systems'],
  },
  {
    domain: 'product-management',
    phrases: [
      'product manager',
      'product management',
      'pm',
      'roadmap',
      'roadmaps',
      'product owner',
      'backlog',
      'sprint planning',
      'user stories',
      'stakeholder',
      'stakeholders',
      'requirements',
      'prioritization',
      'product strategy',
    ],
    capabilities: ['workflow-management', 'task-orchestration', 'user-research'],
  },
  {
    domain: 'research',
    phrases: [
      'research',
      'researcher',
      'user research',
      'interviews',
      'usability',
      'survey',
      'surveys',
      'experiment',
      'experiments',
      'a/b testing',
      'behavioral',
      'psychology',
      'user testing',
      'academic',
      'studies',
    ],
    capabilities: ['user-research', 'behavioral-analysis', 'user-psychology', 'statistical-modeling'],
  },
  {
    domain: 'operations',
    phrases: [
      'operations',
      'ops',
      'workflow',
      'workflows',
      'process',
      'processes',
      'coordination',
      'coordinating',
      'logistics',
      'scheduling',
      'project management',
      'program management',
      'task management',
      'automation',
      'administrative',
    ],
    capabilities: ['workflow-management', 'task-orchestration', 'monitoring'],
  },
  {
    domain: 'marketing',
    phrases: [
      'marketing',
      'marketer',
      'growth',
      'seo',
      'campaign',
      'campaigns',
      'social media',
      'content strategy',
      'copywriting',
      'advertising',
      'ads',
      'audience',
      'engagement',
      'brand awareness',
      'email marketing',
      'go-to-market',
    ],
    capabilities: ['brand-strategy', 'creative-direction', 'behavioral-analysis'],
  },
];

/**
 * Fallback roster selection, by capability tag: an orchestrator to coordinate
 * work, a generalist (full-stack) executor to do it, and an analyzer to
 * report on it. This trio is broadly useful regardless of what the user does,
 * small enough that scoping still means something, and picked by tags so it
 * survives agent renames. Within a group the candidate carrying the MOST
 * group tags wins, tie-broken by name for determinism.
 */
const FALLBACK_CAPABILITY_GROUPS: readonly (readonly string[])[] = [
  ['workflow-management', 'task-orchestration'],
  ['full-stack-development'],
  ['data-analysis', 'reporting'],
];

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;

function escapeRegExp(phrase: string): string {
  return phrase.replace(REGEX_ESCAPE, '\\$&');
}

/**
 * One word-boundary regex per domain. Boundaries are mandatory: a naive
 * `includes('ui')` fires on "building" and "guide" and silently
 * mis-provisions agents.
 */
const DOMAIN_MATCHERS: ReadonlyMap<string, RegExp> = new Map(
  DOMAIN_SIGNALS.map((signal) => [
    signal.domain,
    new RegExp(`\\b(?:${signal.phrases.map(escapeRegExp).join('|')})\\b`),
  ])
);

const DOMAIN_CAPABILITIES: ReadonlyMap<string, readonly string[]> = new Map(
  DOMAIN_SIGNALS.map((signal) => [signal.domain, signal.capabilities])
);

/**
 * Detect work domains from the four signal-bearing slots. Only slots with
 * `status === 'answered'` and a non-null value contribute; the six
 * interaction-style slots are never read.
 */
export function detectDomains(slots: Record<OnboardingSlot, InterviewSlot>): string[] {
  const fragments: string[] = [];
  for (const slotKey of SIGNAL_SLOTS) {
    const interviewSlot = slots[slotKey];
    if (interviewSlot.status === 'answered' && interviewSlot.value !== null) {
      fragments.push(interviewSlot.value);
    }
  }
  if (fragments.length === 0) return [];

  const text = fragments.join(' ').toLowerCase();
  const detected: string[] = [];
  for (const signal of DOMAIN_SIGNALS) {
    const matcher = DOMAIN_MATCHERS.get(signal.domain);
    if (matcher !== undefined && matcher.test(text)) {
      detected.push(signal.domain);
    }
  }
  return detected;
}

function impliedCapabilities(domains: string[]): Set<string> {
  const implied = new Set<string>();
  for (const domain of domains) {
    const capabilities = DOMAIN_CAPABILITIES.get(domain);
    if (capabilities !== undefined) {
      for (const capability of capabilities) implied.add(capability);
    }
  }
  return implied;
}

function contributingDomains(domains: string[], matched: string[]): string[] {
  const matchedSet = new Set(matched);
  return domains.filter((domain) => {
    const capabilities = DOMAIN_CAPABILITIES.get(domain);
    return capabilities !== undefined && capabilities.some((cap) => matchedSet.has(cap));
  });
}

function byScoreThenName(a: AgentRecommendation, b: AgentRecommendation): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.agentName < b.agentName) return -1;
  if (a.agentName > b.agentName) return 1;
  return 0;
}

function scoreCandidates(
  candidates: AgentCandidate[],
  domains: string[]
): AgentRecommendation[] {
  const implied = impliedCapabilities(domains);
  if (implied.size === 0) return [];

  const recommendations: AgentRecommendation[] = [];
  for (const candidate of candidates) {
    const matched = candidate.capabilities.filter((capability) => implied.has(capability));
    if (matched.length === 0) continue;

    // Score = fraction of the user's implied capability needs this agent
    // covers. A shared denominator (the implied set) means broad, well-
    // matched agents outrank narrow single-tag agents, and ties are exact.
    const score = matched.length / implied.size;
    const relevantDomains = contributingDomains(domains, matched);
    recommendations.push({
      agentId: candidate.id,
      agentName: candidate.name,
      score,
      matchedCapabilities: matched,
      rationale: `Matches your ${relevantDomains.join(', ')} work via ${matched.join(', ')}.`,
    });
  }
  return recommendations.sort(byScoreThenName);
}

function buildFallbackRoster(candidates: AgentCandidate[]): AgentRecommendation[] {
  const picked = new Map<string, AgentRecommendation>();

  for (const group of FALLBACK_CAPABILITY_GROUPS) {
    const groupSet = new Set(group);
    let best: AgentCandidate | null = null;
    let bestMatched: string[] = [];

    for (const candidate of candidates) {
      if (picked.has(candidate.id)) continue;
      const matched = candidate.capabilities.filter((capability) => groupSet.has(capability));
      if (matched.length === 0) continue;
      const beatsBest =
        best === null ||
        matched.length > bestMatched.length ||
        (matched.length === bestMatched.length && candidate.name < best.name);
      if (beatsBest) {
        best = candidate;
        bestMatched = matched;
      }
    }

    if (best !== null) {
      picked.set(best.id, {
        agentId: best.id,
        agentName: best.name,
        score: 0,
        matchedCapabilities: bestMatched,
        rationale:
          'Default starter roster: no work domains were detected in the interview, ' +
          `so this agent was included for its ${bestMatched.join(', ')} capabilities.`,
      });
    }
  }

  return Array.from(picked.values()).sort(byScoreThenName);
}

/**
 * Recommend agents to provision for a newly-onboarded user.
 *
 * Scored candidates (score > 0) are returned sorted by score descending,
 * tie-broken by name ascending, capped at MAX_RECOMMENDED_AGENTS. When no
 * domain is detected — or nothing matches — a small default roster is
 * returned instead of an empty list, with `usedFallback: true`: a user who
 * skips onboarding should get a generic starter set, never an empty app.
 */
export function recommendAgents(params: RecommendAgentsParams): RecommendationResult {
  const eligible = params.candidates.filter(
    (candidate) => candidate.id !== ONBOARDING_GUIDE_AGENT_ID
  );
  const matchedDomains = detectDomains(params.slots);
  const scored = scoreCandidates(eligible, matchedDomains);

  if (scored.length > 0) {
    return {
      recommendations: scored.slice(0, MAX_RECOMMENDED_AGENTS),
      matchedDomains,
      usedFallback: false,
    };
  }

  return {
    recommendations: buildFallbackRoster(eligible),
    matchedDomains,
    usedFallback: true,
  };
}
