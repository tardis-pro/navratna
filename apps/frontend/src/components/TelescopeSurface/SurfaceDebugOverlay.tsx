'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MaterializableBlockData } from '@/components/MaterializableBlock/materializable_block_types';
import { captureSurfaceSnapshot, isDebugMode } from './surface_snapshot';
import type { SurfaceSnapshot } from './surface_snapshot';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SurfaceDebugOverlayProps {
  blocks: MaterializableBlockData[];
  activeWorkflows?: string[];
  recentIntents?: string[];
  attentionBudget?: { used: number; max: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = {
  bg: 'oklch(10% 0.01 264 / 0.85)',
  border: 'oklch(30% 0.02 264)',
  text: 'oklch(75% 0.02 264)',
  textMuted: 'oklch(55% 0.02 264)',
  accent: 'oklch(75% 0.12 150)',
  warning: 'oklch(75% 0.15 85)',
  hidden: 'oklch(50% 0.05 25)',
  badge: 'oklch(20% 0.01 264)',
} as const;

// ---------------------------------------------------------------------------
// Block Debug Badge (overlaid on each block)
// ---------------------------------------------------------------------------

export function BlockDebugBadge({ block }: { block: MaterializableBlockData }) {
  if (!isDebugMode()) return null;

  const pct = Math.round(block.relevanceScore * 100);

  return (
    <div
      className="absolute top-1 left-1 z-50 flex flex-col gap-0.5 rounded px-1.5 py-1 pointer-events-none"
      style={{
        backgroundColor: COLORS.bg,
        border: `1px solid ${COLORS.border}`,
        backdropFilter: 'blur(4px)',
      }}
    >
      <span className="text-[8px] font-mono font-bold" style={{ color: COLORS.accent }}>
        {block.id.slice(0, 12)}
      </span>
      <span className="text-[8px] font-mono" style={{ color: COLORS.text }}>
        rel: {pct}% | {block.visibility} | {block.expression}
      </span>
      <span className="text-[8px] font-mono" style={{ color: COLORS.textMuted }}>
        {block.type}
        {block.metadata?.title ? ` \u00b7 ${String(block.metadata.title).slice(0, 20)}` : ''}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Corner Snapshot Panel
// ---------------------------------------------------------------------------

export function SurfaceDebugOverlay({
  blocks,
  activeWorkflows = [],
  recentIntents = [],
  attentionBudget = { used: 0, max: 4 },
}: SurfaceDebugOverlayProps) {
  const [collapsed, setCollapsed] = useState(false);
  const debugActive = isDebugMode();

  const snapshot: SurfaceSnapshot | null = useMemo(() => {
    if (!debugActive) return null;
    return captureSurfaceSnapshot(blocks, activeWorkflows, recentIntents, attentionBudget);
  }, [debugActive, blocks, activeWorkflows, recentIntents, attentionBudget]);

  const handleCopySnapshot = useCallback(() => {
    if (!snapshot) return;
    navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2)).catch(() => {
      // Silently fail — dev tool, not critical
    });
  }, [snapshot]);

  if (!debugActive || !snapshot) return null;

  const visibleCount = snapshot.blocks.filter((b) => b.visibility !== 'hidden').length;
  const hiddenCount = snapshot.blocks.length - visibleCount;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed bottom-4 left-4 z-[9999] max-w-xs"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
      >
        <div
          className="rounded-lg overflow-hidden"
          style={{
            backgroundColor: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Header */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center justify-between px-3 py-2 text-left"
            style={{ borderBottom: collapsed ? undefined : `1px solid ${COLORS.border}` }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.accent }}>
              Surface Debug
            </span>
            <span className="text-[9px] font-mono" style={{ color: COLORS.textMuted }}>
              {collapsed ? '\u25b6' : '\u25bc'}
            </span>
          </button>

          {!collapsed && (
            <div className="flex flex-col gap-2 px-3 py-2">
              {/* Attention budget */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-semibold uppercase" style={{ color: COLORS.textMuted }}>
                  Budget
                </span>
                <span className="text-[10px] font-mono font-bold" style={{ color: COLORS.text }}>
                  {snapshot.attentionBudget.used}/{snapshot.attentionBudget.max}
                </span>
                <span className="text-[9px]" style={{ color: COLORS.textMuted }}>
                  ({visibleCount} vis, {hiddenCount} hid)
                </span>
              </div>

              {/* Block list */}
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {snapshot.blocks.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-1.5 text-[9px] font-mono"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          b.visibility === 'hidden'
                            ? COLORS.hidden
                            : b.visibility === 'faded'
                              ? COLORS.warning
                              : COLORS.accent,
                      }}
                    />
                    <span className="truncate" style={{ color: COLORS.text }}>
                      {b.id.slice(0, 10)}
                    </span>
                    <span style={{ color: COLORS.textMuted }}>
                      {Math.round(b.relevanceScore * 100)}%
                    </span>
                    <span style={{ color: COLORS.textMuted }}>
                      {b.expression}
                    </span>
                  </div>
                ))}
              </div>

              {/* Workflows */}
              {snapshot.activeWorkflows.length > 0 && (
                <div>
                  <span className="text-[9px] font-semibold uppercase block mb-0.5" style={{ color: COLORS.textMuted }}>
                    Workflows
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: COLORS.text }}>
                    {snapshot.activeWorkflows.join(', ')}
                  </span>
                </div>
              )}

              {/* Recent intents */}
              {snapshot.recentIntents.length > 0 && (
                <div>
                  <span className="text-[9px] font-semibold uppercase block mb-0.5" style={{ color: COLORS.textMuted }}>
                    Intents
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: COLORS.text }}>
                    {snapshot.recentIntents.join(', ')}
                  </span>
                </div>
              )}

              {/* Timestamp + copy */}
              <div className="flex items-center justify-between pt-1" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <span className="text-[8px] font-mono" style={{ color: COLORS.textMuted }}>
                  {snapshot.timestamp.split('T')[1]?.slice(0, 8)}
                </span>
                <button
                  type="button"
                  onClick={handleCopySnapshot}
                  className="text-[9px] font-semibold rounded px-1.5 py-0.5 transition-colors hover:bg-white/5"
                  style={{ color: COLORS.accent }}
                >
                  Copy JSON
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
