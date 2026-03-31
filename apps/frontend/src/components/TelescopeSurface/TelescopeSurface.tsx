'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { Bot, Layers, FileCode, MessageSquare, ListTodo, Telescope } from 'lucide-react';
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
import { renderPortalContent } from './portal_registry';
import { cn } from '@/lib/utils';
import { IntentField } from '@/components/IntentField/IntentField';
import type { IntentOption } from '@/components/IntentField/intent_field_types';
import { AttentionBudget } from '@/components/AttentionBudget/AttentionBudget';
import { WhisperLine } from '@/components/AmbientIntelligence/WhisperLine';

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
// CosmicBackground component
// ---------------------------------------------------------------------------

const CosmicBackground = () => {
  // Generate random stars
  const stars = useMemo(() => {
    return Array.from({ length: 100 }).map((_, i) => ({
      id: i,
      cx: `${Math.random() * 100}%`,
      cy: `${Math.random() * 100}%`,
      r: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.5 + 0.1,
      animationDuration: `${Math.random() * 3 + 2}s`,
      animationDelay: `${Math.random() * 2}s`,
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* Nebula Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[var(--color-llama1)] opacity-[0.03] blur-[120px] animate-pulse-glow" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[var(--color-llama2)] opacity-[0.03] blur-[100px] animate-pulse-glow" style={{ animationDelay: '2s' }} />
      
      {/* Starfield SVG */}
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {stars.map((star) => (
          <circle
            key={star.id}
            cx={star.cx}
            cy={star.cy}
            r={star.r}
            fill="currentColor"
            className="text-white animate-pulse-glow"
            style={{
              opacity: star.opacity,
              animationDuration: star.animationDuration,
              animationDelay: star.animationDelay,
            }}
          />
        ))}
      </svg>

      {/* Scanline overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.1)_51%)] bg-[length:100%_4px] opacity-20 pointer-events-none" />
      
      {/* Sweeping scan line */}
      <motion.div 
        className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--color-llama1)] to-transparent opacity-30"
        animate={{ y: ['0vh', '100vh'] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// ConstellationLines
// ---------------------------------------------------------------------------

interface BlockCenter {
  id: string;
  x: number;
  y: number;
  relevanceScore: number;
}

interface ConstellationLinesProps {
  centers: BlockCenter[];
  containerRef: React.RefObject<HTMLDivElement>;
}

const ConstellationLines = ({ centers, containerRef }: ConstellationLinesProps) => {
  if (centers.length < 2 || !containerRef.current) return null;

  const containerRect = containerRef.current.getBoundingClientRect();

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="constellation-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="oklch(65% 0.12 250)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="oklch(65% 0.12 290)" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {centers.map((a, i) => {
        const b = centers[i + 1];
        if (!b) return null;
        const x1 = a.x - containerRect.left;
        const y1 = a.y - containerRect.top;
        const x2 = b.x - containerRect.left;
        const y2 = b.y - containerRect.top;
        const strength = Math.sqrt(a.relevanceScore * b.relevanceScore);

        return (
          <motion.line
            key={`line-${a.id}-${b.id}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="url(#constellation-grad)"
            strokeWidth={strength * 1.5}
            strokeDasharray="5 4"
            initial={{ opacity: 0 }}
            animate={{ opacity: strength * 0.5 }}
            transition={{ duration: 1.2, delay: i * 0.15 }}
          />
        );
      })}
    </svg>
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
    [0.3, 0.65, 1]
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
    ? { borderColor: 'oklch(85% 0.15 85)', boxShadow: '0 0 15px oklch(85% 0.15 85 / 0.3), inset 0 0 20px oklch(85% 0.15 85 / 0.1)' }
    : { borderColor: typeColors.border };

  const scaleBase = isTopRanked ? 1.02 : 1;

  return (
    <motion.div
      layout
      layoutId={block.id}
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
        "backdrop-blur-xl min-h-[8rem]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
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
              {(block.metadata?.title as string) ?? BLOCK_TYPE_LABELS[block.type]}
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
              className="w-2 h-2 rounded-full animate-pulse"
              style={{
                backgroundColor: expressionColor,
                boxShadow: `0 0 8px ${expressionColor}`,
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
          {block.metadata.description as string}
        </p>
      )}

      <div className="flex-1" />

      {/* Relevance Progress Bar */}
      <div className="flex flex-col gap-1.5 mt-2">
        <div className="flex justify-between items-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>Relevance</span>
          <span style={{ color: isTopRanked ? 'oklch(85% 0.15 85)' : typeColors.accent }}>{relevancePercent}%</span>
        </div>
        <div className="h-1.5 w-full bg-background/50 rounded-full overflow-hidden border border-border/30">
          <motion.div 
            className="h-full rounded-full"
            style={{ 
              backgroundColor: isTopRanked ? 'oklch(85% 0.15 85)' : typeColors.accent,
              boxShadow: `0 0 10px ${isTopRanked ? 'oklch(85% 0.15 85)' : typeColors.accent}`
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

export interface TelescopeSurfaceProps {
  blocks: MaterializableBlockData[];
  onBlockSelect?: (id: string) => void;
  onIntentSelect?: (option: IntentOption) => void;
  maxVisibleBlocks?: number;
  className?: string;
}

export function TelescopeSurface({
  blocks,
  onBlockSelect,
  onIntentSelect,
  maxVisibleBlocks = DEFAULT_MAX_VISIBLE_BLOCKS,
  className,
}: TelescopeSurfaceProps) {
  const arrangeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [_arrangeKey, setArrangeKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [blockCenters, setBlockCenters] = useState<BlockCenter[]>([]);

  const processedBlocks = useMemo(() => {
    const sorted = sortByRelevance(blocks);
    return applyVisibilityRules(sorted, maxVisibleBlocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, maxVisibleBlocks]);

  const visibleBlocks = useMemo(
    () => processedBlocks.filter((b) => b.visibility !== 'hidden'),
    [processedBlocks]
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const centers: BlockCenter[] = [];
      visibleBlocks.forEach((block) => {
        const el = container.querySelector<HTMLElement>(`[data-block-id="${block.id}"]`);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        centers.push({
          id: block.id,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          relevanceScore: block.relevanceScore,
        });
      });
      setBlockCenters(centers);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();

    return () => observer.disconnect();
  }, [visibleBlocks]);

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
      <ConstellationLines centers={blockCenters} containerRef={containerRef} />

      <AttentionBudget
        activeCount={visibleBlocks.length}
        maxBudget={maxVisibleBlocks}
        items={visibleBlocks.map((b) => ({
          id: b.id,
          label: (b.metadata?.title as string) ?? b.id,
          type: b.type,
        }))}
        className="absolute top-4 right-4 z-20"
        position="right"
      />

      <div className="relative z-10 max-w-[1600px] mx-auto">
        <div className="mb-6">
          <IntentField
            onSelect={onIntentSelect}
            placeholder="Search agents, portals, knowledge..."
            showTrigger={true}
          />
        </div>

        <div className="grid gap-6 auto-rows-min grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {visibleBlocks.map((block, index) =>
              block.type === 'portal' ? (
                <div key={block.id} data-block-id={block.id}>
                  <MaterializableBlock block={block}>
                    {renderPortalContent(block.id)}
                  </MaterializableBlock>
                </div>
              ) : (
                <div key={block.id} data-block-id={block.id}>
                  <TelescopeBlock
                    block={block}
                    onClick={onBlockSelect}
                    isTopRanked={index === 0 && block.relevanceScore > 0.8}
                  />
                </div>
              )
            )}
          </AnimatePresence>
        </div>
      </div>

      {visibleBlocks.length === 0 && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10"
        >
          <div className="relative">
            <motion.div 
              className="absolute inset-0 bg-[var(--color-llama1)] rounded-full blur-3xl opacity-20"
              animate={{ scale: [1, 1.5, 1], opacity: [0.1, 0.3, 0.1] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="w-24 h-24 rounded-full bg-background/50 backdrop-blur-xl border border-border/50 flex items-center justify-center shadow-2xl relative">
              <Telescope className="w-10 h-10 text-muted-foreground" />
            </div>
          </div>
          <h3 className="mt-8 text-xl font-medium text-foreground tracking-tight">The constellation is quiet</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md text-center leading-relaxed">
            Agents and artifacts will surface here automatically as they become relevant to your current context.
          </p>
        </motion.div>
      )}

      {visibleBlocks.length > 0 && (
        <WhisperLine
          message={`Showing ${visibleBlocks.length} constellation${visibleBlocks.length !== 1 ? 's' : ''} — sorted by context relevance`}
          context={`Top: ${(visibleBlocks[0]?.metadata?.title as string) ?? visibleBlocks[0]?.id ?? ''}`}
          relevanceScore={visibleBlocks[0]?.relevanceScore}
          position="bottom"
          className="absolute bottom-0 left-0 right-0 z-20"
        />
      )}
    </div>
  );
}

export { TelescopeBlock };
export type { TelescopeBlockProps };
