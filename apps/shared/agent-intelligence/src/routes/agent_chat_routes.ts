import { Elysia, t } from 'elysia'
import { getNginxUser, withNginxAuth } from '@uaip/middleware'
import type { AgentIntelligenceService } from '@uaip/shared-services'
import { canAccessAgent } from '@uaip/shared-services'
import type {
  AgentAssignedTool,
  AgentChatMessage,
  AgentChatTurnClaim,
  AgentChatThreadSummary,
  AgentChatTurnState,
  AgentChatUsage,
  AgentResponseRequest,
  AvailableTool,
  ChatMessage,
  DocumentContext,
} from '@uaip/types'
import type { UserLLMService } from '@uaip/llm-service'
import { logger, isRecord } from '@uaip/utils'

/**
 * How many stored messages are replayed to the model. Bounds prompt growth on a
 * long-lived conversation, which is otherwise unbounded now that it persists.
 */
const HISTORY_TURN_LIMIT = 50

export type AgentChatPersistence = {
  beginTurn(params: {
    organizationId: string
    userId: string
    agentId: string
    threadKey?: string
    clientTurnId: string
    content: string
  }): Promise<AgentChatTurnState>
  completeTurn(params: {
    conversationId: string
    organizationId: string
    clientTurnId: string
    userMessageId: string
    processingToken: string
    content: string
    agentId: string
    model?: string
    usage?: AgentChatUsage
    metadata?: Record<string, unknown>
  }): Promise<string | null>
  failTurn(userMessageId: string, processingToken: string): Promise<void>
  loadHistory(params: { conversationId: string; limit?: number }): Promise<AgentChatMessage[]>
  findOwnedConversation(params: {
    organizationId: string
    userId: string
    agentId: string
    threadKey?: string
  }): Promise<string | null>
  listThreads(params: {
    organizationId: string
    userId: string
    limit?: number
  }): Promise<AgentChatThreadSummary[]>
  updateOwnedThread(params: {
    conversationId: string
    organizationId: string
    userId: string
    title?: string
    model?: string | null
    archived?: boolean
  }): Promise<boolean>
  ensureThreadTitle(conversationId: string, firstMessage: string): Promise<void>
  ensureParticipants(params: {
    conversationId: string
    organizationId: string
    agentIds: string[]
  }): Promise<void>
  completeTurnWithReplies(params: {
    conversationId: string
    organizationId: string
    clientTurnId: string
    userMessageId: string
    processingToken: string
    replies: AgentChatReply[]
  }): Promise<string[] | null>
}

export type AgentChatReply = {
  agentId: string
  content: string
  model?: string
  usage?: AgentChatUsage
  metadata?: Record<string, unknown>
}

/**
 * Which agents answer this turn.
 *
 * Mentioned ids arrive from the client, so each is checked against the caller's
 * own assignments — an unassigned id is DROPPED rather than refused, because one
 * stale mention in a message should not block the whole turn. Falling back to the
 * addressed agent keeps a plain 1:1 chat working when nobody is mentioned.
 */
export const resolveRespondingAgents = async (
  mentionedAgentIds: string[],
  fallbackAgentId: string,
  canAccess: (agentId: string) => Promise<boolean>
): Promise<string[]> => {
  const unique = [...new Set(mentionedAgentIds.map((id) => id.trim()).filter((id) => id !== ''))]
  if (unique.length === 0) return [fallbackAgentId]

  const checked = await Promise.all(
    unique.map(async (agentId) => ((await canAccess(agentId)) ? agentId : null))
  )
  const allowed = checked.filter((id): id is string => id !== null)

  return allowed.length > 0 ? allowed : [fallbackAgentId]
}

type AgentChatDeps = Pick<AgentIntelligenceService, 'getAgent'>
type AgentRecord = NonNullable<Awaited<ReturnType<AgentIntelligenceService['getAgent']>>>
type AgentGeneration = Awaited<ReturnType<UserLLMService['generateAgentResponse']>>
/**
 * `threw` separates an unexpected exception from a provider reporting failure in
 * band. They map to different statuses (500 vs 502), and fan-out must catch both
 * per agent so one bad responder cannot discard the replies that did arrive.
 */
type FailedGeneration = { agentId: string; failure: string; threw: boolean }
type SuccessfulGeneration = {
  agentId: string
  responder: AgentRecord
  response: AgentGeneration
}
type GenerationOutcome = FailedGeneration | SuccessfulGeneration

const isSuccessfulGeneration = (
  outcome: GenerationOutcome
): outcome is SuccessfulGeneration => 'response' in outcome

const readMentionedAgentIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : []
type UserLlmDeps = Pick<UserLLMService, 'generateAgentResponse'>
type ApprovalWorkflowRepo = {
  findById(id: string): Promise<Record<string, unknown> | null>
  update(id: string, data: Record<string, unknown>): Promise<unknown>
}
type ApprovalDecisionRepo = {
  create(data: Record<string, unknown>): Promise<unknown>
}
type SecurityDeps = {
  getApprovalWorkflowRepository(): ApprovalWorkflowRepo
  getApprovalDecisionRepository(): ApprovalDecisionRepo
}

/**
 * Looks up the stored definition of a bound tool so the model receives its real
 * JSON schema. Returns null for a tool that no longer exists, which drops it
 * from the turn rather than failing the chat.
 */
export type ToolSchemaProvider = (
  toolId: string
) => Promise<{ description: string; parameters: Record<string, unknown> } | null>

export type ProjectToolScope = {
  integrationServerKeys: string[]
  boundServerKeys: string[]
  /**
   * Set when the binding tables could not be read. A sentinel server key would NOT
   * work here — the filter matches on exact server names, so an unmatchable key
   * keeps every tool instead of hiding it.
   */
  unknownScope?: boolean
}

/**
 * Drops integration tools that are not bound to the project the caller named.
 *
 * An agent's assigned set spans every project it was linked in, so offering the
 * whole set would let a chat in project A see (and call) a credential bound in
 * project B. The resolver would refuse the call, but the model should never be
 * offered a tool it cannot use. Tools whose server is not a caller-bound
 * integration are untouched — those carry no per-project credential.
 */
export const filterToolsForProject = (
  assigned: AgentAssignedTool[],
  scope: ProjectToolScope
): AgentAssignedTool[] => {
  if (scope.unknownScope) return []
  if (scope.integrationServerKeys.length === 0) return assigned

  const bound = new Set(scope.boundServerKeys)
  return assigned.filter((tool) => {
    const isIntegration = scope.integrationServerKeys.includes(tool.serverName)
    return !isIntegration || bound.has(tool.serverName)
  })
}

export const resolveAgentTools = async (
  assigned: AgentAssignedTool[],
  provider: ToolSchemaProvider | undefined
): Promise<AvailableTool[]> => {
  if (!provider) return []

  const resolved: AvailableTool[] = []
  for (const tool of assigned) {
    if (tool.enabled === false) continue

    const schema = await provider(tool.toolId)
    if (!schema) {
      logger.warn('Skipping agent tool with no resolvable definition', {
        toolId: tool.toolId,
        toolName: tool.toolName,
      })
      continue
    }

    resolved.push({
      name: tool.toolName,
      description: schema.description,
      parameters: schema.parameters,
    })
  }
  return resolved
}


const toChatMessage = (value: unknown, index: number): ChatMessage | null => {
  if (!isRecord(value)) return null
  const content = typeof value.content === 'string' ? value.content : null
  if (!content) return null

  const sender = typeof value.sender === 'string' ? value.sender : 'user'
  const timestamp = typeof value.timestamp === 'string' ? value.timestamp : new Date().toISOString()
  const type =
    value.type === 'assistant' ||
    value.type === 'system' ||
    value.type === 'tool' ||
    value.type === 'user'
      ? value.type
      : 'user'

  return {
    id: typeof value.id === 'string' ? value.id : `msg_${Date.now()}_${index}`,
    content,
    sender,
    timestamp,
    type,
  }
}

/**
 * Maps the UI's local history shape onto canonical ChatMessages. The UI records a
 * coarse role in `sender` ('user' | 'agent'), while `ChatMessage.sender` is echoed
 * verbatim into the prompt as the speaker label — so an agent turn must be
 * relabelled with the agent's name, not left as the literal string 'agent'.
 */
const toHistoryMessages = (value: unknown, agentName: string): ChatMessage[] => {
  if (!Array.isArray(value)) return []

  const history: ChatMessage[] = []
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) continue
    const content = typeof entry.content === 'string' ? entry.content : null
    if (!content) continue

    const isAgent = entry.sender === 'agent' || entry.sender === 'assistant'
    history.push({
      id: `hist_${index}`,
      content,
      sender: isAgent ? agentName : 'user',
      timestamp:
        typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
      type: isAgent ? 'assistant' : 'user',
    })
  }
  return history
}

/**
 * Replays the stored transcript, EXCLUDING the current turn's user row — it was
 * written before generation, so including it would send the live message twice.
 */
