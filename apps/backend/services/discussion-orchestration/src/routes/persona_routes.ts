type Elysia = { group: Function }
import { withNginxAuth } from '@uaip/middleware'
import { PersonaService } from '@uaip/shared-services/persona'
import { logger } from '@uaip/utils'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function registerPersonaRoutes(app: Elysia, personaService: PersonaService): Elysia {
  return (app as unknown as { group: Function }).group(
    '/api/v1/personas',
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
            const result = await personaService.searchPersonas(
              filters as Parameters<typeof personaService.searchPersonas>[0],
              parseInt(limit, 10),
              parseInt(offset, 10)
            )
            return { success: true, ...result }
          } catch (error) {
            logger.error('Failed to list personas', { error })
            ctx.set.status = 500
            return { success: false, error: 'Failed to list personas' }
          }
        })

        .post('/', async (ctx) => {
          try {
            const body = isRecord(ctx.body) ? ctx.body : {}
            const userId = ctx.user.id
            const persona = await personaService.createPersona(
              {
                ...body,
                createdBy: userId,
              } as Parameters<typeof personaService.createPersona>[0]
            )
            ctx.set.status = 201
            return { success: true, data: persona }
          } catch (error) {
            logger.error('Failed to create persona', { error })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to create persona',
            }
          }
        })

        .get('/search', async (ctx) => {
          try {
            const { limit = '20', offset = '0', ...filters } = ctx.query
            const result = await personaService.searchPersonas(
              filters as Parameters<typeof personaService.searchPersonas>[0],
              parseInt(limit, 10),
              parseInt(offset, 10)
            )
            return { success: true, ...result }
          } catch (error) {
            logger.error('Failed to search personas', { error })
            ctx.set.status = 500
            return { success: false, error: 'Failed to search personas' }
          }
        })

        .get('/recommendations', async (ctx) => {
          try {
            const userId = ctx.user.id
            const { context: contextStr, limit = '10' } = ctx.query
            const recommendations = await personaService.getPersonaRecommendations(
              userId,
              contextStr,
              parseInt(limit, 10)
            )
            return { success: true, data: recommendations }
          } catch (error) {
            logger.error('Failed to get persona recommendations', { error })
            ctx.set.status = 500
            return { success: false, error: 'Failed to get persona recommendations' }
          }
        })

        .get('/templates', async (ctx) => {
          try {
            const { category } = ctx.query
            const templates = await personaService.getPersonaTemplates(category)
            return { success: true, data: templates }
          } catch (error) {
            logger.error('Failed to get persona templates', { error })
            ctx.set.status = 500
            return { success: false, error: 'Failed to get persona templates' }
          }
        })

        .get('/:id', async (ctx) => {
          try {
            const persona = await personaService.getPersona(ctx.params.id)
            if (!persona) {
              ctx.set.status = 404
              return { success: false, error: 'Persona not found' }
            }
            return { success: true, data: persona }
          } catch (error) {
            logger.error('Failed to get persona', { error, id: ctx.params.id })
            ctx.set.status = 500
            return { success: false, error: 'Failed to get persona' }
          }
        })

        .put('/:id', async (ctx) => {
          try {
            const persona = await personaService.updatePersona(
              ctx.params.id,
              ctx.body as Parameters<typeof personaService.updatePersona>[1]
            )
            return { success: true, data: persona }
          } catch (error) {
            logger.error('Failed to update persona', { error, id: ctx.params.id })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to update persona',
            }
          }
        })

        .delete('/:id', async (ctx) => {
          try {
            const deletedBy = ctx.user.id
            await personaService.deletePersona(ctx.params.id, deletedBy)
            return { success: true, message: 'Persona deleted' }
          } catch (error) {
            logger.error('Failed to delete persona', { error, id: ctx.params.id })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to delete persona',
            }
          }
        })

        .get('/:id/analytics', async (ctx) => {
          try {
            const analytics = await personaService.getPersonaAnalytics(ctx.params.id)
            return { success: true, data: analytics }
          } catch (error) {
            logger.error('Failed to get persona analytics', { error, id: ctx.params.id })
            ctx.set.status = 500
            return { success: false, error: 'Failed to get persona analytics' }
          }
        })

        .post('/:id/validate', async (ctx) => {
          try {
            const persona = await personaService.getPersona(ctx.params.id)
            if (!persona) {
              ctx.set.status = 404
              return { success: false, error: 'Persona not found' }
            }
            const validation = await personaService.validatePersona(persona)
            return { success: true, data: validation }
          } catch (error) {
            logger.error('Failed to validate persona', { error, id: ctx.params.id })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to validate persona',
            }
          }
        })
    }
  ) as unknown as Elysia
}
