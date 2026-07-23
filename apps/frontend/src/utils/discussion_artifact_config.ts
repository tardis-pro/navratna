import type { ArtifactGenerationConfig, ArtifactType } from '@uaip/types';

export type DiscussionArtifactTarget =
  | 'document'
  | 'code'
  | 'presentation'
  | 'prd'
  | 'analysis-report'
  | 'action-plan'
  | 'research-summary'
  | 'decision-matrix';

const ARTIFACT_TYPE_MAP: Record<DiscussionArtifactTarget, ArtifactType> = {
  document: 'documentation',
  code: 'code',
  presentation: 'documentation',
  prd: 'prd',
  'analysis-report': 'analysis',
  'action-plan': 'documentation',
  'research-summary': 'documentation',
  'decision-matrix': 'report',
};

export function createDiscussionArtifactConfig(
  target: DiscussionArtifactTarget
): ArtifactGenerationConfig {
  return {
    enabled: true,
    artifactType: ARTIFACT_TYPE_MAP[target],
    generateOnCompletion: true,
  };
}
