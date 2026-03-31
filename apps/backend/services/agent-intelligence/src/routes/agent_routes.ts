import { z } from 'zod'
import { Elysia } from 'elysia'
import { withNginxAuth } from '@uaip/middleware'
import { scoreRelevance } from '@uaip/shared-services'
import { logger } from '@uaip/utils'

const candidateSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['agent', 'sop', 'task', 'knowledge', 'capability']),
  vector: z.array(z.number()).optional(),
  metadata: z.record(z.unknown()).optional(),
})

const relevanceSchema = z.object({
  query: z.string().min(1),
  candidates: z.array(candidateSchema),
  weights: z
    .object({
      vector: z.number(),
      graph: z.number(),
      recency: z.number(),
      explicit: z.number(),
    })
    .optional(),
  limit: z.number().int().positive().max(100).optional(),
})

export function registerAgentRoutes<T extends Elysia>(app: T): T {
  app.group('/api/v1/agents', (group) =>
    withNginxAuth(group).post('/relevance', async (ctx) => {
      const parsed = relevanceSchema.safeParse(ctx.body)

      if (!parsed.success) {
        ctx.set.status = 400
        return {
          success: false,
          error: 'Invalid relevance payload',
          details: parsed.error.flatten(),
        }
      }

      try {
        const payload = relevanceSchema.parse(ctx.body)
        const results = await scoreRelevance({
          query: payload.query,
          candidates: payload.candidates.map((candidate) => ({
            id: candidate.id,
            type: candidate.type,
            ...(candidate.vector ? { vector: candidate.vector } : {}),
            ...(candidate.metadata ? { metadata: candidate.metadata } : {}),
          })),
          ...(payload.weights
            ? {
                weights: {
                  vector: payload.weights.vector,
                  graph: payload.weights.graph,
                  recency: payload.weights.recency,
                  explicit: payload.weights.explicit,
                },
              }
            : {}),
          ...(payload.limit ? { limit: payload.limit } : {}),
        })
        // @ts-expect-error -- withNginxAuth injects user into Elysia context for guarded groups
        const userId = ctx.user.id
        return {
          success: true,
          results,
          total: results.length,
          query: payload.query,
          requestedBy: userId,
        }
      } catch (error) {
        // @ts-expect-error -- withNginxAuth injects user into Elysia context for guarded groups
        const userId = ctx.user.id
        logger.error('Failed to score relevance', { error, userId })
        ctx.set.status = 500
        return {
          success: false,
          error: 'Failed to score relevance',
        }
      }
    })
  )

  return app
}
