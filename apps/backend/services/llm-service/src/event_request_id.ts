import type { EventBusMessage } from '@uaip/types'

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function extractArtifactRequestId(event: EventBusMessage): string | undefined {
  if (isRecordValue(event.metadata) && typeof event.metadata.requestId === 'string') {
    return event.metadata.requestId
  }
  return typeof event.correlationId === 'string' ? event.correlationId : undefined
}
