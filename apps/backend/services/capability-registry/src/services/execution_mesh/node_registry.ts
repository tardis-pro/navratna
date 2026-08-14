// Execution Mesh — Node Registry (control-plane side).
// In-memory registry of ExecutionNodes, updated by bus handlers for
// `exec.node.register` / `exec.node.heartbeat`. Nodes that miss N heartbeats
// are marked `down`. Exposes pickNode() for the scheduler.
// See docs/specs/11-HYBRID-EXECUTION-MESH.md §4.

import { EventBusService } from '@uaip/infra';
import { logger } from '@uaip/utils';
import type {
  ExecutionNode,
  ExecutionNodeAffinity,
  ExecutionNodeHeartbeat,
  ExecutionNodeRegistration,
  ExecutionRuntime,
} from '@uaip/types';
import { EXEC_NODE_HEARTBEAT, EXEC_NODE_REGISTER } from './subjects.js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const VALID_RUNTIMES: ReadonlySet<string> = new Set([
  'worker',
  'docker-mcp',
  'codespace',
  'native',
  'federation',
]);

export interface NodeRegistryOptions {
  /** Miss this many heartbeat intervals -> node is marked down. */
  missedHeartbeats?: number;
  /** How often the sweep runs (ms). */
  sweepIntervalMs?: number;
}

export class ExecutionNodeRegistry {
  private nodes = new Map<string, ExecutionNode>();
  private inFlight = new Map<string, number>();
  private eventBus: EventBusService;
  private started = false;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private readonly missedHeartbeats: number;
  private readonly sweepIntervalMs: number;

  constructor(eventBus?: EventBusService, opts: NodeRegistryOptions = {}) {
    this.eventBus = eventBus || EventBusService.getInstance();
    this.missedHeartbeats = opts.missedHeartbeats ?? 3;
    this.sweepIntervalMs = opts.sweepIntervalMs ?? 10_000;
  }

  /** Subscribe to register/heartbeat topics and begin the staleness sweep. Idempotent. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    await this.eventBus.subscribe(EXEC_NODE_REGISTER, async (message) => {
      const reg = this.toRegistration(message.data);
      if (reg) this.registerNode(this.registrationToNode(reg));
    });

    await this.eventBus.subscribe(EXEC_NODE_HEARTBEAT, async (message) => {
      const hb = this.toHeartbeat(message.data);
      if (hb) this.recordHeartbeat(hb);
    });

    this.sweepTimer = setInterval(() => this.sweepStaleNodes(), this.sweepIntervalMs);
    this.sweepTimer.unref?.();

    logger.info('Execution mesh node registry started', {
      missedHeartbeats: this.missedHeartbeats,
      sweepIntervalMs: this.sweepIntervalMs,
    });
  }

  /** Register (or replace) a node directly — used for the in-process native node. */
  registerNode(node: ExecutionNode): void {
    this.nodes.set(node.id, node);
    if (!this.inFlight.has(node.id)) this.inFlight.set(node.id, 0);
    logger.info('Execution node registered', {
      nodeId: node.id,
      runtime: node.runtime,
      capabilities: node.capabilities,
    });
  }

  recordHeartbeat(hb: ExecutionNodeHeartbeat): void {
    const node = this.nodes.get(hb.id);
    if (!node) {
      logger.debug('Heartbeat for unknown node ignored', { nodeId: hb.id });
      return;
    }
    node.lastHeartbeat = Date.now();
    if (hb.health) node.health = hb.health;
    else if (node.health === 'down') node.health = 'ready';
  }

