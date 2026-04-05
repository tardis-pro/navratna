import { Elysia } from 'elysia'
import { withNginxAuth, t } from '@uaip/middleware'
import { PersonaService } from '@uaip/shared-services/persona'
import { logger } from '@uaip/utils'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function registerPersonaRoutes(personaService: PersonaService) {
  return new Elysia()
    .group('/api/v1/personas', (group) => {
      return withNginxAuth(group)
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
        }, {
          query: t.Object({ limit: t.Optional(t.String()), offset: t.Optional(t.String()) }, { additionalProperties: true }),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Optional(t.Array(t.Any())), total: t.Optional(t.Number()) }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        })

        .post('/', async (ctx) => {
          try {
            const body = isRecord(ctx.body) ? ctx.body : {}
            const userId = (ctx as unknown as { user: { id: string; role?: string } } /* Elysia withNginxAuth injects user context that TypeScript cannot infer through nested groups */).user.id
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
        }, {
          body: t.Object({
            name: t.String(),
            description: t.Optional(t.String()),
            role: t.Optional(t.String()),
            traits: t.Optional(t.Array(t.Any())),
            expertise: t.Optional(t.Array(t.String())),
            systemPrompt: t.Optional(t.String()),
            metadata: t.Optional(t.Record(t.String(), t.Unknown())),
          }, { additionalProperties: true }),
          response: {
            201: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
          },
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
        }, {
          query: t.Object({ limit: t.Optional(t.String()), offset: t.Optional(t.String()) }, { additionalProperties: true }),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Optional(t.Array(t.Any())), total: t.Optional(t.Number()) }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        })

        .get('/recommendations', async (ctx) => {
          try {
            const userId = (ctx as unknown as { user: { id: string; role?: string } } /* Elysia withNginxAuth injects user context that TypeScript cannot infer through nested groups */).user.id
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
        }, {
          query: t.Object({ context: t.Optional(t.String()), limit: t.Optional(t.String()) }),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Array(t.Any()) }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
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
        }, {
          query: t.Object({ category: t.Optional(t.String()) }),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Array(t.Any()) }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
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
        }, {
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            404: t.Object({ success: t.Literal(false), error: t.String() }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        })

        .put('/:id', async (ctx) => {
          try {
            const userId: string = (ctx as unknown as { user: { id: string; role?: string } } /* Elysia withNginxAuth injects user context that TypeScript cannot infer through nested groups */).user.id
            const userRole: string = (ctx as unknown as { user: { id: string; role?: string } } /* Elysia withNginxAuth injects user context that TypeScript cannot infer through nested groups */).user.role ?? ''

            const existing = await personaService.getPersona(ctx.params.id)
            if (!existing) {
              ctx.set.status = 404
              return { success: false, error: 'Persona not found' }
            }

            if (existing.createdBy !== userId && userRole !== 'admin') {
              ctx.set.status = 403
              return { success: false, error: 'Forbidden: you do not own this persona' }
            }

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
        }, {
          body: t.Object({
            name: t.Optional(t.String()),
            description: t.Optional(t.String()),
            role: t.Optional(t.String()),
            traits: t.Optional(t.Array(t.Any())),
            expertise: t.Optional(t.Array(t.String())),
            systemPrompt: t.Optional(t.String()),
            metadata: t.Optional(t.Record(t.String(), t.Unknown())),
          }, { additionalProperties: true }),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
            403: t.Object({ success: t.Literal(false), error: t.String() }),
            404: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        })

        .delete('/:id', async (ctx) => {
          try {
            const userId: string = (ctx as unknown as { user: { id: string; role?: string } } /* Elysia withNginxAuth injects user context that TypeScript cannot infer through nested groups */).user.id
            const userRole: string = (ctx as unknown as { user: { id: string; role?: string } } /* Elysia withNginxAuth injects user context that TypeScript cannot infer through nested groups */).user.role ?? ''

            const existing = await personaService.getPersona(ctx.params.id)
            if (!existing) {
              ctx.set.status = 404
              return { success: false, error: 'Persona not found' }
            }

            if (existing.createdBy !== userId && userRole !== 'admin') {
              ctx.set.status = 403
              return { success: false, error: 'Forbidden: you do not own this persona' }
            }

            await personaService.deletePersona(ctx.params.id, userId)
            return { success: true, message: 'Persona deleted' }
          } catch (error) {
            logger.error('Failed to delete persona', { error, id: ctx.params.id })
            ctx.set.status = 400
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to delete persona',
            }
          }
        }, {
          response: {
            200: t.Object({ success: t.Literal(true), message: t.String() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
            403: t.Object({ success: t.Literal(false), error: t.String() }),
            404: t.Object({ success: t.Literal(false), error: t.String() }),
          },
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
        }, {
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            500: t.Object({ success: t.Literal(false), error: t.String() }),
          },
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
        }, {
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Any() }),
            400: t.Object({ success: t.Literal(false), error: t.String() }),
            404: t.Object({ success: t.Literal(false), error: t.String() }),
          },
        })
    })
}
