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

interface CallerBoundKeyCache {
  keys: string[];
  loadedAt: number;
}

const CALLER_BOUND_TTL_MS = 30_000;
let callerBoundCache: CallerBoundKeyCache | null = null;

async function callerBoundServerKeys(): Promise<string[]> {
  const now = Date.now();
  if (callerBoundCache && now - callerBoundCache.loadedAt < CALLER_BOUND_TTL_MS) {
    return callerBoundCache.keys;
  }

  const { McpConnectionResolver } = await import('@uaip/shared-services');
  const servers = await McpConnectionResolver.getInstance().listIntegrationServers();
  const keys = servers
    .filter((server) => server.credentialMode === 'caller_connection')
    .map((server) => server.serverKey);

  callerBoundCache = { keys, loadedAt: now };
  return keys;
}

/**
 * Matches the tool id against the registered caller-bound server keys directly
 * rather than the positional `mcpServerNameOf` split, because both halves of the
 * key may contain hyphens — `mcp-github-copilot-create_issue` splits to `github`
 * and would MISS a registered `github-copilot`, dispatching a credentialed tool
 * to the worker tier. A lookup failure returns true (native), so uncertainty
 * keeps the tool on the credential-aware path instead of leaking it outward.
 */
async function isCallerBoundIntegrationTool(toolId: string): Promise<boolean> {
  const remainder = toolId.slice('mcp-'.length);
  try {
    const keys = await callerBoundServerKeys();
    return keys.some((key) => remainder.startsWith(`${key}-`));
  } catch (error) {
    logger.warn('Could not determine integration credential mode; keeping the tool native', {
      toolId,
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
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

    // An integration server runs against a per-caller credential that only
    // IntegrationMcpExecutor can resolve, and the mesh forwards a remote step as
    // (toolId, params) with ctx.scopedToken 'system'. Dispatching one of these to
    // the worker tier would therefore drop the caller's credential AND ship the
    // internal user/project/agent ids to the edge as tool arguments. Pin them
    // native so BaseToolExecutor keeps them on the credential-aware path.
    if (await isCallerBoundIntegrationTool(toolId)) return {};

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