const toStoredHistoryMessages = (
  stored: AgentChatMessage[],
  agentName: string,
  currentUserMessageId: string
): ChatMessage[] =>
  stored
    .filter((message) => message.id !== currentUserMessageId)
    .map((message) => ({
      id: message.id,
      content: message.content,
      sender: message.role === 'assistant' ? agentName : 'user',
      timestamp: message.createdAt.toISOString(),
      type: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    }))

/**
 * The provider shape is not uniform across adapters — some return `content`,
 * others `response`. Picking the wrong one persists an empty assistant message.
 */
const readResponseText = (response: unknown): string => {
  if (!isRecord(response)) return ''
  if (typeof response.response === 'string') return response.response
  if (typeof response.content === 'string') return response.content
  return ''
}

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/**
 * Adapters disagree on the usage shape: some nest it under `usage`, older ones
 * report only a flat `tokensUsed` total. Reading just one loses accounting for
 * every provider that uses the other.
 */
const readUsage = (response: unknown): AgentChatUsage | undefined => {
  if (!isRecord(response)) return undefined

  const usage = isRecord(response.usage) ? response.usage : undefined
  const promptTokens = readNumber(usage?.promptTokens ?? usage?.prompt_tokens)
  const completionTokens = readNumber(usage?.completionTokens ?? usage?.completion_tokens)
  const totalTokens =
    readNumber(usage?.totalTokens ?? usage?.total_tokens ?? response.tokensUsed) ??
    (promptTokens !== undefined && completionTokens !== undefined
      ? promptTokens + completionTokens
      : undefined)

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined
  }
  return { promptTokens, completionTokens, totalTokens }
}

/**
 * Providers report a failed generation IN BAND — they resolve with
 * `{content:'', finishReason:'error', error:'HTTP 401: Unauthorized'}` rather
 * than throwing. Committing that as an assistant turn stores a permanently
 * blank reply AND marks the turn 'completed', so the idempotent replay path
 * serves the blank forever and the user can never retry.
 */
const readGenerationFailure = (response: unknown): string | null => {
  if (!isRecord(response)) return 'The model returned an unreadable response.'
  if (typeof response.error === 'string' && response.error.length > 0) return response.error
  if (response.finishReason === 'error') return 'The model provider reported a generation error.'
  if (readResponseText(response).trim().length > 0) return null
  // A tool-calling turn can legitimately answer with no prose, so empty text
  // only means failure when the model also did nothing.
  const executed = response.toolsExecuted
  if (Array.isArray(executed) && executed.length > 0) return null
  return 'The model returned an empty response.'
}

const toDocumentContext = (value: unknown): DocumentContext | undefined => {
  if (!isRecord(value)) return undefined
  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.content !== 'string' ||
    typeof value.type !== 'string'
  ) {
    return undefined
  }

  return {
    id: value.id,
    title: value.title,
    content: value.content,
    type: value.type,
  }
}

/**
 * An external (`mcp-*`) tool acts on a real third-party account under the user's
 * own credential, so a MISSING approval flag must read as "gate it", not "allow
 * it". Rows written before the policy existed carry no flag; treating that as
 * false would auto-execute them until rediscovery happened to repair the row.
 * A built-in tool keeps the original opt-in behaviour.
 */
export const toAssignedTools = (value: unknown): AgentAssignedTool[] => {
  if (!Array.isArray(value)) return []

  const assigned: AgentAssignedTool[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (typeof entry.toolId !== 'string' || typeof entry.toolName !== 'string') continue

    const isExternal = entry.toolId.startsWith('mcp-')
    const requiresApproval =
      typeof entry.requiresApproval === 'boolean' ? entry.requiresApproval : isExternal

    assigned.push({
      toolId: entry.toolId,
      toolName: entry.toolName,
      serverName: typeof entry.serverName === 'string' ? entry.serverName : '',
      enabled: entry.enabled !== false,
      requiresApproval,
    })
  }
  return assigned
}

