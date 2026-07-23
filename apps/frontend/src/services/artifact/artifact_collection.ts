import type { Artifact } from '@uaip/types';

export const artifactCollection = {
  listArtifacts(artifacts: Artifact[]): Artifact[] {
    return [...artifacts].sort((a, b) => {
      const aDate = a.traceability?.generatedAt ?? a.metadata.updatedAt ?? a.metadata.createdAt;
      const bDate = b.traceability?.generatedAt ?? b.metadata.updatedAt ?? b.metadata.createdAt;
      return new Date(bDate ?? 0).getTime() - new Date(aDate ?? 0).getTime();
    });
  },

  getArtifact(artifacts: Artifact[], artifactId: string): Artifact | undefined {
    return artifacts.find(
      (artifact) => artifact.id === artifactId || artifact.metadata.id === artifactId
    );
  },
};
