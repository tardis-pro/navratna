'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { Bot, Layers, FileCode, MessageSquare, ListTodo, Telescope, Workflow, ArrowLeft } from 'lucide-react';
import { WorkflowBlockRenderer } from '@/components/WorkflowBlockRenderer';
import type { BlockDisplayType, FieldProjection, ActionProjection } from '@uaip/types';
import type {
  MaterializableBlockData,
  MaterializableBlockType,
  BlockVisibility,
} from '@/components/MaterializableBlock/materializable_block_types';
import {
  BLOCK_TYPE_COLORS,
  getExpressionColor,
} from '@/components/MaterializableBlock/materializable_block_styles';
import { MaterializableBlock } from '@/components/MaterializableBlock';
import { renderPortalContent } from './portal-escape-hatches';
import { cn } from '@/lib/utils';
import { AttentionBudget } from '@/components/AttentionBudget/AttentionBudget';
import { CrystallizationEffect } from '@/components/PredictiveIntent/CrystallizationEffect';
import { MorningFog } from '@/components/AmbientIntelligence/MorningFog';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_VISIBLE_BLOCKS = 10;
const RELEVANCE_HIDDEN_THRESHOLD = 0.2;
const RELEVANCE_FADED_THRESHOLD = 0.5;

/** A block explicitly surfaced via intent is pinned — it bypasses the attention budget. */
function isPinned(block: MaterializableBlockData): boolean {
  return block.metadata?.pinned === true;
}

const BLOCK_TYPE_ICONS: Record<MaterializableBlockType, React.ReactNode> = {
  agent: <Bot className="w-4 h-4" />,
  portal: <Layers className="w-4 h-4" />,
  artifact: <FileCode className="w-4 h-4" />,
  discussion: <MessageSquare className="w-4 h-4" />,
  task: <ListTodo className="w-4 h-4" />,
  workflow: <Workflow className="w-4 h-4" />,
};

const BLOCK_TYPE_LABELS: Record<MaterializableBlockType, string> = {
  agent: 'Agent',
  portal: 'Portal',
  artifact: 'Artifact',
  discussion: 'Discussion',
  task: 'Task',
  workflow: 'Workflow',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveVisibility(
  relevanceScore: number,
  index: number,
  maxVisible: number
): BlockVisibility {
  if (index >= maxVisible) return 'hidden';
  if (relevanceScore < RELEVANCE_HIDDEN_THRESHOLD) return 'hidden';
  if (relevanceScore < RELEVANCE_FADED_THRESHOLD) return 'faded';
  return 'visible';
}

function sortByRelevance(blocks: MaterializableBlockData[]): MaterializableBlockData[] {
  return [...blocks].sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// ---------------------------------------------------------------------------
// useTelescopeSurface hook
// ---------------------------------------------------------------------------

export interface UseTelescopeSurfaceReturn {
  blocks: MaterializableBlockData[];
  addBlock: (data: MaterializableBlockData) => void;
  removeBlock: (id: string) => void;
  updateRelevance: (id: string, score: number) => void;
  /** Pin a block so it is always visible regardless of the attention budget. */
  pinBlock: (id: string) => void;
  /** Merge in newly-materialized blocks (dedupe by id, preserving existing state). */
  mergeBlocks: (incoming: MaterializableBlockData[]) => void;
  visibleCount: number;
  isAtCapacity: boolean;
}

export function useTelescopeSurface(
  initialBlocks: MaterializableBlockData[] = [],
  maxVisibleBlocks: number = DEFAULT_MAX_VISIBLE_BLOCKS
): UseTelescopeSurfaceReturn {
  const [blocks, setBlocks] = useState<MaterializableBlockData[]>(() =>
    applyVisibilityRules(sortByRelevance(initialBlocks), maxVisibleBlocks)
  );

  const maxVisibleRef = useRef(maxVisibleBlocks);
  maxVisibleRef.current = maxVisibleBlocks;

  const applyRules = useCallback(
    (raw: MaterializableBlockData[]): MaterializableBlockData[] =>
      applyVisibilityRules(sortByRelevance(raw), maxVisibleRef.current),
    []
  );

  const addBlock = useCallback(
    (data: MaterializableBlockData) => {
      setBlocks((prev) => {
        // Prevent duplicates
        if (prev.some((b) => b.id === data.id)) return prev;
        return applyRules([...prev, data]);
      });
    },
    [applyRules]
  );

  const removeBlock = useCallback(
    (id: string) => {
      setBlocks((prev) => applyRules(prev.filter((b) => b.id !== id)));
    },
    [applyRules]
  );

  const updateRelevance = useCallback(
    (id: string, score: number) => {
      const clamped = Math.max(0, Math.min(1, score));
      setBlocks((prev) =>
        applyRules(prev.map((b) => (b.id === id ? { ...b, relevanceScore: clamped } : b)))
      );
    },
    [applyRules]
  );

  const pinBlock = useCallback(
    (id: string) => {
      setBlocks((prev) =>
        applyRules(
          prev.map((b) =>
            b.id === id ? { ...b, metadata: { ...b.metadata, pinned: true } } : b
          )
        )
      );
    },
    [applyRules]
  );

  const mergeBlocks = useCallback(
    (incoming: MaterializableBlockData[]) => {
      setBlocks((prev) => {
        const existingIds = new Set(prev.map((b) => b.id));
        const additions = incoming.filter((b) => !existingIds.has(b.id));
        // No new blocks → return prev unchanged to avoid needless re-renders
        // (important: this runs on a 30s refresh interval).
        if (additions.length === 0) return prev;
        return applyRules([...prev, ...additions]);
      });
    },
    [applyRules]
  );

  const visibleCount = useMemo(
    () => blocks.filter((b) => b.visibility !== 'hidden').length,
    [blocks]
  );

  const isAtCapacity = visibleCount >= maxVisibleBlocks;

  return {
    blocks,
    addBlock,
    removeBlock,
    updateRelevance,
    pinBlock,
    mergeBlocks,
    visibleCount,
    isAtCapacity,
  };
}

function applyVisibilityRules(
  sorted: MaterializableBlockData[],
  maxVisible: number
): MaterializableBlockData[] {
  // Pinned blocks (intent-materialized) are always visible and do NOT consume
  // the attention budget. Only non-pinned blocks are counted against maxVisible,
  // preserving the ambient "most relevant float up" behaviour for everything else.
  let budgetIndex = 0;
  return sorted.map((block) => {
    if (isPinned(block)) {
      return { ...block, visibility: 'visible' as BlockVisibility };
    }
    const visibility = deriveVisibility(block.relevanceScore, budgetIndex, maxVisible);
    budgetIndex += 1;
    return { ...block, visibility };
  });
}

// ---------------------------------------------------------------------------
// CosmicBackground component
// ---------------------------------------------------------------------------

const CosmicBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* Single subtle ambient glow — calm, content-first backdrop */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[var(--color-llama1)] opacity-[0.03] blur-[120px]" />
    </div>
  );
};

