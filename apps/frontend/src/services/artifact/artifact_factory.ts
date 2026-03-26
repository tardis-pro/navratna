import type { Artifact } from '@uaip/types';
import type { UIConversationContext as ConversationContext } from '@uaip/types';

export interface ArtifactFactoryOptions {
  type: string;
  context: ConversationContext;
}

export const artifactFactory = {
  async createArtifact(_options: ArtifactFactoryOptions): Promise<Artifact> {
    throw new Error('artifactFactory.createArtifact not yet implemented');
  },

  async generateArtifact(
    _type: string,
    _context: ConversationContext
  ): Promise<{ success: boolean; artifact?: Artifact }> {
    throw new Error('artifactFactory.generateArtifact not yet implemented');
  },
};
