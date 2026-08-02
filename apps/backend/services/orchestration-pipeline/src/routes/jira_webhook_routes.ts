import { z } from 'zod'
import { Elysia } from 'elysia'
import { logger } from '@uaip/utils'
import type { JiraWebhookPayload } from '@uaip/types'
import { validateJiraWebhook, routeJiraWebhookEvent } from '../services/jira_webhook_service.js'
import { onJiraStatusChange } from '../services/jira_sync_service.js'

const jiraWebhookUserSchema = z.object({
  accountId: z.string(),
  displayName: z.string(),
  emailAddress: z.string().optional(),
})

const jiraWebhookIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    status: z.object({ name: z.string(), id: z.string() }),
    issuetype: z.object({ name: z.string() }),
    priority: z.object({ name: z.string() }),
    assignee: jiraWebhookUserSchema.nullable(),
    labels: z.array(z.string()),
    parent: z.object({ key: z.string() }).optional(),
  }),
})

const jiraWebhookSprintSchema = z.object({
  id: z.number(),
  name: z.string(),
  state: z.enum(['active', 'closed', 'future']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  completeDate: z.string().optional(),
  goal: z.string().optional(),
})

const jiraWebhookChangelogSchema = z.object({
  items: z.array(z.object({
    field: z.string(),
    fieldtype: z.string(),
    from: z.string().nullable(),
    fromString: z.string().nullable(),
    to: z.string().nullable(),
    toString: z.string().nullable(),
  })),
})

const jiraWebhookBodySchema = z.object({
  webhookEvent: z.enum(['issue_updated', 'issue_created', 'issue_deleted', 'sprint_started', 'sprint_completed', 'sprint_created']),
  timestamp: z.number(),
  user: jiraWebhookUserSchema,
  issue: jiraWebhookIssueSchema.optional(),
  sprint: jiraWebhookSprintSchema.optional(),
  changelog: jiraWebhookChangelogSchema.optional(),
})

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isJiraWebhookPayload(data: unknown): data is JiraWebhookPayload {
  if (!isRecord(data)) return false
  return (
    typeof data['webhookEvent'] === 'string' &&
    typeof data['timestamp'] === 'number' &&
    typeof data['user'] === 'object' && data['user'] !== null
  )
}

export function registerJiraWebhookRoutes() {
  return new Elysia()
    // Deliver the Jira webhook body as the raw text Jira signed. The HMAC in
    // validateJiraWebhook is computed over the exact bytes; letting Elysia parse
    // JSON and re-serializing it (key order / whitespace) makes every legitimate
    // webhook fail signature verification. This instance holds only the webhook
    // route, so overriding the parser here is safe.
    .onParse(({ request }, contentType) => {
      if (contentType.startsWith('application/json')) {
        return request.text()
      }
    })
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

    let decodedBody: unknown
    try {
      decodedBody = JSON.parse(rawBody)
    } catch {
      ctx.set.status = 400
      return { success: false, error: 'Invalid webhook payload' }
    }

    const parsed = jiraWebhookBodySchema.safeParse(decodedBody)
    if (!parsed.success) {
      ctx.set.status = 400
      return { success: false, error: 'Invalid webhook payload' }
    }

    if (!isJiraWebhookPayload(parsed.data)) {
      ctx.set.status = 400
      return { success: false, error: 'Invalid webhook payload structure' }
    }
    const payload = parsed.data

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
