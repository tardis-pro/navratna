import { describe, expect, it } from 'vitest';
import type { InterviewSlot, OnboardingSlot } from '../../onboarding/types';
import { ONBOARDING_GUIDE_AGENT_ID } from '../../agent_access_service';
import {
  MAX_RECOMMENDED_AGENTS,
  detectDomains,
  recommendAgents,
} from '../../onboarding/agent_recommendation_service';
import type {
  AgentCandidate,
  RecommendationResult,
} from '../../onboarding/agent_recommendation_service';

/**
 * Candidate fixtures mirror the REAL capability sets from
 * database/seeders/agent_seed.ts. Ids are synthetic — the matcher must never
 * depend on names or ids, only capability tags.
 */
const CANDIDATES: AgentCandidate[] = [
  {
    id: 'agent-pro',
    name: 'Pro',
    role: 'ANALYZER',
    capabilities: ['data-analysis', 'visualization', 'statistical-modeling', 'reporting'],
  },
  {
    id: 'agent-taniye',
    name: 'Taniye',
    role: 'ORCHESTRATOR',
    capabilities: ['workflow-management', 'task-orchestration'],
  },
  {
    id: 'agent-prashis',
    name: 'Prashis',
    role: 'EXECUTOR',
    capabilities: ['full-stack-development', 'api-design', 'database-optimization', 'testing'],
  },
  {
    id: 'agent-keegan',
    name: 'Keegan',
    role: 'EXECUTOR',
    capabilities: ['backend-development', 'system-architecture'],
  },
  {
    id: 'agent-josh',
    name: 'Josh',
    role: 'EXECUTOR',
    capabilities: ['frontend-development', 'ui-ux-design'],
  },
  {
    id: 'agent-pankaj',
    name: 'Pankaj',
    role: 'EXECUTOR',
    capabilities: ['devops', 'infrastructure-automation', 'monitoring', 'deployment'],
  },
  {
    id: 'agent-maya',
    name: 'Maya',
    role: 'ADVISOR',
    capabilities: ['creative-direction', 'brand-strategy', 'design-systems', 'user-research'],
  },
  {
    id: 'agent-zara',
    name: 'Zara',
    role: 'ADVISOR',
    capabilities: ['behavioral-analysis', 'user-psychology'],
  },
];

function slot(overrides: Partial<InterviewSlot> = {}): InterviewSlot {
  return {
    status: 'unanswered',
    value: null,
    evidenceMessageIds: [],
    confidence: null,
    attempts: 0,
    revision: 0,
    ...overrides,
  };
}

function answered(value: string): InterviewSlot {
  return slot({ status: 'answered', value, confidence: 0.9 });
}

function emptySlots(): Record<OnboardingSlot, InterviewSlot> {
  return {
    identity: slot(),
    scope_of_work: slot(),
    communication: slot(),
    always_surface: slot(),
    never_surface: slot(),
    decision_style: slot(),
    approval_style: slot(),
    non_negotiables: slot(),
    vision: slot(),
    trust_kill: slot(),
  };
}

function slotsWith(
  values: Partial<Record<OnboardingSlot, InterviewSlot>>
): Record<OnboardingSlot, InterviewSlot> {
  return { ...emptySlots(), ...values };
}

function recommendedIds(result: RecommendationResult): string[] {
  return result.recommendations.map((rec) => rec.agentId);
}

