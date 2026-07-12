// Execution Mesh — Scheduler (control plane).
// Resolves a tool's runtime, picks a healthy node, dispatches over the bus (or
// runs the native in-process node), enforces bounded per-runtime concurrency,
// and correlates the result back. Never executes tool logic itself except via
// the injected native executor.
// See docs/specs/11-HYBRID-EXECUTION-MESH.md §5, §6, §8.

import { EventBusService } from '@uaip/infra';
import { logger } from '@uaip/utils';
import type {
  ExecutionMeshErrorCode,
  ExecutionRequestEnvelope,
  ExecutionResultEnvelope,
  ExecutionRuntime,
  ToolRuntimeDescriptor,
} from '@uaip/types';
import { config } from '../../config/config.js';
import { ExecutionNodeRegistry } from './node_registry.js';
import { execRequestSubject } from './subjects.js';

/** Typed scheduler failure (e.g. RESOURCE_EXHAUSTED when a runtime queue is full). */
export class ExecutionMeshError extends Error {
  constructor(
    public readonly code: ExecutionMeshErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ExecutionMeshError';
  }
}

/** Signature of the native (in-process) executor the mesh falls back to. */
export type NativeExecutor = (
  toolId: string,
  params: Record<string, unknown>
) => Promise<unknown>;

