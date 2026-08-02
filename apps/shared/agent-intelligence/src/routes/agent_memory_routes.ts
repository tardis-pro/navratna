import { Elysia } from 'elysia'
import { withNginxAuth, getNginxUser } from '@uaip/middleware'
import type { SemanticMemoryManager } from '@uaip/shared-services'
import { canAccessAgent } from '@uaip/shared-services'
import { logger, isRecord } from '@uaip/utils'

type SemanticMemoryDeps = Pick<
  SemanticMemoryManager,
  'pruneMemory' | 'reinforceConcept' | 'downvoteMemory'
>

// These routes MUTATE an agent's memory, so an unguarded agentId in the URL is
// a write primitive against any agent in any tenant.
async function isGranted(ctx: unknown, agentId: string): Promise<boolean> {
  const { id: userId, organizationId, role } = getNginxUser(ctx)
  return canAccessAgent({ userId, organizationId, role }, agentId)
}

// 404 rather than 403 so an unassigned agent stays indistinguishable from a
// missing one — a 403 confirms it exists.
const AGENT_NOT_FOUND = { success: false, error: 'Agent not found' } as const


export function registerAgentMemoryRoutes(
  semanticMemoryManager: SemanticMemoryDeps
) {
  return new Elysia().group(
    '/api/v1/agents',
    (group) => withNginxAuth(group)
      .delete('/:agentId/memory/semantic/:conceptId', async (ctx) => {
        try {
          if (!(await isGranted(ctx, ctx.params.agentId))) {
            ctx.set.status = 404
            return AGENT_NOT_FOUND
          }
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
          if (!(await isGranted(ctx, ctx.params.agentId))) {
            ctx.set.status = 404
            return AGENT_NOT_FOUND
          }
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
}
