// exec-node-mcp — BYO-node quick enrollment client (data-plane side).
//
// When NAVRATNA_API_URL + NAVRATNA_NODE_TOKEN are set, the node:
//   1. self-detects which runtimes/binaries it has (so the scheduler only sends
//      it steps whose `requires` it can actually run),
//   2. POSTs that descriptor + the enroll token to /api/v1/mesh/nodes/enroll,
//   3. gets back a stable nodeId, tenant, and a node token used to heartbeat.
//
// If enrollment is not configured this module is inert and the node keeps its
// existing bus-based self-registration (unchanged legacy behaviour).

import { execFileSync } from 'node:child_process';
import type {
  ExecutionNodeEnrollRequest,
  ExecutionNodeEnrollResponse,
} from '@uaip/types';
import type { ExecNodeConfig } from './config.js';

type Logger = {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
};

// Binaries a node commonly needs to execute steps. Advertised verbatim so a step
// can declare `requires: ['python3']` and match. Extend via EXEC_NODE_PROBE_BINS.
const DEFAULT_PROBE_BINS = [
  'bash',
  'sh',
  'python3',
  'node',
  'docker',
  'sqlite3',
  'curl',
  'git',
  'go',
  'ruby',
  'java',
  'make',
];

/** Return the subset of `bins` present on PATH (via `command -v`). Never throws. */
export function detectRuntimes(bins: string[] = DEFAULT_PROBE_BINS): string[] {
  const extra = (process.env.EXEC_NODE_PROBE_BINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const candidates = Array.from(new Set([...bins, ...extra]));
  const found: string[] = [];
  for (const bin of candidates) {
    try {
      execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' });
      found.push(bin);
    } catch {
      // not installed — skip
    }
  }
  return found;
}

/** Infer tier when not explicitly set: heavy if it has python3/docker, else light. */
function inferTier(cfg: ExecNodeConfig, runtimes: string[]): 'light' | 'heavy' {
  if (cfg.tier) return cfg.tier;
  return runtimes.includes('python3') || runtimes.includes('docker') ? 'heavy' : 'light';
}

export interface EnrollmentResult {
  nodeId: string;
  tenant?: string;
  nodeToken: string;
  heartbeatIntervalMs: number;
  runtimes: string[];
  tier: 'light' | 'heavy';
}

/**
 * Exchange the enroll token for a registration. Returns null when enrollment is
 * not configured (apiUrl/enrollToken absent) so callers fall back to bus register.
 */
export async function enrollNode(
  cfg: ExecNodeConfig,
  log: Logger
): Promise<EnrollmentResult | null> {
  if (!cfg.apiUrl || !cfg.enrollToken) return null;

  const runtimes = detectRuntimes();
  const tier = inferTier(cfg, runtimes);

  const descriptor: ExecutionNodeEnrollRequest = {
    runtime: 'docker-mcp',
    capabilities: cfg.capabilities,
    capacity: { maxConcurrent: cfg.maxConcurrent, cpu: cfg.cpu, memMb: cfg.memMb },
    runtimes,
    tier,
    labels: cfg.region ? { region: cfg.region } : undefined,
  };

  const resp = await fetch(`${cfg.apiUrl}/api/v1/mesh/nodes/enroll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.enrollToken}`,
    },
    body: JSON.stringify(descriptor),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Enrollment failed: HTTP ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as ExecutionNodeEnrollResponse;
  log.info('Node enrolled with control plane', {
    nodeId: data.nodeId,
    tenant: data.tenant,
    runtimes,
    tier,
  });

  return {
    nodeId: data.nodeId,
    tenant: data.tenant,
    nodeToken: data.nodeToken,
    heartbeatIntervalMs: data.heartbeatIntervalMs || cfg.heartbeatIntervalMs,
    runtimes,
    tier,
  };
}

/** Send an HTTP heartbeat authenticated by the node token. Never throws. */
export async function sendHttpHeartbeat(
  apiUrl: string,
  nodeId: string,
  nodeToken: string,
  health: string
): Promise<void> {
  try {
    await fetch(`${apiUrl}/api/v1/mesh/nodes/${encodeURIComponent(nodeId)}/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nodeToken}`,
      },
      body: JSON.stringify({ health }),
    });
  } catch {
    // Transient — the staleness sweep tolerates missed heartbeats.
  }
}
