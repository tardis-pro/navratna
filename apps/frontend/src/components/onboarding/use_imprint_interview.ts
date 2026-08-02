import { useCallback, useEffect, useRef, useState } from 'react';
import { onboardingAPI } from '@/api/onboarding_api';
import { ONBOARDING_SLOT_KEYS } from '@/api/onboarding_api.types';
import type {
  OnboardingInterviewView,
  OnboardingMessageView,
  OnboardingSlotKey,
  OnboardingSlotView,
} from '@/api/onboarding_api.types';
import type { ImprintInterviewState, TurnFeedback } from './imprint_interview_types';

const RESOLVED_STATUSES = new Set(['answered', 'declined', 'not_applicable']);

function emptySlots(): Record<OnboardingSlotKey, OnboardingSlotView> {
  const slots = {} as Record<OnboardingSlotKey, OnboardingSlotView>;
  for (const key of ONBOARDING_SLOT_KEYS) {
    slots[key] = { status: 'unanswered', value: null, confidence: null, revision: 0 };
  }
  return slots;
}

export function countResolved(slots: Record<OnboardingSlotKey, OnboardingSlotView>): number {
  return ONBOARDING_SLOT_KEYS.filter((key) => RESOLVED_STATUSES.has(slots[key].status)).length;
}

export function useImprintInterview(): ImprintInterviewState {
  const [interview, setInterview] = useState<OnboardingInterviewView | null>(null);
  const [slots, setSlots] = useState<Record<OnboardingSlotKey, OnboardingSlotView>>(emptySlots);
  const [messages, setMessages] = useState<OnboardingMessageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<TurnFeedback>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const status = await onboardingAPI.getInterview();
      if (!mountedRef.current) return;

      if (status.interview === null) {
        const started = await onboardingAPI.startInterview();
        if (!mountedRef.current) return;
        if (started.kind === 'already_finished') {
          setFeedback('already_finished');
          return;
        }
        setInterview(started.data.interview);
        setSlots(started.data.slots);
        setMessages(started.data.messages);
      } else {
        setInterview(status.interview);
        setSlots(status.slots);
        setMessages(status.messages);
      }
      setFeedback(null);
    } catch {
      if (mountedRef.current) setFeedback('unavailable');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The user's text is appended optimistically and kept on every non-success
   * path: a conflict, an in-flight duplicate and an extractor outage are all
   * recoverable, and discarding what someone just typed to re-ask a question
   * is the fastest way to make an interview feel hostile.
   */
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || interview === null || sending) return;

      const clientTurnId = crypto.randomUUID();
      const optimistic: OnboardingMessageView = {
        id: clientTurnId,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimistic]);
      setSending(true);
      setFeedback(null);

      try {
        const outcome = await onboardingAPI.sendTurn({
          message: trimmed,
          clientTurnId,
          expectedStateVersion: interview.stateVersion,
        });

        if (!mountedRef.current) return;

        if (outcome.kind === 'conflict') {
          await load();
          if (mountedRef.current) setFeedback('conflict');
          return;
        }
        if (outcome.kind === 'in_flight') {
          setFeedback('in_flight');
          return;
        }
        if (outcome.kind === 'unavailable') {
          setFeedback('unavailable');
          return;
        }

        setInterview(outcome.data.interview);
        setSlots(outcome.data.slots);
        setMessages((prev) => [
          ...prev,
          {
            id: outcome.data.reply.id,
            role: 'assistant',
            content: outcome.data.reply.content,
            createdAt: new Date().toISOString(),
          },
        ]);
      } catch {
        if (mountedRef.current) setFeedback('unavailable');
      } finally {
        if (mountedRef.current) setSending(false);
      }
    },
    [interview, load, sending]
  );

  /**
   * The local state must NOT settle unless the server recorded the skip:
   * hiding onboarding on a failed request makes it silently reappear on the
   * next reload, because nothing was ever persisted.
   */
  const skip = useCallback(async (onSettled: () => void) => {
    try {
      await onboardingAPI.skip();
      if (mountedRef.current) setFeedback(null);
      onSettled();
    } catch {
      if (mountedRef.current) setFeedback('skip_failed');
    }
  }, []);

  const correctSlot = useCallback(
    async (slotKey: OnboardingSlotKey, value: string, status: 'answered' | 'declined') => {
      try {
        const updated = await onboardingAPI.updateSlot(slotKey, {
          value: status === 'answered' ? value : null,
          status,
        });
        if (!mountedRef.current) return;
        setInterview(updated.interview);
        setSlots(updated.slots);
      } catch {
        if (mountedRef.current) setFeedback('unavailable');
      }
    },
    []
  );

  return {
    interview,
    slots,
    messages,
    loading,
    sending,
    feedback,
    resolvedCount: countResolved(slots),
    totalSlots: ONBOARDING_SLOT_KEYS.length,
    send,
    correctSlot,
    skip,
    reload: load,
  };
}
