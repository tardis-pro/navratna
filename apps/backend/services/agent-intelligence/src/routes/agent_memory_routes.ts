import { Elysia } from 'elysia'
import { withNginxAuth } from '@uaip/middleware'
import type { SemanticMemoryManager } from '@uaip/shared-services'
import { logger } from '@uaip/utils'

type SemanticMemoryDeps = Pick<
  SemanticMemoryManager,
  'pruneMemory' | 'reinforceConcept' | 'downvoteMemory'
>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function registerAgentMemoryRoutes<T extends Elysia>(
  app: T,
  semanticMemoryManager: SemanticMemoryDeps
): T {
  app.group(
    '/api/v1/agents',
    (group) => withNginxAuth(group)
      .delete('/:agentId/memory/semantic/:conceptId', async (ctx) => {
        try {
          await semanticMemoryManager.pruneMemory(ctx.params.agentId, ctx.params.conceptId)
          return { success: true, message: 'Semantic concept pruned' }
        } catch (error) {
          logger.error('Failed to prune semantic concept', {
            error,
            agentId: ctx.params.agentId,
            conceptId: ctx.params.conceptId,
          })
          ctx.set.status = 400
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to prune concept',
          }
        }
      })
    
      .patch('/:agentId/memory/semantic/:conceptId', async (ctx) => {
        try {
          const body = isRecord(ctx.body) ? ctx.body : {}
          if (body.action === 'reinforce') {
            const newExample = typeof body.example === 'string' ? body.example : undefined
            await semanticMemoryManager.reinforceConcept(
              ctx.params.agentId,
              ctx.params.conceptId,
              newExample
            )
            return { success: true, message: 'Concept reinforced' }
          }
    
          await semanticMemoryManager.downvoteMemory(ctx.params.agentId, ctx.params.conceptId)
          return { success: true, message: 'Concept downvoted' }
        } catch (error) {
          logger.error('Failed to update semantic concept', {
            error,
            agentId: ctx.params.agentId,
            conceptId: ctx.params.conceptId,
          })
          ctx.set.status = 400
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update concept',
          }
        }
      })
  )

  return app
}
