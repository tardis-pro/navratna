// exec-node-mcp — warm container pool (spec §3.2, §8, §9).
//
// Keeps recently-used MCP server containers alive briefly so repeat calls avoid
// cold image-pull + process-spawn latency. Enforces a hard max-container cap;
// when saturated, acquire() throws so the agent can return a typed
// RESOURCE_EXHAUSTED result (backpressure, not unbounded latency).
//
// Warm reuse is keyed by (image, command, args, scopedToken). Folding the token
// into the key means a call never reuses a container started with a *different*
// credential — this is a no-op today (token is the 'system' stub) but keeps the
// pool correct once real per-call tokens land (spec §4/§7).

import { startContainer, type ContainerSpec, type ContainerHandle } from './docker_runner.js';
import { McpStdioSession } from './mcp_stdio_session.js';

export class ResourceExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceExhaustedError';
  }
}

interface PooledContainer {
  key: string;
  handle: ContainerHandle;
  session: McpStdioSession;
  inUse: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
  ttlTimer: ReturnType<typeof setTimeout> | null;
  disposed: boolean;
}

export interface ContainerPoolOptions {
  maxContainers: number;
  warmIdleTtlMs: number;
  /** MCP handshake timeout when a fresh container is created. */
  initTimeoutMs: number;
  log: (msg: string, meta?: Record<string, unknown>) => void;
}

function signature(spec: ContainerSpec): string {
  return [spec.image, spec.command ?? '', spec.args.join(' '), spec.scopedToken ?? ''].join('::');
}

export class ContainerPool {
  private containers: PooledContainer[] = [];

  constructor(private readonly opts: ContainerPoolOptions) {}

  get size(): number {
    return this.containers.length;
  }

  /**
   * Lease a ready (initialized) MCP session for `spec`. Reuses an idle warm
   * container of the same signature, else starts a new one (subject to the
   * max-container cap), else throws ResourceExhaustedError.
   */
  async acquire(spec: ContainerSpec): Promise<PooledContainer> {
    const key = signature(spec);

    const warm = this.containers.find((c) => c.key === key && !c.inUse && !c.disposed);
    if (warm) {
      warm.inUse = true;
      if (warm.idleTimer) {
        clearTimeout(warm.idleTimer);
        warm.idleTimer = null;
      }
      this.opts.log('warm-pool hit', { key, poolSize: this.containers.length });
      return warm;
    }

    if (this.containers.length >= this.opts.maxContainers) {
      throw new ResourceExhaustedError(
        `docker-mcp node at container cap (${this.opts.maxContainers})`
      );
    }

    const handle = startContainer(spec);
    const session = new McpStdioSession(handle.stdout, handle.stdin, (line) =>
      this.opts.log('container-log', { name: spec.name, line })
    );

    const entry: PooledContainer = {
      key,
      handle,
      session,
      inUse: true,
      idleTimer: null,
      ttlTimer: null,
      disposed: false,
    };

    // Hard wall-clock TTL — kill the container regardless of warm reuse (spec §8).
    const ttlSec = spec.sandbox.ttlSec ?? 900;
    entry.ttlTimer = setTimeout(() => this.destroy(entry, 'ttl'), ttlSec * 1000);
    entry.ttlTimer.unref?.();

    // If the container dies on its own, drop it from the pool.
    handle.waitExit.then(() => this.destroy(entry, 'exit'));

    this.containers.push(entry);

    try {
      await session.initialize(this.opts.initTimeoutMs);
    } catch (err) {
      this.destroy(entry, 'init-failed');
      throw err;
    }

    this.opts.log('container started', { key, poolSize: this.containers.length });
    return entry;
  }

  /** Return a container to the pool (warm) or destroy it on error. */
  release(entry: PooledContainer, destroy = false): void {
    if (entry.disposed) return;
    entry.inUse = false;
    if (destroy) {
      this.destroy(entry, 'release-destroy');
      return;
    }
    // Warm idle reaper.
    entry.idleTimer = setTimeout(() => this.destroy(entry, 'idle'), this.opts.warmIdleTtlMs);
    entry.idleTimer.unref?.();
  }

  private destroy(entry: PooledContainer, reason: string): void {
    if (entry.disposed) return;
    entry.disposed = true;
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    if (entry.ttlTimer) clearTimeout(entry.ttlTimer);
    entry.session.dispose();
    entry.handle.kill();
    this.containers = this.containers.filter((c) => c !== entry);
    this.opts.log('container destroyed', { key: entry.key, reason, poolSize: this.containers.length });
  }

  /** Kill every container (graceful shutdown). */
  shutdown(): void {
    for (const entry of [...this.containers]) this.destroy(entry, 'shutdown');
  }
}

export type { PooledContainer };
