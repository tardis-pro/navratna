/**
 * SwellPrediction — Markov chain navigation predictor for UAIP portals
 *
 * Tracks portal-to-portal navigation sequences and builds a bigram
 * transition matrix. When enough data is collected the hook surfaces
 * the top-3 most likely next portals so the shell can pre-render them.
 */

import { useState, useEffect, useCallback, useRef, type ReactNode, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavigationEvent {
  portalId: string;
  timestamp: number;
}

export interface Prediction {
  portalId: string;
  probability: number;
  basedOnSequence: string[];
}

/** Serialisable representation of the transition matrix. */
type SerializedMatrix = Record<string, Record<string, number>>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'swell_transition_matrix';
const MIN_TRANSITIONS = 5;
const TOP_K = 3;
const PRE_RENDER_TTL_MS = 60_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bigramKey(a: string, b: string): string {
  return `${a}|${b}`;
}

function serializeMatrix(matrix: Map<string, Map<string, number>>): SerializedMatrix {
  const out: SerializedMatrix = {};
  for (const [from, targets] of matrix) {
    out[from] = Object.fromEntries(targets);
  }
  return out;
}

function deserializeMatrix(raw: SerializedMatrix): Map<string, Map<string, number>> {
  const matrix = new Map<string, Map<string, number>>();
  for (const [from, targets] of Object.entries(raw)) {
    matrix.set(from, new Map(Object.entries(targets)));
  }
  return matrix;
}

function loadMatrixFromStorage(): Map<string, Map<string, number>> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // @ts-expect-error -- JSON.parse returns any; runtime shape matches SerializedMatrix
      const parsed: SerializedMatrix = JSON.parse(stored);
      return deserializeMatrix(parsed);
    }
  } catch {
    // Corrupt or missing — start fresh.
  }
  return new Map();
}

function persistMatrix(matrix: Map<string, Map<string, number>>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeMatrix(matrix)));
  } catch {
    // Storage full or unavailable — silently degrade.
  }
}

