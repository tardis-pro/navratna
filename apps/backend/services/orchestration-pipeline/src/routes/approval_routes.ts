import { Elysia } from 'elysia'
import { withRequiredAuth } from '@uaip/middleware'
import type { ApprovalResponsePayload } from '@uaip/types'
import { logger } from '@uaip/utils'
import { RDLOApprovalService } from '../services/rdlo_approval_service.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseApprovalResponsePayload(value: unknown): ApprovalResponsePayload | null {
  if (!isRecord(value) || typeof value.approved !== 'boolean') {
    return null
  }

  if ('comment' in value && typeof value.comment !== 'string' && value.comment !== undefined) {
    return null
  }

  return {
    approved: value.approved,
    ...(typeof value.comment === 'string' ? { comment: value.comment } : {}),
  }
}

export function registerApprovalRoutes(approvalService: RDLOApprovalService) {
  return new Elysia()
    .group('/api/v1/orchestration', (group) =>
      withRequiredAuth(group).post('/approvals/:id', async (ctx) => {
        const payload = parseApprovalResponsePayload(ctx.body)
        if (!payload) {
          ctx.set.status = 400
          return {
            success: false,
            error: 'Invalid approval response payload',
          }
        }

        try {
          const approval = await approvalService.handleResponse(
            ctx.params.id,
            payload.approved,
            payload.comment
          )

          return {
            success: true,
            data: approval,
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to resolve approval'
          if (message.includes('not found')) {
            ctx.set.status = 404
            return {
              success: false,
              error: message,
            }
          }

          logger.error('Failed to resolve RDLO approval response', {
            approvalId: ctx.params.id,
            error: message,
          })
          ctx.set.status = 500
          return {
            success: false,
            error: 'Failed to resolve approval',
          }
        }
      })
    )
}
