import type { AgentAssignedTool, AvailableTool } from '@uaip/types'
import { logger, isRecord } from '@uaip/utils'

/**
 * Turning an agent's stored tool bindings into something a model can be offered.
 *
 * These are pure functions with no Elysia, middleware or service dependencies,
 * and they live here rather than in agent_chat_routes because both the chat
 * route AND the discussion turn handler need them. Importing the route module
 * from an event handler pulled the whole HTTP surface into the handler's module
 * graph and pushed navratna-core's subscription-wiring test past its timeout.
 */

/**
 * Looks up the stored definition of a bound tool so the model receives its real
 * JSON schema. Returns null for a tool that no longer exists, which drops it
 * from the turn rather than failing the turn.
 */
export type ToolSchemaProvider = (
  toolId: string
) => Promise<{ description: string; parameters: Record<string, unknown> } | null>

/**
 * Normalises the `assigned_mcp_tools` jsonb column into typed bindings.
 *
 * Entries missing `toolId`/`toolName` are dropped rather than partially
 * constructed. `requiresApproval` defaults to true for MCP-discovered tools —
 * an external tool is assumed to need a gate unless the row says otherwise.
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

/**
 * Resolves each enabled binding to its real schema. A binding with no
 * resolvable definition is skipped and logged: offering the model a tool whose
 * schema is unknown produces a call nothing can execute.
 */
export const resolveAgentTools = async (
  assigned: AgentAssignedTool[],
  provider: ToolSchemaProvider | undefined
): Promise<AvailableTool[]> => {
  if (!provider) return []

  const resolved: AvailableTool[] = []
  for (const tool of assigned) {
    if (tool.enabled === false) continue

    // oxlint-disable-next-line no-await-in-loop -- bounded by an agent's binding count
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
