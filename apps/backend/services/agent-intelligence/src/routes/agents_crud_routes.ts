import { Elysia, t } from 'elysia'
import { withNginxAuth } from '@uaip/middleware'
import type { AgentIntelligenceService } from '@uaip/shared-services'
import { getIntelligenceDb, eq, ilike, and, sql, count, asc } from '@uaip/shared-services/drizzle/clients'
import { agents } from '@uaip/shared-services/drizzle/intelligence'
import { logger } from '@uaip/utils'

type AgentCrudDeps = Pick<
  AgentIntelligenceService,
  'getAgent' | 'createAgent' | 'updateAgent' | 'deleteAgent'
>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const AGENT_LIST_DEFAULT_LIMIT = 12
const AGENT_LIST_MAX_LIMIT = 100
const AGENT_LIST_DEFAULT_PAGE = 1

function parsePaginationParams(query: Record<string, string | undefined>): {
  page: number
  limit: number
  search: string | null
} {
  const page = Math.max(
    AGENT_LIST_DEFAULT_PAGE,
    parseInt(String(query.page ?? String(AGENT_LIST_DEFAULT_PAGE)), 10) || AGENT_LIST_DEFAULT_PAGE
  )
  const limit = Math.min(
    AGENT_LIST_MAX_LIMIT,
    Math.max(1, parseInt(String(query.limit ?? String(AGENT_LIST_DEFAULT_LIMIT)), 10) || AGENT_LIST_DEFAULT_LIMIT)
  )
  const rawSearch = typeof query.search === 'string' ? query.search.trim() : null
  const search = rawSearch && rawSearch.length > 0 ? rawSearch : null
  return { page, limit, search }
}

const AgentSchema = t.Object({
  id: t.Optional(t.String()),
  name: t.Optional(t.String()),
  description: t.Optional(t.Union([t.String(), t.Null()])),
  role: t.Optional(t.String()),
  personaId: t.Optional(t.String()),
  isActive: t.Optional(t.Boolean()),
  createdBy: t.Optional(t.String()),
  status: t.Optional(t.String()),
  capabilities: t.Optional(t.Array(t.String())),
  version: t.Optional(t.Any()),
  securityLevel: t.Optional(t.String()),
  createdAt: t.Optional(t.Union([t.String(), t.Date()])),
  updatedAt: t.Optional(t.Union([t.String(), t.Date()])),
  intelligenceConfig: t.Optional(t.Any()),
  securityContext: t.Optional(t.Any()),
  configuration: t.Optional(t.Any()),
  metadata: t.Optional(t.Any()),
  preferences: t.Optional(t.Any()),
  tags: t.Optional(t.Any()),
})

const AgentErrorSchema = t.Object({ error: t.String(), message: t.Optional(t.String()) })

export function registerAgentCrudRoutes(
  agentIntelligenceService: AgentCrudDeps
) {
  return new Elysia().group(
    '/api/v1/agents',
    (group) => withNginxAuth(group)
      .get('/', async (ctx) => {
        try {
          const { page, limit, search } = parsePaginationParams(
            (ctx.query ?? {}) as Record<string, string | undefined>
          )
    
          const db = getIntelligenceDb()
          const whereClause = search
            ? and(eq(agents.isActive, true), ilike(agents.name, `%${search}%`))
            : eq(agents.isActive, true)
    
          const [countRow] = await db
            .select({ total: count() })
            .from(agents)
            .where(whereClause)
    
          const total = Number(countRow?.total ?? 0)
    
          const rows = await db
            .select()
            .from(agents)
            .where(whereClause)
            .orderBy(asc(agents.createdAt))
            .limit(limit)
            .offset((page - 1) * limit)
    
          return {
            success: true,
            data: rows,
            pagination: {
              page,
              limit,
              total,
              hasMore: page * limit < total,
            },
          }
        } catch (error) {
          logger.error('Failed to list agents', { error })
          ctx.set.status = 500
          return { success: false, error: 'Failed to list agents' }
        }
      }, {
        query: t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          search: t.Optional(t.String()),
        }),
        response: {
          200: t.Object({
            success: t.Literal(true),
            data: t.Array(AgentSchema),
            pagination: t.Object({
              page: t.Number(),
              limit: t.Number(),
              total: t.Number(),
              hasMore: t.Boolean(),
            }),
          }),
          500: AgentErrorSchema,
        },
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
      }, {
        body: t.Object({
          name: t.String(),
          description: t.Optional(t.String()),
          type: t.Optional(t.String()),
          systemPrompt: t.Optional(t.String()),
          model: t.Optional(t.String()),
          capabilities: t.Optional(t.Array(t.String())),
          metadata: t.Optional(t.Record(t.String(), t.Unknown())),
        }),
        response: {
          201: t.Object({ success: t.Literal(true), data: AgentSchema }),
          400: AgentErrorSchema,
        },
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
      }, {
        response: {
          200: t.Object({ success: t.Literal(true), data: AgentSchema }),
          404: AgentErrorSchema,
          500: AgentErrorSchema,
        },
      })
    
      .put('/:agentId', async (ctx) => {
        try {
          // @ts-expect-error -- withNginxAuth injects user into Elysia context for guarded groups
          const userId: string = ctx.user.id
          // @ts-expect-error -- withNginxAuth injects user into Elysia context for guarded groups
          const userRole: string = ctx.user.role ?? ''
    
          const existing = await agentIntelligenceService.getAgent(ctx.params.agentId)
          if (!existing) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }
    
          if (existing.createdBy !== userId && userRole !== 'admin') {
            ctx.set.status = 403
            return { success: false, error: 'Forbidden: you do not own this agent' }
          }
    
          const body = isRecord(ctx.body) ? ctx.body : {}
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
      }, {
        body: t.Partial(t.Object({
          name: t.String(),
          description: t.String(),
          type: t.String(),
          systemPrompt: t.String(),
          model: t.String(),
          capabilities: t.Array(t.String()),
          metadata: t.Record(t.String(), t.Unknown()),
        })),
        response: {
          200: t.Object({ success: t.Literal(true), data: AgentSchema }),
          403: AgentErrorSchema,
          404: AgentErrorSchema,
          400: AgentErrorSchema,
        },
      })
    
      .delete('/:agentId', async (ctx) => {
        try {
          // @ts-expect-error -- withNginxAuth injects user into Elysia context for guarded groups
          const userId: string = ctx.user.id
          // @ts-expect-error -- withNginxAuth injects user into Elysia context for guarded groups
          const userRole: string = ctx.user.role ?? ''
    
          const existing = await agentIntelligenceService.getAgent(ctx.params.agentId)
          if (!existing) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }
    
          if (existing.createdBy !== userId && userRole !== 'admin') {
            ctx.set.status = 403
            return { success: false, error: 'Forbidden: you do not own this agent' }
          }
    
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
      }, {
        response: {
          200: t.Object({ success: t.Literal(true), message: t.String() }),
          403: AgentErrorSchema,
          404: AgentErrorSchema,
          400: AgentErrorSchema,
        },
      })
  )
}
