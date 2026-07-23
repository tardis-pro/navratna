import type { ArtifactType } from '@uaip/types';

export const supportedArtifactTypes: readonly ArtifactType[] = ['code', 'test', 'documentation', 'prd'];

export function isArtifactType(value: unknown): value is ArtifactType {
  return (
    value === 'code' ||
    value === 'test' ||
    value === 'documentation' ||
    value === 'prd'
  );
}
