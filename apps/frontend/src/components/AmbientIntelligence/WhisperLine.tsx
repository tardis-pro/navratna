'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DismissXIcon } from '@/components/ui/DismissXIcon';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelevanceFactor {
  label: string;
  score: number;
}

export interface BlockSummary {
  id: string;
  title: string;
  visible: boolean;
  reason: string;
}

export interface WhisperLineProps {
  message: string;
  context?: string;
  relevanceScore?: number;
  /** Breakdown of relevance factors shown on drill-down */
  relevanceFactors?: RelevanceFactor[];
  /** All blocks (visible and hidden) for the debug panel */
  blockSummaries?: BlockSummary[];
  /** Callback when user manually surfaces a hidden block */
  onSurfaceBlock?: (blockId: string) => void;
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
  expandBg: 'oklch(16% 0.01 264 / 0.95)',
  expandBorder: 'oklch(28% 0.02 264)',
  factorBar: 'oklch(65% 0.12 250)',
  factorBarBg: 'oklch(25% 0.01 264)',
  visibleDot: 'oklch(75% 0.15 150)',
  hiddenDot: 'oklch(50% 0.02 264)',
  surfaceBtn: 'oklch(70% 0.12 250)',
} as const;

const DEFAULT_RELEVANCE_FACTORS: RelevanceFactor[] = [
  { label: 'Intent match', score: 0 },
  { label: 'Recent usage', score: 0 },
  { label: 'Agent recommendation', score: 0 },
  { label: 'Workflow priority', score: 0 },
];

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

function QuestionIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 12.5a.75.75 0 110-1.5.75.75 0 010 1.5zm.75-3.5v.5a.75.75 0 01-1.5 0v-1a.75.75 0 01.75-.75c.69 0 1.25-.56 1.25-1.25S8.69 6.25 8 6.25 6.75 6.81 6.75 7.5a.75.75 0 01-1.5 0A2.75 2.75 0 118 10z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Relevance Factors Panel
// ---------------------------------------------------------------------------

