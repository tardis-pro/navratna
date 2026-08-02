'use client';

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Pencil, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ONBOARDING_SLOT_KEYS } from '@/api/onboarding_api.types';
import type { OnboardingSlotKey } from '@/api/onboarding_api.types';
import { SLOT_LABELS } from './imprint_interview_types';
import type { ImprintReviewProps } from './imprint_interview_types';

export function ImprintReview({
  slots,
  onCorrect,
  onConfirm,
  confirming,
  className,
}: ImprintReviewProps) {
  const [editing, setEditing] = useState<OnboardingSlotKey | null>(null);
  const [draft, setDraft] = useState('');

  const beginEdit = useCallback(
    (key: OnboardingSlotKey) => {
      setEditing(key);
      setDraft(slots[key].value ?? '');
    },
    [slots]
  );

  const commit = useCallback(async () => {
    if (editing === null) return;
    const key = editing;
    const value = draft.trim();
    setEditing(null);
    await onCorrect(key, value, value.length === 0 ? 'declined' : 'answered');
  }, [draft, editing, onCorrect]);

  return (
    <div className={cn('mx-auto flex w-full max-w-2xl flex-col gap-6', className)}>
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Here&apos;s what I understood
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Correct anything I got wrong. This shapes which agents you get and how they work with you.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {ONBOARDING_SLOT_KEYS.map((key, index) => {
          const slot = slots[key];
          const isEditing = editing === key;
          const isEmpty = slot.value === null || slot.value.length === 0;

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, type: 'spring', stiffness: 140, damping: 20 }}
              className={cn(
                'group rounded-xl border p-4 backdrop-blur-xl transition-colors',
                isEditing ? 'border-primary/50 bg-primary/5' : 'border-white/10 bg-white/5'
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {SLOT_LABELS[key]}
                </span>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => beginEdit(key)}
                    aria-label={`Edit ${SLOT_LABELS[key]}`}
                    className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="mt-2 flex items-start gap-2">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={2}
                    autoFocus
                    className="flex-1 resize-none rounded-lg border border-white/10 bg-background/60 p-2 text-sm text-foreground outline-none focus:border-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() => void commit()}
                    aria-label="Save"
                    className="rounded-lg border border-green-500/30 bg-green-500/10 p-2 hover:bg-green-500/20"
                  >
                    <Check className="h-4 w-4 text-green-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    aria-label="Cancel"
                    className="rounded-lg border border-white/10 bg-white/5 p-2 hover:bg-white/10"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <p
                  className={cn(
                    'mt-1 text-sm',
                    isEmpty ? 'italic text-muted-foreground/60' : 'text-foreground'
                  )}
                >
                  {isEmpty ? 'Not answered' : slot.value}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onConfirm}
        disabled={confirming}
        className={cn(
          'flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-6 py-3',
          'text-sm font-medium text-foreground transition-colors hover:bg-primary/20',
          'disabled:cursor-not-allowed disabled:opacity-60'
        )}
      >
        <Sparkles className="h-4 w-4" />
        {confirming ? 'Bringing in your agents…' : 'Looks right — bring in my agents'}
      </button>
    </div>
  );
}
