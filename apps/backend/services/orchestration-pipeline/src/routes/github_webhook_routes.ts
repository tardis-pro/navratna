import { z } from 'zod'
import { Elysia } from 'elysia'
import { logger } from '@uaip/utils'
import type { GitHubWebhookEventType, GitHubCheckRunPayload, GitHubCheckSuitePayload, GitHubWebhookPayload } from '@uaip/types'
import {
  validateGitHubWebhook,
  routeGitHubWebhookEvent,
} from '../services/github_webhook_service.js'
import {
  evaluateCheckRun,
  evaluateCheckSuite,
  handleCIResult,
} from '../services/github_ci_monitor_service.js'

const VALID_GITHUB_EVENT_TYPES = new Set<string>([
  'push', 'pull_request', 'check_run', 'check_suite', 'issue_comment', 'issues', 'pull_request_review',
])

function isGitHubWebhookEventType(s: string): s is GitHubWebhookEventType {
  return VALID_GITHUB_EVENT_TYPES.has(s)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isGitHubWebhookPayload(data: unknown): data is GitHubWebhookPayload {
  if (!isRecord(data)) return false
  return isRecord(data['repository']) && isRecord(data['sender'])
}

function isGitHubCheckRunPayload(data: unknown): data is GitHubCheckRunPayload {
  if (!isGitHubWebhookPayload(data)) return false
  return isRecord((data as unknown as Record<string, unknown>)['check_run'])
}

function isGitHubCheckSuitePayload(data: unknown): data is GitHubCheckSuitePayload {
  if (!isGitHubWebhookPayload(data)) return false
  return isRecord((data as unknown as Record<string, unknown>)['check_suite'])
}

const webhookBodySchema = z.object({
  action: z.string().optional(),
  repository: z.object({
    id: z.number(),
    full_name: z.string(),
  }).passthrough().optional(),
  sender: z.object({
    id: z.number(),
    login: z.string(),
  }).passthrough().optional(),
}).passthrough()

export function registerGitHubWebhookRoutes() {
  return new Elysia()
    .post('/api/v1/webhooks/github', async (ctx) => {
    const rawBody = typeof ctx.body === 'string' ? ctx.body : JSON.stringify(ctx.body)
    const signatureHeader = ctx.request.headers.get('x-hub-signature-256')
    const eventType = ctx.request.headers.get('x-github-event')
    const deliveryId = ctx.request.headers.get('x-github-delivery') ?? `gh-${Date.now()}`

    const validation = validateGitHubWebhook(rawBody, signatureHeader, eventType)

    if (!validation.valid) {
      logger.warn('GitHub webhook validation failed', { error: validation.error, deliveryId })
      ctx.set.status = 401
      return { success: false, error: validation.error }
    }

    const parsed = webhookBodySchema.safeParse(ctx.body)
    if (!parsed.success) {
      ctx.set.status = 400
      return { success: false, error: 'Invalid webhook payload' }
    }

    if (eventType !== null && isGitHubWebhookEventType(eventType) && isGitHubWebhookPayload(parsed.data)) {
      routeGitHubWebhookEvent(
        eventType,
        parsed.data,
        deliveryId
      ).catch((error) => {
        logger.error('Async webhook processing failed', {
          error: error instanceof Error ? error.message : String(error),
          deliveryId,
        })
      })
    }

    if (eventType === 'check_run' && parsed.data.action === 'completed' && isGitHubCheckRunPayload(parsed.data)) {
      const result = evaluateCheckRun(parsed.data)
      handleCIResult(result).catch((error) => {
        logger.error('CI result handling failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }

    if (eventType === 'check_suite' && parsed.data.action === 'completed' && isGitHubCheckSuitePayload(parsed.data)) {
      const result = evaluateCheckSuite(parsed.data)
      handleCIResult(result).catch((error) => {
        logger.error('CI suite result handling failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }

    return { success: true, deliveryId }
    })
}
