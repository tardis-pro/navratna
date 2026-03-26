import type { Artifact } from '@uaip/types';
import type { UIConversationContext as ConversationContext } from '@uaip/types';

export interface ArtifactFactoryOptions {
  type: string;
  context: ConversationContext;
}

export const artifactFactory = {
  async createArtifact(options: ArtifactFactoryOptions): Promise<Artifact> {
    throw new Error('artifactFactory.createArtifact not yet implemented');
  },

  async generateArtifact(
    type: string,
    context: ConversationContext
  ): Promise<{ success: boolean; artifact?: Artifact }> {
    throw new Error('artifactFactory.generateArtifact not yet implemented');
  },
};
