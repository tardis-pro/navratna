'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useAnimation as _useAnimation } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MorningFogItem {
  id: string;
  relevanceScore: number;
  loaded: boolean;
}

export interface MorningFogProps {
  items: Array<MorningFogItem>;
  isActive: boolean;
  onCleared?: () => void;
  className?: string;
}

export interface UseMorningFogReturn {
  isActive: boolean;
  activate: () => void;
  deactivate: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BLUR_PX = 20;
const CLEAR_DURATION_S = 2;
const MAX_FOG_LIFETIME_MS = 8_000;
const PARTICLE_COUNT = 24;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sort items by relevance descending so highest-relevance items clear first. */
function sortByRelevance(items: MorningFogItem[]): MorningFogItem[] {
  return [...items].sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/** Calculate aggregate blur based on how many items have loaded, weighted by relevance. */
function computeBlur(items: MorningFogItem[]): number {
  if (items.length === 0) return 0;

  const totalWeight = items.reduce((sum, item) => sum + item.relevanceScore, 0);
  if (totalWeight === 0) return 0;

  const loadedWeight = items
    .filter((item) => item.loaded)
    .reduce((sum, item) => sum + item.relevanceScore, 0);

  const clearFraction = loadedWeight / totalWeight;
  return MAX_BLUR_PX * (1 - clearFraction);
}

/** Generate a deterministic position for a reveal circle based on item index. */
function getRevealPosition(index: number, total: number): { cx: string; cy: string } {
  // Distribute reveals across viewport in a golden-angle spiral
  const goldenAngle = 137.508;
  const angle = (index * goldenAngle * Math.PI) / 180;
  const radius = 20 + (index / Math.max(total, 1)) * 30;
  const cx = 50 + radius * Math.cos(angle);
  const cy = 50 + radius * Math.sin(angle);
  return {
    cx: `${Math.max(5, Math.min(95, cx))}%`,
    cy: `${Math.max(5, Math.min(95, cy))}%`,
  };
}

// ---------------------------------------------------------------------------
// Particle dust effect (CSS-only animated spans)
// ---------------------------------------------------------------------------

function DustParticles({ clearing }: { clearing: boolean }) {
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const size = 2 + Math.random() * 3;
        const left = Math.random() * 100;
        const top = Math.random() * 100;
        const delay = Math.random() * 3;
        const duration = 3 + Math.random() * 4;
        const drift = (Math.random() - 0.5) * 60;

        return { id: i, size, left, top, delay, duration, drift };
      }),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            top: `${p.top}%`,
            backgroundColor: 'oklch(85% 0.02 264 / 0.35)',
            opacity: clearing ? 0 : 1,
            transform: clearing
              ? `translate(${p.drift}px, -40px) scale(0.2)`
              : 'translate(0, 0) scale(1)',
            transition: `all ${p.duration}s ease-out ${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reveal circles SVG mask
// ---------------------------------------------------------------------------

function RevealMask({ items }: { items: MorningFogItem[] }) {
  const sorted = useMemo(() => sortByRelevance(items), [items]);

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <mask id="morning-fog-reveal-mask">
          {/* White = opaque fog; black circles = clear spots */}
          <rect width="100%" height="100%" fill="white" />
          {sorted.map((item, index) => {
            if (!item.loaded) return null;
            const pos = getRevealPosition(index, sorted.length);
            return (
              <motion.circle
                key={item.id}
                cx={pos.cx}
                cy={pos.cy}
                fill="black"
                initial={{ r: '0%' }}
                animate={{ r: '18%' }}
                transition={{
                  duration: CLEAR_DURATION_S,
                  ease: [0.16, 1, 0.3, 1], // ease-out expo
                }}
              />
            );
          })}
        </mask>
      </defs>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Component: MorningFog
// ---------------------------------------------------------------------------

export function MorningFog({ items, isActive, onCleared, className }: MorningFogProps) {
  const [hasCleared, setHasCleared] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearedRef = useRef(false);

  const blurValue = useMemo(() => computeBlur(items), [items]);
  const allLoaded = items.length > 0 && items.every((item) => item.loaded);

  const markCleared = useCallback(() => {
    if (clearedRef.current) return;
    clearedRef.current = true;
    setHasCleared(true);
    onCleared?.();
  }, [onCleared]);

  // Auto-clear after all items loaded
  useEffect(() => {
    if (allLoaded && isActive) {
      markCleared();
    }
  }, [allLoaded, isActive, markCleared]);

  // Safety timeout: clear after MAX_FOG_LIFETIME_MS regardless
  useEffect(() => {
    if (!isActive) return;

    timeoutRef.current = setTimeout(() => {
      markCleared();
    }, MAX_FOG_LIFETIME_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isActive, markCleared]);

  // Reset when re-activated
  useEffect(() => {
    if (isActive) {
      clearedRef.current = false;
      setHasCleared(false);
    }
  }, [isActive]);

  const shouldShow = isActive && !hasCleared;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          className={['fixed inset-0 z-[9000] pointer-events-none', className]
            .filter(Boolean)
            .join(' ')}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.8, ease: 'easeOut' } }}
          aria-hidden
        >
          {/* Primary blur overlay */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundColor: 'oklch(15% 0.01 264 / 0.4)',
              mask: 'url(#morning-fog-reveal-mask)',
              WebkitMask: 'url(#morning-fog-reveal-mask)',
            }}
            initial={{ backdropFilter: `blur(${MAX_BLUR_PX}px)` }}
            animate={{ backdropFilter: `blur(${blurValue}px)` }}
            transition={{ duration: CLEAR_DURATION_S, ease: [0.16, 1, 0.3, 1] }}
          />

          {/* Global blur layer (without mask, fades as items load) */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundColor: 'oklch(15% 0.01 264 / 0.25)',
            }}
            initial={{ backdropFilter: `blur(${MAX_BLUR_PX}px)` }}
            animate={{ backdropFilter: `blur(${Math.max(blurValue * 0.6, 0)}px)` }}
            transition={{ duration: CLEAR_DURATION_S, ease: 'easeOut' }}
          />

          {/* SVG reveal mask definitions */}
          <RevealMask items={items} />

          {/* Dust particle effect */}
          <DustParticles clearing={allLoaded} />

          {/* Subtle gradient vignette */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 40%, oklch(10% 0.01 264 / 0.3) 100%)',
              opacity: 1 - (allLoaded ? 1 : 0),
              transition: `opacity ${CLEAR_DURATION_S}s ease-out`,
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Hook: useMorningFog
// ---------------------------------------------------------------------------

export function useMorningFog(): UseMorningFogReturn {
  const [isActive, setIsActive] = useState(false);

  const activate = useCallback(() => setIsActive(true), []);
  const deactivate = useCallback(() => setIsActive(false), []);

  // Auto-activate on mount
  useEffect(() => {
    setIsActive(true);
  }, []);

  return { isActive, activate, deactivate };
}