  /**
   * Pick the least-loaded healthy node of `runtime` that can run `capability`,
   * honouring affinity when provided. Returns null when none available.
   */
  pickNode(
    runtime: ExecutionRuntime,
    capability?: string,
    affinity?: ExecutionNodeAffinity,
    requires?: string[]
  ): ExecutionNode | null {
    const candidates: ExecutionNode[] = [];

    for (const node of this.nodes.values()) {
      if (node.runtime !== runtime) continue;
      if (node.health !== 'ready' && node.health !== 'degraded') continue;
      if (capability && !this.matchesCapability(node, capability)) continue;
      if (affinity && !this.matchesAffinity(node, affinity)) continue;
      // Dependency gate: a step's declared runtimes/binaries must all be present
      // on the node, else it would fail for lack of deps (python step on a
      // bash-only node). No requires => no constraint.
      if (requires?.length && !this.matchesRequires(node, requires)) continue;
      const load = this.inFlight.get(node.id) ?? 0;
      if (load >= node.capacity.maxConcurrent) continue;
      candidates.push(node);
    }

    if (candidates.length === 0) return null;

    // Prefer ready over degraded, then least-loaded.
    candidates.sort((a, b) => {
      const healthRank = this.healthRank(a.health) - this.healthRank(b.health);
      if (healthRank !== 0) return healthRank;
      return (this.inFlight.get(a.id) ?? 0) - (this.inFlight.get(b.id) ?? 0);
    });

    return candidates[0];
  }

  acquire(nodeId: string): void {
    this.inFlight.set(nodeId, (this.inFlight.get(nodeId) ?? 0) + 1);
  }

  release(nodeId: string): void {
    this.inFlight.set(nodeId, Math.max(0, (this.inFlight.get(nodeId) ?? 0) - 1));
  }

  listNodes(): ExecutionNode[] {
    return Array.from(this.nodes.values());
  }

  private sweepStaleNodes(): void {
    const now = Date.now();
    const timeout = this.missedHeartbeats * this.sweepIntervalMs;
    for (const node of this.nodes.values()) {
      // The native node and any statically-registered always-on node (e.g. the
      // Cloudflare exec-worker) have no heartbeat loop; never drain them.
      if (node.runtime === 'native' || node.alwaysOn) continue;
      if (node.health === 'down') continue;
      if (now - node.lastHeartbeat > timeout) {
        node.health = 'down';
        logger.warn('Execution node marked down (missed heartbeats)', {
          nodeId: node.id,
          runtime: node.runtime,
          lastHeartbeat: node.lastHeartbeat,
        });
      }
    }
  }

  private matchesCapability(node: ExecutionNode, capability: string): boolean {
    return node.capabilities.some(
      (cap) => cap === '*' || cap === capability || capability.startsWith(cap)
    );
  }

  /**
   * True when the node advertises EVERY runtime/binary the step requires. A node
   * satisfies a requirement via its `runtimes` list, its `capabilities` list, or
   * a `['*']` wildcard (platform nodes claim all).
   */
  private matchesRequires(node: ExecutionNode, requires: string[]): boolean {
    if (node.capabilities.includes('*')) return true;
    const advertised = new Set([...(node.runtimes ?? []), ...node.capabilities]);
    return requires.every((req) => advertised.has(req));
  }

  private matchesAffinity(node: ExecutionNode, affinity: ExecutionNodeAffinity): boolean {
    if (!node.affinity) return false;
    if (affinity.tenant && node.affinity.tenant !== affinity.tenant) return false;
    if (affinity.region && node.affinity.region !== affinity.region) return false;
    if (affinity.dataLocality && node.affinity.dataLocality !== affinity.dataLocality) {
      return false;
    }
    return true;
  }

  private healthRank(health: ExecutionNode['health']): number {
    return health === 'ready' ? 0 : 1;
  }

  private registrationToNode(reg: ExecutionNodeRegistration): ExecutionNode {
    return {
      id: reg.id,
      runtime: reg.runtime,
      capabilities: reg.capabilities,
      capacity: reg.capacity,
      affinity: reg.affinity,
      health: 'ready',
      lastHeartbeat: Date.now(),
      owner: reg.owner,
      runtimes: reg.runtimes,
      tier: reg.tier,
      labels: reg.labels,
    };
  }

  private toRegistration(data: unknown): ExecutionNodeRegistration | null {
    if (!isRecord(data)) return null;
    if (typeof data.id !== 'string') return null;
    if (typeof data.runtime !== 'string' || !VALID_RUNTIMES.has(data.runtime)) return null;
    if (!Array.isArray(data.capabilities)) return null;
    if (!isRecord(data.capacity)) return null;
    return data as unknown as ExecutionNodeRegistration;
  }

  private toHeartbeat(data: unknown): ExecutionNodeHeartbeat | null {
    if (!isRecord(data) || typeof data.id !== 'string') return null;
    return data as unknown as ExecutionNodeHeartbeat;
  }
}
