// exec-node-mcp — the docker-mcp node-agent (data plane, spec §3.2/§4/§6).
//
// Lifecycle: register over the bus -> heartbeat on an interval -> consume
// exec.request.docker-mcp -> run each tool in a hardened, pooled Docker container
// -> reply with an ExecutionResultEnvelope. If Docker is unavailable the node
// heartbeats `degraded` and fails calls with a typed NODE_ERROR (never crashes).

import type { EventBusService } from '@uaip/infra';
import type {
  ExecutionMeshErrorCode,
  ExecutionNodeHeartbeat,
  ExecutionNodeHealth,
  ExecutionNodeRegistration,
  ExecutionRequestEnvelope,
  ExecutionResultEnvelope,
  ExecutionSandboxPolicy,
} from '@uaip/types';
import {
  EXEC_NODE_HEARTBEAT,
  EXEC_NODE_REGISTER,
  execRequestSubject,
  execResultSubject,
} from '@uaip/types';
import type { ExecNodeConfig } from './config.js';
import { ContainerPool, ResourceExhaustedError } from './container_pool.js';
import { isDockerAvailable, type ContainerSpec } from './docker_runner.js';
import { sendHttpHeartbeat } from './enroll.js';

// The shared reply queue used by EventBusService.publishAndWaitForResponse — the
// scheduler waits on this queue keyed by the request's correlationId. See
// apps/shared/infra/src/event_bus.ts (getOrCreateReplyWorker).
const REPLY_QUEUE = 'rpc.replies';
const INIT_TIMEOUT_MS = 60_000;

