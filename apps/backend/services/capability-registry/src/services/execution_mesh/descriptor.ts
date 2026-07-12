// Execution Mesh — tool -> runtime descriptor resolution (control plane).
// Sources a ToolRuntimeDescriptor from the tool's registry / MCP config so the
// scheduler can route a tool to the node built for it (spec §5). Phase 1b:
//   - stdio MCP tool  -> runtime 'docker-mcp' + a hardened sandbox launch spec
//   - http MCP tool   -> runtime 'worker' (Phase 2 target; no worker node yet, so
//                        the scheduler's native fallback still handles it — fine)
//   - anything else   -> {} => resolves to 'native' (today's in-process behaviour)
//
// Defensive by construction: any lookup miss / error yields {} (native). With the
// FEATURE_EXEC_MESH flag OFF this module is never reached.

import { logger } from '@uaip/utils';
import type { ToolRuntimeDescriptor, ExecutionSandboxPolicy } from '@uaip/types';

// Conservative default caps for a generic stdio MCP container (spec §5 example).
const DEFAULT_MCP_SANDBOX: Omit<ExecutionSandboxPolicy, 'command' | 'args' | 'env' | 'image'> = {
  cpu: 0.5,
  memMb: 256,
  network: 'none', // default-deny egress; per-tool allow-list is a later phase
  readonlyRoot: true,
  ttlSec: 900,
  pidsLimit: 256,
};

/** Parse `mcp-<server>-<tool>` -> serverName (or null if not an MCP tool id). */
function mcpServerNameOf(toolId: string): string | null {
  if (!toolId.startsWith('mcp-')) return null;
  const parts = toolId.split('-');
  if (parts.length < 3) return null;
  return parts[1];
}

/**
 * Resolve a tool's runtime descriptor. Only `mcp-*` tools carry a real runtime in
 * Phase 1b; every other tool resolves to native. Never throws.
 */
export async function resolveToolDescriptor(toolId: string): Promise<ToolRuntimeDescriptor> {
  try {
    const serverName = mcpServerNameOf(toolId);
    if (!serverName) return {}; // native tools (math, text, oauth-*, unknown)

    // Reuse the MCP client's DB-backed config (KNOWLEDGE reuse, no duplication).
    const { MCPClientService } = await import('../mcp_client_service.js');
    const mcpConfig = await MCPClientService.getInstance().getMeshServerConfig(serverName);
    if (!mcpConfig) return {}; // unknown server -> native fallback

    if (mcpConfig.transportType === 'http' || mcpConfig.transportType === 'streamable-http') {
      // Phase 2 target: the light worker tier proxies http MCP. No worker node is
      // registered yet, so the scheduler falls back to native — behaviour preserved.
      return { runtime: 'worker', transport: mcpConfig.transportType };
    }

    // stdio -> the docker-mcp tier. Carry a hardened launch spec for the node.
    const sandbox: ExecutionSandboxPolicy = {
      ...DEFAULT_MCP_SANDBOX,
      command: mcpConfig.command,
      args: mcpConfig.args,
      env: mcpConfig.env,
      // image left undefined: the node runs `command` inside its generic MCP
      // runner image. A prebuilt per-server image is a later optimisation.
    };
    return { runtime: 'docker-mcp', transport: 'stdio', sandbox };
  } catch (error) {
    logger.warn('resolveToolDescriptor failed; defaulting to native', {
      toolId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}
