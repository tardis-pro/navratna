import { useCallback } from 'react';
import { TelescopeSurface, useTelescopeSurface } from '@/components/TelescopeSurface';
import { createInitialBlocks } from '@/components/TelescopeSurface/dynamic_block_registry';
import { WelcomeConstellation } from '@/components/TelescopeSurface/WelcomeConstellation';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useKnowledge } from '@/contexts/KnowledgeContext';
import type { IntentOption } from '@/components/IntentField/intent_field_types';

const initialBlocks = createInitialBlocks();

export default function TelescopeSurfacePage() {
  const surface = useTelescopeSurface(initialBlocks);
  const { showOnboarding, completeOnboarding, skipOnboarding } = useOnboarding();
  const { items } = useKnowledge();

  const hasKnowledgeItems = Object.keys(items).length > 0;
  const showWelcome = showOnboarding && !hasKnowledgeItems;

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
      const match = surface.blocks.find((b) => b.id === option.id);
      if (match) {
        surface.updateRelevance(option.id, Math.min(match.relevanceScore + 0.15, 1.0));
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
      className="min-h-screen"
    />
  );
}
