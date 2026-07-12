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

/**
 * Pure-JS native tools the Phase 2 worker tier re-implements (Workers-compatible)
 * and can run at the edge. `file-reader` is deliberately EXCLUDED — a Worker has
 * no filesystem, so it stays native (spec §3.1). `web-search` runs on the worker
 * via `fetch`. `oauth-*` tools stay native (need standing gateway credentials).
 */
const WORKER_JS_TOOLS: ReadonlySet<string> = new Set([
  'math-calculator',
  'text-analysis',
  'time-utility',
  'id-generator',
  'web-search',
]);

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
    // Pure-JS tools the worker tier can run at the edge. When a worker-cf node is
    // registered (EXEC_WORKER_URL set) these dispatch to it; otherwise the
    // scheduler falls back to native — behaviour preserved. file-reader is absent
    // here on purpose (no Worker filesystem) and resolves to native below.
    if (WORKER_JS_TOOLS.has(toolId)) return { runtime: 'worker' };

    const serverName = mcpServerNameOf(toolId);
    if (!serverName) return {}; // native tools (file-reader, oauth-*, unknown)

    // Reuse the MCP client's DB-backed config (KNOWLEDGE reuse, no duplication).
    const { MCPClientService } = await import('../mcp_client_service.js');
    const mcpConfig = await MCPClientService.getInstance().getMeshServerConfig(serverName);
    if (!mcpConfig) return {}; // unknown server -> native fallback

    if (mcpConfig.transportType === 'http' || mcpConfig.transportType === 'streamable-http') {
      // Phase 2: the light worker tier proxies http/streamable-http MCP over fetch.
      // Carry the MCP server endpoint so the exec-worker knows where to proxy the
      // JSON-RPC tools/call. When no worker-cf node is registered the scheduler
      // falls back to native (which routes via mcp_client_service) — preserved.
      return {
        runtime: 'worker',
        transport: mcpConfig.transportType,
        sandbox: mcpConfig.httpUrl ? { httpUrl: mcpConfig.httpUrl, network: 'egress' } : undefined,
      };
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
