import { createHmac, timingSafeEqual } from 'node:crypto'
import { logger, ValidationError } from '@uaip/utils'
import { EventBusService } from '@uaip/infra'
import type {
  JiraWebhookEventType,
  JiraWebhookPayload,
  WebhookEvent,
  WebhookValidationResult,
  WebhookEventSource,
} from '@uaip/types'

const JIRA_EVENT_TOPIC_MAP: Record<string, string> = {
  issue_updated: 'jira.issue.updated',
  issue_created: 'jira.issue.created',
  issue_deleted: 'jira.issue.deleted',
  sprint_started: 'jira.sprint.started',
  sprint_completed: 'jira.sprint.completed',
  sprint_created: 'jira.sprint.created',
}

function getWebhookSecret(): string {
  const secret = process.env.JIRA_WEBHOOK_SECRET
  if (!secret) {
    throw new ValidationError('JIRA_WEBHOOK_SECRET environment variable is required')
  }
  return secret
}

export function validateJiraWebhook(
  payload: string,
  signatureHeader: string | null
): WebhookValidationResult {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing webhook signature', source: 'jira' as WebhookEventSource, eventType: 'unknown' }
  }

  const secret = getWebhookSecret()
  const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex')

  const isValid =
    signatureHeader.length === expectedSignature.length &&
    timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSignature))

  if (!isValid) {
    return { valid: false, error: 'Invalid webhook signature', source: 'jira' as WebhookEventSource, eventType: 'unknown' }
  }

  return { valid: true, source: 'jira' as WebhookEventSource, eventType: 'jira_event' }
}

export async function routeJiraWebhookEvent(
  payload: JiraWebhookPayload,
  deliveryId: string
): Promise<void> {
  const eventType = payload.webhookEvent
  const topic = JIRA_EVENT_TOPIC_MAP[eventType]

  if (!topic) {
    logger.warn('Unhandled Jira webhook event type', { eventType, deliveryId })
    return
  }

  const event: WebhookEvent<JiraWebhookPayload> = {
    id: deliveryId,
    source: 'jira' as WebhookEventSource,
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
    logger.info('Jira webhook event routed', { eventType, topic, deliveryId })
  } catch (error) {
    logger.error('Failed to route Jira webhook event', {
      error: error instanceof Error ? error.message : String(error),
      eventType,
      deliveryId,
    })
  }
}
