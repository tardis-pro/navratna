import { describe, expect, it } from 'vitest'

import { buildReconciledArtifactGeneration } from '../../feature.js'
import { ARTIFACT_LLM_REQUEST_TIMEOUT_MS } from '../../artifact_service.js'

describe('artifact reconciliation', () => {
  it('allows long-form artifact generation to run for five minutes', () => {
    expect(ARTIFACT_LLM_REQUEST_TIMEOUT_MS).toBe(300_000)
  })

  it('preserves PRD generation settings from completed discussion metadata', () => {
    const artifactGeneration = buildReconciledArtifactGeneration({
      id: 'discussion-1',
      status: 'completed',
      completionReason: 'manual',
      updatedAt: new Date('2026-07-23T21:58:51.940Z'),
      metadata: {
        artifactConfig: {
          enabled: true,
          artifactType: 'prd',
          generateOnCompletion: true,
          autoShare: false,
        },
      },
    })

    expect(artifactGeneration).toEqual({
      suggestedType: 'prd',
      generateOnCompletion: true,
      autoShare: false,
      requiresApproval: false,
      metadata: { reconciled: true },
    })
  })
})
