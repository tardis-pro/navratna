import type { AnyElysia } from 'elysia'
import { withNginxAuth } from '@uaip/middleware'
import type { AgentIntelligenceService } from '@uaip/shared-services'
import { logger } from '@uaip/utils'

type AgentCrudDeps = Pick<
  AgentIntelligenceService,
  'getAgents' | 'createAgent' | 'getAgent' | 'updateAgent' | 'deleteAgent'
>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function registerAgentCrudRoutes(
  app: AnyElysia,
  agentIntelligenceService: AgentCrudDeps
): AnyElysia {
  return app.group(
    '/api/v1/agents',
    (group: AnyElysia) =>
      withNginxAuth(group)
        .get('/', async (ctx) => {
          try {
            const agents = (await agentIntelligenceService.getAgents()) ?? []
            return { success: true, data: agents, total: agents.length }
          } catch (error) {
            logger.error('Failed to list agents', { error })
            ctx.set.status = 500
            return { success: false, error: 'Failed to list agents' }
          }
        })

        .post('/', async (ctx) => {
          try {
            const body = isRecord(ctx.body) ? ctx.body : {}
            // @ts-expect-error -- withNginxAuth injects user into Elysia context for guarded groups
            const userId = ctx.user.id
            const agent = await agentIntelligenceService.createAgent({
              ...body,
              createdBy: userId,
            })
            ctx.set.status = 201
            return { success: true, data: agent }
          } catch (error) {
            logger.error('Failed to create agent', { error })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to create agent',
            }
          }
        })

        .get('/:agentId', async (ctx) => {
          try {
            const agent = await agentIntelligenceService.getAgent(ctx.params.agentId)
            if (!agent) {
              ctx.set.status = 404
              return { success: false, error: 'Agent not found' }
            }

            return { success: true, data: agent }
          } catch (error) {
            logger.error('Failed to get agent', { error, agentId: ctx.params.agentId })
            ctx.set.status = 500
            return { success: false, error: 'Failed to get agent' }
          }
        })

        .put('/:agentId', async (ctx) => {
          try {
            const body = isRecord(ctx.body) ? ctx.body : {}
            // @ts-expect-error -- withNginxAuth injects user into Elysia context for guarded groups
            const userId = ctx.user.id
            const agent = await agentIntelligenceService.updateAgent(ctx.params.agentId, {
              ...body,
              updatedBy: userId,
            })
            return { success: true, data: agent }
          } catch (error) {
            logger.error('Failed to update agent', { error, agentId: ctx.params.agentId })
            ctx.set.status = error instanceof Error && error.message.includes('not found') ? 404 : 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to update agent',
            }
          }
        })

        .delete('/:agentId', async (ctx) => {
          try {
            await agentIntelligenceService.deleteAgent(ctx.params.agentId)
            return { success: true, message: 'Agent deleted' }
          } catch (error) {
            logger.error('Failed to delete agent', { error, agentId: ctx.params.agentId })
            ctx.set.status = error instanceof Error && error.message.includes('not found') ? 404 : 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to delete agent',
            }
          }
        })
  )
}
