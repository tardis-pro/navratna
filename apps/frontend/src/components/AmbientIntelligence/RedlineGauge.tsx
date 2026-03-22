'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AttentionBudget, useAttentionBudget } from '@/components/AttentionBudget';
import type { AttentionItem } from '@/components/AttentionBudget';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RedlineGaugeProps {
  className?: string;
  position?: 'left' | 'right';
}

export interface PortalInfo {
  id: string;
  label: string;
  type: string;
  timestamp: number;
}

export interface UseRedlineGaugeReturn {
  canOpenPortal: boolean;
  activePortals: PortalInfo[];
  budgetUtilization: number;
  openPortal: (portal: Omit<PortalInfo, 'timestamp'>) => boolean;
  closePortal: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Custom events
// ---------------------------------------------------------------------------

const PORTAL_OPEN_EVENT = 'uaip:portal:open';
const PORTAL_CLOSE_EVENT = 'uaip:portal:close';

export interface PortalOpenDetail {
  id: string;
  label: string;
  type: string;
}

export interface PortalCloseDetail {
  id: string;
}

/** Dispatch a custom event to open a portal. */
export function emitPortalOpen(detail: PortalOpenDetail): void {
  window.dispatchEvent(new CustomEvent<PortalOpenDetail>(PORTAL_OPEN_EVENT, { detail }));
}

/** Dispatch a custom event to close a portal. */
export function emitPortalClose(detail: PortalCloseDetail): void {
  window.dispatchEvent(new CustomEvent<PortalCloseDetail>(PORTAL_CLOSE_EVENT, { detail }));
}

// ---------------------------------------------------------------------------
// Toast warning component
// ---------------------------------------------------------------------------

function BudgetToast({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed bottom-6 left-1/2 z-[9500] -translate-x-1/2 select-none"
          initial={{ y: 40, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg"
            style={{
              backgroundColor: 'oklch(20% 0.04 25 / 0.9)',
              color: 'oklch(85% 0.12 25)',
              backdropFilter: 'blur(12px)',
              border: '1px solid oklch(35% 0.08 25 / 0.4)',
              boxShadow: '0 0 20px oklch(55% 0.22 25 / 0.3)',
            }}
            role="alert"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M8 1l7 13H1z" />
              <line x1="8" y1="6" x2="8" y2="9" />
              <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
            </svg>
            Attention budget exceeded — close a portal to continue
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Component: RedlineGauge
// ---------------------------------------------------------------------------

export function RedlineGauge({ className, position = 'right' }: RedlineGaugeProps) {
  const [portals, setPortals] = useState<PortalInfo[]>([]);
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const budget = useAttentionBudget({
    maxBudget: 4,
    onBudgetExceeded: () => {
      setShowToast(true);
      // Auto-hide toast after 4 seconds
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setShowToast(false), 4_000);
    },
  });

  // Convert portals into attention items for the budget tracker
  const attentionItems: AttentionItem[] = useMemo(
    () =>
      portals.map((p) => ({
        id: p.id,
        label: p.label,
        type: p.type,
      })),
    [portals]
  );

  // Sync portals with budget tracker
  const syncPortalToBudget = useCallback(
    (portal: PortalOpenDetail) => {
      const item: AttentionItem = {
        id: portal.id,
        label: portal.label,
        type: portal.type,
      };
      const accepted = budget.requestSlot(item);
      if (accepted) {
        setPortals((prev) => {
          if (prev.some((p) => p.id === portal.id)) return prev;
          return [...prev, { ...portal, timestamp: Date.now() }];
        });
      }
    },
    [budget]
  );

  const removePortal = useCallback(
    (id: string) => {
      budget.releaseSlot(id);
      setPortals((prev) => prev.filter((p) => p.id !== id));
    },
    [budget]
  );

  // Listen for custom portal events
  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent<PortalOpenDetail>).detail;
      syncPortalToBudget(detail);
    };

    const handleClose = (e: Event) => {
      const detail = (e as CustomEvent<PortalCloseDetail>).detail;
      removePortal(detail.id);
    };

    window.addEventListener(PORTAL_OPEN_EVENT, handleOpen);
    window.addEventListener(PORTAL_CLOSE_EVENT, handleClose);

    return () => {
      window.removeEventListener(PORTAL_OPEN_EVENT, handleOpen);
      window.removeEventListener(PORTAL_CLOSE_EVENT, handleClose);
    };
  }, [syncPortalToBudget, removePortal]);

  // Cleanup toast timer
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleDismiss = useCallback(
    (id: string) => {
      removePortal(id);
    },
    [removePortal]
  );

  return (
    <>
      <AttentionBudget
        activeCount={portals.length}
        maxBudget={4}
        items={attentionItems}
        onDismiss={handleDismiss}
        onBudgetExceeded={() => {
          setShowToast(true);
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastTimerRef.current = setTimeout(() => setShowToast(false), 4_000);
        }}
        className={className}
        position={position}
      />
      <BudgetToast visible={showToast} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Hook: useRedlineGauge
// ---------------------------------------------------------------------------

export function useRedlineGauge(maxBudget: number = 4): UseRedlineGaugeReturn {
  const [portals, setPortals] = useState<PortalInfo[]>([]);

  const budgetUtilization = Math.min(portals.length / maxBudget, 1);
  const canOpenPortal = portals.length < maxBudget;

  const openPortal = useCallback(
    (portal: Omit<PortalInfo, 'timestamp'>): boolean => {
      if (portals.length >= maxBudget) {
        return false;
      }
      const info: PortalInfo = { ...portal, timestamp: Date.now() };

      setPortals((prev) => {
        if (prev.some((p) => p.id === info.id)) return prev;
        return [...prev, info];
      });

      // Also emit the event so any mounted RedlineGauge picks it up
      emitPortalOpen({ id: portal.id, label: portal.label, type: portal.type });
      return true;
    },
    [portals.length, maxBudget]
  );

  const closePortal = useCallback((id: string) => {
    setPortals((prev) => prev.filter((p) => p.id !== id));
    emitPortalClose({ id });
  }, []);

  // Listen for external events to keep local state in sync
  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent<PortalOpenDetail>).detail;
      setPortals((prev) => {
        if (prev.some((p) => p.id === detail.id)) return prev;
        if (prev.length >= maxBudget) return prev;
        return [...prev, { ...detail, timestamp: Date.now() }];
      });
    };

    const handleClose = (e: Event) => {
      const detail = (e as CustomEvent<PortalCloseDetail>).detail;
      setPortals((prev) => prev.filter((p) => p.id !== detail.id));
    };

    window.addEventListener(PORTAL_OPEN_EVENT, handleOpen);
    window.addEventListener(PORTAL_CLOSE_EVENT, handleClose);

    return () => {
      window.removeEventListener(PORTAL_OPEN_EVENT, handleOpen);
      window.removeEventListener(PORTAL_CLOSE_EVENT, handleClose);
    };
  }, [maxBudget]);

  return {
    canOpenPortal,
    activePortals: portals,
    budgetUtilization,
    openPortal,
    closePortal,
  };
}
