import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { TelescopeSurface } from '@/components/TelescopeSurface';
import type { TelescopeFocusTarget } from '@/components/TelescopeSurface/TelescopeSurface';
import { useExploreSurface } from '@/components/TelescopeSurface/ExploreSurfaceProvider';
import { resolveCapabilityTarget } from '@/components/TelescopeSurface/capability_manifest';
import { WelcomeConstellation } from '@/components/TelescopeSurface/WelcomeConstellation';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useKnowledge } from '@/contexts/KnowledgeContext';
import { useHomeShell } from '@/components/home/use_home_shell';
import type { IntentOption } from '@/components/IntentField/intent_field_types';
import type { MaterializableBlockData } from '@/components/MaterializableBlock/materializable_block_types';

function createMaterializedPortal(
  option: IntentOption,
  blockId: string
): MaterializableBlockData {
  return {
    id: blockId,
    type: 'portal',
    expression: 'attentive',
    relevanceScore: 1,
    visibility: 'visible',
    position: { x: 0, y: 0, z: 1 },
    dimensions: { width: 400, height: 500 },
    metadata: { title: option.title, pinned: true },
  };
}

export default function TelescopeSurfacePage() {
  const { surface } = useExploreSurface();
  const { openDiscussionComposer } = useHomeShell();
  const navigate = useNavigate();
  const { blockId } = useParams();
  const { showOnboarding, completeOnboarding, skipOnboarding } = useOnboarding();
  const { items } = useKnowledge();
  const [focusTarget, setFocusTarget] = useState<TelescopeFocusTarget>();
  const focusNonceRef = useRef(0);
  const routedBlockRef = useRef<string | null>(null);

  const hasKnowledgeItems = Object.keys(items).length > 0;
  const showWelcome = showOnboarding && !hasKnowledgeItems;

  useEffect(() => {
    if (!blockId || routedBlockRef.current === blockId) return;
    const routedBlock = surface.blocks.find((block) => block.id === blockId);
    if (!routedBlock) return;

    surface.pinBlock(blockId);
    surface.updateRelevance(blockId, 1);
    routedBlockRef.current = blockId;
  }, [blockId, surface.blocks, surface.pinBlock, surface.updateRelevance]);

  useEffect(() => {
    if (!blockId) routedBlockRef.current = null;
  }, [blockId]);

  const handleBlockSelect = useCallback(
    (id: string) => {
      const current = surface.blocks.find((block) => block.id === id);
      if (!current) return;
      surface.updateRelevance(id, Math.min(current.relevanceScore + 0.1, 1));
    },
    [surface.blocks, surface.updateRelevance]
  );

  const handleIntentSelect = useCallback(
    (option: IntentOption) => {
      const knownIds = new Set(surface.blocks.map((block) => block.id));
      const target = resolveCapabilityTarget(option.id, knownIds);
      if (!target) return;

      const currentBlock = surface.blocks.find((block) => block.id === target.blockId);
      if (!currentBlock) {
        surface.addBlock(createMaterializedPortal(option, target.blockId));
      } else {
        surface.pinBlock(target.blockId);
      }
      surface.updateRelevance(target.blockId, 1);

      if (target.action === 'new-discussion') {
        openDiscussionComposer();
      }

      if (currentBlock && currentBlock.type !== 'portal') {
        focusNonceRef.current += 1;
        setFocusTarget({ id: target.blockId, nonce: focusNonceRef.current });
        return;
      }

      void navigate(`/explore/${encodeURIComponent(target.blockId)}`);
    },
    [
      navigate,
      openDiscussionComposer,
      surface.addBlock,
      surface.blocks,
      surface.pinBlock,
      surface.updateRelevance,
    ]
  );

  const handleFocusedPortalChange = useCallback(
    (focusedBlockId: string | null) => {
      void navigate(
        focusedBlockId ? `/explore/${encodeURIComponent(focusedBlockId)}` : '/explore'
      );
    },
    [navigate]
  );

  const handleConnectTools = useCallback(() => {
    void navigate('/explore/settings');
  }, [navigate]);

  const handleMeetAgent = useCallback(() => {
    void navigate('/explore/chat');
  }, [navigate]);

  const handleOnboardingComplete = useCallback(() => {
    void completeOnboarding({});
  }, [completeOnboarding]);

  if (showWelcome) {
    return (
      <div className="relative flex h-full min-h-0 flex-col items-center justify-center bg-background p-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">
          Welcome to Navratna
        </h1>
        <p className="mb-12 max-w-lg text-center text-muted-foreground">
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
          className="mt-8 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
      focusedPortalId={blockId ?? null}
      onFocusedPortalChange={handleFocusedPortalChange}
      className="h-full min-h-0 overflow-auto"
    />
  );
}