const NATIVE_NODE_ID = 'native-inproc';
const WORKER_NODE_ID = 'worker-cf';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export class ExecutionScheduler {
  private static instance: ExecutionScheduler | null = null;

  private eventBus: EventBusService;
  private registry: ExecutionNodeRegistry;
  private nativeExecutor: NativeExecutor | null = null;
  private inFlightPerRuntime = new Map<ExecutionRuntime, number>();
  private startPromise: Promise<void> | null = null;
  private readonly maxConcurrentPerRuntime: number;
  private readonly workerUrl: string;
  private readonly workerSecret: string;

  private constructor(eventBus?: EventBusService) {
    this.eventBus = eventBus || EventBusService.getInstance();
    this.registry = new ExecutionNodeRegistry(this.eventBus, {
      sweepIntervalMs: config.execMesh.heartbeatTimeoutMs,
    });
    this.maxConcurrentPerRuntime = config.execMesh.maxConcurrentPerRuntime;
    this.workerUrl = config.execMesh.workerUrl.replace(/\/$/, '');
    this.workerSecret = config.execMesh.workerSecret;
  }

  static getInstance(): ExecutionScheduler {
    if (!ExecutionScheduler.instance) {
      ExecutionScheduler.instance = new ExecutionScheduler();
    }
    return ExecutionScheduler.instance;
  }

  getRegistry(): ExecutionNodeRegistry {
    return this.registry;
  }

  /**
   * Register the in-process native node exactly once, wrapping the legacy
   * BaseToolExecutor so the mesh always has at least one node even with nothing
   * deployed. Idempotent.
   */
  ensureNativeNode(executor: NativeExecutor): void {
    if (this.nativeExecutor) return;
    this.nativeExecutor = executor;
    this.registry.registerNode({
      id: NATIVE_NODE_ID,
      runtime: 'native',
      capabilities: ['*'],
      capacity: {
        maxConcurrent: this.maxConcurrentPerRuntime,
        cpu: 1,
        memMb: 512,
      },
      health: 'ready',
      lastHeartbeat: Date.now(),
    });
  }

  /**
   * Runtime resolution precedence (spec §5):
   *   1. explicit descriptor.runtime
   *   2. inference from transport: http/streamable-http -> worker; stdio -> docker-mcp
   *   3. native (default)
   */
  resolveRuntime(descriptor: ToolRuntimeDescriptor): ExecutionRuntime {
    if (descriptor.runtime) return descriptor.runtime;
    if (descriptor.transport === 'http' || descriptor.transport === 'streamable-http') {
      return 'worker';
    }
    if (descriptor.transport === 'stdio') return 'docker-mcp';
    return 'native';
  }

  /**
   * Schedule one execution. Picks a healthy node of the target runtime
   * (least-loaded, capability + affinity aware). If none is available and the
   * runtime is not native, falls back to the native node (logged warning) so a
   * call never hard-fails while remote nodes are undeployed.
   */
  async schedule(envelope: ExecutionRequestEnvelope): Promise<ExecutionResultEnvelope> {
    await this.ensureStarted();

    const { runtime } = envelope;
    this.acquireRuntimeSlot(runtime);
    const startedAt = Date.now();

    try {
      if (runtime === 'native') {
        return await this.runNative(envelope, startedAt, NATIVE_NODE_ID);
      }

      const node = this.registry.pickNode(runtime, envelope.toolId, this.affinityOf(envelope));
      if (!node) {
        logger.warn('No healthy node for runtime; falling back to native', {
          runtime,
          toolId: envelope.toolId,
          correlationId: envelope.correlationId,
        });
        return await this.runNative(envelope, startedAt, NATIVE_NODE_ID);
      }

      // Worker tier is dispatched by HTTP fetch (request-scoped edge Worker holds
      // no bus subscription); every other remote runtime goes over the bus.
      if (runtime === 'worker') {
        return await this.dispatchWorker(node.id, envelope, startedAt);
      }

      return await this.dispatchRemote(node.id, runtime, envelope, startedAt);
    } finally {
      this.releaseRuntimeSlot(runtime);
    }
  }

  private async runNative(
    envelope: ExecutionRequestEnvelope,
    startedAt: number,
    nodeId: string
  ): Promise<ExecutionResultEnvelope> {
    if (!this.nativeExecutor) {
      throw new ExecutionMeshError(
        'NO_NODE_AVAILABLE',
        'Native node not registered; call ensureNativeNode() first'
      );
    }

    this.registry.acquire(nodeId);
    const deadline = new Promise<never>((_, reject) => {
      const t = setTimeout(
        () => reject(new ExecutionMeshError('DEADLINE_EXCEEDED', 'Tool execution timeout')),
        envelope.deadlineMs
      );
      t.unref?.();
    });

    try {
      const output = await Promise.race([
        this.nativeExecutor(envelope.toolId, envelope.params),
        deadline,
      ]);
      return this.ok(envelope, output, nodeId, startedAt);
    } catch (error) {
      return this.fail(envelope, error, nodeId, startedAt);
    } finally {
      this.registry.release(nodeId);
    }
  }

  /**
   * Dispatch a worker-runtime request to the always-on Cloudflare exec-worker by
   * HTTP fetch (`POST {workerUrl}/exec` with the `X-Edge-Auth` shared secret) —
   * the reverse of the edge gateway's trust pattern. On ANY transport failure
   * (network error, non-2xx, timeout) it falls back to the native executor so a
   * call never hard-fails while the worker is unreachable. A well-formed
   * `{ ok:false }` tool error from the worker is returned as-is (not a fallback).
   */
  private async dispatchWorker(
    nodeId: string,
    envelope: ExecutionRequestEnvelope,
    startedAt: number
  ): Promise<ExecutionResultEnvelope> {
    this.registry.acquire(nodeId);
    try {
      const raw = await this.fetchWorker(envelope);
      return this.normalizeRemoteResult(raw, envelope, nodeId, startedAt);
    } catch (error) {
      logger.warn('Worker dispatch failed; falling back to native', {
        toolId: envelope.toolId,
        correlationId: envelope.correlationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return await this.runNative(envelope, startedAt, NATIVE_NODE_ID);
    } finally {
      this.registry.release(nodeId);
    }
  }

  /** POST the envelope to the exec-worker; throws on network error or non-2xx. */
  private async fetchWorker(envelope: ExecutionRequestEnvelope): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), envelope.deadlineMs);
    timer.unref?.();
    try {
      const resp = await fetch(`${this.workerUrl}/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Edge-Auth': this.workerSecret,
        },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new ExecutionMeshError('NODE_ERROR', `exec-worker HTTP ${resp.status}`);
      }
      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private async dispatchRemote(
    nodeId: string,
    runtime: ExecutionRuntime,
    envelope: ExecutionRequestEnvelope,
    startedAt: number
  ): Promise<ExecutionResultEnvelope> {
    this.registry.acquire(nodeId);
    try {
      // RPC over the existing bus; the node replies on the correlated result topic.
      const raw = await this.eventBus.publishAndWaitForResponse<unknown>(
        execRequestSubject(runtime),
        envelope,
        envelope.deadlineMs
      );
      return this.normalizeRemoteResult(raw, envelope, nodeId, startedAt);
    } catch (error) {
      return this.fail(envelope, error, nodeId, startedAt);
    } finally {
      this.registry.release(nodeId);
    }
  }

  private normalizeRemoteResult(
    raw: unknown,
    envelope: ExecutionRequestEnvelope,
    nodeId: string,
    startedAt: number
  ): ExecutionResultEnvelope {
    if (isRecord(raw) && typeof raw.ok === 'boolean') {
      const result = raw as unknown as ExecutionResultEnvelope;
      return {
        ...result,
        correlationId: envelope.correlationId,
        metrics: {
          ...result.metrics,
          nodeId,
          durationMs: Date.now() - startedAt,
        },
      };
    }
    return this.ok(envelope, raw, nodeId, startedAt);
  }

  private acquireRuntimeSlot(runtime: ExecutionRuntime): void {
    const current = this.inFlightPerRuntime.get(runtime) ?? 0;
    if (current >= this.maxConcurrentPerRuntime) {
      throw new ExecutionMeshError(
        'RESOURCE_EXHAUSTED',
        `Runtime "${runtime}" at capacity (${this.maxConcurrentPerRuntime} concurrent)`
      );
    }
    this.inFlightPerRuntime.set(runtime, current + 1);
  }

  private releaseRuntimeSlot(runtime: ExecutionRuntime): void {
    const current = this.inFlightPerRuntime.get(runtime) ?? 0;
    this.inFlightPerRuntime.set(runtime, Math.max(0, current - 1));
  }

  private affinityOf(envelope: ExecutionRequestEnvelope) {
    return envelope.ctx.tenant ? { tenant: envelope.ctx.tenant } : undefined;
  }

  private ok(
    envelope: ExecutionRequestEnvelope,
    output: unknown,
    nodeId: string,
    startedAt: number
  ): ExecutionResultEnvelope {
    return {
      correlationId: envelope.correlationId,
      ok: true,
      output,
      metrics: { nodeId, durationMs: Date.now() - startedAt },
    };
  }

  private fail(
    envelope: ExecutionRequestEnvelope,
    error: unknown,
    nodeId: string,
    startedAt: number
  ): ExecutionResultEnvelope {
    return {
      correlationId: envelope.correlationId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      metrics: { nodeId, durationMs: Date.now() - startedAt },
    };
  }

  private async ensureStarted(): Promise<void> {
    if (!this.startPromise) {
      this.startPromise = this.registry.start().then(() => this.registerWorkerNode());
    }
    await this.startPromise;
  }

  /**
   * Statically register the always-on Cloudflare exec-worker as a `worker`-runtime
   * node (spec §3.1). No heartbeat: it is dispatched by HTTP fetch and never
   * drained (ExecutionNode.alwaysOn). Skipped entirely when EXEC_WORKER_URL is
   * unset, so worker-runtime tools then fall back to native — behaviour preserved.
   */
  private registerWorkerNode(): void {
    if (!this.workerUrl) return;
    this.registry.registerNode({
      id: WORKER_NODE_ID,
      runtime: 'worker',
      capabilities: ['*'], // pure-JS tools + http/streamable-http MCP proxy
      capacity: {
        maxConcurrent: this.maxConcurrentPerRuntime,
        cpu: 1,
        memMb: 128,
      },
      health: 'ready',
      lastHeartbeat: Date.now(),
      alwaysOn: true,
    });
    logger.info('Registered static Cloudflare exec-worker node', {
      nodeId: WORKER_NODE_ID,
      workerUrl: this.workerUrl,
    });
  }
}