describe('AgentRecommendationService', () => {
  describe('detectDomains', () => {
    it('detects software engineering from a scope_of_work answer', () => {
      const slots = slotsWith({
        scope_of_work: answered('I write software and build APIs for our platform.'),
      });

      expect(detectDomains(slots)).toContain('software-engineering');
    });

    it('detects design from an identity answer', () => {
      const slots = slotsWith({
        identity: answered("I'm a designer at a small studio."),
      });

      expect(detectDomains(slots)).toContain('design');
    });

    it('detects multiple domains across several answered slots', () => {
      const slots = slotsWith({
        identity: answered('I am a frontend engineer.'),
        scope_of_work: answered('I also manage our kubernetes deployments.'),
      });

      const domains = detectDomains(slots);
      expect(domains).toContain('frontend');
      expect(domains).toContain('software-engineering');
      expect(domains).toContain('devops');
    });

    it('ignores slots that are unanswered or declined', () => {
      const slots = slotsWith({
        identity: slot({ status: 'declined', value: 'I build backend systems.' }),
        scope_of_work: slot({ status: 'needs_clarification', value: 'frontend react work' }),
        vision: slot({ status: 'unanswered', value: 'kubernetes devops everywhere' }),
      });

      expect(detectDomains(slots)).toEqual([]);
    });

    it('ignores the six interaction-style slots', () => {
      const slots = slotsWith({
        communication: answered('Talk to me like a frontend react engineer.'),
        decision_style: answered('I decide like a devops kubernetes designer.'),
        never_surface: answered('backend databases and marketing campaigns'),
        approval_style: answered('data analytics dashboards'),
        non_negotiables: answered('ux design and user research'),
        trust_kill: answered('software apis everywhere'),
      });

      expect(detectDomains(slots)).toEqual([]);
    });

    it('matches on word boundaries', () => {
      const slots = slotsWith({
        scope_of_work: answered('building the guidelines'),
      });

      expect(detectDomains(slots)).toEqual([]);
    });
  });

  describe('recommendAgents', () => {
    it('recommends backend and full-stack agents for a backend answer', () => {
      const result = recommendAgents({
        slots: slotsWith({
          scope_of_work: answered('I build backend services and maintain our database schemas.'),
        }),
        candidates: CANDIDATES,
      });

      const ids = recommendedIds(result);
      expect(ids).toContain('agent-keegan');
      expect(ids).toContain('agent-prashis');
      expect(ids).not.toContain('agent-josh');
      expect(result.usedFallback).toBe(false);
      expect(result.matchedDomains).toContain('backend');
    });

    it('recommends the design agents for a design answer', () => {
      const result = recommendAgents({
        slots: slotsWith({
          identity: answered("I'm a UX designer focused on brand strategy."),
        }),
        candidates: CANDIDATES,
      });

      const ids = recommendedIds(result);
      expect(ids).toContain('agent-maya');
      expect(ids).toContain('agent-josh');
      expect(ids[0]).toBe('agent-maya');
      expect(result.usedFallback).toBe(false);
      const maya = result.recommendations.find((rec) => rec.agentId === 'agent-maya');
      expect(maya?.matchedCapabilities).toContain('brand-strategy');
    });

    it('orders recommendations by score then by name', () => {
      const tiedCandidates: AgentCandidate[] = [
        {
          id: 'agent-zephyr',
          name: 'Zephyr',
          role: 'EXECUTOR',
          capabilities: ['ui-ux-design'],
        },
        {
          id: 'agent-maya',
          name: 'Maya',
          role: 'ADVISOR',
          capabilities: ['creative-direction', 'brand-strategy', 'design-systems', 'user-research'],
        },
        {
          id: 'agent-aldous',
          name: 'Aldous',
          role: 'EXECUTOR',
          capabilities: ['ui-ux-design'],
        },
      ];

      const result = recommendAgents({
        slots: slotsWith({
          identity: answered("I'm a UX designer focused on brand strategy."),
        }),
        candidates: tiedCandidates,
      });

      // Maya scores highest; Aldous and Zephyr tie exactly and must resolve
      // alphabetically by name for deterministic provisioning.
      expect(recommendedIds(result)).toEqual(['agent-maya', 'agent-aldous', 'agent-zephyr']);
    });

    it('never recommends the onboarding guide agent', () => {
      const withGuide: AgentCandidate[] = [
        ...CANDIDATES,
        {
          id: ONBOARDING_GUIDE_AGENT_ID,
          name: 'Guide',
          role: 'ADVISOR',
          capabilities: ['ui-ux-design', 'creative-direction'],
        },
      ];

      const result = recommendAgents({
        slots: slotsWith({
          identity: answered("I'm a UX designer focused on brand strategy."),
        }),
        candidates: withGuide,
      });

      expect(recommendedIds(result)).not.toContain(ONBOARDING_GUIDE_AGENT_ID);
    });

    it('falls back to a default roster when no domain is detected', () => {
      const withGuide: AgentCandidate[] = [
        ...CANDIDATES,
        {
          id: ONBOARDING_GUIDE_AGENT_ID,
          name: 'Guide',
          role: 'ADVISOR',
          capabilities: ['workflow-management', 'data-analysis'],
        },
      ];

      const result = recommendAgents({
        slots: emptySlots(),
        candidates: withGuide,
      });

      expect(result.usedFallback).toBe(true);
      expect(result.matchedDomains).toEqual([]);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeLessThan(CANDIDATES.length);
      expect(recommendedIds(result)).not.toContain(ONBOARDING_GUIDE_AGENT_ID);
      // Capability-tag selection: an orchestrator, a generalist executor, an analyzer.
      expect(recommendedIds(result).sort()).toEqual(
        ['agent-pro', 'agent-prashis', 'agent-taniye'].sort()
      );
    });

    it('caps recommendations at MAX_RECOMMENDED_AGENTS', () => {
      const result = recommendAgents({
        slots: slotsWith({
          scope_of_work: answered(
            'I do frontend react, backend databases, kubernetes devops, data analytics, ' +
              'ux design, user research, marketing campaigns, and workflow operations.'
          ),
        }),
        candidates: CANDIDATES,
      });

      expect(result.recommendations.length).toBeLessThanOrEqual(MAX_RECOMMENDED_AGENTS);
      expect(result.recommendations.length).toBe(MAX_RECOMMENDED_AGENTS);
    });

    it('returns an empty list when there are no candidates at all', () => {
      let result: RecommendationResult | undefined;

      expect(() => {
        result = recommendAgents({
          slots: slotsWith({
            scope_of_work: answered('I build backend services.'),
          }),
          candidates: [],
        });
      }).not.toThrow();

      expect(result?.recommendations).toEqual([]);
    });

    it('is deterministic — the same input yields the identical output twice', () => {
      const slots = slotsWith({
        identity: answered('I am a frontend engineer.'),
        scope_of_work: answered('I build backend services and kubernetes deployments.'),
      });

      const first = recommendAgents({ slots, candidates: CANDIDATES });
      const second = recommendAgents({ slots, candidates: CANDIDATES });

      expect(second).toEqual(first);
    });
  });
});
