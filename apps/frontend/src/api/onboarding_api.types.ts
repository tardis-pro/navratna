export const ONBOARDING_SLOT_KEYS = [
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

export type OnboardingSlotKey = (typeof ONBOARDING_SLOT_KEYS)[number];

export type OnboardingSlotStatus =
  | 'unanswered'
  | 'answered'
  | 'declined'
  | 'not_applicable'
  | 'needs_clarification';

export type OnboardingInterviewStatus =
  | 'active'
  | 'paused'
  | 'review'
  | 'completed'
  | 'abandoned';

export interface OnboardingSlotView {
  status: OnboardingSlotStatus;
  value: string | null;
  confidence: number | null;
  revision: number;
}

export interface OnboardingInterviewView {
  id: string;
  status: OnboardingInterviewStatus;
  currentObjective: OnboardingSlotKey | null;
  turnCount: number;
  stateVersion: number;
  guideAgentId: string;
}

export interface OnboardingMessageView {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface OnboardingStatusData {
  interview: OnboardingInterviewView | null;
  slots: Record<OnboardingSlotKey, OnboardingSlotView>;
  messages: OnboardingMessageView[];
}

export interface OnboardingTurnRequest {
  message: string;
  clientTurnId: string;
  expectedStateVersion: number;
}

export interface OnboardingTurnData {
  reply: { id: string; content: string };
  interview: OnboardingInterviewView;
  slots: Record<OnboardingSlotKey, OnboardingSlotView>;
}

export interface OnboardingSlotUpdateRequest {
  value: string | null;
  status: 'answered' | 'declined';
}

export interface OnboardingSlotUpdateData {
  interview: OnboardingInterviewView;
  slots: Record<OnboardingSlotKey, OnboardingSlotView>;
}

export interface ProvisionedAgentView {
  id: string;
  name: string;
  role: string;
  rationale: string;
}

export interface OnboardingCompleteData {
  provisionedAgents: ProvisionedAgentView[];
}

/**
 * Distinguishes the two non-error outcomes a turn can have besides success:
 * `conflict` means another tab advanced the interview and the answer belongs to
 * a question that is no longer on screen; `in_flight` means an identical turn is
 * already generating. Neither is a failure the user caused, so both are modelled
 * as values rather than thrown errors.
 */
export type OnboardingTurnOutcome =
  | { kind: 'committed'; data: OnboardingTurnData }
  | { kind: 'conflict' }
  | { kind: 'in_flight' }
  | { kind: 'unavailable' };

/**
 * `already_finished` means this user completed or abandoned onboarding before.
 * The server will not reopen it, so the caller must settle the UI rather than
 * retry — modelled as a value because it is expected, not a failure.
 */
export type OnboardingStartOutcome =
  | { kind: 'started'; data: OnboardingStatusData }
  | { kind: 'already_finished' };
