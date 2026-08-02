import { Elysia, t } from 'elysia'
import { withNginxAuth, getNginxUser } from '@uaip/middleware'
import type { AgentIntelligenceService } from '@uaip/shared-services'
import {
  ADMIN_ORG_ID,
  canAccessAgent,
  isPrivilegedRole,
  ONBOARDING_GUIDE_AGENT_ID,
  UserAgentAssignmentRepository,
} from '@uaip/shared-services'
import {
  getIntelligenceDb,
  eq,
  ne,
  or,
  ilike,
  and,
  sql,
  count,
  asc,
  inArray,
} from '@uaip/shared-services/drizzle/clients'
import { agents } from '@uaip/shared-services/drizzle/intelligence'
import { logger, isRecord } from '@uaip/utils'

type AgentCrudDeps = Pick<
  AgentIntelligenceService,
  'getAgent' | 'createAgent' | 'updateAgent' | 'deleteAgent'
>


type AssignedMCPTool = NonNullable<typeof agents.$inferSelect.assignedMCPTools>[number]

type AgentRow = typeof agents.$inferSelect

interface AgentListPagination {
  page: number
  limit: number
  total: number
  hasMore: boolean
}

interface AgentListResponse {
  success: true
  data: AgentRow[]
  pagination: AgentListPagination
}

interface AgentListQueryParams {
  page: number
  limit: number
  search: string | null
  /** When present, restricts the roster to these agent ids (assignment scoping). */
  assignedAgentIds?: string[]
}

interface AssignedToolSummary {
  toolId: string
  toolName: string
  serverName: string
}

interface AgentAssignedToolsRow {
  assigned: AssignedMCPTool[] | null
}

// THE ASSIGNMENT ROW IS THE GRANT: visibility is decided by
// user_agent_assignments rows (control plane), never by comparing
// organization ids — all seeded agents live in the admin org and agent names
// are globally unique, so org-equality would deny every non-admin-org user.
// The planes may live on different Postgres hosts, so the control-plane id
// lookup and the intelligence-plane agents query are ALWAYS two separate
// statements joined in the application (inArray), never one SQL statement.
const assignmentRepository = new UserAgentAssignmentRepository()

async function queryAgentsPage(params: AgentListQueryParams): Promise<AgentListResponse> {
  const { page, limit, search, assignedAgentIds } = params
  const db = getIntelligenceDb()

  // The guide is excluded for EVERY caller, privileged included. It is not a
  // selectable agent: agent_chat_conversations is UNIQUE(org,user,agent), so a
  // generic chat opened against it writes into the very row the interview
  // extractor reads, corrupting the transcript. Reachable only via the explicit
  // deny-by-default carve-out in agent_access_service, never through listings.
  const visibleClause = and(eq(agents.isActive, true), ne(agents.id, ONBOARDING_GUIDE_AGENT_ID))
  const baseClause = search
    ? and(visibleClause, ilike(agents.name, `%${search}%`))
    : visibleClause
  const whereClause = assignedAgentIds
    ? and(baseClause, inArray(agents.id, assignedAgentIds))
    : baseClause

  const [countRow] = await db
    .select({ total: count() })
    .from(agents)
    .where(whereClause)

  const total = Number(countRow?.total ?? 0)

  const exactNameRank = search
    ? sql<number>`CASE WHEN lower(${agents.name}) = lower(${search}) THEN 0 ELSE 1 END`
    : sql<number>`1`

  const rows = await db
    .select()
    .from(agents)
    .where(whereClause)
    .orderBy(exactNameRank, asc(agents.createdAt))
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
}

function collectUniqueTools(rows: AgentAssignedToolsRow[]): AssignedToolSummary[] {
  const seen = new Map<string, AssignedToolSummary>()
  for (const row of rows) {
    for (const tool of row.assigned ?? []) {
      if (tool?.toolId && !seen.has(tool.toolId)) {
        seen.set(tool.toolId, { toolId: tool.toolId, toolName: tool.toolName, serverName: tool.serverName })
      }
    }
  }
  return Array.from(seen.values())
}