const toAgentRequest = (
  agent: Awaited<ReturnType<AgentIntelligenceService['getAgent']>>,
  messages: ChatMessage[],
  context?: DocumentContext,
  tools?: AvailableTool[],
  projectId?: string,
  modelOverride?: string
): AgentResponseRequest => ({
  agent: {
    id: agent.id,
    name: agent.name,
    role: String(agent.role),
    capabilities: Array.isArray(agent.capabilities)
      ? agent.capabilities.filter((item): item is string => typeof item === 'string')
      : undefined,
    maxTokens: typeof agent.maxTokens === 'number' ? agent.maxTokens : undefined,
    temperature: typeof agent.temperature === 'number' ? agent.temperature : undefined,
    configuration: isRecord(agent.configuration) ? agent.configuration : undefined,
    persona: isRecord(agent.persona)
      ? {
          description:
            typeof agent.persona.description === 'string' ? agent.persona.description : undefined,
        }
      : undefined,
    /**
     * A per-turn override changes ONLY this reply. The agent row is untouched,
     * so switching model mid-thread cannot silently repoint the agent for every
     * other user and thread that shares it.
     */
    modelId:
      modelOverride ?? (typeof agent.modelId === 'string' ? agent.modelId : undefined),
    apiType: typeof agent.apiType === 'string' ? agent.apiType : undefined,
    userLLMProviderId:
      typeof agent.userLLMProviderId === 'string' ? agent.userLLMProviderId : undefined,
    systemPrompt: typeof agent.systemPrompt === 'string' ? agent.systemPrompt : undefined,
    description: typeof agent.description === 'string' ? agent.description : undefined,
    metadata: isRecord(agent.metadata) ? agent.metadata : undefined,
    version: typeof agent.version === 'number' ? agent.version : undefined,
    assignedMCPTools: toAssignedTools(agent.assignedMCPTools),
    skills: Array.isArray(agent.skills) ? agent.skills : undefined,
  },
  messages,
  context,
  ...(tools && tools.length > 0 ? { tools } : {}),
  ...(projectId ? { projectId } : {}),
})

/**
 * Supplies the two server-key lists the project filter needs. Injected rather than
 * imported so this route package does not depend on shared-services.
 */
export type ProjectToolScopeProvider = {
  listIntegrationServerKeys(): Promise<string[]>
  listBoundServerKeys(projectId: string, agentId: string): Promise<string[]>
}

/**
 * Fails CLOSED: if the scope cannot be read, every caller-bound integration tool is
 * treated as unbound and hidden, rather than offering the model a tool whose
 * credential may belong to another project.
 */
