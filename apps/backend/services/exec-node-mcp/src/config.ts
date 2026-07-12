// exec-node-mcp — node-agent configuration (env-driven).
// Redis/BullMQ connection is read by @uaip/infra from REDIS_* env, exactly like
// every other service. Everything here tunes the docker-mcp data plane.

import { hostname } from 'node:os';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function listEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ExecNodeConfig {
  /** Stable node id announced to the control plane. */
  nodeId: string;
  /** Tool families this node advertises (prefix match, e.g. 'mcp-'). */
  capabilities: string[];
  /** Max MCP containers in flight before backpressure (RESOURCE_EXHAUSTED). */
  maxConcurrent: number;
  /** Advertised capacity for scheduler load balancing. */
  cpu: number;
  memMb: number;
  /** Heartbeat cadence — must be << the scheduler's staleness timeout. */
  heartbeatIntervalMs: number;
  /** Generic MCP runner image used when a tool declares no prebuilt image. */
  runnerImage: string;
  /** Keep an idle server container warm this long before reaping (warm pool). */
  warmIdleTtlMs: number;
  /** Hard ceiling on total containers (warm + active). */
  maxContainers: number;
  /** Fallback per-call wall-clock TTL (sec) when the sandbox declares none. */
  defaultTtlSec: number;
  /** Optional affinity advertised to the scheduler. */
  region?: string;
  tenant?: string;
}

export function loadConfig(): ExecNodeConfig {
  return {
    nodeId: process.env.EXEC_NODE_ID || `mcp-${hostname()}-${process.pid}`,
    capabilities: listEnv('EXEC_NODE_CAPABILITIES', ['mcp-']),
    maxConcurrent: intEnv('EXEC_NODE_MAX_CONCURRENT', 16),
    cpu: intEnv('EXEC_NODE_CPU', 4),
    memMb: intEnv('EXEC_NODE_MEM_MB', 4096),
    heartbeatIntervalMs: intEnv('EXEC_NODE_HEARTBEAT_MS', 5000),
    runnerImage: process.env.EXEC_NODE_RUNNER_IMAGE || 'node:20-slim',
    warmIdleTtlMs: intEnv('EXEC_NODE_WARM_IDLE_MS', 60_000),
    maxContainers: intEnv('EXEC_NODE_MAX_CONTAINERS', 24),
    defaultTtlSec: intEnv('EXEC_NODE_DEFAULT_TTL_SEC', 900),
    region: process.env.EXEC_NODE_REGION || undefined,
    tenant: process.env.EXEC_NODE_TENANT || undefined,
  };
}
