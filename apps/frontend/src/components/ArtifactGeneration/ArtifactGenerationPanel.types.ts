import type { Artifact } from '@uaip/types';

export interface ArtifactGenerationPanelProps {
  conversationId: string;
  artifacts?: Artifact[];
  onArtifactViewed?: (artifact: Artifact) => void;
}

export interface ArtifactViewState {
  selectedArtifact: Artifact | null;
}
