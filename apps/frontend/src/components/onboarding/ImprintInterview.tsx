'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { onboardingAPI } from '@/api/onboarding_api';
import type { ProvisionedAgentView } from '@/api/onboarding_api.types';
import { useImprintInterview } from './use_imprint_interview';
import { ImprintReview } from './ImprintReview';
import type { ImprintInterviewProps } from './imprint_interview_types';

const TURN_SPRING = { type: 'spring' as const, stiffness: 140, damping: 20 };

const FEEDBACK_COPY: Record<string, string> = {
  conflict: 'That answer arrived after the question moved on — here it is again.',
  in_flight: 'Still thinking about your last answer.',
  unavailable: "I couldn't read that just now. Say it once more?",
  already_finished: "You've already been through this. Nothing left to ask.",
  skip_failed: "I couldn't record that. Try skipping again in a moment.",
};

export function ImprintInterview({ onComplete, onSkip, className }: ImprintInterviewProps) {
  const interview = useImprintInterview();
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [provisioned, setProvisioned] = useState<ProvisionedAgentView[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (container === null) return;
    container.scrollTop = container.scrollHeight;
  }, [interview.messages.length, interview.sending]);

  const submit = useCallback(async () => {
    const text = draft;
    setDraft('');
    await interview.send(text);
  }, [draft, interview]);

  const confirm = useCallback(async () => {
    setConfirming(true);
    try {
      const result = await onboardingAPI.complete();
      setProvisioned(result.provisionedAgents);
      window.setTimeout(onComplete, 2400);
    } catch {
      setConfirming(false);
    }
  }, [onComplete]);

  if (interview.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (provisioned !== null) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={TURN_SPRING}
        className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center"
      >
        <h2 className="text-xl font-semibold text-foreground">Your constellation is forming</h2>
        <div className="flex flex-col gap-2">
          {provisioned.map((agent, index) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.15, ...TURN_SPRING }}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left"
            >
              <p className="text-sm font-medium text-foreground">{agent.name}</p>
              <p className="text-xs text-muted-foreground">{agent.rationale}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  }

  if (interview.interview?.status === 'review') {
    return (
      <ImprintReview
        slots={interview.slots}
        onCorrect={interview.correctSlot}
        onConfirm={() => void confirm()}
        confirming={confirming}
        className={className}
      />
    );
  }

  return (
    <div className={cn('mx-auto flex h-full w-full max-w-2xl flex-col', className)}>
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-1 py-6">
        <AnimatePresence initial={false}>
          {interview.messages.map((message) => (
            <motion.div
              key={message.id}
              layout
              initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={TURN_SPRING}
              className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  message.role === 'user'
                    ? 'bg-primary/15 text-foreground'
                    : 'border border-white/10 bg-white/5 text-foreground'
                )}
              >
                {message.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {interview.sending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 px-1 text-xs text-muted-foreground"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            thinking
          </motion.div>
        )}

        {interview.feedback !== null && (
          <p className="px-1 text-xs text-amber-400/80">{FEEDBACK_COPY[interview.feedback]}</p>
        )}
      </div>

      <div className="flex flex-col gap-3 pb-6">
        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur-xl focus-within:border-primary/40">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            rows={1}
            placeholder="Answer in your own words…"
            aria-label="Your answer"
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={draft.trim().length === 0 || interview.sending}
            aria-label="Send answer"
            className={cn(
              'rounded-xl border border-primary/40 bg-primary/10 p-2 transition-colors hover:bg-primary/20',
              'disabled:cursor-not-allowed disabled:opacity-40'
            )}
          >
            <ArrowUp className="h-4 w-4 text-foreground" />
          </button>
        </div>

        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: interview.totalSlots }, (_, index) => (
              <motion.span
                key={index}
                animate={{
                  opacity: index < interview.resolvedCount ? 1 : 0.25,
                  scale: index < interview.resolvedCount ? 1 : 0.7,
                }}
                transition={TURN_SPRING}
                className="h-1 w-1 rounded-full bg-primary"
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => void interview.skip(onSkip)}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
