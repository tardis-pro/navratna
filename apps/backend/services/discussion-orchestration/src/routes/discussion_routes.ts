type Elysia = { group: Function }
import { withNginxAuth } from '@uaip/middleware'
import { DiscussionService } from '@uaip/shared-services/discussion'
import { DiscussionOrchestrationService } from '../services/discussion_orchestration_service.js'
import { logger } from '@uaip/utils'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function registerDiscussionRoutes(
  app: Elysia,
  discussionService: DiscussionService,
  orchestrationService: DiscussionOrchestrationService
): Elysia {
  return (app as unknown as { group: Function }).group(
    '/api/v1/discussions',
    (group: {
      get: Function
      post: Function
      put: Function
      delete: Function
    }) => {
      const applyNginxAuth = withNginxAuth as unknown as (app: typeof group) => typeof group
      const authedGroup = applyNginxAuth(group)

      return authedGroup
        .get('/', async (ctx) => {
          try {
            const { limit = '20', offset = '0', ...filters } = ctx.query
            const result = await discussionService.searchDiscussions(
              filters as Parameters<typeof discussionService.searchDiscussions>[0],
              parseInt(limit, 10),
              parseInt(offset, 10)
            )
            return { success: true, ...result }
          } catch (error) {
            logger.error('Failed to list discussions', { error })
            ctx.set.status = 500
            return { success: false, error: 'Failed to list discussions' }
          }
        })

        .post('/', async (ctx) => {
          try {
            const body = isRecord(ctx.body) ? ctx.body : {}
            const userId = ctx.user.id
            const discussion = await discussionService.createDiscussion(
              {
                ...body,
                createdBy: userId,
              } as Parameters<typeof discussionService.createDiscussion>[0]
            )
            ctx.set.status = 201
            return { success: true, data: discussion }
          } catch (error) {
            logger.error('Failed to create discussion', { error })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to create discussion',
            }
          }
        })

        .get('/search', async (ctx) => {
          try {
            const { limit = '20', offset = '0', ...filters } = ctx.query
            const result = await discussionService.searchDiscussions(
              filters as Parameters<typeof discussionService.searchDiscussions>[0],
              parseInt(limit, 10),
              parseInt(offset, 10)
            )
            return { success: true, ...result }
          } catch (error) {
            logger.error('Failed to search discussions', { error })
            ctx.set.status = 500
            return { success: false, error: 'Failed to search discussions' }
          }
        })

        .get('/:id', async (ctx) => {
          try {
            const discussion = await discussionService.getDiscussion(ctx.params.id)
            if (!discussion) {
              ctx.set.status = 404
              return { success: false, error: 'Discussion not found' }
            }
            return { success: true, data: discussion }
          } catch (error) {
            logger.error('Failed to get discussion', { error, id: ctx.params.id })
            ctx.set.status = 500
            return { success: false, error: 'Failed to get discussion' }
          }
        })

        .put('/:id', async (ctx) => {
          try {
            const discussion = await discussionService.updateDiscussion(
              ctx.params.id,
              ctx.body as Parameters<typeof discussionService.updateDiscussion>[1]
            )
            return { success: true, data: discussion }
          } catch (error) {
            logger.error('Failed to update discussion', { error, id: ctx.params.id })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to update discussion',
            }
          }
        })

        .post('/:id/start', async (ctx) => {
          try {
            const startedBy = ctx.user.id
            const discussion = await discussionService.startDiscussion(ctx.params.id, startedBy)
            return { success: true, data: discussion }
          } catch (error) {
            logger.error('Failed to start discussion', { error, id: ctx.params.id })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to start discussion',
            }
          }
        })

        .post('/:id/end', async (ctx) => {
          try {
            const endedBy = ctx.user.id
            const body = ctx.body as { reason?: string } | undefined
            const discussion = await discussionService.endDiscussion(ctx.params.id, endedBy, body?.reason)
            return { success: true, data: discussion }
          } catch (error) {
            logger.error('Failed to end discussion', { error, id: ctx.params.id })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to end discussion',
            }
          }
        })

        .post('/:id/participants', async (ctx) => {
            try {
              const addedBy = ctx.user.id
              const result = await orchestrationService.addParticipant(
                ctx.params.id,
                ctx.body as Parameters<typeof orchestrationService.addParticipant>[1],
                addedBy
              )
              ctx.set.status = 201
              return { success: true, data: result }
            } catch (error) {
              logger.error('Failed to add participant', { error, id: ctx.params.id })
              ctx.set.status = 400
              return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to add participant',
              }
            }
        })

        .delete('/:id/participants/:pid', async (ctx) => {
          try {
            const removedBy = ctx.user.id
            await discussionService.removeParticipant(ctx.params.id, ctx.params.pid, removedBy)
            return { success: true, message: 'Participant removed' }
          } catch (error) {
            logger.error('Failed to remove participant', { error, id: ctx.params.id })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to remove participant',
            }
          }
        })

        .post('/:id/participants/:pid/messages', async (ctx) => {
          try {
            const body = ctx.body as { content: string; messageType?: string; metadata?: Record<string, unknown> }
            const result = await orchestrationService.sendMessage(
              ctx.params.id,
              ctx.params.pid,
              body.content,
              body.messageType || 'message',
              body.metadata
            )
            if (!result.success) {
              ctx.set.status = 400
              return { success: false, error: result.error }
            }
            ctx.set.status = 201
            return { success: true, data: result }
          } catch (error) {
            logger.error('Failed to send message', { error, id: ctx.params.id })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to send message',
            }
          }
        })

        .get('/:id/messages', async (ctx) => {
          try {
            const { limit = '50', offset = '0' } = ctx.query
            const messages = await discussionService.getDiscussionMessages(ctx.params.id, {
              limit: parseInt(limit, 10),
              offset: parseInt(offset, 10),
            })
            return { success: true, data: messages }
          } catch (error) {
            logger.error('Failed to get messages', { error, id: ctx.params.id })
            ctx.set.status = 500
            return { success: false, error: 'Failed to get messages' }
          }
        })

        .post('/:id/advance-turn', async (ctx) => {
          try {
            const forcedBy = ctx.user.id
            await discussionService.advanceTurn(ctx.params.id, forcedBy)
            return { success: true, message: 'Turn advanced' }
          } catch (error) {
            logger.error('Failed to advance turn', { error, id: ctx.params.id })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to advance turn',
            }
          }
        })

        .get('/:id/analytics', async (ctx) => {
          try {
            const analytics = await discussionService.getDiscussionAnalytics(ctx.params.id)
            return { success: true, data: analytics }
          } catch (error) {
            logger.error('Failed to get discussion analytics', { error, id: ctx.params.id })
            ctx.set.status = 500
            return { success: false, error: 'Failed to get discussion analytics' }
          }
        })

        .post('/:id/turns/request', async (ctx) => {
          try {
            const body = ctx.body as { participantId?: string; reason?: string } | undefined
            const participantId = body?.participantId
            if (!participantId) {
              ctx.set.status = 400
              return { success: false, error: 'participantId is required' }
            }
            const result = await orchestrationService.requestTurn(ctx.params.id, participantId)
            return { success: true, data: result }
          } catch (error) {
            logger.error('Failed to request turn', { error, id: ctx.params.id })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to request turn',
            }
          }
        })

        .post('/:id/huddle', async (ctx) => {
          try {
            const body = ctx.body as {
              initiatorId?: string
              participants?: string[]
              topic?: string
              context?: string
            } | undefined
            const participantIds =
              body?.participants && body.participants.length > 0
                ? body.participants
                : body?.initiatorId
                  ? [body.initiatorId]
                  : []
            if (participantIds.length === 0) {
              ctx.set.status = 400
              return { success: false, error: 'participants or initiatorId is required' }
            }
            const result = await orchestrationService.createHuddle(
              ctx.params.id,
              participantIds,
              body?.topic || 'Specialist huddle'
            )
            ctx.set.status = 201
            return { success: true, data: result }
          } catch (error) {
            logger.error('Failed to create huddle', { error, id: ctx.params.id })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to create huddle',
            }
          }
        })

        .post('/:id/huddles/:huddle_id/resolve', async (ctx) => {
          try {
            const body = ctx.body as { summary?: string } | undefined
            await orchestrationService.resolveHuddle(ctx.params.huddle_id, body?.summary || '')
            return { success: true, message: 'Huddle resolved' }
          } catch (error) {
            logger.error('Failed to resolve huddle', { error, huddleId: ctx.params.huddle_id })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to resolve huddle',
            }
          }
        })
    }
  ) as unknown as Elysia
}
