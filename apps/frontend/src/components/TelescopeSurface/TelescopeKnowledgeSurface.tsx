'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IntentField } from '@/components/IntentField/IntentField';
import { WhisperLine } from '@/components/AmbientIntelligence';
import { AttentionBudget } from '@/components/AttentionBudget';
import { CrystallizationEffect } from '@/components/PredictiveIntent';
import { ConstellationNode } from './ConstellationNode';
import { useConstellations } from './useConstellations';
import { useForceLayout } from './useForceLayout';
import type { ForceNode } from './useForceLayout';
import type { BlockVisibility } from '@/components/MaterializableBlock/MaterializableBlock.types';
import type { AttentionItem } from '@/components/AttentionBudget';
import { cn } from '@/lib/utils';

// ─── Constants ──────────────────────────────────────────────────────

const MAX_VISIBLE = 4;
const SURFACE_PADDING = 24;
const NODE_WIDTH = 288; // w-72
const NODE_HEIGHT = 200;

const SPRING_TRANSITION = { type: 'spring' as const, damping: 25, stiffness: 120 };

// ─── Types ──────────────────────────────────────────────────────────

export interface TelescopeKnowledgeSurfaceProps {
  className?: string;
  onConstellationSelect?: (id: string) => void;
}

interface WhisperState {
  message: string;
  context: string;
  relevanceScore: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

function deriveVisibility(score: number, index: number): BlockVisibility {
  if (index >= MAX_VISIBLE) return 'hidden';
  if (score < 0.2) return 'hidden';
  if (score < 0.5) return 'faded';
  return 'visible';
}

// ─── Component ──────────────────────────────────────────────────────

export function TelescopeKnowledgeSurface({
  className,
  onConstellationSelect,
}: TelescopeKnowledgeSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [whisper, setWhisper] = useState<WhisperState | null>(null);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Constellation data
  const {
    blocks: constellations,
    isLoading,
    error,
    search,
    toggleExpand,
    constellationCount,
  } = useConstellations({ limit: 12 });

  // Sort by relevance and assign visibility
  const processedConstellations = useMemo(() => {
    const sorted = [...constellations].sort((a, b) => b.relevanceScore - a.relevanceScore);
    return sorted.map((block, index) => ({
      ...block,
      visibility: deriveVisibility(block.relevanceScore, index),
    }));
  }, [constellations]);

  const visibleConstellations = useMemo(
    () => processedConstellations.filter((c) => c.visibility !== 'hidden'),
    [processedConstellations]
  );

  // Force layout
  const forceConfig = useMemo(
    () => ({
      gravity: 0.3,
      springStrength: 0.5,
      repulsion: 0.8,
      friction: 0.85,
      centerX: dimensions.width / 2,
      centerY: (dimensions.height - 120) / 2,
    }),
    [dimensions]
  );

  const {
    positions,
    setNodes: setForceNodes,
    setIntentCenter,
    isSimulating,
  } = useForceLayout(forceConfig);

  // Update force layout nodes when constellations change
  useEffect(() => {
    if (visibleConstellations.length === 0) return;

    const emptyConnections: string[] = [];
    const forceNodes: ForceNode[] = visibleConstellations.map((c, i) => ({
      id: c.id,
      x: dimensions.width / 2 + (i - visibleConstellations.length / 2) * (NODE_WIDTH + 20),
      y: (dimensions.height - 120) / 2,
      vx: 0,
      vy: 0,
      relevanceScore: c.relevanceScore,
      radius: NODE_WIDTH / 2,
      connections: emptyConnections,
      pinned: false,
    }));
    setForceNodes(forceNodes);
  }, [visibleConstellations, dimensions, setForceNodes]);

  // Intent handling
  const handleIntentSearch = useCallback(
    (query: string) => {
      search(query);

      // Update intent gravity center
      setIntentCenter({ x: dimensions.width / 2, y: (dimensions.height - 120) / 3 });

      // Update whisper
      if (query.length > 0) {
        setWhisper({
          message: `Reorganizing around "${query}"`,
          context: `${constellationCount} constellations`,
          relevanceScore:
            visibleConstellations.length > 0 ? visibleConstellations[0].relevanceScore : 0,
        });
      } else {
        setWhisper(null);
      }
    },
    [search, setIntentCenter, dimensions, constellationCount, visibleConstellations]
  );

  const handleConstellationClick = useCallback(
    (id: string) => {
      onConstellationSelect?.(id);
    },
    [onConstellationSelect]
  );

  // Attention items for the gauge
  const attentionItems: AttentionItem[] = useMemo(
    () =>
      visibleConstellations.map((c) => ({
        id: c.id,
        label: c.metadata.constellationName,
        type: 'knowledge',
      })),
    [visibleConstellations]
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full h-full min-h-[400px] flex flex-col overflow-hidden',
        'bg-gradient-to-b from-black/95 to-black/98',
        className
      )}
      role="region"
      aria-label="Telescope Knowledge Surface"
    >
      {/* IntentField at top */}
      <div className="relative z-20 p-4 pb-2">
        <IntentField
          showTrigger={false}
          placeholder="What are you looking for..."
          onSelect={(option) => handleIntentSearch(option.title)}
        />
      </div>

      {/* WhisperLine */}
      <AnimatePresence>
        {whisper && (
          <div className="relative z-10 px-4" key="whisper">
            <WhisperLine
              message={whisper.message}
              context={whisper.context}
              relevanceScore={whisper.relevanceScore}
              onDismiss={() => setWhisper(null)}
              position="top"
            />
          </div>
        )}
      </AnimatePresence>

      {/* Main constellation surface */}
      <div className="relative flex-1 min-h-0">
        <CrystallizationEffect isLoading={isLoading} showShimmer>
          <div className="relative w-full h-full" style={{ padding: SURFACE_PADDING }}>
            <AnimatePresence mode="popLayout">
              {visibleConstellations.map((constellation) => {
                const pos = positions.get(constellation.id);
                const x = pos ? pos.x - NODE_WIDTH / 2 : SURFACE_PADDING;
                const y = pos ? pos.y - NODE_HEIGHT / 2 : SURFACE_PADDING;

                return (
                  <motion.div
                    key={constellation.id}
                    layout
                    style={{
                      position: 'absolute',
                      width: NODE_WIDTH,
                    }}
                    animate={{ left: x, top: y }}
                    transition={SPRING_TRANSITION}
                  >
                    <ConstellationNode
                      block={constellation}
                      visibility={constellation.visibility}
                      onClick={handleConstellationClick}
                      onExpand={toggleExpand}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Empty state */}
            {!isLoading && visibleConstellations.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-2" style={{ color: 'oklch(60% 0.02 264)' }}>
                  <p className="text-sm">No constellations materialized</p>
                  {error ? (
                    <p className="text-xs" style={{ color: 'oklch(60% 0.15 25)' }}>
                      {error}
                    </p>
                  ) : (
                    <p className="text-xs">Add knowledge or type an intent to begin</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </CrystallizationEffect>
      </div>

      {/* Attention Budget gauge */}
      <AttentionBudget
        activeCount={visibleConstellations.length}
        maxBudget={MAX_VISIBLE}
        items={attentionItems}
        position="right"
      />

      {/* Simulation indicator */}
      {isSimulating && (
        <div
          className="absolute bottom-2 left-2 text-[9px]"
          style={{ color: 'oklch(45% 0.02 264 / 0.5)' }}
          aria-hidden
        >
          settling...
        </div>
      )}
    </div>
  );
}