function totalTransitions(matrix: Map<string, Map<string, number>>): number {
  let total = 0;
  for (const targets of matrix.values()) {
    for (const count of targets.values()) {
      total += count;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// useSwellPrediction hook
// ---------------------------------------------------------------------------

export function useSwellPrediction() {
  const matrixRef = useRef<Map<string, Map<string, number>>>(loadMatrixFromStorage());
  const historyRef = useRef<string[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);

  // Persist on unmount as a safety-net (main persistence happens on write).
  useEffect(() => {
    const matrix = matrixRef.current;
    return () => {
      persistMatrix(matrix);
    };
  }, []);

  /**
   * Record that the user navigated to `portalId`.
   * Updates the bigram transition matrix and persists it.
   */
  const recordNavigation = useCallback((portalId: string) => {
    const history = historyRef.current;
    const matrix = matrixRef.current;

    if (history.length >= 1) {
      // Unigram transition: previous -> current
      const prev = history[history.length - 1];
      if (!matrix.has(prev)) {
        matrix.set(prev, new Map());
      }
      const uniTargets = matrix.get(prev)!;
      uniTargets.set(portalId, (uniTargets.get(portalId) ?? 0) + 1);
    }

    if (history.length >= 2) {
      // Bigram transition: (prev-1, prev) -> current
      const key = bigramKey(history[history.length - 2], history[history.length - 1]);
      if (!matrix.has(key)) {
        matrix.set(key, new Map());
      }
      const biTargets = matrix.get(key)!;
      biTargets.set(portalId, (biTargets.get(portalId) ?? 0) + 1);
    }

    // Keep a sliding window of the last 10 events.
    history.push(portalId);
    if (history.length > 10) {
      history.shift();
    }

    persistMatrix(matrix);
  }, []);

  /**
   * Return the top-K predicted next portals. Bigram matches are weighted 2x.
   * Returns an empty array until MIN_TRANSITIONS have been observed.
   */
  const predict = useCallback((): Prediction[] => {
    const matrix = matrixRef.current;
    const history = historyRef.current;

    if (totalTransitions(matrix) < MIN_TRANSITIONS || history.length === 0) {
      return [];
    }

    const scores = new Map<string, number>();
    const basedOn: string[] = [];

    const lastPortal = history[history.length - 1];

    // Unigram scores
    const uniTargets = matrix.get(lastPortal);
    if (uniTargets) {
      basedOn.push(lastPortal);
      let uniTotal = 0;
      for (const count of uniTargets.values()) uniTotal += count;
      for (const [target, count] of uniTargets) {
        scores.set(target, (scores.get(target) ?? 0) + count / uniTotal);
      }
    }

    // Bigram scores (weighted 2x)
    if (history.length >= 2) {
      const key = bigramKey(history[history.length - 2], lastPortal);
      const biTargets = matrix.get(key);
      if (biTargets) {
        basedOn.unshift(history[history.length - 2]);
        let biTotal = 0;
        for (const count of biTargets.values()) biTotal += count;
        for (const [target, count] of biTargets) {
          scores.set(target, (scores.get(target) ?? 0) + (count / biTotal) * 2);
        }
      }
    }

    // Normalise to 0-1 range and pick top-K.
    let maxScore = 0;
    for (const s of scores.values()) {
      if (s > maxScore) maxScore = s;
    }

    const results: Prediction[] = [];
    if (maxScore > 0) {
      for (const [portalId, raw] of scores) {
        results.push({
          portalId,
          probability: raw / maxScore,
          basedOnSequence: basedOn,
        });
      }
    }

    results.sort((a, b) => b.probability - a.probability);

    const topK = results.slice(0, TOP_K);
    setPredictions(topK);
    return topK;
  }, []);

  return { predictions, recordNavigation, predict } as const;
}

// ---------------------------------------------------------------------------
// SwellPrediction component
// ---------------------------------------------------------------------------

export interface SwellPredictionProps {
  children: ReactNode;
  predictions: Prediction[];
  onPreRender?: (portalId: string) => void;
}

const PRE_RENDER_THRESHOLD = 0.4;

export function SwellPrediction({ children, predictions, onPreRender }: SwellPredictionProps) {
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!onPreRender) return;
    for (const p of predictions) {
      if (p.probability > PRE_RENDER_THRESHOLD && !firedRef.current.has(p.portalId)) {
        firedRef.current.add(p.portalId);
        onPreRender(p.portalId);
      }
    }
  }, [predictions, onPreRender]);

  const highConfidence = predictions.filter((p) => p.probability > PRE_RENDER_THRESHOLD);

  return (
    <div className="relative">
      {children}

      <AnimatePresence>
        {highConfidence.map((p) => (
          <motion.div
            key={p.portalId}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ delay: 0.5, duration: 0.35, ease: 'easeOut' }}
            className="absolute -right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs backdrop-blur-sm"
            aria-label={`Predicted portal: ${p.portalId} (${Math.round(p.probability * 100)}%)`}
          >
            {/* Wave icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              style={{ color: 'oklch(70% 0.15 264)' }}
            >
              <path d="M2 12c1.5-3 4-5 6-5s3.5 2 5 2 3.5-2 5.5-2 3 1.5 3.5 5" />
              <path d="M2 17c1.5-3 4-5 6-5s3.5 2 5 2 3.5-2 5.5-2 3 1.5 3.5 5" />
            </svg>
            <span className="opacity-70">{Math.round(p.probability * 100)}%</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PreRenderSlot component
// ---------------------------------------------------------------------------

export interface PreRenderSlotProps {
  portalId: string;
  isActive: boolean;
  /** React.lazy factory — the host provides the mapping from id to component. */
  loader?: () => Promise<{ default: React.ComponentType }>;
}

export function PreRenderSlot({ portalId, isActive, loader }: PreRenderSlotProps) {
  const [mounted, setMounted] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-unmount after TTL if the slot is never activated.
  useEffect(() => {
    if (isActive) {
      // Cancel any pending unmount — user navigated here.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setTimeout(() => {
      setMounted(false);
    }, PRE_RENDER_TTL_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isActive]);

  if (!mounted || !loader) return null;

  const LazyPortal = lazy(loader);

  return (
    <div
      data-prerender-slot={portalId}
      style={{ display: isActive ? 'contents' : 'none' }}
      aria-hidden={!isActive}
    >
      <Suspense fallback={null}>
        <LazyPortal />
      </Suspense>
    </div>
  );
}
