export const MCP_TOOL_PREFIX = 'mcp-';

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
 * match so `github-copilot` wins over a also-registered `github`.
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

  if (best) return best;

  // The server is not registered in this process (restarted instance, or the
  // server was removed). Fall back to the legacy positional split so a stale
  // binding still routes somewhere explicable instead of silently vanishing.
  const separator = remainder.indexOf('-');
  if (separator <= 0 || separator === remainder.length - 1) return null;
  return {
    serverName: remainder.slice(0, separator),
    toolName: remainder.slice(separator + 1),
  };
}
