import { describe, it, expect } from 'vitest';
import { ONBOARDING_SLOTS } from '../../onboarding/types.js';
import {
  ExtractedSlotUpdateSchema,
  TurnExtractionSchema,
  BaseImprintSchema,
} from '../../onboarding/schemas.js';

/**
 * The server owns slot state; the LLM only reports deltas. These schemas are
 * the trust boundary: an "answered" slot without quoted evidence is treated as
 * a hallucination, and a declined question must never carry a guessed value.
 */

const wellFormedUpdate = {
  slot: 'identity',
  status: 'answered',
  value: 'Pronit, founder, IST',
  evidence: "I'm Pronit, I run the platform, I'm in IST",
};

describe('ONBOARDING_SLOTS', () => {
  it('contains exactly the ten interview slots in order', () => {
    expect(ONBOARDING_SLOTS).toEqual([
      'identity',
      'scope_of_work',
      'communication',
      'always_surface',
      'never_surface',
      'decision_style',
      'approval_style',
      'non_negotiables',
      'vision',
      'trust_kill',
    ]);
  });
});

describe('ExtractedSlotUpdateSchema', () => {
  it('rejects status=answered with null evidence', () => {
    const result = ExtractedSlotUpdateSchema.safeParse({
      ...wellFormedUpdate,
      evidence: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join(' ');
      expect(messages).toMatch(/evidence/i);
    }
  });

  it('rejects status=answered with empty-string value', () => {
    const result = ExtractedSlotUpdateSchema.safeParse({
      ...wellFormedUpdate,
      value: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects status=declined carrying a non-null value', () => {
    const result = ExtractedSlotUpdateSchema.safeParse({
      ...wellFormedUpdate,
      status: 'declined',
      value: 'a guessed value',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a well-formed answered update', () => {
    const result = ExtractedSlotUpdateSchema.safeParse(wellFormedUpdate);
    expect(result.success).toBe(true);
  });

  it('rejects an unknown slot name', () => {
    const result = ExtractedSlotUpdateSchema.safeParse({
      ...wellFormedUpdate,
      slot: 'favorite_color',
    });
    expect(result.success).toBe(false);
  });
});

describe('TurnExtractionSchema', () => {
  const validTurn = {
    updates: [wellFormedUpdate],
    userIntent: 'answer',
    shouldClarify: false,
    clarificationReason: null,
  };

  it('rejects unknown top-level properties', () => {
    const result = TurnExtractionSchema.safeParse({
      ...validTurn,
      inventedField: 'the model must not add fields',
    });
    expect(result.success).toBe(false);
  });

  it('rejects shouldClarify=true with null clarificationReason', () => {
    const result = TurnExtractionSchema.safeParse({
      ...validTurn,
      shouldClarify: true,
      clarificationReason: null,
    });
    expect(result.success).toBe(false);
  });

  it('accepts an empty updates array', () => {
    const result = TurnExtractionSchema.safeParse({
      updates: [],
      userIntent: 'clarification_request',
      shouldClarify: false,
      clarificationReason: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('BaseImprintSchema', () => {
  it('accepts a profile where declined fields are null', () => {
    const result = BaseImprintSchema.safeParse({
      identity: {
        name: 'Pronit',
        role: null,
        timezone: 'Asia/Kolkata',
        communicationStyle: null,
        description: null,
      },
      domains: [],
      workPatterns: {
        peakHours: null,
        reviewStyle: null,
        delegationPreference: null,
        contextSwitchFrequency: null,
      },
      priorities: {
        alwaysSurface: [],
        neverSurface: [],
        surfaceOnlyIfBlocking: [],
      },
      security: {
        approvalThreshold: null,
        notificationChannel: null,
        autoRevertOnFailure: null,
        maxAutonomyLevel: null,
        nonNegotiables: [],
        trustBreakers: null,
      },
      systemVision: {
        shortTerm: null,
        longTerm: null,
        personality: null,
      },
    });
    expect(result.success).toBe(true);
  });

  it('defaults missing arrays to empty arrays', () => {
    const result = BaseImprintSchema.safeParse({
      identity: {
        name: null,
        role: null,
        timezone: null,
        communicationStyle: null,
        description: null,
      },
      workPatterns: {
        peakHours: null,
        reviewStyle: null,
        delegationPreference: null,
        contextSwitchFrequency: null,
      },
      priorities: {},
      security: {
        approvalThreshold: null,
        notificationChannel: null,
        autoRevertOnFailure: null,
        maxAutonomyLevel: null,
        trustBreakers: null,
      },
      systemVision: {
        shortTerm: null,
        longTerm: null,
        personality: null,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.domains).toEqual([]);
      expect(result.data.priorities.alwaysSurface).toEqual([]);
      expect(result.data.priorities.neverSurface).toEqual([]);
      expect(result.data.priorities.surfaceOnlyIfBlocking).toEqual([]);
      expect(result.data.security.nonNegotiables).toEqual([]);
    }
  });
});
