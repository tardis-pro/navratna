import { z } from 'zod'
import { Elysia } from 'elysia'
import { logger } from '@uaip/utils'
import type { JiraWebhookPayload } from '@uaip/types'
import { validateJiraWebhook, routeJiraWebhookEvent } from '../services/jira_webhook_service.js'
import { onJiraStatusChange } from '../services/jira_sync_service.js'

const jiraWebhookBodySchema = z.object({
  webhookEvent: z.string(),
  timestamp: z.number(),
  user: z.object({
    accountId: z.string(),
    displayName: z.string(),
  }).passthrough(),
  issue: z.object({
    id: z.string(),
    key: z.string(),
    fields: z.record(z.unknown()),
  }).passthrough().optional(),
  sprint: z.record(z.unknown()).optional(),
  changelog: z.object({
    items: z.array(z.object({
      field: z.string(),
      fieldtype: z.string(),
      from: z.string().nullable(),
      fromString: z.string().nullable(),
      to: z.string().nullable(),
      toString: z.string().nullable(),
    })),
  }).optional(),
}).passthrough()

export function registerJiraWebhookRoutes() {
  return new Elysia()
    .post('/api/v1/webhooks/jira', async (ctx) => {
    const rawBody = typeof ctx.body === 'string' ? ctx.body : JSON.stringify(ctx.body)
    const signatureHeader = ctx.request.headers.get('x-hub-signature')
    const deliveryId = `jira-${Date.now()}`

    const validation = validateJiraWebhook(rawBody, signatureHeader)

    if (!validation.valid) {
      logger.warn('Jira webhook validation failed', { error: validation.error, deliveryId })
      ctx.set.status = 401
      return { success: false, error: validation.error }
    }

    const parsed = jiraWebhookBodySchema.safeParse(ctx.body)
    if (!parsed.success) {
      ctx.set.status = 400
      return { success: false, error: 'Invalid webhook payload' }
    }

    const payload = parsed.data as unknown as JiraWebhookPayload

    routeJiraWebhookEvent(payload, deliveryId).catch((error) => {
      logger.error('Async Jira webhook processing failed', {
        error: error instanceof Error ? error.message : String(error),
        deliveryId,
      })
    })

    if (payload.webhookEvent === 'issue_updated' && payload.changelog) {
      onJiraStatusChange(payload).catch((error) => {
        logger.error('Jira status sync failed', {
          error: error instanceof Error ? error.message : String(error),
          issueKey: payload.issue?.key,
        })
      })
    }

    return { success: true, deliveryId }
    })
}
