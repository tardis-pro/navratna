'use client';

import { useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BreathCycleProps {
  systemLoad: number; // 0-1, where 0 = idle, 1 = max load
  isActive: boolean;
  children: React.ReactNode;
  className?: string;
}

export interface UseBreathCycleOptions {
  wsConnectionCount?: number;
  pendingOperations?: number;
  errorCount?: number;
  maxConnections?: number;
  maxPending?: number;
  maxErrors?: number;
}

export interface UseBreathCycleReturn {
  systemLoad: number;
  zone: BreathZone;
  breathDuration: number;
  tintColor: string;
}

// ---------------------------------------------------------------------------
// Zone system
// ---------------------------------------------------------------------------

type BreathZone = 'idle' | 'normal' | 'busy' | 'stressed';

interface ZoneConfig {
  zone: BreathZone;
  duration: number; // seconds per breath cycle
  opacityRange: [number, number];
  scaleRange: [number, number];
  hue: number; // oklch hue
  chroma: number;
}

const ZONE_CONFIGS: ZoneConfig[] = [
  {
    zone: 'idle',
    duration: 6,
    opacityRange: [0.97, 1],
    scaleRange: [0.998, 1],
    hue: 250,
    chroma: 0.02,
  },
  {
    zone: 'normal',
    duration: 4,
    opacityRange: [0.965, 1],
    scaleRange: [0.997, 1],
    hue: 264,
    chroma: 0.02,
  },
  {
    zone: 'busy',
    duration: 2.5,
    opacityRange: [0.955, 1],
    scaleRange: [0.996, 1],
    hue: 75,
    chroma: 0.04,
  },
  {
    zone: 'stressed',
    duration: 1.5,
    opacityRange: [0.94, 1],
    scaleRange: [0.994, 1],
    hue: 25,
    chroma: 0.06,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getZoneConfig(load: number): ZoneConfig {
  const clamped = Math.max(0, Math.min(1, load));
  if (clamped < 0.2) return ZONE_CONFIGS[0]; // idle
  if (clamped < 0.5) return ZONE_CONFIGS[1]; // normal
  if (clamped < 0.8) return ZONE_CONFIGS[2]; // busy
  return ZONE_CONFIGS[3]; // stressed
}

/** Interpolate between two zone configs based on where the load sits within its range. */
function interpolateZone(load: number): {
  duration: number;
  opacityMin: number;
  opacityMax: number;
  scaleMin: number;
  scaleMax: number;
  hue: number;
  chroma: number;
} {
  const clamped = Math.max(0, Math.min(1, load));

  // Determine which two zones we're between
  const thresholds = [0, 0.2, 0.5, 0.8, 1];
  let lowerIdx = 0;
  for (let i = 0; i < thresholds.length - 1; i++) {
    if (clamped >= thresholds[i]) lowerIdx = i;
  }
  const upperIdx = Math.min(lowerIdx + 1, ZONE_CONFIGS.length - 1);
  const clampedLowerIdx = Math.min(lowerIdx, ZONE_CONFIGS.length - 1);

  const lower = ZONE_CONFIGS[clampedLowerIdx];
  const upper = ZONE_CONFIGS[upperIdx];

  const rangeStart = thresholds[lowerIdx];
  const rangeEnd = thresholds[lowerIdx + 1] ?? 1;
  const t = rangeEnd === rangeStart ? 0 : (clamped - rangeStart) / (rangeEnd - rangeStart);

  const lerp = (a: number, b: number) => a + (b - a) * t;

  return {
    duration: lerp(lower.duration, upper.duration),
    opacityMin: lerp(lower.opacityRange[0], upper.opacityRange[0]),
    opacityMax: lerp(lower.opacityRange[1], upper.opacityRange[1]),
    scaleMin: lerp(lower.scaleRange[0], upper.scaleRange[0]),
    scaleMax: lerp(lower.scaleRange[1], upper.scaleRange[1]),
    hue: lerp(lower.hue, upper.hue),
    chroma: lerp(lower.chroma, upper.chroma),
  };
}

function buildTintColor(hue: number, chroma: number, alpha: number = 0.04): string {
  return `oklch(50% ${chroma.toFixed(3)} ${Math.round(hue)} / ${alpha})`;
}

// ---------------------------------------------------------------------------
// Component: BreathCycle
// ---------------------------------------------------------------------------

export function BreathCycle({ systemLoad, isActive, children, className }: BreathCycleProps) {
  const interpolated = useMemo(() => interpolateZone(systemLoad), [systemLoad]);

  const tintColor = useMemo(
    () => buildTintColor(interpolated.hue, interpolated.chroma),
    [interpolated.hue, interpolated.chroma]
  );

  if (!isActive) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={['relative', className].filter(Boolean).join(' ')}
      animate={{
        opacity: [interpolated.opacityMin, interpolated.opacityMax, interpolated.opacityMin],
        scale: [interpolated.scaleMin, interpolated.scaleMax, interpolated.scaleMin],
      }}
      transition={{
        duration: interpolated.duration,
        ease: 'easeInOut',
        repeat: Infinity,
        repeatType: 'loop',
      }}
      style={{ willChange: 'opacity, transform' }}
    >
      {/* Subtle tint overlay that shifts color with load */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ backgroundColor: tintColor }}
        animate={{
          opacity: [0.3, 0.7, 0.3],
        }}
        transition={{
          duration: interpolated.duration,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatType: 'loop',
        }}
        aria-hidden
      />

      {/* Children render above the tint */}
      <div className="relative z-0">{children}</div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Hook: useBreathCycle
// ---------------------------------------------------------------------------

export function useBreathCycle(options: UseBreathCycleOptions = {}): UseBreathCycleReturn {
  const {
    wsConnectionCount = 0,
    pendingOperations = 0,
    errorCount = 0,
    maxConnections = 20,
    maxPending = 50,
    maxErrors = 10,
  } = options;

  const computeLoad = useCallback((): number => {
    // Weighted combination of the three signals
    const connLoad = Math.min(wsConnectionCount / maxConnections, 1) * 0.3;
    const pendingLoad = Math.min(pendingOperations / maxPending, 1) * 0.5;
    const errorLoad = Math.min(errorCount / maxErrors, 1) * 0.2;

    return Math.min(connLoad + pendingLoad + errorLoad, 1);
  }, [wsConnectionCount, pendingOperations, errorCount, maxConnections, maxPending, maxErrors]);

  const systemLoad = useMemo(() => computeLoad(), [computeLoad]);

  const zoneConfig = useMemo(() => getZoneConfig(systemLoad), [systemLoad]);
  const interpolated = useMemo(() => interpolateZone(systemLoad), [systemLoad]);

  const tintColor = useMemo(
    () => buildTintColor(interpolated.hue, interpolated.chroma, 0.08),
    [interpolated.hue, interpolated.chroma]
  );

  return {
    systemLoad,
    zone: zoneConfig.zone,
    breathDuration: interpolated.duration,
    tintColor,
  };
}
