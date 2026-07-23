import type { EventBusMessage } from '@uaip/types'
import { normalizeEventEnvelope } from '@uaip/shared-services/event-bus'
import { describe, expect, it } from 'vitest'

import { extractArtifactRequestId } from '../../event_request_id.js'

function createEvent(metadata?: Record<string, unknown>): EventBusMessage {
  return {
    id: 'event-1',
    type: 'llm.generate.request',
    source: 'artifact-service',
    data: {},
    timestamp: new Date('2026-07-23T22:00:00.000Z'),
    version: '1.0.0',
    correlationId: 'corr-generated',
    metadata,
  }
}

describe('artifact request ID extraction', () => {
  it('preserves metadata after BullMQ serializes the timestamp', () => {
    const envelope = normalizeEventEnvelope({
      id: 'event-1',
      type: 'llm.generate.request',
      source: 'artifact-service',
      data: {},
      timestamp: '2026-07-23T22:00:00.000Z',
      version: '1.0.0',
      correlationId: 'corr-generated',
      metadata: { requestId: 'artifact_req_123' },
    })

    expect(envelope.timestamp).toEqual(new Date('2026-07-23T22:00:00.000Z'))
    expect(envelope.metadata).toEqual({ requestId: 'artifact_req_123' })
  })

  it('prefers the explicit request ID over an auto-generated correlation ID', () => {
    expect(extractArtifactRequestId(createEvent({ requestId: 'artifact_req_123' }))).toBe(
      'artifact_req_123'
    )
  })

  it('falls back to the correlation ID when explicit metadata is absent', () => {
    expect(extractArtifactRequestId(createEvent())).toBe('corr-generated')
  })
})
