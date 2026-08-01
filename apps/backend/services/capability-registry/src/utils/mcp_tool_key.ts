export const MCP_TOOL_PREFIX = 'mcp-';

/**
 * Reserved parameter key carrying the AUTHENTICATED caller identity to the MCP
 * executor. The mesh native node only forwards (toolId, params), so this is the
 * single channel available. It is written server-side AFTER the model's
 * arguments, so a model that emits this key cannot forge an identity, and it is
 * stripped before the arguments reach the remote server.
 */
export const MCP_CONTEXT_PARAM = '__navratnaMcpContext';

export interface McpToolExecutionContext {
  userId: string;
  projectId: string;
  agentId: string;
}

export interface McpToolInvocation {
  context: McpToolExecutionContext | null;
  args: Record<string, unknown>;
}

export function withMcpExecutionContext(
  args: Record<string, unknown>,
  context: McpToolExecutionContext
): Record<string, unknown> {
  return { ...args, [MCP_CONTEXT_PARAM]: context };
}

/**
 * Splits the trusted context back off the parameters. The context key is always
 * removed, so internal user/project/agent ids are never forwarded to a
 * third-party MCP server as tool arguments.
 */
export function extractMcpExecutionContext(parameters: unknown): McpToolInvocation {
  if (typeof parameters !== 'object' || parameters === null) {
    return { context: null, args: {} };
  }

  const { [MCP_CONTEXT_PARAM]: raw, ...args } = parameters as Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null) {
    return { context: null, args };
  }

  const candidate = raw as Partial<McpToolExecutionContext>;
  if (
    typeof candidate.userId !== 'string' ||
    typeof candidate.projectId !== 'string' ||
    typeof candidate.agentId !== 'string'
  ) {
    return { context: null, args };
  }

  return {
    context: {
      userId: candidate.userId,
      projectId: candidate.projectId,
      agentId: candidate.agentId,
    },
    args,
  };
}

export interface McpToolRegistration {
  id: string;
  name: string;
  displayName: string;
  description: string;
  parameters: Record<string, unknown>;
  metadata: {
    mcpServer: string;
    mcpTool: string;
    protocol: 'mcp';
  };
}

/**
 * Builds the `tool.register` payload for one discovered MCP tool.
 *
 * `name` deliberately carries the `mcp-<server>-<tool>` dispatch key rather than
 * the raw MCP name: tool_definitions.name is UNIQUE (so two servers both exposing
 * `search` would collide), and UnifiedToolRegistry resolves non-uuid tool ids via
 * findToolByName, so the row must be findable by the same string BaseToolExecutor
 * dispatches on. The raw name is preserved in `displayName` for the UI.
 */
export function buildMcpToolRegistration(
  serverName: string,
  tool: Record<string, unknown>
): McpToolRegistration {
  const rawName = String(tool.name || '');
  const key = mcpToolKey(serverName, rawName);
  const description =
    typeof tool.description === 'string' && tool.description
      ? tool.description
      : `${rawName} from ${serverName} MCP server`;
  const parameters =
    tool.inputSchema && typeof tool.inputSchema === 'object'
      ? (tool.inputSchema as Record<string, unknown>)
      : {};

  return {
    id: key,
    name: key,
    displayName: rawName,
    description,
    parameters,
    metadata: { mcpServer: serverName, mcpTool: rawName, protocol: 'mcp' },
  };
}

export interface ParsedMcpToolKey {
  serverName: string;
  toolName: string;
}

export function mcpToolKey(serverName: string, toolName: string): string {
  return `${MCP_TOOL_PREFIX}${serverName}-${toolName}`;
}

export function isMcpToolKey(value: string): boolean {
  return value.startsWith(MCP_TOOL_PREFIX);
}

/**
 * A key is `mcp-<server>-<tool>`, but BOTH halves may contain hyphens
 * (`github-copilot`, `create_pull_request-draft`), so it cannot be split
 * positionally — `parts[1]` yields `github` for `mcp-github-copilot-x`.
 * Disambiguate against the registered server names, preferring the longest
 * match so `github-copilot` wins over a also-registered `github`. A key that
 * matches no registered server returns null — dispatch must fail closed rather
 * than guess a server whose credential is not the one the key was minted for.
 */
export function parseMcpToolKey(
  key: string,
  knownServerNames: Iterable<string>
): ParsedMcpToolKey | null {
  if (!isMcpToolKey(key)) return null;

  const remainder = key.slice(MCP_TOOL_PREFIX.length);
  let best: ParsedMcpToolKey | null = null;

  for (const serverName of knownServerNames) {
    if (!remainder.startsWith(`${serverName}-`)) continue;
    const toolName = remainder.slice(serverName.length + 1);
    if (!toolName) continue;
    if (best && serverName.length <= best.serverName.length) continue;
    best = { serverName, toolName };
  }

  // No positional fallback: `mcp-github-copilot-create_issue` splits to server
  // `github`, which may itself be registered, so a stale key would execute
  // against ANOTHER server's credential. An unresolvable key fails closed.
  return best;
}
