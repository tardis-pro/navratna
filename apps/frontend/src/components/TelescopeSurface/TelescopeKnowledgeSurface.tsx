'use client';

import { useState, useCallback, useMemo, useRef, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, LayoutGrid, X } from 'lucide-react';
import { WhisperLine } from '@/components/AmbientIntelligence';
import { AttentionBudget } from '@/components/AttentionBudget';
import { CrystallizationEffect } from '@/components/PredictiveIntent';
import { ConstellationNode } from './ConstellationNode';
import { useConstellations } from './use_constellations';
import { useForceLayout } from './use_force_layout';
import type { ForceNode } from './use_force_layout';
import type { BlockVisibility } from '@/components/MaterializableBlock/materializable_block_types';
import type { AttentionItem } from '@/components/AttentionBudget';
import { Portal } from '@/components/futuristic/Portal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PORTAL_COMPONENTS, PORTAL_LABELS } from './portal_registry';
import { MapWallpaper } from '@/components/futuristic/desktop/MapWallpaper';
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

interface OpenPortal {
  id: string;
  zIndex: number;
}

let _zCounter = 1000;

export function TelescopeKnowledgeSurface({
  className,
  onConstellationSelect,
}: TelescopeKnowledgeSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [openPortals, setOpenPortals] = useState<OpenPortal[]>([]);
  const [whisper, setWhisper] = useState<WhisperState | null>(null);
  const [launcherOpen, setLauncherOpen] = useState(false);

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
    search,
    searchQuery,
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

  useEffect(() => {
    if (visibleConstellations.length === 0) return;
    if (dimensions.width <= 800 && dimensions.height <= 600) return;

    const emptyConnections: string[] = [];
    const safeY = Math.max(300, (dimensions.height - 120) / 2);
    const forceNodes: ForceNode[] = visibleConstellations.map((c, i) => ({
      id: c.id,
      x: dimensions.width / 2 + (i - visibleConstellations.length / 2) * (NODE_WIDTH + 60),
      y: safeY,
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
      const WELCOME_MAP: Record<string, string> = {
        'welcome-intent': 'chat',
        'welcome-knowledge': 'knowledge',
        'welcome-agents': 'agent-manager',
        'welcome-discuss': 'discussion',
      };
      const portalId = id in PORTAL_COMPONENTS ? id : WELCOME_MAP[id] ?? null;
      if (!portalId) return;
      setOpenPortals((prev) => {
        if (prev.some((p) => p.id === portalId)) {
          return prev.map((p) =>
            p.id === portalId ? { ...p, zIndex: ++_zCounter } : p
          );
        }
        return [...prev, { id: portalId, zIndex: ++_zCounter }];
      });
    },
    [onConstellationSelect]
  );

  const handleClosePortal = useCallback((id: string) => {
    setOpenPortals((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleFocusPortal = useCallback((id: string) => {
    setOpenPortals((prev) =>
      prev.map((p) => (p.id === id ? { ...p, zIndex: ++_zCounter } : p))
    );
  }, []);

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
        className
      )}
      role="region"
      aria-label="Telescope Knowledge Surface"
    >
      <MapWallpaper theme="dark" interactive={false} className="pointer-events-none" />
      <div className="relative z-20 p-4 pb-2">
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl border"
          style={{
            background: 'oklch(14% 0.01 264 / 0.85)',
            borderColor: 'oklch(35% 0.04 264 / 0.5)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'oklch(55% 0.04 264)' }} />
          <input
            type="text"
            placeholder="What are you looking for..."
            value={searchQuery}
            onChange={(e) => handleIntentSearch(e.target.value)}
            aria-label="Search constellations"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{
              color: 'oklch(88% 0.02 264)',
              caretColor: 'oklch(65% 0.18 250)',
            }}
          />
          <button
            onClick={() => setLauncherOpen((v) => !v)}
            aria-label="All portals"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs flex-shrink-0 transition-colors"
            style={{
              background: launcherOpen ? 'oklch(45% 0.12 250 / 0.3)' : 'oklch(22% 0.02 264 / 0.6)',
              color: launcherOpen ? 'oklch(75% 0.15 250)' : 'oklch(55% 0.04 264)',
              border: `1px solid ${launcherOpen ? 'oklch(55% 0.12 250 / 0.5)' : 'oklch(35% 0.04 264 / 0.4)'}`,
            }}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Portals</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {launcherOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="relative z-30 mx-4 mb-2 rounded-xl border overflow-hidden"
            style={{
              background: 'oklch(12% 0.01 264 / 0.96)',
              borderColor: 'oklch(30% 0.04 264 / 0.6)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b"
              style={{ borderColor: 'oklch(25% 0.03 264 / 0.5)' }}>
              <span className="text-xs font-medium" style={{ color: 'oklch(65% 0.04 264)' }}>
                All Portals
              </span>
              <button onClick={() => setLauncherOpen(false)} aria-label="Close launcher"
                style={{ color: 'oklch(50% 0.04 264)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 p-3">
              {Object.entries(PORTAL_LABELS).map(([id, label]) => {
                const isOpen = openPortals.some((p) => p.id === id);
                return (
                  <button
                    key={id}
                    onClick={() => {
                      handleConstellationClick(id);
                      setLauncherOpen(false);
                    }}
                    className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-center transition-all"
                    style={{
                      background: isOpen ? 'oklch(35% 0.1 250 / 0.3)' : 'oklch(18% 0.02 264 / 0.6)',
                      color: isOpen ? 'oklch(75% 0.15 250)' : 'oklch(72% 0.04 264)',
                      border: `1px solid ${isOpen ? 'oklch(50% 0.12 250 / 0.4)' : 'oklch(28% 0.03 264 / 0.4)'}`,
                    }}
                  >
                    <span className="text-[10px] leading-tight font-medium">{label}</span>
                    {isOpen && (
                      <span className="text-[8px]" style={{ color: 'oklch(60% 0.12 250)' }}>open</span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

            {visibleConstellations.length > 1 && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ zIndex: 0 }}
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient id="tks-conn-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="oklch(65% 0.12 250)" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="oklch(65% 0.12 290)" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                {visibleConstellations.map((c, i) => {
                  const next = visibleConstellations[i + 1];
                  if (!next) return null;
                  const posA = positions.get(c.id);
                  const posB = positions.get(next.id);
                  if (!posA || !posB) return null;
                  const strength = Math.sqrt(c.relevanceScore * next.relevanceScore);
                  return (
                    <motion.line
                      key={`conn-${c.id}-${next.id}`}
                      x1={posA.x}
                      y1={posA.y}
                      x2={posB.x}
                      y2={posB.y}
                      stroke="url(#tks-conn-grad)"
                      strokeWidth={strength * 2}
                      strokeDasharray="6 4"
                      initial={{ opacity: 0, pathLength: 0 }}
                      animate={{ opacity: strength * 0.6, pathLength: 1 }}
                      transition={{ duration: 1.2, ease: 'easeOut', delay: i * 0.1 }}
                    />
                  );
                })}
              </svg>
            )}

            <AnimatePresence mode="popLayout">
              {visibleConstellations.map((constellation) => {
                const pos = positions.get(constellation.id);
                const rawX = pos ? pos.x - NODE_WIDTH / 2 : SURFACE_PADDING;
                const rawY = pos ? pos.y - NODE_HEIGHT / 2 : SURFACE_PADDING;
                const x = Math.max(SURFACE_PADDING, Math.min(rawX, dimensions.width - NODE_WIDTH - SURFACE_PADDING));
                const y = Math.max(SURFACE_PADDING, Math.min(rawY, dimensions.height - NODE_HEIGHT - SURFACE_PADDING));

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

            {!isLoading && visibleConstellations.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm" style={{ color: 'oklch(60% 0.02 264)' }}>
                  The constellation is quiet
                </p>
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

      {isSimulating && (
        <div
          className="absolute bottom-2 left-2 text-[9px]"
          style={{ color: 'oklch(45% 0.02 264 / 0.5)' }}
          aria-hidden
        >
          settling...
        </div>
      )}

      <AnimatePresence>
        {openPortals.map((op) => {
          const PortalComponent = PORTAL_COMPONENTS[op.id];
          if (!PortalComponent) return null;
          return (
            <Portal
              key={op.id}
              id={op.id}
              type={op.id}
              title={PORTAL_LABELS[op.id] ?? op.id}
              zIndex={op.zIndex}
              onClose={() => handleClosePortal(op.id)}
              onFocus={() => handleFocusPortal(op.id)}
              initialPosition={{
                x: 80 + (openPortals.indexOf(op) % 4) * 40,
                y: 80 + (openPortals.indexOf(op) % 4) * 30,
              }}
              initialSize={{ width: 720, height: 520 }}
            >
              <ErrorBoundary fallback={
                <div className="flex items-center justify-center h-full text-sm"
                  style={{ color: 'oklch(65% 0.15 25)' }}>
                  Portal unavailable
                </div>
              }>
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full text-sm"
                    style={{ color: 'oklch(55% 0.04 264)' }}>
                    Loading...
                  </div>
                }>
                  <PortalComponent />
                </Suspense>
              </ErrorBoundary>
            </Portal>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
