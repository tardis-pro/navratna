import { createHmac, timingSafeEqual } from 'node:crypto'
import { logger, ValidationError } from '@uaip/utils'
import { EventBusService } from '@uaip/infra'
import {
  WebhookEventSource,
} from '@uaip/types'
import type {
  GitHubWebhookEventType,
  GitHubWebhookPayload,
  WebhookEvent,
  WebhookValidationResult,
} from '@uaip/types'

/**
 * Bus topics the verified GitHub webhook fans out to.
 *
 * These are a deliberate public surface, not internal handoffs: a workflow
 * definition with `trigger: { kind: 'event', expr: 'github.ci.check' }` binds to
 * one directly (see WorkflowEngineService.registerEventTrigger), so a publish
 * here has a real subscription path even when nothing happens to be listening
 * right now. That is what separates them from the `rdlo.*` topics that were
 * removed — those addressed components that do not exist.
 */
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
    throw new ValidationError('GITHUB_WEBHOOK_SECRET environment variable is required')
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
    return { valid: false, error: 'Missing X-Hub-Signature-256 header', source: WebhookEventSource.GITHUB, eventType: eventType ?? 'unknown' }
  }

  if (!eventType) {
    return { valid: false, error: 'Missing X-GitHub-Event header', source: WebhookEventSource.GITHUB, eventType: 'unknown' }
  }

  const isValid = validateGitHubSignature(payload, signatureHeader)
  if (!isValid) {
    return { valid: false, error: 'Invalid HMAC signature', source: WebhookEventSource.GITHUB, eventType }
  }

  return { valid: true, source: WebhookEventSource.GITHUB, eventType }
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
    source: WebhookEventSource.GITHUB,
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