/**
 * Visibility predicate for a single agent the caller has ALREADY been granted.
 *
 * Plain org equality is wrong here: every seeded agent lives in ADMIN_ORG_ID
 * and is offerable to every tenant (isOfferableToOrg), so an org-equality
 * filter 404s a platform agent the caller legitimately holds a grant for.
 * Authorization is the grant; this only keeps another tenant's PRIVATE agent
 * indistinguishable from a missing one.
 */
function visibleAgentPredicate(agentId: string, organizationId: string) {
  return and(
    eq(agents.id, agentId),
    or(eq(agents.organizationId, organizationId), eq(agents.organizationId, ADMIN_ORG_ID))
  )
}

/**
 * Read-modify-write of the whole assigned_mcp_tools array loses a concurrent
 * add or remove, so the row is locked FOR UPDATE for the duration.
 * Returns null when the agent does not exist.
 */
async function mutateAssignedMCPTools(
  agentId: string,
  organizationId: string,
  mutate: (current: AssignedMCPTool[]) => AssignedMCPTool[]
): Promise<AssignedMCPTool[] | null> {
  const db = getIntelligenceDb()

  return await db.transaction(async (tx) => {
    // Tenant scope lives in the SAME locked query as the read: another
    // tenant's private agent must be indistinguishable from a missing one.
    const [row] = await tx
      .select({ assigned: agents.assignedMCPTools })
      .from(agents)
      .where(visibleAgentPredicate(agentId, organizationId))
      .limit(1)
      .for('update')

    if (!row) return null

    const assignedMCPTools = mutate(row.assigned ?? [])
    await tx
      .update(agents)
      .set({ assignedMCPTools })
      .where(visibleAgentPredicate(agentId, organizationId))
    return assignedMCPTools
  })
}

// Org equality is NOT the grant: mutateAssignedMCPTools scopes by
// organizationId, which lets any same-org member edit an agent they were never
// assigned. Every per-agent MCP route must consult the assignment first.
async function callerHasGrant(ctx: unknown): Promise<boolean> {
  const { id: userId, organizationId, role } = getNginxUser(ctx)
  const { agentId } = (ctx as { params: { agentId: string } }).params
  return canAccessAgent({ userId, organizationId, role }, agentId)
}

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

const AgentSkillBodySchema = t.Object({
  id: t.Optional(t.String()),
  name: t.String(),
  description: t.String(),
  content: t.String(),
  source: t.Optional(t.Union([t.Literal('inline'), t.Literal('filesystem'), t.Literal('registry')])),
  sourcePath: t.Optional(t.String()),
  sourceUrl: t.Optional(t.String()),
  enabled: t.Optional(t.Boolean()),
  model: t.Optional(t.String()),
  allowedTools: t.Optional(t.Array(t.String())),
  metadata: t.Optional(t.Record(t.String(), t.Unknown())),
})

