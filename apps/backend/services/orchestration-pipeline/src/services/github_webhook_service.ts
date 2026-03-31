import { createHmac, timingSafeEqual } from 'node:crypto'
import { logger } from '@uaip/utils'
import { EventBusService } from '@uaip/infra'
import type {
  GitHubWebhookEventType,
  GitHubWebhookPayload,
  WebhookEvent,
  WebhookValidationResult,
  WebhookEventSource,
} from '@uaip/types'

const GITHUB_EVENT_TOPIC_MAP: Record<string, string> = {
  push: 'github.push',
  pull_request: 'github.pr',
  check_run: 'github.ci.check',
  check_suite: 'github.ci.suite',
  issue_comment: 'github.comment',
  issues: 'github.issue',
  pull_request_review: 'github.pr.review',
}

function getWebhookSecret(): string {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('GITHUB_WEBHOOK_SECRET environment variable is required')
  }
  return secret
}

export function validateGitHubSignature(payload: string, signatureHeader: string): boolean {
  const secret = getWebhookSecret()
  const expectedSignature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`

  if (signatureHeader.length !== expectedSignature.length) {
    return false
  }

  return timingSafeEqual(
    Buffer.from(signatureHeader),
    Buffer.from(expectedSignature)
  )
}

export function validateGitHubWebhook(
  payload: string,
  signatureHeader: string | null,
  eventType: string | null
): WebhookValidationResult {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing X-Hub-Signature-256 header', source: 'github' as WebhookEventSource, eventType: eventType ?? 'unknown' }
  }

  if (!eventType) {
    return { valid: false, error: 'Missing X-GitHub-Event header', source: 'github' as WebhookEventSource, eventType: 'unknown' }
  }

  const isValid = validateGitHubSignature(payload, signatureHeader)
  if (!isValid) {
    return { valid: false, error: 'Invalid HMAC signature', source: 'github' as WebhookEventSource, eventType }
  }

  return { valid: true, source: 'github' as WebhookEventSource, eventType }
}

export async function routeGitHubWebhookEvent(
  eventType: GitHubWebhookEventType,
  payload: GitHubWebhookPayload,
  deliveryId: string
): Promise<void> {
  const topic = GITHUB_EVENT_TOPIC_MAP[eventType]
  if (!topic) {
    logger.warn('Unhandled GitHub webhook event type', { eventType, deliveryId })
    return
  }

  const event: WebhookEvent<GitHubWebhookPayload> = {
    id: deliveryId,
    source: 'github' as WebhookEventSource,
    eventType,
    timestamp: new Date().toISOString(),
    payload,
    metadata: {
      deliveryId,
      retryCount: 0,
    },
  }

  try {
    const eventBus = EventBusService.getInstance()
    await eventBus.publish(topic, event)
    logger.info('GitHub webhook event routed', { eventType, topic, deliveryId })
  } catch (error) {
    logger.error('Failed to route GitHub webhook event', {
      error: error instanceof Error ? error.message : String(error),
      eventType,
      deliveryId,
    })
  }
}
