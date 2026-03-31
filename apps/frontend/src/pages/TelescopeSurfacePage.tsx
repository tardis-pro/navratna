import { useCallback } from 'react';
import { TelescopeSurface, useTelescopeSurface } from '@/components/TelescopeSurface';
import { createInitialBlocks } from '@/components/TelescopeSurface/portal_registry';
import type { IntentOption } from '@/components/IntentField/intent_field_types';

const initialBlocks = createInitialBlocks();

export default function TelescopeSurfacePage() {
  const surface = useTelescopeSurface(initialBlocks);

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

  return (
    <TelescopeSurface
      blocks={surface.blocks}
      onBlockSelect={handleBlockSelect}
      onIntentSelect={handleIntentSelect}
      className="min-h-screen"
    />
  );
}