function RelevanceFactorsPanel({ factors }: { factors: RelevanceFactor[] }) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      {factors.map((factor) => {
        const pct = Math.round(factor.score * 100);
        return (
          <div key={factor.label} className="flex items-center gap-2">
            <span
              className="w-[120px] shrink-0 text-[10px] font-medium truncate"
              style={{ color: COLORS.contextText }}
            >
              {factor.label}
            </span>
            <div
              className="flex-1 h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: COLORS.factorBarBg }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: COLORS.factorBar,
                }}
              />
            </div>
            <span
              className="w-8 shrink-0 text-right text-[10px] font-semibold tabular-nums"
              style={{ color: COLORS.sparkle }}
            >
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block Visibility Panel (opened via "?" button)
// ---------------------------------------------------------------------------

function BlockVisibilityPanel({
  blocks,
  onSurfaceBlock,
  onClose,
}: {
  blocks: BlockSummary[];
  onSurfaceBlock?: (id: string) => void;
  onClose: () => void;
}) {
  const visibleBlocks = blocks.filter((b) => b.visible);
  const hiddenBlocks = blocks.filter((b) => !b.visible);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2 }}
      className="px-3 py-2"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: COLORS.contextText }}>
          Surface Visibility
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 transition-colors"
          style={{ color: COLORS.dismiss }}
          onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.dismissHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.dismiss; }}
          aria-label="Close visibility panel"
        >
          <DismissXIcon size={8} />
        </button>
      </div>

      {visibleBlocks.length > 0 && (
        <div className="mb-2">
          <span className="text-[9px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: COLORS.visibleDot }}>
            Visible ({visibleBlocks.length})
          </span>
          {visibleBlocks.map((b) => (
            <div key={b.id} className="flex items-center gap-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COLORS.visibleDot }} />
              <span className="text-[10px] font-medium truncate" style={{ color: COLORS.text }}>
                {b.title}
              </span>
              <span className="text-[9px] truncate ml-auto" style={{ color: COLORS.contextText }}>
                {b.reason}
              </span>
            </div>
          ))}
        </div>
      )}

      {hiddenBlocks.length > 0 && (
        <div>
          <span className="text-[9px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: COLORS.hiddenDot }}>
            Hidden ({hiddenBlocks.length})
          </span>
          {hiddenBlocks.map((b) => (
            <div key={b.id} className="flex items-center gap-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COLORS.hiddenDot }} />
              <span className="text-[10px] font-medium truncate" style={{ color: COLORS.contextText }}>
                {b.title}
              </span>
              <span className="text-[9px] truncate" style={{ color: COLORS.contextText }}>
                {b.reason}
              </span>
              {onSurfaceBlock && (
                <button
                  type="button"
                  onClick={() => onSurfaceBlock(b.id)}
                  className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold transition-colors hover:brightness-110"
                  style={{
                    color: COLORS.surfaceBtn,
                    border: `1px solid ${COLORS.surfaceBtn}`,
                  }}
                >
                  Surface
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {blocks.length === 0 && (
        <p className="text-[10px]" style={{ color: COLORS.contextText }}>
          No block data available.
        </p>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Component: WhisperLine
// ---------------------------------------------------------------------------

export function WhisperLine({
  message,
  context,
  relevanceScore,
  relevanceFactors,
  blockSummaries,
  onSurfaceBlock,
  onDismiss,
  position = 'top',
  className,
}: WhisperLineProps) {
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showVisibilityPanel, setShowVisibilityPanel] = useState(false);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    onDismiss?.();
  }, [onDismiss]);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
    // Close visibility panel when collapsing
    if (expanded) setShowVisibilityPanel(false);
  }, [expanded]);

  const toggleVisibilityPanel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowVisibilityPanel((prev) => !prev);
  }, []);

  const isTop = position === 'top';
  const slideOrigin = isTop ? -BAR_HEIGHT : BAR_HEIGHT;
  const relevancePercent = relevanceScore !== undefined ? Math.round(relevanceScore * 100) : null;

  const factors = relevanceFactors ?? DEFAULT_RELEVANCE_FACTORS;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={[
            'relative z-10 flex w-full flex-col',
            'select-none overflow-hidden',
            isTop ? 'rounded-t-md' : 'rounded-b-md',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
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
          {/* Main 28px bar */}
          <div
            className="flex w-full items-center gap-2 px-3"
            style={{ height: BAR_HEIGHT }}
          >
            {/* Relevance sparkle + percentage (clickable) */}
            {relevancePercent !== null && (
              <button
                type="button"
                onClick={toggleExpanded}
                className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold tabular-nums rounded px-1 -mx-1 transition-colors hover:bg-white/5"
                style={{ color: COLORS.sparkle }}
                aria-label={`${relevancePercent}% relevance — click to ${expanded ? 'collapse' : 'expand'} details`}
                aria-expanded={expanded}
              >
                <SparkleIcon className="opacity-80" />
                {relevancePercent}%
              </button>
            )}

            {/* Message text */}
            <span className="flex-1 truncate text-xs font-medium" style={{ color: COLORS.text }}>
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

            {/* "?" button for visibility panel */}
            {blockSummaries && blockSummaries.length > 0 && (
              <button
                type="button"
                onClick={toggleVisibilityPanel}
                className="shrink-0 rounded p-0.5 transition-colors"
                style={{ color: showVisibilityPanel ? COLORS.sparkle : COLORS.dismiss }}
                onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.sparkle; }}
                onMouseLeave={(e) => {
                  if (!showVisibilityPanel) e.currentTarget.style.color = COLORS.dismiss;
                }}
                aria-label="Show block visibility details"
                aria-expanded={showVisibilityPanel}
              >
                <QuestionIcon />
              </button>
            )}

            {/* Dismiss button */}
            <button
              type="button"
              onClick={handleDismiss}
              className="ml-1 shrink-0 rounded p-0.5 transition-colors"
              style={{ color: COLORS.dismiss }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = COLORS.dismissHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = COLORS.dismiss;
              }}
              aria-label="Dismiss explanation"
            >
              <DismissXIcon />
            </button>
          </div>

          {/* Expanded relevance factors (below the bar) */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
                style={{
                  borderTop: `1px solid ${COLORS.expandBorder}`,
                  backgroundColor: COLORS.expandBg,
                }}
              >
                <RelevanceFactorsPanel factors={factors} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Block visibility panel (below the bar or factors) */}
          <AnimatePresence>
            {showVisibilityPanel && blockSummaries && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
                style={{
                  borderTop: `1px solid ${COLORS.expandBorder}`,
                  backgroundColor: COLORS.expandBg,
                }}
              >
                <BlockVisibilityPanel
                  blocks={blockSummaries}
                  onSurfaceBlock={onSurfaceBlock}
                  onClose={() => setShowVisibilityPanel(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
