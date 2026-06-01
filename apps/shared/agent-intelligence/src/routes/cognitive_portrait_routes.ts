import { z } from 'zod'
import { Elysia } from 'elysia'
import { withNginxAuth } from '@uaip/middleware'
import { logger } from '@uaip/utils'
import type { CognitivePortraitRequest } from '@uaip/types'
import { TrustAction } from '@uaip/types'
import {
  getPortrait,
  updateTrustCalibration,
  getPersonalizationVector,
} from '../services/cognitive_portrait_service.js'

const portraitRequestSchema = z.object({
  forceRecompute: z.boolean().optional(),
})

const calibrateRequestSchema = z.object({
  action: z.enum(['override', 'accept']),
  agentId: z.string().min(1),
  context: z.string().min(1),
})

export function registerCognitivePortraitRoutes() {
  return new Elysia().group('/api/v1/users', (group) =>
    withNginxAuth(group)
      .get('/:userId/cognitive-portrait', async (ctx) => {
        const userId = ctx.params.userId
        const forceRecompute = ctx.query?.forceRecompute === 'true'

        try {
          const request: CognitivePortraitRequest = { userId, forceRecompute }
          const response = await getPortrait(request)
          return { success: true, ...response }
        } catch (error) {
          logger.error('Failed to get cognitive portrait', {
            error: error instanceof Error ? error.message : String(error),
            userId,
          })
          ctx.set.status = 500
          return { success: false, error: 'Failed to get cognitive portrait' }
        }
      })
      .post('/:userId/cognitive-portrait/calibrate', async (ctx) => {
        const userId = ctx.params.userId
        const parsed = calibrateRequestSchema.safeParse(ctx.body)

        if (!parsed.success) {
          ctx.set.status = 400
          return { success: false, error: 'Invalid calibration request', details: parsed.error.flatten() }
        }

        try {
          const validActions = Object.values(TrustAction);
          const action = validActions.find(a => a === parsed.data.action) ?? TrustAction.ACCEPT;
          const trust = await updateTrustCalibration(
            userId,
            action,
            parsed.data.agentId,
            parsed.data.context
          )
          return { success: true, trustCalibration: trust }
        } catch (error) {
          logger.error('Failed to calibrate trust', {
            error: error instanceof Error ? error.message : String(error),
            userId,
          })
          ctx.set.status = 500
          return { success: false, error: 'Failed to calibrate trust' }
        }
      })
      .get('/:userId/personalization-vector', async (ctx) => {
        const userId = ctx.params.userId

        try {
          const vector = getPersonalizationVector(userId)
          return { success: true, personalizationVector: vector }
        } catch (error) {
          logger.error('Failed to get personalization vector', {
            error: error instanceof Error ? error.message : String(error),
            userId,
          })
          ctx.set.status = 500
          return { success: false, error: 'Failed to get personalization vector' }
        }
      })
  )
}
