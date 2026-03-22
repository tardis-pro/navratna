'use client';

import { useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, ChevronDown, ChevronRight, Tag } from 'lucide-react';
import type { ConstellationHealth, ConstellationItem } from '@uaip/types';
import type { BlockVisibility } from '@/components/MaterializableBlock/MaterializableBlock.types';
import { MicroexpressionIndicator } from '@/components/Microexpression/Microexpression';
import { useKnowledgeMicroexpression } from '@/hooks/useKnowledgeMicroexpression';
import { cn } from '@/lib/utils';
import type { ConstellationBlockData } from './TelescopeSurface.types';

export interface ConstellationNodeProps {
  block: ConstellationBlockData;
  visibility: BlockVisibility;
  onClick?: (id: string) => void;
  onExpand?: (id: string) => void;
  className?: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const SPRING_TRANSITION = { type: 'spring' as const, damping: 25, stiffness: 120 };

const MAX_VISIBLE_TAGS = 4;

const HEALTH_COLORS: Record<
  ConstellationHealth,
  { bg: string; border: string; accent: string; glow: string }
> = {
  stable: {
    bg: 'oklch(20% 0.02 264 / 0.85)',
    border: 'oklch(50% 0.04 264 / 0.5)',
    accent: 'oklch(65% 0.06 264)',
    glow: 'oklch(55% 0.04 264 / 0.15)',
  },
  active: {
    bg: 'oklch(20% 0.03 250 / 0.85)',
    border: 'oklch(55% 0.18 250 / 0.5)',
    accent: 'oklch(65% 0.2 250)',
    glow: 'oklch(55% 0.18 250 / 0.2)',
  },
  processing: {
    bg: 'oklch(20% 0.03 290 / 0.85)',
    border: 'oklch(58% 0.18 290 / 0.5)',
    accent: 'oklch(65% 0.2 290)',
    glow: 'oklch(60% 0.18 290 / 0.25)',
  },
  conflicted: {
    bg: 'oklch(20% 0.03 25 / 0.85)',
    border: 'oklch(52% 0.2 25 / 0.5)',
    accent: 'oklch(60% 0.22 25)',
    glow: 'oklch(55% 0.2 25 / 0.25)',
  },
  ambiguous: {
    bg: 'oklch(20% 0.03 75 / 0.85)',
    border: 'oklch(65% 0.16 75 / 0.5)',
    accent: 'oklch(72% 0.18 75)',
    glow: 'oklch(68% 0.16 75 / 0.2)',
  },
  validated: {
    bg: 'oklch(20% 0.03 145 / 0.85)',
    border: 'oklch(55% 0.16 145 / 0.5)',
    accent: 'oklch(65% 0.18 145)',
    glow: 'oklch(58% 0.16 145 / 0.2)',
  },
  stale: {
    bg: 'oklch(18% 0.02 50 / 0.85)',
    border: 'oklch(55% 0.12 50 / 0.4)',
    accent: 'oklch(65% 0.14 50)',
    glow: 'oklch(58% 0.12 50 / 0.1)',
  },
};

// ─── Helpers ────────────────────────────────────────────────────────

function getRelevanceScale(relevanceScore: number): number {
  return 0.3 + relevanceScore * 1.2;
}

function getRelevanceBlur(relevanceScore: number): number {
  return (1 - relevanceScore) * 4;
}

function getVisibilityOpacity(visibility: BlockVisibility): number {
  switch (visibility) {
    case 'visible':
      return 1;
    case 'faded':
      return 0.4;
    case 'hidden':
      return 0;
  }
}

// ─── Sub-components ─────────────────────────────────────────────────

interface ConstellationItemRowProps {
  item: ConstellationItem;
}

function ConstellationItemRow({ item }: ConstellationItemRowProps) {
  return (
    <div
      className="flex flex-col gap-0.5 px-3 py-2 rounded-lg"
      style={{
        backgroundColor: 'oklch(22% 0.01 264 / 0.6)',
      }}
    >
      <span className="text-xs font-medium truncate" style={{ color: 'oklch(85% 0.02 264)' }}>
        {item.title}
      </span>
      <span className="text-xs line-clamp-1" style={{ color: 'oklch(65% 0.02 264)' }}>
        {item.content}
      </span>
    </div>
  );
}

interface TagBadgeProps {
  label: string;
}

function TagBadge({ label }: TagBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs"
      style={{
        backgroundColor: 'oklch(25% 0.02 264 / 0.7)',
        color: 'oklch(72% 0.04 264)',
      }}
    >
      <Tag className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function ConstellationNode({
  block,
  visibility,
  onClick,
  onExpand,
  className,
}: ConstellationNodeProps) {
  const {
    constellationId,
    constellationName,
    itemCount,
    health,
    tags,
    isExpanded,
    items,
    description,
  } = block.metadata;

  const relevanceScore = block.relevanceScore;

  // Determine if there are conflicts based on health
  const hasConflicts = health === 'conflicted';
  const isProcessing = health === 'processing';

  const { expression, label: expressionLabel } = useKnowledgeMicroexpression({
    health,
    relevanceScore,
    isProcessing,
    hasConflicts,
  });

  const healthColors = useMemo(() => HEALTH_COLORS[health], [health]);

  const scale = useMemo(() => getRelevanceScale(relevanceScore), [relevanceScore]);
  const blur = useMemo(() => getRelevanceBlur(relevanceScore), [relevanceScore]);
  const opacity = useMemo(() => getVisibilityOpacity(visibility), [visibility]);

  const relevancePercent = useMemo(() => Math.round(relevanceScore * 100), [relevanceScore]);

  const visibleTags = useMemo(() => tags.slice(0, MAX_VISIBLE_TAGS), [tags]);
  const overflowTagCount = useMemo(() => Math.max(0, tags.length - MAX_VISIBLE_TAGS), [tags]);

  const handleClick = useCallback(() => {
    onClick?.(constellationId);
  }, [onClick, constellationId]);

  const handleExpand = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onExpand?.(constellationId);
    },
    [onExpand, constellationId]
  );

