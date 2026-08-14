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
import { parseFederatedToolId } from './descriptor.js';
import { mintScopedToken } from './scoped_token.js';

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
const FEDERATION_NODE_ID = 'federation-dialer';

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

      // Federation: tenant scoping is enforced by the scoped token's claims, not
      // node placement — the always-on dialer advertises no affinity, and a
      // tenant-affinity filter would wrongly exclude it (matchesAffinity is
      // false for affinity-less nodes).
      const node = this.registry.pickNode(
        runtime,
        envelope.toolId,
        runtime === 'federation' ? undefined : this.affinityOf(envelope),
        envelope.requires
      );
      if (!node) {
        // A federated tool exists ONLY on its producer — native has no such tool,
        // so "falling back" would silently execute something else (or nothing).
        // Fail loud instead (execution plan §2.3).
        if (runtime === 'federation') {
          throw new ExecutionMeshError(
            'NO_NODE_AVAILABLE',
            `No federation node available for tool ${envelope.toolId}`
          );
        }
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

      // Federation tier dials the producer's own MCP endpoint directly — no
      // static front door, per the spec-11 sovereign-nodes thesis (D1/D3).
      if (runtime === 'federation') {
        return await this.dispatchFederation(node.id, envelope, startedAt);
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

  /**
   * Dispatch a federation-runtime request straight to the producer's MCP
   * endpoint (`envelope.endpoint`, sourced from the federation registry) as a
   * JSON-RPC `tools/call`, authenticated with a per-call scoped RS256 token the
   * producer verifies against the fleet JWKS. DELIBERATE divergence from the
   * worker path: a transport failure NEVER falls back to native — a federated
   * tool exists only on its producer, so it fails with NODE_ERROR instead of
   * silently running something else (execution plan §2.3).
   */
  private async dispatchFederation(
    nodeId: string,
    envelope: ExecutionRequestEnvelope,
    startedAt: number
  ): Promise<ExecutionResultEnvelope> {
    this.registry.acquire(nodeId);
    try {
      const endpoint = envelope.endpoint;
      if (!endpoint) {
        throw new ExecutionMeshError(
          'NODE_ERROR',
          `Federated tool ${envelope.toolId} has no producer endpoint on its envelope`
        );
      }

      const parsed = parseFederatedToolId(envelope.toolId);
      const toolName = parsed?.toolName ?? envelope.toolId;

      // D3 + D6: federation NEVER ships unauthenticated. If the scoped token
      // cannot be minted, the call fails closed.
      const scopedToken = await mintScopedToken({
        userId: envelope.ctx.userId,
        toolId: envelope.toolId,
        correlationId: envelope.correlationId,
        tenant: envelope.ctx.tenant,
      });

      const output = await this.fetchFederation(endpoint, toolName, envelope, scopedToken);
      return this.ok(envelope, output, nodeId, startedAt);
    } catch (error) {
      logger.warn('Federation dispatch failed (no native fallback for federated tools)', {
        toolId: envelope.toolId,
        correlationId: envelope.correlationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.fail(envelope, error, nodeId, startedAt);
    } finally {
      this.registry.release(nodeId);
    }
  }

  /**
   * POST a JSON-RPC 2.0 `tools/call` to a federated producer's MCP endpoint.
   * Mirrors MCPClientService's http/streamable-http request shape (Accept
   * includes text/event-stream; single-event SSE bodies are unwrapped) without
   * requiring a registered long-lived server entry — producers are dialled
   * per-call and never held open.
   */
  private async fetchFederation(
    endpoint: string,
    toolName: string,
    envelope: ExecutionRequestEnvelope,
    scopedToken: string
  ): Promise<unknown> {
    const request = {
      jsonrpc: '2.0' as const,
      id: envelope.correlationId,
      method: 'tools/call',
      params: { name: toolName, arguments: envelope.params },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), envelope.deadlineMs);
    timer.unref?.();
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${scopedToken}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new ExecutionMeshError('NODE_ERROR', `federated producer HTTP ${resp.status}`);
      }

      const contentType = resp.headers.get('content-type') ?? '';
      const body: unknown = contentType.includes('text/event-stream')
        ? this.parseSSEBody(await resp.text())
        : await resp.json();

      if (!isRecord(body) || body.jsonrpc !== '2.0') {
        throw new ExecutionMeshError('NODE_ERROR', 'federated producer returned non-JSON-RPC body');
      }
      if (isRecord(body.error)) {
        const message = typeof body.error.message === 'string' ? body.error.message : 'unknown';
        throw new ExecutionMeshError('NODE_ERROR', `federated tool error: ${message}`);
      }
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Extract the last `data:` payload from a single-response SSE body. */
  private parseSSEBody(text: string): unknown {
    let last: unknown;
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice('data:'.length).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        last = JSON.parse(payload);
      } catch {
        // Non-JSON keep-alive chunk — ignore.
      }
    }
    return last;
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
      this.startPromise = this.registry.start().then(() => {
        this.registerWorkerNode();
        this.registerFederationNode();
      });
    }
    await this.startPromise;
  }

  /**
   * Statically register the in-process federation dialer as a `federation`
   * node. Like the worker node it is always-on and never heartbeats — producers
   * are dialled directly per call; their liveness is the federation registry's
   * health-check concern, not the mesh's. Always registered: a federated tool
   * with no producer still fails loud (NODE_ERROR), never silently native.
   */
  private registerFederationNode(): void {
    this.registry.registerNode({
      id: FEDERATION_NODE_ID,
      runtime: 'federation',
      capabilities: ['*'], // any federated tool; the endpoint travels on the envelope
      capacity: {
        maxConcurrent: this.maxConcurrentPerRuntime,
        cpu: 1,
        memMb: 64,
      },
      health: 'ready',
      lastHeartbeat: Date.now(),
      alwaysOn: true,
    });
    logger.info('Registered static federation dialer node', { nodeId: FEDERATION_NODE_ID });
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
