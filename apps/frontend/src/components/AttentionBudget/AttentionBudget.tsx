import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AttentionItem {
  id: string;
  label: string;
  type: string;
}

export interface AttentionBudgetProps {
  activeCount: number;
  maxBudget?: number;
  items?: AttentionItem[];
  onDismiss?: (id: string) => void;
  onBudgetExceeded?: () => void;
  className?: string;
  position?: 'left' | 'right';
}

export interface UseAttentionBudgetOptions {
  maxBudget?: number;
  onBudgetExceeded?: () => void;
}

export interface UseAttentionBudgetReturn {
  canAdd: boolean;
  activeCount: number;
  isAtCapacity: boolean;
  isOverCapacity: boolean;
  utilization: number;
  items: AttentionItem[];
  requestSlot: (item: AttentionItem) => boolean;
  releaseSlot: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GAUGE_WIDTH_COLLAPSED = 40;
const GAUGE_WIDTH_EXPANDED = 220;
const GAUGE_HEIGHT = 200;
const SLOT_DOT_SIZE = 8;

/** oklch colours matching the microexpression system */
const COLOR_GREEN = 'oklch(60% 0.18 145)';
const COLOR_AMBER = 'oklch(70% 0.18 75)';
const COLOR_RED = 'oklch(55% 0.22 25)';

const TYPE_ICONS: Record<string, string> = {
  notification: '\u{1F514}',
  task: '\u{1F4CB}',
  alert: '\u{26A0}\u{FE0F}',
  chat: '\u{1F4AC}',
  default: '\u{25CF}',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGaugeColor(utilization: number): string {
  if (utilization <= 0.5) return COLOR_GREEN;
  if (utilization <= 0.75) return COLOR_AMBER;
  return COLOR_RED;
}

function getGaugeGlow(utilization: number): string {
  if (utilization <= 0.5) return '0 0 8px oklch(60% 0.18 145 / 0.4)';
  if (utilization <= 0.75) return '0 0 10px oklch(70% 0.18 75 / 0.5)';
  return '0 0 14px oklch(55% 0.22 25 / 0.7)';
}

function getZoneLabel(utilization: number): string {
  if (utilization <= 0.5) return 'CLEAR';
  if (utilization <= 0.75) return 'CAUTION';
  if (utilization < 1) return 'WARNING';
  return 'REDLINE';
}

function getTypeIcon(type: string): string {
  return TYPE_ICONS[type] ?? TYPE_ICONS.default;
}

// ---------------------------------------------------------------------------
// Hook: useAttentionBudget
// ---------------------------------------------------------------------------

export function useAttentionBudget(
  options: UseAttentionBudgetOptions = {},
): UseAttentionBudgetReturn {
  const { maxBudget = 4, onBudgetExceeded } = options;
  const [items, setItems] = useState<AttentionItem[]>([]);

  const activeCount = items.length;
  const utilization = Math.min(activeCount / maxBudget, 1);
  const canAdd = activeCount < maxBudget;
  const isAtCapacity = activeCount === maxBudget;
  const isOverCapacity = activeCount > maxBudget;

  const requestSlot = useCallback(
    (item: AttentionItem): boolean => {
      if (items.length >= maxBudget) {
        onBudgetExceeded?.();
        return false;
      }
      setItems((prev) => {
        if (prev.some((existing) => existing.id === item.id)) return prev;
        return [...prev, item];
      });
      return true;
    },
    [items.length, maxBudget, onBudgetExceeded],
  );

  const releaseSlot = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return {
    canAdd,
    activeCount,
    isAtCapacity,
    isOverCapacity,
    utilization,
    items,
    requestSlot,
    releaseSlot,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SlotIndicators({
  activeCount,
  maxBudget,
  color,
}: {
  activeCount: number;
  maxBudget: number;
  color: string;
}) {
  return (
    <div className="flex flex-col-reverse items-center gap-1.5">
      {Array.from({ length: maxBudget }, (_, i) => {
        const isActive = i < activeCount;
        return (
          <motion.div
            key={i}
            className="rounded-full border"
            style={{
              width: SLOT_DOT_SIZE,
              height: SLOT_DOT_SIZE,
              borderColor: color,
              backgroundColor: isActive ? color : 'transparent',
            }}
            initial={false}
            animate={{
              scale: isActive ? 1 : 0.8,
              opacity: isActive ? 1 : 0.35,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          />
        );
      })}
    </div>
  );
}

function ItemList({
  items,
  onDismiss,
}: {
  items: AttentionItem[];
  onDismiss?: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[160px] pr-1">
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12, transition: { duration: 0.15 } }}
            className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1 text-xs"
          >
            <span className="shrink-0 text-sm" aria-hidden>
              {getTypeIcon(item.type)}
            </span>
            <span className="flex-1 truncate text-white/80">{item.label}</span>
            {/* Tiny relevance bar for visual flair */}
            <span
              className="h-1 w-6 rounded-full"
              style={{ backgroundColor: COLOR_GREEN }}
            />
            {onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(item.id)}
                className="ml-1 shrink-0 rounded p-0.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
                aria-label={`Dismiss ${item.label}`}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <line x1="2" y1="2" x2="8" y2="8" />
                  <line x1="8" y1="2" x2="2" y2="8" />
                </svg>
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component: AttentionBudget
// ---------------------------------------------------------------------------

export function AttentionBudget({
  activeCount,
  maxBudget = 4,
  items = [],
  onDismiss,
  onBudgetExceeded,
  className,
  position = 'right',
}: AttentionBudgetProps) {
  const [expanded, setExpanded] = useState(false);

  const utilization = Math.min(activeCount / maxBudget, 1);
  const isAtCapacity = activeCount >= maxBudget;
  const color = getGaugeColor(utilization);
  const glow = getGaugeGlow(utilization);
  const zoneLabel = getZoneLabel(utilization);
  const fillPercent = utilization * 100;

  // Fire callback when budget is exceeded
  useEffect(() => {
    if (activeCount > maxBudget) {
      onBudgetExceeded?.();
    }
  }, [activeCount, maxBudget, onBudgetExceeded]);

  const gaugeWidth = expanded ? GAUGE_WIDTH_EXPANDED : GAUGE_WIDTH_COLLAPSED;

  const positionClasses = useMemo(
    () =>
      position === 'left'
        ? 'left-0 rounded-r-lg'
        : 'right-0 rounded-l-lg',
    [position],
  );

  return (
    <motion.div
      className={cn(
        'fixed top-1/2 z-50 -translate-y-1/2 select-none',
        positionClasses,
        className,
      )}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onClick={() => setExpanded((prev) => !prev)}
      role="status"
      aria-label={`Attention budget: ${activeCount} of ${maxBudget} slots used. Status: ${zoneLabel}`}
    >
      <motion.div
        className="flex overflow-hidden border border-white/10 bg-black/80 backdrop-blur-md"
        style={{ borderRadius: 10 }}
        initial={false}
        animate={{ width: gaugeWidth, height: GAUGE_HEIGHT }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      >
        {/* ---- Gauge column ---- */}
        <div className="relative flex w-10 shrink-0 flex-col items-center justify-between py-2">
          {/* Zone label */}
          <span
            className="text-[8px] font-bold uppercase tracking-widest"
            style={{ color, writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            {zoneLabel}
          </span>

          {/* Gauge track */}
          <div className="relative mx-auto my-1 w-3 flex-1 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="absolute bottom-0 left-0 w-full rounded-full"
              style={{ backgroundColor: color }}
              initial={false}
              animate={{
                height: `${fillPercent}%`,
                boxShadow: glow,
              }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            />

            {/* Redline pulse overlay */}
            {isAtCapacity && (
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: COLOR_RED }}
                animate={{ opacity: [1, 0.7, 1] }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </div>

          {/* Slot dot indicators */}
          <SlotIndicators
            activeCount={activeCount}
            maxBudget={maxBudget}
            color={color}
          />
        </div>

        {/* ---- Expanded panel ---- */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              className="flex flex-1 flex-col gap-2 overflow-hidden py-2 pr-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.1 } }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                  Attention
                </span>
                <span
                  className="text-xs font-bold tabular-nums"
                  style={{ color }}
                >
                  {activeCount}/{maxBudget}
                </span>
              </div>

              {items.length > 0 ? (
                <ItemList items={items} onDismiss={onDismiss} />
              ) : (
                <span className="mt-4 text-center text-[10px] text-white/30">
                  No active items
                </span>
              )}

              {isAtCapacity && (
                <motion.span
                  className="mt-auto text-center text-[9px] font-semibold uppercase tracking-wider"
                  style={{ color: COLOR_RED }}
                  animate={{ opacity: [1, 0.6, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  Budget maxed — dismiss to add
                </motion.span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
