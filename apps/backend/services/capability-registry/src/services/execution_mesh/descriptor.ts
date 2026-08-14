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

// ---------------------------------------------------------------------------
// Federation (D3) — `federation:<subdomainId>:<toolName>` ids resolve to the
// `federation` runtime, dialled directly at the producer's mcp_server_url.
// ---------------------------------------------------------------------------

/** Parse `federation:<subdomainId>:<toolName>` (the id shape syncTools registers). */
export function parseFederatedToolId(
  toolId: string
): { subdomainId: string; toolName: string } | null {
  if (!toolId.startsWith('federation:')) return null;
  const rest = toolId.slice('federation:'.length);
  const sep = rest.indexOf(':');
  if (sep <= 0 || sep === rest.length - 1) return null;
  return { subdomainId: rest.slice(0, sep), toolName: rest.slice(sep + 1) };
}

interface FederationEndpointCacheEntry {
  descriptor: ToolRuntimeDescriptor | null; // null = known miss (also cached)
  loadedAt: number;
}

const FEDERATION_TTL_MS = 30_000;
const federationCache = new Map<string, FederationEndpointCacheEntry>();

/**
 * Resolve a federated tool's producer endpoint from the federation registry.
 * TTL-cached per subdomain — a registry lookup on every call is a per-invocation
 * DB round trip the < 200 ms agent-turn budget will not absorb. Returns null on
 * any miss (unknown subdomain, deregistered, stdio producer) — caller maps null
 * to `{}` (native), which then simply fails to find the tool rather than
 * executing something else.
 */
async function resolveFederationDescriptor(
  subdomainId: string
): Promise<ToolRuntimeDescriptor | null> {
  const now = Date.now();
  const cached = federationCache.get(subdomainId);
  if (cached && now - cached.loadedAt < FEDERATION_TTL_MS) {
    return cached.descriptor;
  }

  const { FederationRegistryService } = await import('../federation_registry_service.js');
  const subdomain = await FederationRegistryService.getInstance().getSubdomainById(subdomainId);

  let descriptor: ToolRuntimeDescriptor | null = null;
  if (subdomain && subdomain.status !== 'deregistered' && subdomain.mcpServerUrl) {
    // Only http-family producers are direct-dialled by the federation node. A
    // stdio producer needs a local docker-mcp node fronting it — that is the
    // homelab stdio decision (execution plan §4), not this path.
    if (subdomain.transport === 'streamable-http' || subdomain.transport === 'sse') {
      descriptor = {
        runtime: 'federation',
        transport: subdomain.transport === 'sse' ? 'http' : 'streamable-http',
        endpoint: subdomain.mcpServerUrl,
      };
    } else {
      logger.warn('Federated producer uses a non-HTTP transport; tool stays unresolved', {
        subdomainId,
        transport: subdomain.transport,
      });
    }
  }

  federationCache.set(subdomainId, { descriptor, loadedAt: now });
  return descriptor;
}

/** Test hook — clears the federation endpoint cache. */
export function resetFederationDescriptorCache(): void {
  federationCache.clear();
}

/** Parse `mcp-<server>-<tool>` -> serverName (or null if not an MCP tool id). */
function mcpServerNameOf(toolId: string): string | null {
  if (!toolId.startsWith('mcp-')) return null;
  const parts = toolId.split('-');
  if (parts.length < 3) return null;
  return parts[1];
}

interface ServerModeCache {
  /** serverKey -> credentialMode, for every registered integration server. */
  modes: Map<string, string>;
  loadedAt: number;
}

const CALLER_BOUND_TTL_MS = 30_000;
let serverModeCache: ServerModeCache | null = null;

async function serverCredentialModes(): Promise<Map<string, string>> {
  const now = Date.now();
  if (serverModeCache && now - serverModeCache.loadedAt < CALLER_BOUND_TTL_MS) {
    return serverModeCache.modes;
  }

  const { McpConnectionResolver } = await import('@uaip/shared-services');
  const servers = await McpConnectionResolver.getInstance().listIntegrationServers();
  const modes = new Map(servers.map((server) => [server.serverKey, server.credentialMode]));

  serverModeCache = { modes, loadedAt: now };
  return modes;
}

/**
 * The registered server key this tool id belongs to, or null.
 *
 * Longest match wins: keys may themselves contain hyphens, so a short key can be
 * a prefix of a longer one (`github` vs `github-copilot`) and the shorter would
 * otherwise claim the longer one's tools.
 */
async function serverKeyOf(toolId: string): Promise<string | null> {
  const remainder = toolId.slice('mcp-'.length);
  const modes = await serverCredentialModes();
  let best: string | null = null;
  for (const key of modes.keys()) {
    if (remainder.startsWith(`${key}-`) && (best === null || key.length > best.length)) best = key;
  }
  return best;
}

/**
 * True when the MCP server behind this tool holds its OWN standing credential
 * (`credentialMode: 'none'` — static headers stored encrypted on the server row),
 * so a call needs no per-caller project/agent identity to authenticate.
 *
 * Used to scope the (user, project, agent) requirement in UnifiedToolRegistry to
 * the servers that actually need it. Unknown server or lookup failure returns
 * FALSE, which keeps the stricter requirement — uncertainty must not relax a
 * credential check.
 */
export async function mcpServerCarriesOwnCredential(toolId: string): Promise<boolean> {
  if (!toolId.startsWith('mcp-')) return false;
  try {
    const key = await serverKeyOf(toolId);
    if (!key) return false;
    return (await serverCredentialModes()).get(key) === 'none';
  } catch (error) {
    logger.warn('Could not determine MCP credential mode; requiring full caller context', {
      toolId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
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
  try {
    const key = await serverKeyOf(toolId);
    if (!key) return false;
    return (await serverCredentialModes()).get(key) === 'caller_connection';
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

    // Federated producer tools (D3). Resolved BEFORE the mcp-* prefix check: a
    // federated tool is addressed by its registry id `federation:<sub>:<tool>`
    // and must dial its own producer endpoint, never the static worker URL.
    const federated = parseFederatedToolId(toolId);
    if (federated) {
      const descriptor = await resolveFederationDescriptor(federated.subdomainId);
      return descriptor ?? {};
    }

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