const AgentSchema = t.Object({
  id: t.Optional(t.String()),
  skills: t.Optional(t.Any()),
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
          const { page, limit, search } = parsePaginationParams(ctx.query ?? {})
          const { id: userId, organizationId, role } = getNginxUser(ctx)

          if (isPrivilegedRole(role)) {
            return await queryAgentsPage({ page, limit, search })
          }

          const assignedAgentIds = await assignmentRepository.findAgentIdsForUser(userId, organizationId)
          // Short-circuit: inArray(col, []) generates invalid SQL in some
          // drizzle versions, and there is nothing to fetch anyway.
          if (assignedAgentIds.length === 0) {
            return {
              success: true,
              data: [],
              pagination: { page, limit, total: 0, hasMore: false },
            }
          }

          return await queryAgentsPage({ page, limit, search, assignedAgentIds })
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
          const { id: userId, organizationId } = getNginxUser(ctx)
          const agent = await agentIntelligenceService.createAgent({
            ...body,
            createdBy: userId,
            organizationId,
          })

          // The assignment row IS the grant. Without it the agent is an
          // unreachable orphan: GET / filters it out, and DELETE /:agentId
          // checks access BEFORE ownership, so it answers 404 to the very user
          // who created it. Reporting 201 would strand it permanently, so the
          // creation is compensated and the failure surfaced instead.
          try {
            await new UserAgentAssignmentRepository().assignMany({
              userId,
              organizationId,
              agentIds: [agent.id],
              assignedBy: userId,
              source: 'creator',
            })
          } catch (grantError) {
            logger.error('Agent created but creator grant failed — rolling back', {
              agentId: agent.id,
              userId,
              error: grantError instanceof Error ? grantError.message : String(grantError),
            })

            try {
              await agentIntelligenceService.deleteAgent(agent.id)
            } catch (rollbackError) {
              logger.error('Compensating delete failed — orphaned agent left behind', {
                agentId: agent.id,
                userId,
                error:
                  rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
              })
            }

            ctx.set.status = 500
            return { success: false, error: 'Failed to grant access to the created agent' }
          }

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
          role: t.Optional(t.String()),
          systemPrompt: t.Optional(t.String()),
          model: t.Optional(t.String()),
          modelId: t.Optional(t.String()),
          providerId: t.Optional(t.String()),
          personaId: t.Optional(t.String()),
          isActive: t.Optional(t.Boolean()),
          capabilities: t.Optional(t.Array(t.String())),
          skills: t.Optional(t.Array(AgentSkillBodySchema)),
          metadata: t.Optional(t.Record(t.String(), t.Unknown())),
          configuration: t.Optional(t.Record(t.String(), t.Unknown())),
          intelligenceConfig: t.Optional(t.Record(t.String(), t.Unknown())),
        }),
        response: {
          201: t.Object({ success: t.Literal(true), data: AgentSchema }),
          400: AgentErrorSchema,
          500: AgentErrorSchema,
        },
      })
    
      // Static `/catalog` MUST be registered before the `/:agentId` wildcard,
      // otherwise Elysia matches it as agentId="catalog" and the agent lookup
      // fails with a non-UUID id → 500 (same hazard as `/mcp-tools` below).
      .get('/catalog', async (ctx) => {
        try {
          const { role } = getNginxUser(ctx)
          if (!isPrivilegedRole(role)) {
            ctx.set.status = 403
            return { success: false, error: 'Forbidden' }
          }
          const { page, limit, search } = parsePaginationParams(ctx.query ?? {})
          return await queryAgentsPage({ page, limit, search })
        } catch (error) {
          logger.error('Failed to list agent catalog', { error })
          ctx.set.status = 500
          return { success: false, error: 'Failed to list agent catalog' }
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
          403: AgentErrorSchema,
          500: AgentErrorSchema,
        },
      })

      // Static `/mcp-tools` MUST be registered before the `/:agentId` wildcard,
      // otherwise Elysia matches it as agentId="mcp-tools" and the agent lookup
      // fails with a non-UUID id → 500.
      .get('/mcp-tools', async (ctx) => {
        try {
          const { id: userId, organizationId, role } = getNginxUser(ctx)
          if (isPrivilegedRole(role)) {
            const rows = await getIntelligenceDb()
              .select({ assigned: agents.assignedMCPTools })
              .from(agents)
            return { success: true, tools: collectUniqueTools(rows) }
          }

          const assignedAgentIds = await assignmentRepository.findAgentIdsForUser(userId, organizationId)
          if (assignedAgentIds.length === 0) {
            return { success: true, tools: [] }
          }

          const rows = await getIntelligenceDb()
            .select({ assigned: agents.assignedMCPTools })
            .from(agents)
            .where(inArray(agents.id, assignedAgentIds))
          return { success: true, tools: collectUniqueTools(rows) }
        } catch (error) {
          logger.error('Failed to list MCP tools', { error })
          ctx.set.status = 500
          return { success: false, error: 'Failed to list MCP tools' }
        }
      })

      .get('/:agentId/mcp-tools', async (ctx) => {
        try {
          const { organizationId } = getNginxUser(ctx)
          if (!(await callerHasGrant(ctx))) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }
          const db = getIntelligenceDb()
          const [row] = await db
            .select({ assigned: agents.assignedMCPTools, settings: agents.mcpToolSettings })
            .from(agents)
            .where(visibleAgentPredicate(ctx.params.agentId, organizationId))
            .limit(1)
          if (!row) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }
          return { success: true, assignedMCPTools: row.assigned ?? [], mcpToolSettings: row.settings ?? {} }
        } catch (error) {
          logger.error('Failed to get agent MCP tools', { error, agentId: ctx.params.agentId })
          ctx.set.status = 500
          return { success: false, error: 'Failed to get agent MCP tools' }
        }
      })

      .post('/:agentId/mcp-tools', async (ctx) => {
        try {
          if (!(await callerHasGrant(ctx))) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }
          const body = isRecord(ctx.body) ? ctx.body : {}
          const toolsToAssign = Array.isArray(body.toolsToAssign) ? body.toolsToAssign : []

          const assignedMCPTools = await mutateAssignedMCPTools(ctx.params.agentId, getNginxUser(ctx).organizationId, (current) => {
            const byId = new Map(current.map((tool) => [tool.toolId, tool]))
            for (const raw of toolsToAssign) {
              if (!isRecord(raw) || typeof raw.toolId !== 'string') continue
              byId.set(raw.toolId, {
                toolId: raw.toolId,
                toolName: typeof raw.toolName === 'string' ? raw.toolName : raw.toolId,
                serverName: typeof raw.serverName === 'string' ? raw.serverName : '',
                enabled: raw.enabled !== false,
              })
            }
            return Array.from(byId.values())
          })

          if (assignedMCPTools === null) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }
          return { success: true, assignedMCPTools }
        } catch (error) {
          logger.error('Failed to assign agent MCP tools', { error, agentId: ctx.params.agentId })
          ctx.set.status = 500
          return { success: false, error: 'Failed to assign agent MCP tools' }
        }
      })

      .put('/:agentId/mcp-tools/:toolId', async (ctx) => {
        try {
          if (!(await callerHasGrant(ctx))) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }
          const body = isRecord(ctx.body) ? ctx.body : {}
          const enabled = body.enabled !== false

          const assignedMCPTools = await mutateAssignedMCPTools(ctx.params.agentId, getNginxUser(ctx).organizationId, (current) =>
            current.map((tool) =>
              tool.toolId === ctx.params.toolId ? { ...tool, enabled } : tool
            )
          )

          if (assignedMCPTools === null) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }
          return { success: true, assignedMCPTools }
        } catch (error) {
          logger.error('Failed to update agent MCP tool', { error, agentId: ctx.params.agentId })
          ctx.set.status = 500
          return { success: false, error: 'Failed to update agent MCP tool' }
        }
      })

      .delete('/:agentId/mcp-tools/:toolId', async (ctx) => {
        try {
          if (!(await callerHasGrant(ctx))) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }
          const assignedMCPTools = await mutateAssignedMCPTools(ctx.params.agentId, getNginxUser(ctx).organizationId, (current) =>
            current.filter((tool) => tool.toolId !== ctx.params.toolId)
          )

          if (assignedMCPTools === null) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }
          return { success: true, assignedMCPTools }
        } catch (error) {
          logger.error('Failed to remove agent MCP tool', { error, agentId: ctx.params.agentId })
          ctx.set.status = 500
          return { success: false, error: 'Failed to remove agent MCP tool' }
        }
      })

      .get('/:agentId', async (ctx) => {
        try {
          const { id: userId, organizationId, role } = getNginxUser(ctx)
          const agent = await agentIntelligenceService.getAgent(ctx.params.agentId)
          if (!agent) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }

          // 404 (not 403) on missing assignment: a 403 would confirm the
          // agent exists, leaking existence to users with no grant.
          const allowed = await canAccessAgent({ userId, organizationId, role }, ctx.params.agentId)
          if (!allowed) {
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
          const { id: userId, organizationId, role: userRole } = getNginxUser(ctx)

          const existing = await agentIntelligenceService.getAgent(ctx.params.agentId)
          if (!existing) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }

          // Access check FIRST, 404 (not 403) on missing assignment so agent
          // existence never leaks to users with no grant.
          const allowed = await canAccessAgent({ userId, organizationId, role: userRole }, ctx.params.agentId)
          if (!allowed) {
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
          modelId: t.String(),
          apiType: t.String(),
          configuration: t.Record(t.String(), t.Unknown()),
          capabilities: t.Array(t.String()),
          skills: t.Array(AgentSkillBodySchema),
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
          const { id: userId, organizationId, role: userRole } = getNginxUser(ctx)

          const existing = await agentIntelligenceService.getAgent(ctx.params.agentId)
          if (!existing) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }

          // Access check FIRST, 404 (not 403) on missing assignment so agent
          // existence never leaks to users with no grant.
          const allowed = await canAccessAgent({ userId, organizationId, role: userRole }, ctx.params.agentId)
          if (!allowed) {
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
