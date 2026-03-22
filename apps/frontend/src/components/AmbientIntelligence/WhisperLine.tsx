'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhisperLineProps {
  message: string;
  context?: string;
  relevanceScore?: number;
  onDismiss?: () => void;
  position?: 'top' | 'bottom';
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BAR_HEIGHT = 28;
const ANIMATION_DURATION = 0.3;

const COLORS = {
  text: 'oklch(80% 0.02 264)',
  bg: 'oklch(20% 0.01 264 / 0.6)',
  contextText: 'oklch(65% 0.02 264)',
  sparkle: 'oklch(75% 0.12 85)',
  dismissHover: 'oklch(60% 0.02 264)',
  dismiss: 'oklch(50% 0.02 264)',
} as const;

// ---------------------------------------------------------------------------
// Sparkle icon (inline SVG to avoid icon library dep)
// ---------------------------------------------------------------------------

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 0l1.5 5.5L15 7l-5.5 1.5L8 14l-1.5-5.5L1 7l5.5-1.5z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component: WhisperLine
// ---------------------------------------------------------------------------

export function WhisperLine({
  message,
  context,
  relevanceScore,
  onDismiss,
  position = 'top',
  className,
}: WhisperLineProps) {
  const [visible, setVisible] = useState(true);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    onDismiss?.();
  }, [onDismiss]);

  const isTop = position === 'top';
  const slideOrigin = isTop ? -BAR_HEIGHT : BAR_HEIGHT;
  const relevancePercent =
    relevanceScore !== undefined ? Math.round(relevanceScore * 100) : null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={[
            'relative z-10 flex w-full items-center gap-2 px-3',
            'select-none overflow-hidden',
            isTop ? 'rounded-t-md' : 'rounded-b-md',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            height: BAR_HEIGHT,
            backgroundColor: COLORS.bg,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
          initial={{ y: slideOrigin, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: slideOrigin, opacity: 0 }}
          transition={{ duration: ANIMATION_DURATION, ease: [0.16, 1, 0.3, 1] }}
          role="status"
          aria-live="polite"
        >
          {/* Relevance sparkle + percentage */}
          {relevancePercent !== null && (
            <span
              className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold tabular-nums"
              style={{ color: COLORS.sparkle }}
            >
              <SparkleIcon className="opacity-80" />
              {relevancePercent}%
            </span>
          )}

          {/* Message text */}
          <span
            className="flex-1 truncate text-xs font-medium"
            style={{ color: COLORS.text }}
          >
            {message}
          </span>

          {/* Optional context */}
          {context && (
            <span
              className="hidden shrink-0 truncate text-[10px] sm:inline"
              style={{ color: COLORS.contextText }}
            >
              {context}
            </span>
          )}

          {/* Dismiss button */}
          <button
            type="button"
            onClick={handleDismiss}
            className="ml-1 shrink-0 rounded p-0.5 transition-colors"
            style={{ color: COLORS.dismiss }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = COLORS.dismissHover;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = COLORS.dismiss;
            }}
            aria-label="Dismiss explanation"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden
            >
              <line x1="2" y1="2" x2="8" y2="8" />
              <line x1="8" y1="2" x2="2" y2="8" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