// ---------------------------------------------------------------------------
// TelescopeBlock sub-component
// ---------------------------------------------------------------------------

interface TelescopeBlockProps {
  block: MaterializableBlockData;
  onClick?: (id: string) => void;
  isTopRanked?: boolean;
}

function TelescopeBlock({ block, onClick, isTopRanked = false }: TelescopeBlockProps) {
  const typeColors = BLOCK_TYPE_COLORS[block.type];
  const expressionColor = getExpressionColor(block.expression);
  const relevancePercent = Math.round(block.relevanceScore * 100);

  const relevanceMotion = useMotionValue(block.relevanceScore);
  const springRelevance = useSpring(relevanceMotion, { stiffness: 120, damping: 20 });
  const relevanceOpacity = useTransform(
    springRelevance,
    [0, RELEVANCE_FADED_THRESHOLD, 1],
    [0.9, 0.95, 1]
  );

  useEffect(() => {
    relevanceMotion.set(block.relevanceScore);
  }, [block.relevanceScore, relevanceMotion]);

  const handleClick = useCallback(() => {
    onClick?.(block.id);
  }, [onClick, block.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(block.id);
      }
    },
    [onClick, block.id]
  );

  // Von Restorff effect for top ranked block
  const borderStyle = isTopRanked
    ? { borderColor: 'var(--color-accent)', boxShadow: '0 1px 3px oklch(0% 0 0 / 0.08), 0 1px 2px oklch(0% 0 0 / 0.06)' }
    : { borderColor: typeColors.border };

  const scaleBase = isTopRanked ? 1.02 : 1;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{
        scale: scaleBase,
        y: 0
      }}
      exit={{ opacity: 0, scale: 0.95, y: -20 }}
      style={{
        opacity: relevanceOpacity,
        backgroundColor: typeColors.bg,
        ...borderStyle
      }}
      whileHover={{ 
        scale: scaleBase + 0.02, 
        borderColor: typeColors.accent,
        boxShadow: `0 10px 30px -10px ${typeColors.accent}40`
      }}
      whileTap={{ scale: scaleBase - 0.02 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${BLOCK_TYPE_LABELS[block.type]} block: ${block.metadata?.title ?? block.id} — ${relevancePercent}% relevant`}
      className={cn(
        "relative flex flex-col gap-3 rounded-2xl border-2 p-5 cursor-pointer overflow-hidden",
        "min-h-[8rem]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      )}
    >
      {/* Type-based gradient header strip */}
      <div 
        className="absolute top-0 left-0 right-0 h-1 opacity-80"
        style={{ background: `linear-gradient(90deg, ${typeColors.accent}, transparent)` }}
      />

      {/* Header row: icon + title + relevance */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl shadow-inner"
            style={{ 
              backgroundColor: `color-mix(in oklch, ${typeColors.accent} 20%, transparent)`,
              color: typeColors.accent,
              border: `1px solid color-mix(in oklch, ${typeColors.accent} 40%, transparent)`
            }}
          >
            {BLOCK_TYPE_ICONS[block.type]}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-base font-semibold truncate text-foreground tracking-tight">
              {(typeof block.metadata?.title === 'string' ? block.metadata.title : null) ?? BLOCK_TYPE_LABELS[block.type]}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {block.id.split('-')[0]} • {BLOCK_TYPE_LABELS[block.type]}
            </span>
          </div>
        </div>

        {/* Microexpression indicator */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5 bg-background/40 px-2 py-1 rounded-full border border-border/50">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: expressionColor,
              }}
              title={`${block.expression} state`}
            />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {block.expression}
            </span>
          </div>
        </div>
      </div>

      {/* Metadata / Description (if available) */}
      {block.metadata?.description && (
        <p className="text-sm text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
          {String(block.metadata.description)}
        </p>
      )}

      <div className="flex-1" />

      {/* Relevance Progress Bar */}
      <div className="flex flex-col gap-1.5 mt-2">
        <div className="flex justify-between items-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>Relevance</span>
          <span style={{ color: isTopRanked ? 'var(--color-accent)' : typeColors.accent }}>{relevancePercent}%</span>
        </div>
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden border border-border/30">
          <motion.div
            className="h-full rounded-full"
            style={{
              backgroundColor: isTopRanked ? 'var(--color-accent)' : typeColors.accent,
            }}
            initial={{ width: 0 }}
            animate={{ width: `${relevancePercent}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// TelescopeSurface component
// ---------------------------------------------------------------------------

export interface TelescopeFocusTarget {
  id: string;
  nonce: number;
}

export interface TelescopeSurfaceProps {
  blocks: MaterializableBlockData[];
  onBlockSelect?: (id: string) => void;
  maxVisibleBlocks?: number;
  className?: string;
  /**
   * Request that a materialized block be scrolled into view and focused.
   * `nonce` retriggers the effect when the same block is selected again.
   */
  focusTarget?: TelescopeFocusTarget;
  focusedPortalId?: string | null;
  onFocusedPortalChange?: (blockId: string | null) => void;
}

export function TelescopeSurface({
  blocks,
  onBlockSelect,
  maxVisibleBlocks = DEFAULT_MAX_VISIBLE_BLOCKS,
  className,
  focusTarget,
  focusedPortalId,
  onFocusedPortalChange,
}: Omit<TelescopeSurfaceProps, 'onIntentSelect'>) {
  const containerRef = useRef<HTMLDivElement>(null);

  const processedBlocks = useMemo(() => {
    const sorted = sortByRelevance(blocks);
    return applyVisibilityRules(sorted, maxVisibleBlocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, maxVisibleBlocks]);

  const visibleBlocks = useMemo(
    () => processedBlocks.filter((b) => b.visibility !== 'hidden'),
    [processedBlocks]
  );

  const [crystallizedIds, setCrystallizedIds] = useState<Set<string>>(new Set());
  // A rich portal, when opened, takes over the surface in a focused view instead
  // of ballooning inline in the ambient grid. null = the constellation is showing.
  const [internalFocusedPortalId, setInternalFocusedPortalId] = useState<string | null>(null);
  const activeFocusedPortalId = focusedPortalId === undefined
    ? internalFocusedPortalId
    : focusedPortalId;

  const setFocusedPortal = useCallback(
    (blockId: string | null) => {
      if (focusedPortalId === undefined) {
        setInternalFocusedPortalId(blockId);
      }
      onFocusedPortalChange?.(blockId);
    },
    [focusedPortalId, onFocusedPortalChange]
  );

  const focusedBlock = useMemo(
    () => blocks.find((b) => b.id === activeFocusedPortalId) ?? null,
    [activeFocusedPortalId, blocks]
  );

  useEffect(() => {
    if (!activeFocusedPortalId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocusedPortal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeFocusedPortalId, setFocusedPortal]);

  // Scroll a freshly-materialized block into view and focus it, so an
  // intent selection visibly "opens" the capability rather than silently
  // re-ranking. Deferred to the next frame so the block has mounted.
  useEffect(() => {
    if (!focusTarget) return;
    const raf = requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector<HTMLElement>(
        `[data-block-id="${CSS.escape(focusTarget.id)}"]`
      );
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget?.id, focusTarget?.nonce]);

  useEffect(() => {
    const unclaimed = visibleBlocks.filter((b) => !crystallizedIds.has(b.id));
    if (unclaimed.length === 0) return;

    const timers = unclaimed.map((b, i) =>
      setTimeout(() => {
        setCrystallizedIds((prev) => new Set([...prev, b.id]));
      }, 100 + i * 150)
    );

    return () => timers.forEach(clearTimeout);
  }, [visibleBlocks, crystallizedIds]);

  const fogItems = useMemo(
    () =>
      visibleBlocks.map((b) => ({
        id: b.id,
        relevanceScore: b.relevanceScore,
        loaded: crystallizedIds.has(b.id),
      })),
    [visibleBlocks, crystallizedIds]
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full min-h-screen p-6 md:p-8 lg:p-12',
        'bg-background overflow-hidden',
        className
      )}
      role="region"
      aria-label="Telescope Surface — ambient block view"
    >
      <CosmicBackground />

      <AttentionBudget
        activeCount={visibleBlocks.length}
        maxBudget={maxVisibleBlocks}
        items={visibleBlocks.map((b) => ({
          id: b.id,
          label: (typeof b.metadata?.title === 'string' ? b.metadata.title : null) ?? b.id,
          type: b.type,
        }))}
        className="absolute top-4 right-4 z-20"
        position="right"
      />

      <div className="relative z-10 max-w-[1600px] mx-auto">
        <MorningFog items={fogItems} isActive={false} />

        <div className="grid gap-6 auto-rows-min grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {visibleBlocks.map((block, index) => {
                return (
                <motion.div
                  key={block.id}
                  data-block-id={block.id}
                  tabIndex={-1}
                  exit={{ opacity: 0, filter: 'blur(8px)', scale: 0.95 }}
                  transition={{ duration: 0.4 }}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-2xl"
                >
                  <CrystallizationEffect isLoading={!crystallizedIds.has(block.id)} duration={400}>
                    {block.type === 'portal' ? (
                      // Portals are full apps — show a compact ambient card here;
                      // opening it takes over the surface in the focused view.
                      <TelescopeBlock
                        block={block}
                        onClick={setFocusedPortal}
                        isTopRanked={index === 0 && block.relevanceScore > 0.8}
                      />
                    ) : block.type === 'workflow' ? (
                      <MaterializableBlock block={block}>
                        <WorkflowBlockRenderer
                          display={(block.metadata?.display as BlockDisplayType) ?? 'card'}
                          fields={block.metadata?.fields as FieldProjection[] | undefined}
                          actions={block.metadata?.actions as ActionProjection[] | undefined}
                          data={block.metadata?.data as Record<string, unknown> | undefined}
                          title={typeof block.metadata?.title === 'string' ? block.metadata.title : undefined}
                        />
                      </MaterializableBlock>
                    ) : (
                      <TelescopeBlock
                        block={block}
                        onClick={onBlockSelect}
                        isTopRanked={index === 0 && block.relevanceScore > 0.8}
                      />
                    )}
                  </CrystallizationEffect>
                </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
      </div>

      {/* Focused portal view — a rich portal takes over the surface, with a way back. */}
      <AnimatePresence>
        {focusedBlock && (
          <motion.div
            key="focused-portal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-50 flex flex-col bg-background/85 p-3 backdrop-blur-md md:p-6 lg:p-8"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setFocusedPortal(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-[1400px] mx-auto flex-1 min-h-0 flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
                <button
                  onClick={() => setFocusedPortal(null)}
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg px-2 py-1 -ml-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-label="Back to constellation"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <span className="text-base font-semibold text-foreground tracking-tight truncate">
                  {(typeof focusedBlock.metadata?.title === 'string' ? focusedBlock.metadata.title : null) ??
                    BLOCK_TYPE_LABELS[focusedBlock.type]}
                </span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">Esc to close</span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">{renderPortalContent(focusedBlock.id)}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {visibleBlocks.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-background/50 backdrop-blur-xl border border-border/50 flex items-center justify-center shadow-2xl relative">
              <Telescope className="w-10 h-10 text-muted-foreground" />
            </div>
          </div>
          <h3 className="mt-8 text-xl font-medium text-foreground tracking-tight">The constellation is quiet</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md text-center leading-relaxed">
            Agents and artifacts will surface here automatically as they become relevant to your current context.
          </p>
        </div>
      )}

    </div>
  );
}

export { TelescopeBlock };
export type { TelescopeBlockProps };
