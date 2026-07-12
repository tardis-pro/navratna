/**
 * Execution Mesh — BYO-node (docker/EC2) API client.
 * Plain fetch (credentials: include) against the gateway; the mesh routes live in
 * capability-registry (navratna-gateway).
 */

import { resolveApiOrigin } from '@/config/api_config';

const base = resolveApiOrigin().replace(/\/$/, '');

export interface MeshNode {
  id: string;
  runtime: string;
  health: 'ready' | 'degraded' | 'draining' | 'down';
  tier?: 'light' | 'heavy';
  runtimes: string[];
  capabilities: string[];
  labels: Record<string, string>;
  capacity: { maxConcurrent: number; cpu: number; memMb: number };
  lastHeartbeat: number;
}

export interface NodeEnrollmentToken {
  nodeId: string;
  token: string;
  expiresInSec: number;
  dockerRun: string;
  curlBootstrap: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${base}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!resp.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: HTTP ${resp.status}`);
  return (await resp.json()) as T;
}

export const nodesAPI = {
  mintToken(): Promise<NodeEnrollmentToken> {
    return req<NodeEnrollmentToken>('/api/v1/mesh/nodes/tokens', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  listNodes(): Promise<{ nodes: MeshNode[] }> {
    return req<{ nodes: MeshNode[] }>('/api/v1/mesh/nodes');
  },
};
