import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TelescopeSurface, useTelescopeSurface } from '@/components/TelescopeSurface';
import {
  createInitialBlocks,
  buildDynamicBlocks,
} from '@/components/TelescopeSurface/dynamic_block_registry';
import { resolveCapabilityTarget } from '@/components/TelescopeSurface/capability_manifest';
import type { CapabilityAction } from '@/components/TelescopeSurface/capability_manifest';
import { WelcomeConstellation } from '@/components/TelescopeSurface/WelcomeConstellation';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useKnowledge } from '@/contexts/KnowledgeContext';
import type { IntentOption } from '@/components/IntentField/intent_field_types';
import type { MaterializableBlockData } from '@/components/MaterializableBlock/materializable_block_types';
import { logger } from '@/utils/browser_logger';

const DYNAMIC_REFRESH_MS = 30_000;

/**
 * Route an action intent to its real handler where one exists. Every action
 * also materializes the relevant block (handled by the caller), so these
 * dispatches are best-effort side-effects — a graceful no-op when no listener
 * is mounted. Dispatched on a short delay so a freshly-materialized portal has
 * a tick to attach its listener.
 */
function routeCapabilityAction(action: CapabilityAction, blockId: string): void {
  window.setTimeout(() => {
    try {
      switch (action) {
        case 'create-agent':
          window.dispatchEvent(new CustomEvent('openNewAgentChat', { detail: { source: 'intent' } }));
          break;
        case 'new-discussion':
          window.dispatchEvent(new CustomEvent('open-discussion-portal', { detail: { source: 'intent' } }));
          break;
        case 'search-knowledge':
        case 'upload-knowledge':
          window.dispatchEvent(
            new CustomEvent('openKnowledgePortal', {
              detail: { mode: action === 'upload-knowledge' ? 'upload' : 'search' },
            })
          );
          break;
        case 'export-data':
        case 'share':
          // No global handler — materializing the artifacts block IS the action.
          break;
      }
    } catch (err) {
      logger.warn('[TelescopeSurface] capability action dispatch failed', { action, blockId, err });
    }
  }, 50);
}

export default function TelescopeSurfacePage() {
  const initialBlocks = useMemo(() => createInitialBlocks(), []);
  const surface = useTelescopeSurface(initialBlocks);
  const { showOnboarding, completeOnboarding, skipOnboarding } = useOnboarding();
  const { items } = useKnowledge();

  const hasKnowledgeItems = Object.keys(items).length > 0;
  const showWelcome = showOnboarding && !hasKnowledgeItems;

  const [focusTarget, setFocusTarget] = useState<{ id: string; nonce: number } | undefined>();
  const focusNonceRef = useRef(0);

  // Asynchronously merge in workflow + federated-capability blocks after the
  // instant static seed, and keep them fresh on an interval. buildDynamicBlocks
  // degrades internally (per-endpoint try/catch) so a 404/failure keeps the
  // static surface intact — never blank it.
  const { mergeBlocks } = surface;
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const dynamic = await buildDynamicBlocks();
        if (!cancelled) mergeBlocks(dynamic);
      } catch (err) {
        // Total failure (both endpoints unavailable) — keep static blocks.
        logger.warn('[TelescopeSurface] dynamic block refresh failed, keeping static surface', err);
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), DYNAMIC_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [mergeBlocks]);

  const handleBlockSelect = useCallback(
    (id: string) => {
      const current = surface.blocks.find((b) => b.id === id);
      if (!current) return;
      surface.updateRelevance(id, Math.min(current.relevanceScore + 0.1, 1.0));
    },
    [surface]
  );

  const handleIntentSelect = useCallback(
    (option: IntentOption) => {
      const knownIds = new Set(surface.blocks.map((b) => b.id));
      const target = resolveCapabilityTarget(option.id, knownIds);
      // Free-text autocomplete (ws-N) with no capability mapping — leave surface unchanged.
      if (!target) return;

      // Materialize the block if it isn't on the surface yet.
      if (!knownIds.has(target.blockId)) {
        const materialized: MaterializableBlockData = {
          id: target.blockId,
          type: 'portal',
          expression: 'attentive',
          relevanceScore: 1.0,
          visibility: 'visible',
          position: { x: 0, y: 0, z: 1 },
          dimensions: { width: 400, height: 500 },
          metadata: { title: option.title, pinned: true },
        };
        surface.addBlock(materialized);
      } else {
        surface.pinBlock(target.blockId);
      }

      // Always raise to top relevance and open/focus it so materializing is visible.
      surface.updateRelevance(target.blockId, 1.0);
      focusNonceRef.current += 1;
      setFocusTarget({ id: target.blockId, nonce: focusNonceRef.current });

      // Route action intents to their real handlers where they exist.
      if (target.action) {
        routeCapabilityAction(target.action, target.blockId);
      }
    },
    [surface]
  );

  const handleConnectTools = useCallback(() => {
    surface.updateRelevance('settings', 1.0);
  }, [surface]);

  const handleMeetAgent = useCallback(() => {
    surface.updateRelevance('chat', 1.0);
    window.dispatchEvent(
      new CustomEvent('openAgentChat', {
        detail: { agentId: Object.keys(surface.blocks)[0] ?? '', agentName: 'Assistant' },
      })
    );
  }, [surface]);

  const handleOnboardingComplete = useCallback(() => {
    void completeOnboarding({});
  }, [completeOnboarding]);

  if (showWelcome) {
    return (
      <div className="relative min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">Welcome to Navratna</h1>
        <p className="text-muted-foreground mb-12 text-center max-w-lg">
          Set up your cognitive shell in three steps. Each step builds your constellation.
        </p>
        <WelcomeConstellation
          onConnectTools={handleConnectTools}
          onMeetAgent={handleMeetAgent}
          onAllComplete={handleOnboardingComplete}
        />
        <button
          type="button"
          onClick={skipOnboarding}
          className="mt-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      </div>
    );
  }

  return (
    <TelescopeSurface
      blocks={surface.blocks}
      onBlockSelect={handleBlockSelect}
      onIntentSelect={handleIntentSelect}
      focusTarget={focusTarget}
      className="min-h-screen"
    />
  );
}
