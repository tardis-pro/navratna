/**
 * CrystallizationEffect — Blur-to-sharp loading transition
 *
 * Wraps children in a blur+opacity animation that "crystallises" into
 * focus once loading completes. The effect masks loading latency by
 * making the transition feel intentional rather than laggy.
 */

import { type ReactNode } from 'react';
import { motion, type Transition } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrystallizationEffectProps {
  isLoading: boolean;
  /** Approximate transition duration in ms (default 400). */
  duration?: number;
  children: ReactNode;
  className?: string;
  /** Show an animated shimmer overlay while loading (default true). */
  showShimmer?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DURATION_MS = 400;

const SPRING_CONFIG: Transition = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
};

// ---------------------------------------------------------------------------
// Shimmer overlay (pure CSS gradient animation)
// ---------------------------------------------------------------------------

const shimmerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: 'inherit',
  overflow: 'hidden',
  pointerEvents: 'none',
  zIndex: 1,
};

const shimmerGradientStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'linear-gradient(105deg, transparent 40%, oklch(95% 0.01 264 / 0.12) 50%, transparent 60%)',
  backgroundSize: '200% 100%',
  animation: 'crystallize-shimmer 1.8s ease-in-out infinite',
};

function ShimmerOverlay() {
  return (
    <div style={shimmerStyle} aria-hidden="true">
      <div style={shimmerGradientStyle} />
      <style>{`
        @keyframes crystallize-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CrystallizationEffect component
// ---------------------------------------------------------------------------

export function CrystallizationEffect({
  isLoading,
  duration = DEFAULT_DURATION_MS,
  children,
  className = '',
  showShimmer = true,
}: CrystallizationEffectProps) {
  const durationSec = duration / 1000;

  return (
    <div className={`relative ${className}`}>
      <motion.div
        initial={false}
        animate={{
          filter: isLoading ? 'blur(8px)' : 'blur(0px)',
          opacity: isLoading ? 0.7 : 1,
        }}
        transition={{
          ...SPRING_CONFIG,
          // Respect the caller's requested duration for the tween fallback.
          duration: durationSec,
        }}
        style={{ willChange: 'filter, opacity' }}
      >
        {children}
      </motion.div>

      {/* Shimmer overlay — only visible while loading */}
      {isLoading && showShimmer && <ShimmerOverlay />}
    </div>
  );
}