  // Hidden blocks return null
  if (visibility === 'hidden') {
    return null;
  }

  return (
    <motion.div
      layout
      // Entry: crystallize (blur -> sharp)
      initial={{
        opacity: 0,
        scale: scale * 0.8,
        filter: `blur(8px)`,
      }}
      // Animate to current state
      animate={{
        opacity,
        scale,
        filter: `blur(${blur}px)`,
      }}
      // Exit: dissolve (sharp -> blur -> gone)
      exit={{
        opacity: 0,
        scale: scale * 0.6,
        filter: `blur(12px)`,
      }}
      transition={SPRING_TRANSITION}
      onClick={handleClick}
      className={cn(
        'relative flex flex-col rounded-xl border-2 cursor-pointer overflow-hidden',
        'w-72 select-none',
        className
      )}
      style={{
        backgroundColor: healthColors.bg,
        borderColor: healthColors.border,
        boxShadow: `0 0 16px ${healthColors.glow}`,
        transformOrigin: 'center center',
      }}
      role="article"
      aria-label={`Constellation: ${constellationName}`}
      tabIndex={0}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{
          borderBottom: `1px solid oklch(30% 0.02 264 / 0.5)`,
        }}
      >
        <MicroexpressionIndicator expression={expression} size="sm" />

        <Layers className="w-4 h-4 flex-shrink-0" style={{ color: healthColors.accent }} />

        <span
          className="text-sm font-semibold truncate flex-1"
          style={{ color: 'oklch(90% 0.02 264)' }}
        >
          {constellationName}
        </span>

        {/* Relevance badge */}
        <span
          className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium"
          style={{
            backgroundColor: 'oklch(30% 0.03 264 / 0.8)',
            color: healthColors.accent,
          }}
        >
          {relevancePercent}%
        </span>

        {/* Item count */}
        <span
          className="flex-shrink-0 text-xs tabular-nums"
          style={{ color: 'oklch(60% 0.02 264)' }}
        >
          {itemCount}
        </span>
      </div>

      {/* ── Description ────────────────────────────────────────── */}
      <div className="px-3 pt-2 pb-1.5">
        <p
          className="text-xs leading-relaxed line-clamp-2"
          style={{ color: 'oklch(72% 0.02 264)' }}
        >
          {description}
        </p>
      </div>

      {/* ── Tags ───────────────────────────────────────────────── */}
      {visibleTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
          {visibleTags.map((tag) => (
            <TagBadge key={tag} label={tag} />
          ))}
          {overflowTagCount > 0 && (
            <span className="text-xs px-1.5" style={{ color: 'oklch(58% 0.02 264)' }}>
              +{overflowTagCount}
            </span>
          )}
        </div>
      )}

      {/* ── Expand/Collapse Toggle ─────────────────────────────── */}
      {items.length > 0 && (
        <div className="px-3 pb-1.5">
          <button
            type="button"
            onClick={handleExpand}
            className="flex items-center gap-1.5 text-xs font-medium rounded-md px-2 py-1 transition-colors"
            style={{
              color: healthColors.accent,
              backgroundColor: 'oklch(24% 0.02 264 / 0.5)',
            }}
            aria-expanded={isExpanded}
            aria-controls={`constellation-items-${constellationId}`}
          >
            <motion.span
              animate={{ rotate: isExpanded ? 0 : 0 }}
              transition={SPRING_TRANSITION}
              className="flex items-center"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </motion.span>
            {isExpanded ? 'Collapse' : 'Expand'} items
          </button>
        </div>
      )}

      {/* ── Expanded Items List ─────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {isExpanded && items.length > 0 && (
          <motion.div
            key="items-panel"
            id={`constellation-items-${constellationId}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_TRANSITION}
            className="overflow-hidden"
          >
            <div
              className="flex flex-col gap-1.5 px-3 pb-3 pt-1 max-h-48 overflow-y-auto"
              style={{
                borderTop: `1px solid oklch(30% 0.02 264 / 0.3)`,
              }}
            >
              {items.map((item) => (
                <ConstellationItemRow key={item.id} item={item} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Expression Label ───────────────────────────────────── */}
      <div className="flex justify-end px-3 pb-2">
        <span className="text-[0.625rem] italic" style={{ color: 'oklch(50% 0.02 264 / 0.7)' }}>
          {expressionLabel}
        </span>
      </div>
    </motion.div>
  );
}

export default ConstellationNode;