type Logger = {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  debug: (msg: string, meta?: Record<string, unknown>) => void;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parse the request envelope off a bus message payload (defensive). */
function toEnvelope(data: unknown): ExecutionRequestEnvelope | null {
  if (!isRecord(data)) return null;
  if (typeof data.correlationId !== 'string' || typeof data.toolId !== 'string') return null;
  if (!isRecord(data.params)) return null;
  return data as unknown as ExecutionRequestEnvelope;
}

/** `mcp-<server>-<tool>` -> the tool name the MCP server exposes. */
function mcpToolNameOf(toolId: string): string | null {
  const parts = toolId.split('-');
  if (parts.length < 3 || parts[0] !== 'mcp') return null;
  return parts.slice(2).join('-');
}

export class NodeAgent {
  private pool: ContainerPool;
  private dockerReady = false;
  private inFlight = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private readonly bus: EventBusService,
    private readonly cfg: ExecNodeConfig,
    private readonly log: Logger
  ) {
    this.pool = new ContainerPool({
      maxContainers: cfg.maxContainers,
      warmIdleTtlMs: cfg.warmIdleTtlMs,
      initTimeoutMs: INIT_TIMEOUT_MS,
      log: (msg, meta) => this.log.debug(msg, meta),
    });
  }

  async start(): Promise<void> {
    this.dockerReady = await isDockerAvailable();
    if (!this.dockerReady) {
      this.log.warn('Docker daemon not reachable — node will heartbeat DEGRADED', {
        nodeId: this.cfg.nodeId,
      });
    }

    await this.bus.subscribe(execRequestSubject('docker-mcp'), (message) =>
      this.handleRequest(message.correlationId, message.data)
    );

    await this.register();
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat();
    }, this.cfg.heartbeatIntervalMs);
    this.heartbeatTimer.unref?.();

    this.log.info('exec-node-mcp started', {
      nodeId: this.cfg.nodeId,
      dockerReady: this.dockerReady,
      capabilities: this.cfg.capabilities,
      maxContainers: this.cfg.maxContainers,
    });
  }

  /** True when the node was enrolled over HTTP (BYO docker/EC2 quick step). */
  private get enrolled(): boolean {
    return Boolean(this.cfg.apiUrl && this.cfg.nodeToken);
  }

  private async register(): Promise<void> {
    // Enrolled nodes were already registered by the control plane during the HTTP
    // enroll exchange (with owner + org affinity stamped), so we must NOT re-emit
    // an unstamped bus registration that would clobber that identity.
    if (this.enrolled) {
      this.log.info('Node registered via HTTP enrollment; skipping bus register', {
        nodeId: this.cfg.nodeId,
      });
      return;
    }

    const reg: ExecutionNodeRegistration = {
      id: this.cfg.nodeId,
      runtime: 'docker-mcp',
      capabilities: this.cfg.capabilities,
      capacity: {
        maxConcurrent: this.cfg.maxConcurrent,
        cpu: this.cfg.cpu,
        memMb: this.cfg.memMb,
      },
      affinity:
        this.cfg.region || this.cfg.tenant
          ? { region: this.cfg.region, tenant: this.cfg.tenant }
          : undefined,
    };
    await this.bus.publish(EXEC_NODE_REGISTER, reg);
    this.log.info('Node registered with control plane', { nodeId: this.cfg.nodeId });
  }

  private async heartbeat(): Promise<void> {
    if (this.stopped) return;
    // Re-probe Docker so a recovered daemon flips the node back to ready.
    if (!this.dockerReady) this.dockerReady = await isDockerAvailable();
    const health: ExecutionNodeHealth = this.dockerReady ? 'ready' : 'degraded';
    // Enrolled nodes heartbeat over HTTP (authenticated by the node token) and
    // stay off the raw bus for control messages; legacy nodes use the bus.
    if (this.enrolled) {
      await sendHttpHeartbeat(this.cfg.apiUrl!, this.cfg.nodeId, this.cfg.nodeToken!, health);
      return;
    }
    const hb: ExecutionNodeHeartbeat = { id: this.cfg.nodeId, health };
    await this.bus.publish(EXEC_NODE_HEARTBEAT, hb);
  }

  /** Never throws — always resolves so the BullMQ job is not retried (side effects). */
  private async handleRequest(rpcCorrelationId: string | undefined, data: unknown): Promise<void> {
    const envelope = toEnvelope(data);
    if (!envelope) {
      this.log.warn('Dropped malformed exec request', { rpcCorrelationId });
      return;
    }

    const startedAt = Date.now();
    let result: ExecutionResultEnvelope;

    if (!this.dockerReady) {
      result = this.fail(envelope, 'NODE_ERROR', 'Docker daemon unavailable on this node', startedAt);
    } else {
      result = await this.run(envelope, startedAt);
    }

    await this.reply(rpcCorrelationId, envelope, result);
  }

  private async run(
    envelope: ExecutionRequestEnvelope,
    startedAt: number
  ): Promise<ExecutionResultEnvelope> {
    const toolName = mcpToolNameOf(envelope.toolId);
    if (!toolName) {
      return this.fail(envelope, 'NODE_ERROR', `Not an MCP tool id: ${envelope.toolId}`, startedAt);
    }

    const sandbox: ExecutionSandboxPolicy = envelope.sandbox ?? {};
    const spec: ContainerSpec = {
      name: `execmcp-${envelope.correlationId}`,
      image: sandbox.image || this.cfg.runnerImage,
      command: sandbox.command,
      args: sandbox.args ?? [],
      env: sandbox.env,
      scopedToken: envelope.ctx.scopedToken,
      sandbox: { ttlSec: this.cfg.defaultTtlSec, ...sandbox },
    };

    this.inFlight++;
    let leased: Awaited<ReturnType<ContainerPool['acquire']>> | null = null;
    try {
      leased = await this.pool.acquire(spec);
      const output = await leased.session.callTool(toolName, envelope.params, envelope.deadlineMs);
      this.pool.release(leased);
      return this.ok(envelope, output, startedAt);
    } catch (error) {
      if (leased) this.pool.release(leased, true); // destroy on any error
      if (error instanceof ResourceExhaustedError) {
        return this.fail(envelope, 'RESOURCE_EXHAUSTED', error.message, startedAt);
      }
      const msg = error instanceof Error ? error.message : String(error);
      return this.fail(envelope, 'NODE_ERROR', msg, startedAt);
    } finally {
      this.inFlight--;
    }
  }

  private async reply(
    rpcCorrelationId: string | undefined,
    envelope: ExecutionRequestEnvelope,
    result: ExecutionResultEnvelope
  ): Promise<void> {
    // Correlated observability topic (spec §6) — fire and forget.
    void this.bus.publish(execResultSubject(envelope.correlationId), result).catch(() => {});

    // RPC reply the scheduler is awaiting. Wrap as { data } so the shared reply
    // worker resolves the caller's promise with our ExecutionResultEnvelope.
    if (!rpcCorrelationId) {
      this.log.warn('No RPC correlationId on request; cannot reply', {
        correlationId: envelope.correlationId,
      });
      return;
    }
    await this.bus.publish(REPLY_QUEUE, { data: result }, { correlationId: rpcCorrelationId });
  }

  private ok(
    envelope: ExecutionRequestEnvelope,
    output: unknown,
    startedAt: number
  ): ExecutionResultEnvelope {
    return {
      correlationId: envelope.correlationId,
      ok: true,
      output,
      metrics: { nodeId: this.cfg.nodeId, durationMs: Date.now() - startedAt },
    };
  }

  private fail(
    envelope: ExecutionRequestEnvelope,
    code: ExecutionMeshErrorCode,
    message: string,
    startedAt: number
  ): ExecutionResultEnvelope {
    return {
      correlationId: envelope.correlationId,
      ok: false,
      error: `${code}: ${message}`,
      metrics: { nodeId: this.cfg.nodeId, durationMs: Date.now() - startedAt, code },
    };
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // Announce we're draining, then tear down containers.
    if (this.enrolled) {
      await sendHttpHeartbeat(this.cfg.apiUrl!, this.cfg.nodeId, this.cfg.nodeToken!, 'draining');
    } else {
      await this.bus
        .publish(EXEC_NODE_HEARTBEAT, { id: this.cfg.nodeId, health: 'draining' })
        .catch(() => {});
    }
    this.pool.shutdown();
    this.log.info('exec-node-mcp stopped', { nodeId: this.cfg.nodeId, inFlight: this.inFlight });
  }
}
