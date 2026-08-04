import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { TelescopeSurface } from '@/components/TelescopeSurface';
import { useExploreSurface } from '@/components/TelescopeSurface/ExploreSurfaceProvider';
import { ImprintInterview } from '@/components/onboarding';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useKnowledge } from '@/contexts/KnowledgeContext';

export default function TelescopeSurfacePage() {
  const { surface } = useExploreSurface();
  const navigate = useNavigate();
  const { blockId } = useParams();
  const { showOnboarding, markOnboardingSettled, skipOnboarding } = useOnboarding();
  const { items } = useKnowledge();
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

  const handleFocusedPortalChange = useCallback(
    (focusedBlockId: string | null) => {
      void navigate(
        focusedBlockId ? `/explore/${encodeURIComponent(focusedBlockId)}` : '/explore'
      );
    },
    [navigate]
  );

  const handleInterviewComplete = useCallback(() => {
    markOnboardingSettled();
  }, [markOnboardingSettled]);

  // Invoked by the interview ONLY after the server accepted the skip, so this
  // must not call the API itself — a second call would double-post, and
  // settling here unconditionally is what made a failed skip look successful.
  const handleInterviewSkip = useCallback(() => {
    skipOnboarding();
  }, [skipOnboarding]);

  if (showWelcome) {
    return (
      <div className="relative flex h-full min-h-0 flex-col bg-background px-8 pt-12">
        <div className="mb-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Let&apos;s get to know each other
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A short conversation. Your answers decide which agents you get.
          </p>
        </div>
        <ImprintInterview
          onComplete={handleInterviewComplete}
          onSkip={handleInterviewSkip}
          className="min-h-0 flex-1"
        />
      </div>
    );
  }

  return (
    <TelescopeSurface
      blocks={surface.blocks}
      focusedPortalId={blockId ?? null}
      onFocusedPortalChange={handleFocusedPortalChange}
      className="h-full min-h-0 overflow-auto"
    />
  );
}
