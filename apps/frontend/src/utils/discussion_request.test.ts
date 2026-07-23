import { describe, expect, it } from 'vitest';

import { createDiscussionArtifactConfig } from './discussion_artifact_config';
import { buildDiscussionCreateRequest } from './discussion_request';

describe('discussion request', () => {
  it('persists PRD generation configuration in the canonical metadata shape', () => {
    const artifactConfig = createDiscussionArtifactConfig('prd');
    const request = buildDiscussionCreateRequest({
      topic: 'Incident Intelligence Copilot',
      userId: 'user-1',
      selectedAgentIds: ['agent-1', 'agent-2'],
      context: {
        artifactConfig,
        metadata: { purpose: 'prd-creation' },
      },
    });

    expect(request.artifactConfig).toEqual({
      enabled: true,
      artifactType: 'prd',
      generateOnCompletion: true,
    });
    expect(request.metadata).toEqual({
      purpose: 'prd-creation',
      artifactConfig,
    });
  });
});
