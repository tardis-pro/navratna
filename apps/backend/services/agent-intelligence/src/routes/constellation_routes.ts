import { z } from 'zod'
import { Elysia } from 'elysia'
import { withNginxAuth } from '@uaip/middleware'
import { getConstellations } from '@uaip/shared-services'
import type { ConstellationRequest } from '@uaip/types'
import { logger } from '@uaip/utils'

const constellationRequestSchema = z.object({
  query: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
  includeItems: z.boolean().optional(),
})

export function registerConstellationRoutes<T extends Elysia>(app: T): T {
  app.group('/api/v1/knowledge', (group: unknown) =>
    withNginxAuth(group as unknown as Parameters<typeof withNginxAuth>[0]).post('/constellations', async (ctx) => {
      const parsed = constellationRequestSchema.safeParse(ctx.body)

      if (!parsed.success) {
        ctx.set.status = 400
        return {
          success: false,
          error: 'Invalid constellation request',
          details: parsed.error.flatten(),
        }
      }

      try {
        const request: ConstellationRequest = parsed.data
        const response = await getConstellations(request)
        // @ts-expect-error -- withNginxAuth injects user into Elysia context for guarded groups
        const userId = ctx.user.id
        return {
          success: true,
          requestedBy: userId,
          ...response,
        }
      } catch (error) {
        // @ts-expect-error -- withNginxAuth injects user into Elysia context for guarded groups
        const userId = ctx.user.id
        logger.error('Failed to build constellations', { error, userId })
        ctx.set.status = 500
        return {
          success: false,
          error: 'Failed to build constellations',
        }
      }
    })
  )

  return app
}
