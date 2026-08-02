/**
 * Domain types for the conversational onboarding interview ("Base Imprint 10").
 *
 * The server owns slot state and the completion decision; the LLM only
 * extracts deltas from each user turn. Slots are modelled on the interview
 * QUESTIONS, not on BaseImprint fields — the slot→field mapping is
 * many-to-many and the profile is assembled from slots later.
 */

export const ONBOARDING_SLOTS = [
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
] as const;

export type OnboardingSlot = (typeof ONBOARDING_SLOTS)[number];

export type SlotStatus =
  | 'unanswered'
  | 'answered'
  | 'needs_clarification'
  | 'declined'
  | 'not_applicable';

export type InterviewStatus = 'active' | 'paused' | 'review' | 'completed' | 'abandoned';

export type UserIntent =
  | 'answer'
  | 'multi_answer'
  | 'clarification_request'
  | 'refusal'
  | 'correction'
  | 'pause'
  | 'unrelated';

/**
 * Server-side state for one interview slot. Never produced by the LLM, so it
 * has no runtime schema — the server mutates it from validated SlotUpdates.
 */
export interface InterviewSlot {
  status: SlotStatus;
  value: string | null;
  evidenceMessageIds: string[];
  confidence: number | null;
  attempts: number;
  revision: number;
}