const loadProjectToolScope = async (
  provider: ProjectToolScopeProvider | undefined,
  projectId: string | undefined,
  agentId: string
): Promise<ProjectToolScope> => {
  if (!provider) return { integrationServerKeys: [], boundServerKeys: [] }

  try {
    const integrationServerKeys = await provider.listIntegrationServerKeys()
    if (integrationServerKeys.length === 0 || !projectId) {
      return { integrationServerKeys, boundServerKeys: [] }
    }
    return {
      integrationServerKeys,
      boundServerKeys: await provider.listBoundServerKeys(projectId, agentId),
    }
  } catch (error) {
    logger.warn('Could not read the project tool scope; hiding integration tools', {
      agentId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { integrationServerKeys: [], boundServerKeys: [], unknownScope: true }
  }
}

export function registerAgentChatRoutes(
  agentIntelligenceService: AgentChatDeps,
  userLLMService: UserLlmDeps,
  securityService: SecurityDeps,
  toolSchemaProvider?: ToolSchemaProvider,
  projectScopeProvider?: ProjectToolScopeProvider,
  chatPersistence?: AgentChatPersistence
) {
  return new Elysia().group(
    '/api/v1/agents',
    (group) => withNginxAuth(group)
      .post('/:agentId/chat', async (ctx) => {
        let claim: AgentChatTurnClaim | undefined

        try {
          const agent = await agentIntelligenceService.getAgent(ctx.params.agentId)
          if (!agent) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }

          const user = getNginxUser(ctx)
          const userId = user.id

          // Existence is not access. Without this the route only proved the agent
          // was real, so any authenticated user could drive an agent they were
          // never assigned all the way into LLM generation — billing tokens and
          // running that agent's system prompt under someone else's identity.
          // 404, not 403, to match GET /agents/:id and avoid confirming the agent
          // exists to a caller who cannot reach it.
          const mayUseAgent = await canAccessAgent(
            { userId, organizationId: user.organizationId, role: user.role },
            agent.id
          )
          if (!mayUseAgent) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }

          const body = isRecord(ctx.body) ? ctx.body : {}
          const currentMessage =
            typeof body.message === 'string' && body.message.trim().length > 0
              ? body.message
              : undefined

          const bodyMessages = Array.isArray(body.messages)
            ? body.messages.map(toChatMessage).filter((item): item is ChatMessage => item !== null)
            : []

          if (bodyMessages.length === 0 && !currentMessage) {
            ctx.set.status = 400
            return { success: false, error: 'Message or messages array is required' }
          }

          const scope = {
            organizationId: user.organizationId,
            userId,
            agentId: agent.id,
            // Omitted by clients that predate threads; the persistence layer then
            // falls back to the agent id, which is where their history already is.
            threadKey:
              typeof body.threadKey === 'string' && body.threadKey.trim() !== ''
                ? body.threadKey.trim()
                : undefined,
          }

          // Resolved ONCE: the user and assistant rows of a turn are paired by
          // this id, so re-deriving it per call would split them across two turns
          // and defeat the idempotent replay.
          const clientTurnId =
            typeof body.clientTurnId === 'string' && body.clientTurnId.trim().length > 0
              ? body.clientTurnId
              : crypto.randomUUID()

          // Persist and claim BEFORE generating, so a crash mid-call cannot lose
          // what the user typed and a retry cannot start a second generation.
          if (chatPersistence && currentMessage) {
            const turn = await chatPersistence.beginTurn({
              ...scope,
              clientTurnId,
              content: currentMessage,
            })

            if (turn.state === 'completed') {
              return {
                success: true,
                data: {
                  response: turn.content,
                  conversationId: turn.conversationId,
                  assistantMessageId: turn.assistantMessageId,
                },
              }
            }

            if (turn.state === 'processing') {
              ctx.set.status = 409
              return { success: false, error: 'A reply for this turn is already being generated' }
            }

            claim = turn.claim
          }

          // Stored history is authoritative once persistence is on; the request's
          // conversationHistory is only the fallback for a stateless caller.
          const priorMessages = claim
            ? toStoredHistoryMessages(
                await chatPersistence!.loadHistory({
                  conversationId: claim.conversationId,
                  limit: HISTORY_TURN_LIMIT,
                }),
                agent.name,
                claim.userMessageId
              )
            : toHistoryMessages(body.conversationHistory, agent.name)

          const messages =
            bodyMessages.length > 0
              ? bodyMessages
              : [
                  // Prior turns first: the model reads this array in order, and
                  // downstream task-type resolution treats the LAST entry as the
                  // current intent.
                  ...priorMessages,
                  {
                    id: claim?.userMessageId ?? `msg_${Date.now()}`,
                    content: currentMessage!,
                    sender: userId,
                    timestamp: new Date().toISOString(),
                    type: 'user',
                  } satisfies ChatMessage,
                ]

          // Passed through unchecked ON PURPOSE: McpConnectionResolver.resolve()
          // authorizes (actor, project) server-side before selecting a credential,
          // so a caller naming a project they cannot reach is refused there rather
          // than being trusted here.
          const projectId = typeof body.projectId === 'string' ? body.projectId : undefined

          const modelOverride =
            typeof body.model === 'string' && body.model.trim() !== ''
              ? body.model.trim()
              : undefined

          const respondingAgentIds = await resolveRespondingAgents(
            readMentionedAgentIds(body.mentionedAgentIds),
            agent.id,
            (candidateId) =>
              canAccessAgent(
                { userId, organizationId: user.organizationId, role: user.role },
                candidateId
              )
          )

          const generateFor = async (responder: AgentRecord) => {
            const assignedTools = filterToolsForProject(
              toAssignedTools(responder.assignedMCPTools),
              await loadProjectToolScope(projectScopeProvider, projectId, responder.id)
            )
            const tools = await resolveAgentTools(assignedTools, toolSchemaProvider)

            const request = toAgentRequest(
              responder,
              messages,
              toDocumentContext(body.context),
              tools,
              projectId,
              modelOverride
            )

            return userLLMService.generateAgentResponse(userId, request)
          }

          // Parallel, not sequential: every mentioned agent answers the same
          // prompt independently. Feeding one agent's reply to the next would make
          // this a debate, which is what the discussion orchestrator already does.
          const outcomes: GenerationOutcome[] = await Promise.all(
            respondingAgentIds.map(async (responderId): Promise<GenerationOutcome> => {
              const responder =
                responderId === agent.id ? agent : await agentIntelligenceService.getAgent(responderId)
              if (!responder) {
                return { agentId: responderId, failure: 'Agent not found', threw: false }
              }

              try {
                const response = await generateFor(responder)
                const failure = readGenerationFailure(response)
                if (failure) return { agentId: responderId, failure, threw: false }
                return { agentId: responderId, responder, response }
              } catch (error) {
                return {
                  agentId: responderId,
                  failure: error instanceof Error ? error.message : String(error),
                  threw: true,
                }
              }
            })
          )

          const succeeded = outcomes.filter(isSuccessfulGeneration)

          // Only a TOTAL failure fails the turn. With several agents answering, one
          // provider erroring must not discard the replies that did arrive.
          if (succeeded.length === 0) {
            const failures = outcomes.filter(
              (outcome): outcome is FailedGeneration => !isSuccessfulGeneration(outcome)
            )
            const thrown = failures.find((failure) => failure.threw)
            if (claim && chatPersistence) {
              await chatPersistence.failTurn(claim.userMessageId, claim.processingToken)
            }
            logger.error('Agent chat generation failed', {
              agentId: ctx.params.agentId,
              reason: (thrown ?? failures[0])?.failure,
            })

            // An exception is OUR fault (500); a provider reporting failure in
            // band is the upstream's (502). Collapsing both would misreport which.
            if (thrown) {
              ctx.set.status = 500
              return { success: false, error: thrown.failure }
            }

            ctx.set.status = 502
            return { error: 'Agent generation failed', message: failures[0]?.failure }
          }

          const primary = succeeded[0]!

          if (claim && chatPersistence) {
            await chatPersistence.ensureParticipants({
              conversationId: claim.conversationId,
              organizationId: user.organizationId,
              agentIds: succeeded.map((outcome) => outcome.agentId),
            })

            const assistantMessageIds = await chatPersistence.completeTurnWithReplies({
              conversationId: claim.conversationId,
              organizationId: user.organizationId,
              clientTurnId,
              userMessageId: claim.userMessageId,
              processingToken: claim.processingToken,
              replies: succeeded.map((outcome) => ({
                agentId: outcome.agentId,
                content: readResponseText(outcome.response),
                model:
                  modelOverride ??
                  (typeof outcome.responder.modelId === 'string'
                    ? outcome.responder.modelId
                    : undefined),
                usage: readUsage(outcome.response),
                metadata: { agentId: outcome.agentId, agentName: outcome.responder.name },
              })),
            })

            // After the reply, never before: a title must not delay the turn, and
            // a failed generation should not leave a titled but empty thread.
            if (currentMessage) {
              await chatPersistence.ensureThreadTitle(claim.conversationId, currentMessage)
            }

            return {
              success: true,
              data: {
                ...(isRecord(primary.response) ? primary.response : {}),
                conversationId: claim.conversationId,
                userMessageId: claim.userMessageId,
                assistantMessageId: assistantMessageIds?.[0] ?? null,
                replies: succeeded.map((outcome, index) => ({
                  agentId: outcome.agentId,
                  agentName: outcome.responder.name,
                  content: readResponseText(outcome.response),
                  messageId: assistantMessageIds?.[index] ?? null,
                })),
              },
            }
          }

          return { success: true, data: primary.response }
        } catch (error) {
          if (claim && chatPersistence) {
            await chatPersistence.failTurn(claim.userMessageId, claim.processingToken)
          }
          logger.error('Failed to process agent chat', { error, agentId: ctx.params.agentId })
          ctx.set.status = 500
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to process chat request',
          }
        }
      }, {
        body: t.Object({
          message: t.Optional(t.String()),
          messages: t.Optional(t.Array(t.Object({
            id: t.Optional(t.String()),
            content: t.String(),
            sender: t.Optional(t.String()),
            timestamp: t.Optional(t.String()),
            type: t.Optional(t.Union([
              t.Literal('user'),
              t.Literal('assistant'),
              t.Literal('system'),
              t.Literal('tool'),
            ])),
          }))),
          conversationHistory: t.Optional(t.Array(t.Object({
            content: t.String(),
            sender: t.Optional(t.String()),
            timestamp: t.Optional(t.String()),
          }))),
          clientTurnId: t.Optional(t.String()),
          context: t.Optional(t.Object({
            id: t.Optional(t.String()),
            title: t.Optional(t.String()),
            content: t.Optional(t.String()),
            type: t.Optional(t.String()),
          })),
          // Elysia STRIPS any body field absent from this schema, so omitting
          // projectId here would silently drop it and every integration MCP tool
          // would fail with "requires an authenticated user, project and agent
          // context". No `format:` validator — the prod AOT build rejects
          // unregistered TypeBox formats.
          projectId: t.Optional(t.String()),
          // Provider-native model name (e.g. "dirt-cheap"), not a uuid. Overrides
          // the agent's model for this turn only; the credential still comes from
          // the user's own provider, resolved server-side.
          model: t.Optional(t.String()),
          threadKey: t.Optional(t.String()),
          // Every agent that should answer this turn. Authorized server-side
          // against the caller's assignments, so a forged id reaches nothing.
          mentionedAgentIds: t.Optional(t.Array(t.String())),
        }),
        response: {
          200: t.Object({ success: t.Literal(true), data: t.Any() }),
          400: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
          404: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
          // A response schema of the wrong shape makes Elysia reject the
          // handler's own reply and answer 422 instead of the intended status.
          502: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
          500: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
        },
      })

      .get('/chat/threads', async (ctx) => {
        try {
          if (!chatPersistence) return { success: true, data: { threads: [] } }

          const user = getNginxUser(ctx)
          const threads = await chatPersistence.listThreads({
            organizationId: user.organizationId,
            userId: user.id,
          })

          return { success: true, data: { threads } }
        } catch (error) {
          logger.error('Failed to list agent chat threads', { error })
          ctx.set.status = 500
          return { success: false, error: 'Failed to list chat threads' }
        }
      }, {
        response: {
          200: t.Object({ success: t.Literal(true), data: t.Any() }),
          500: t.Object({ success: t.Literal(false), error: t.String() }),
        },
      })

      .patch('/chat/threads/:conversationId', async (ctx) => {
        try {
          if (!chatPersistence) {
            ctx.set.status = 404
            return { success: false, error: 'Thread not found' }
          }

          const user = getNginxUser(ctx)
          const body = isRecord(ctx.body) ? ctx.body : {}

          const title =
            typeof body.title === 'string' && body.title.trim() !== ''
              ? body.title.trim().slice(0, 200)
              : undefined
          const model = typeof body.model === 'string' ? body.model.trim() || null : undefined
          const archived = typeof body.archived === 'boolean' ? body.archived : undefined

          if (title === undefined && model === undefined && archived === undefined) {
            ctx.set.status = 400
            return { success: false, error: 'No supported thread fields to update' }
          }

          // Ownership is enforced INSIDE the update predicate, so a thread the
          // caller does not own matches no row and is indistinguishable from one
          // that does not exist.
          const updated = await chatPersistence.updateOwnedThread({
            conversationId: ctx.params.conversationId,
            organizationId: user.organizationId,
            userId: user.id,
            title,
            model,
            archived,
          })

          if (!updated) {
            ctx.set.status = 404
            return { success: false, error: 'Thread not found' }
          }

          return { success: true, data: { conversationId: ctx.params.conversationId } }
        } catch (error) {
          logger.error('Failed to update an agent chat thread', {
            error,
            conversationId: ctx.params.conversationId,
          })
          ctx.set.status = 500
          return { success: false, error: 'Failed to update the chat thread' }
        }
      }, {
        response: {
          200: t.Object({ success: t.Literal(true), data: t.Any() }),
          400: t.Object({ success: t.Literal(false), error: t.String() }),
          404: t.Object({ success: t.Literal(false), error: t.String() }),
          500: t.Object({ success: t.Literal(false), error: t.String() }),
        },
      })

      .get('/:agentId/chat/messages', async (ctx) => {
        try {
          if (!chatPersistence) {
            return { success: true, data: { conversationId: null, messages: [] } }
          }

          // The conversation is derived from the AUTHENTICATED user, never from a
          // query parameter — otherwise any caller could read another user's chat
          // by naming their agent.
          const user = getNginxUser(ctx)

          // Same 404-on-unassigned rule as the chat route: history for an agent the
          // caller cannot reach must be indistinguishable from an agent that does
          // not exist, rather than an empty-but-successful reply that confirms it.
          const mayUseAgent = await canAccessAgent(
            { userId: user.id, organizationId: user.organizationId, role: user.role },
            ctx.params.agentId
          )
          if (!mayUseAgent) {
            ctx.set.status = 404
            return { success: false, error: 'Agent not found' }
          }

          const conversationId = await chatPersistence.findOwnedConversation({
            organizationId: user.organizationId,
            userId: user.id,
            agentId: ctx.params.agentId,
            threadKey:
              typeof ctx.query.threadKey === 'string' && ctx.query.threadKey.trim() !== ''
                ? ctx.query.threadKey.trim()
                : undefined,
          })

          if (!conversationId) {
            return { success: true, data: { conversationId: null, messages: [] } }
          }

          const limit = Number.parseInt(ctx.query.limit ?? '', 10)
          const messages = await chatPersistence.loadHistory({
            conversationId,
            limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : HISTORY_TURN_LIMIT,
          })

          return { success: true, data: { conversationId, messages } }
        } catch (error) {
          logger.error('Failed to load agent chat history', {
            error,
            agentId: ctx.params.agentId,
          })
          ctx.set.status = 500
          return { success: false, error: 'Failed to load chat history' }
        }
      }, {
        query: t.Object({ limit: t.Optional(t.String()), threadKey: t.Optional(t.String()) }),
        response: {
          200: t.Object({ success: t.Literal(true), data: t.Any() }),
          404: t.Object({ success: t.Literal(false), error: t.String() }),
          500: t.Object({ success: t.Literal(false), error: t.String() }),
        },
      })

      .post('/:agentId/approvals/:approvalId', async (ctx) => {
        try {
          // @ts-expect-error -- withNginxAuth injects user into Elysia context for guarded groups
          const userId = ctx.user.id
          const body = isRecord(ctx.body) ? ctx.body : {}
          const decision = body.decision === 'rejected' ? 'rejected' : 'approved'
          const workflowRepo = securityService.getApprovalWorkflowRepository()
          const decisionRepo = securityService.getApprovalDecisionRepository()
    
          const workflow = await workflowRepo.findById(ctx.params.approvalId)
          if (!workflow) {
            ctx.set.status = 404
            return { success: false, error: 'Approval workflow not found' }
          }
    
          const currentApprovers = Array.isArray(workflow.currentApprovers)
            ? workflow.currentApprovers.filter((item): item is string => typeof item === 'string')
            : []
          const requiredApprovers = Array.isArray(workflow.requiredApprovers)
            ? workflow.requiredApprovers.filter((item): item is string => typeof item === 'string')
            : []
          const workflowStatus = typeof workflow.status === 'string' ? workflow.status : 'pending'
    
          if (workflowStatus !== 'pending') {
            ctx.set.status = 409
            return { success: false, error: 'Approval workflow is already resolved' }
          }
    
          if (requiredApprovers.length === 0 || !requiredApprovers.includes(userId)) {
            ctx.set.status = 403
            return { success: false, error: 'User is not authorized to resolve this approval' }
          }
    
          if (currentApprovers.includes(userId)) {
            ctx.set.status = 409
            return { success: false, error: 'Approval already recorded for this user' }
          }
    
          const workflowAgentId =
            isRecord(workflow.metadata) && typeof workflow.metadata.agentId === 'string'
              ? workflow.metadata.agentId
              : null
    
          if (workflowAgentId && workflowAgentId !== ctx.params.agentId) {
            ctx.set.status = 404
            return { success: false, error: 'Approval workflow not found for this agent' }
          }
    
          const nextApprovers = currentApprovers.includes(userId)
            ? currentApprovers
            : [...currentApprovers, userId]
          const isApproved = requiredApprovers.every((approver) => nextApprovers.includes(approver))
          const nextStatus = decision === 'rejected' ? 'rejected' : isApproved ? 'approved' : 'pending'
    
          await decisionRepo.create({
            workflowId: ctx.params.approvalId,
            approverId: userId,
            decision,
            reason: typeof body.reason === 'string' ? body.reason : undefined,
            metadata: isRecord(body.metadata) ? body.metadata : {},
          })
    
          await workflowRepo.update(ctx.params.approvalId, {
            currentApprovers: nextApprovers,
            status: nextStatus,
            metadata: {
              ...(isRecord(workflow.metadata) ? workflow.metadata : {}),
              agentId: ctx.params.agentId,
              lastDecisionBy: userId,
              lastDecisionAt: new Date().toISOString(),
            },
          })
    
          return {
            success: true,
            data: {
              approvalId: ctx.params.approvalId,
              decision,
              status: nextStatus,
            },
          }
        } catch (error) {
          logger.error('Failed to resolve agent approval', {
            error,
            agentId: ctx.params.agentId,
            approvalId: ctx.params.approvalId,
          })
          ctx.set.status = 400
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to resolve approval',
          }
        }
      }, {
        body: t.Object({
          decision: t.Optional(t.Union([t.Literal('approved'), t.Literal('rejected')])),
          reason: t.Optional(t.String()),
          metadata: t.Optional(t.Record(t.String(), t.Unknown())),
        }),
        response: {
          200: t.Object({
            success: t.Literal(true),
            data: t.Object({
              approvalId: t.String(),
              decision: t.Union([t.Literal('approved'), t.Literal('rejected')]),
              status: t.String(),
            }),
          }),
          400: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
          403: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
          404: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
          409: t.Object({ error: t.String(), message: t.Optional(t.String()) }),
        },
      })
  )
}
