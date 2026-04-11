import type { MaterializableBlockData } from '@/components/MaterializableBlock/materializable_block_types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SurfaceSnapshot {
  timestamp: string;
  blocks: Array<{
    id: string;
    type: string;
    relevanceScore: number;
    visibility: string;
    expression: string;
    metadata?: Record<string, unknown>;
  }>;
  activeWorkflows: string[];
  recentIntents: string[];
  attentionBudget: { used: number; max: number };
  debugMode: boolean;
}

// ---------------------------------------------------------------------------
// Debug mode check
// ---------------------------------------------------------------------------

/**
 * Check if debug mode is active (via URL param ?surface_debug=true)
 */
export function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('surface_debug');
}

// ---------------------------------------------------------------------------
// Snapshot capture
// ---------------------------------------------------------------------------

/**
 * Capture current surface state as a serializable snapshot.
 */
export function captureSurfaceSnapshot(
  blocks: MaterializableBlockData[],
  activeWorkflows: string[] = [],
  recentIntents: string[] = [],
  attentionBudget: { used: number; max: number } = { used: 0, max: 4 },
): SurfaceSnapshot {
  return {
    timestamp: new Date().toISOString(),
    blocks: blocks.map((b) => ({
      id: b.id,
      type: b.type,
      relevanceScore: b.relevanceScore,
      visibility: b.visibility,
      expression: b.expression,
      metadata: b.metadata,
    })),
    activeWorkflows,
    recentIntents,
    attentionBudget,
    debugMode: isDebugMode(),
  };
}
