import type {
  OnboardingInterviewView,
  OnboardingMessageView,
  OnboardingSlotKey,
  OnboardingSlotView,
} from '@/api/onboarding_api.types';

export type TurnFeedback =
  | 'conflict'
  | 'in_flight'
  | 'unavailable'
  | 'already_finished'
  | 'skip_failed'
  | null;

export interface ImprintInterviewState {
  interview: OnboardingInterviewView | null;
  slots: Record<OnboardingSlotKey, OnboardingSlotView>;
  messages: OnboardingMessageView[];
  loading: boolean;
  sending: boolean;
  feedback: TurnFeedback;
  resolvedCount: number;
  totalSlots: number;
  send: (text: string) => Promise<void>;
  correctSlot: (
    slotKey: OnboardingSlotKey,
    value: string,
    status: 'answered' | 'declined'
  ) => Promise<void>;
  skip: (onSettled: () => void) => Promise<void>;
  reload: () => Promise<void>;
}

export interface ImprintInterviewProps {
  onComplete: () => void;
  onSkip: () => void;
  className?: string;
}

export interface ImprintReviewProps {
  slots: Record<OnboardingSlotKey, OnboardingSlotView>;
  onCorrect: (
    slotKey: OnboardingSlotKey,
    value: string,
    status: 'answered' | 'declined'
  ) => Promise<void>;
  onConfirm: () => void;
  confirming: boolean;
  className?: string;
}

export const SLOT_LABELS: Record<OnboardingSlotKey, string> = {
  identity: 'Who you are',
  scope_of_work: 'What you own',
  communication: 'How you like to be spoken to',
  always_surface: 'Always surface',
  never_surface: 'Never surface',
  decision_style: 'How you decide',
  approval_style: 'What needs your approval',
  non_negotiables: 'Non-negotiables',
  vision: 'Where this is going',
  trust_kill: 'What would break your trust',
};
