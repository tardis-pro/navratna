'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Layers, FileCode, MessageSquare, ListTodo } from 'lucide-react';
import type {
  MaterializableBlockData,
  MaterializableBlockType,
  BlockVisibility,
} from '@/components/MaterializableBlock/MaterializableBlock.types';
import {
  BLOCK_TYPE_COLORS,
  getExpressionColor,
} from '@/components/MaterializableBlock/MaterializableBlock.styles';
import { EXPRESSION_ICONS } from '@/components/MaterializableBlock';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_VISIBLE_BLOCKS = 4;
const AUTO_REFRESH_INTERVAL_MS = 30_000;
const RELEVANCE_HIDDEN_THRESHOLD = 0.2;
const RELEVANCE_FADED_THRESHOLD = 0.5;

const BLOCK_TYPE_ICONS: Record<MaterializableBlockType, React.ReactNode> = {
  agent: <Bot className="w-4 h-4" />,
  portal: <Layers className="w-4 h-4" />,
  artifact: <FileCode className="w-4 h-4" />,
  discussion: <MessageSquare className="w-4 h-4" />,
  task: <ListTodo className="w-4 h-4" />,
};

const BLOCK_TYPE_LABELS: Record<MaterializableBlockType, string> = {
  agent: 'Agent',
  portal: 'Portal',
  artifact: 'Artifact',
  discussion: 'Discussion',
  task: 'Task',
};

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

export function isTelescopeEnabled(): boolean {
  if (typeof window !== 'undefined') {
    const localFlag = localStorage.getItem('telescope_enabled');
    if (localFlag === 'true') return true;
  }

  try {
    // Vite injects import.meta.env at build time
    return (
      (import.meta as unknown as Record<string, Record<string, string>>).env
        ?.VITE_TELESCOPE_ENABLED === 'true'
    );
  } catch {
    return false;
  }
}

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

  const visibleCount = useMemo(
    () => blocks.filter((b) => b.visibility !== 'hidden').length,
    [blocks]
  );

  const isAtCapacity = visibleCount >= maxVisibleBlocks;

  return { blocks, addBlock, removeBlock, updateRelevance, visibleCount, isAtCapacity };
}

function applyVisibilityRules(
  sorted: MaterializableBlockData[],
  maxVisible: number
): MaterializableBlockData[] {
  return sorted.map((block, index) => ({
    ...block,
    visibility: deriveVisibility(block.relevanceScore, index, maxVisible),
  }));
}

// ---------------------------------------------------------------------------
// TelescopeBlock sub-component
// ---------------------------------------------------------------------------

interface TelescopeBlockProps {
  block: MaterializableBlockData;
  onClick?: (id: string) => void;
}

function TelescopeBlock({ block, onClick }: TelescopeBlockProps) {
  const typeColors = BLOCK_TYPE_COLORS[block.type];
  const expressionColor = getExpressionColor(block.expression);
  const relevancePercent = Math.round(block.relevanceScore * 100);

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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{
        opacity: block.visibility === 'faded' ? 0.5 : 1,
        scale: 1,
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${BLOCK_TYPE_LABELS[block.type]} block: ${block.metadata?.title ?? block.id} — ${relevancePercent}% relevant`}
      className="relative flex flex-col gap-2 rounded-2xl border-2 p-4 cursor-pointer
                 backdrop-blur-md transition-shadow duration-300
                 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      style={{
        backgroundColor: typeColors.bg,
        borderColor: typeColors.border,
      }}
    >
      {/* Header row: icon + title + relevance */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md"
            style={{ color: typeColors.accent }}
          >
            {BLOCK_TYPE_ICONS[block.type]}
          </span>
          <span className="text-sm font-medium truncate" style={{ color: 'oklch(90% 0.02 264)' }}>
            {(block.metadata?.title as string) ?? BLOCK_TYPE_LABELS[block.type]}
          </span>
        </div>

        <span
          className="flex-shrink-0 text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'oklch(30% 0.02 264 / 0.6)',
            color: 'oklch(80% 0.02 264)',
          }}
        >
          {relevancePercent}%
        </span>
      </div>

      {/* Microexpression indicator dot */}
      <div className="flex items-center gap-1.5">
        <span
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: expressionColor,
            boxShadow: `0 0 6px ${expressionColor}`,
          }}
          title={`${block.expression} state`}
        />
        <span className="text-xs opacity-60" style={{ color: 'oklch(80% 0.02 264)' }}>
          {block.expression}
        </span>
        <span className="opacity-40" style={{ color: typeColors.accent }}>
          {EXPRESSION_ICONS[block.expression]}
        </span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// TelescopeSurface component
// ---------------------------------------------------------------------------

export interface TelescopeSurfaceProps {
  blocks: MaterializableBlockData[];
  onBlockSelect?: (id: string) => void;
  maxVisibleBlocks?: number;
  className?: string;
}

export function TelescopeSurface({
  blocks,
  onBlockSelect,
  maxVisibleBlocks = DEFAULT_MAX_VISIBLE_BLOCKS,
  className,
}: TelescopeSurfaceProps) {
  const arrangeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [_arrangeKey, setArrangeKey] = useState(0);

  // Sorted and visibility-applied blocks
  const processedBlocks = useMemo(() => {
    const sorted = sortByRelevance(blocks);
    return applyVisibilityRules(sorted, maxVisibleBlocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, maxVisibleBlocks]);

  const visibleBlocks = useMemo(
    () => processedBlocks.filter((b) => b.visibility !== 'hidden'),
    [processedBlocks]
  );

  // Auto-refresh arrangement every 30 seconds
  useEffect(() => {
    arrangeTimerRef.current = setInterval(() => {
      setArrangeKey((k) => k + 1);
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      if (arrangeTimerRef.current) {
        clearInterval(arrangeTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      className={[
        'relative w-full min-h-[200px] p-6',
        'grid gap-4 auto-rows-min',
        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label="Telescope Surface — ambient block view"
    >
      <AnimatePresence mode="popLayout">
        {visibleBlocks.map((block) => (
          <TelescopeBlock key={block.id} block={block} onClick={onBlockSelect} />
        ))}
      </AnimatePresence>

      {visibleBlocks.length === 0 && (
        <div
          className="col-span-full flex items-center justify-center py-12 text-sm opacity-40"
          style={{ color: 'oklch(70% 0.02 264)' }}
        >
          No blocks in view. Blocks will appear as they become relevant.
        </div>
      )}
    </div>
  );
}

export { TelescopeBlock };
export type { TelescopeBlockProps };
