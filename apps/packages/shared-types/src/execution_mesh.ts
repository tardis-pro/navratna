// Hybrid Execution Mesh — node contract, envelopes, and runtime descriptor.
// See docs/specs/11-HYBRID-EXECUTION-MESH.md.
//
// These types are the control-plane <-> data-plane contract. They are shared so
// that future node-agents (Worker / docker-mcp / codespace) speak the same
// envelopes as the scheduler in capability-registry. Phase 1a ships only the
// control-plane side (scheduler + node registry + native node).

/** The runtime tier a tool executes on. `native` = the legacy in-process executor. */
export type ExecutionRuntime = 'worker' | 'docker-mcp' | 'codespace' | 'native';

/** Health state of a registered execution node. */
export type ExecutionNodeHealth = 'ready' | 'degraded' | 'draining' | 'down';

/**
 * Coarse capacity tier a node self-declares. `light` = constrained/edge-ish
 * (few deps, low RAM); `heavy` = full host with runtimes/binaries installed.
 * Advisory — real routing uses `runtimes`/`capabilities`, not tier alone.
 */
export type NodeTier = 'light' | 'heavy';

/** MCP transport, used to INFER a runtime when a tool declares no explicit one. */
export type ToolTransport = 'stdio' | 'http' | 'streamable-http';

export interface ExecutionNodeCapacity {
  maxConcurrent: number;
  cpu: number;
  memMb: number;
}

export interface ExecutionNodeAffinity {
  region?: string;
  tenant?: string;
  dataLocality?: string;
}

/** A node that has joined the mesh (registered + heart-beating over the bus). */
export interface ExecutionNode {
  id: string;
  runtime: ExecutionRuntime;
  capabilities: string[]; // tool ids / families, or ['*'] for any
  capacity: ExecutionNodeCapacity;
  affinity?: ExecutionNodeAffinity;
  health: ExecutionNodeHealth;
  lastHeartbeat: number; // epoch ms
  /**
   * Statically-registered, always-available node with NO heartbeat loop (e.g. the
   * Cloudflare exec-worker, dispatched by HTTP fetch). The staleness sweep never
   * drains these. See spec §3.1 / Phase 2.
   */
  alwaysOn?: boolean;
  /**
   * The Navratna user id that enrolled this node (BYO docker/EC2 nodes). Absent on
   * platform-owned nodes (native, worker-cf). Used to scope the nodes list to the
   * owner and to keep a user's work on their own machines.
   */
  owner?: string;
  /**
   * Runtimes / binaries the node self-detected at boot (e.g. `python3`, `bash`,
   * `sqlite3`, `node`, `docker`). This is what a step's `requires` is matched
   * against so a step never lands on a node missing its dependencies.
   */
  runtimes?: string[];
  /** Self-declared coarse tier (light/heavy). Advisory. */
  tier?: NodeTier;
  /** Free-form labels the node advertises (e.g. { gpu: 'true', zone: 'home' }). */
  labels?: Record<string, string>;
}

/** Per-call execution context. `scopedToken` is minted per-call by the control plane. */
export interface ExecutionMeshContext {
  userId: string;
  tenant?: string;
  scopedToken?: string; // short-lived, tool-scoped credential (Phase 2+; see spec §4)
}

/** Sandbox policy carried on a tool descriptor / request (enforced by the node). */
export interface ExecutionSandboxPolicy {
  image?: string;
  cpu?: number;
  memMb?: number;
  network?: string; // 'none' by default; egress allow-list otherwise
  readonlyRoot?: boolean;
  ttlSec?: number;
  /** Hard `--pids-limit` cap for the container (fork-bomb protection). */
  pidsLimit?: number;
  /**
   * For stdio MCP servers with no prebuilt `image`: the command the docker-mcp
   * node runs INSIDE a generic MCP runner image (spec §5). Non-secret args/env
   * only — real credentials arrive per-call via `ExecutionMeshContext.scopedToken`.
   */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /**
   * For `http`/`streamable-http` MCP tools routed to the worker tier: the MCP
   * server endpoint the exec-worker proxies the JSON-RPC `tools/call` to (spec
   * §3.1). Non-secret; auth headers are never carried here.
   */
  httpUrl?: string;
}

/** The request the scheduler dispatches to a node (or runs on the native node). */
export interface ExecutionRequestEnvelope {
  correlationId: string;
  toolId: string;
  params: Record<string, unknown>;
  ctx: ExecutionMeshContext;
  runtime: ExecutionRuntime;
  sandbox?: ExecutionSandboxPolicy;
  deadlineMs: number;
  idempotencyKey: string;
  /**
   * Runtimes/binaries the step declares it needs (e.g. `['python3','sqlite3']`).
   * The scheduler only picks a node whose advertised `runtimes` ⊇ `requires`, so
   * a python step never lands on a bash-only light node. Empty/undefined => no
   * runtime constraint (legacy behaviour preserved).
   */
  requires?: string[];
}

export interface ExecutionResultMetrics {
  nodeId: string;
  durationMs: number;
  [key: string]: unknown;
}

/** The result a node returns (correlated back by correlationId). */
export interface ExecutionResultEnvelope {
  correlationId: string;
  ok: boolean;
  output?: unknown;
  error?: string;
  metrics: ExecutionResultMetrics;
}

/**
 * Runtime extension to a tool descriptor. Lives alongside a tool's registry
 * definition; the scheduler reads `runtime` (explicit) or infers from `transport`.
 */
export interface ToolRuntimeDescriptor {
  runtime?: ExecutionRuntime;
  sandbox?: ExecutionSandboxPolicy;
  transport?: ToolTransport;
}

/** Payload of an `exec.node.register` bus message. */
export interface ExecutionNodeRegistration {
  id: string;
  runtime: ExecutionRuntime;
  capabilities: string[];
  capacity: ExecutionNodeCapacity;
  affinity?: ExecutionNodeAffinity;
  /** Self-detected runtimes/binaries the node can execute (see ExecutionNode). */
  runtimes?: string[];
  /** Self-declared coarse tier. */
  tier?: NodeTier;
  /** Free-form advertised labels. */
  labels?: Record<string, string>;
  /** Owning Navratna user id (set by the control plane on token enrollment). */
  owner?: string;
}

// ---------------------------------------------------------------------------
// BYO-node quick enrollment (docker/EC2) — HTTP control-plane contract.
// A user mints a short-lived enrollment token, boots a node with it, and the
// node exchanges it for a registration + a longer-lived node token used to
// heartbeat. Keeps external nodes off the raw bus for control messages.
// ---------------------------------------------------------------------------

/** Body a booting node POSTs to `/api/v1/mesh/nodes/enroll` (Bearer = enroll token). */
export interface ExecutionNodeEnrollRequest {
  runtime: ExecutionRuntime;
  capabilities: string[];
  capacity: ExecutionNodeCapacity;
  runtimes?: string[];
  tier?: NodeTier;
  labels?: Record<string, string>;
}

/** Response the control plane returns to a successfully enrolled node. */
export interface ExecutionNodeEnrollResponse {
  nodeId: string;
  /** Tenant/org the node is scoped to (mirrors the enroll token's org claim). */
  tenant?: string;
  /** Longer-lived, node-scoped token the node uses to authenticate heartbeats. */
  nodeToken: string;
  /** Cadence (ms) the control plane wants heartbeats at. */
  heartbeatIntervalMs: number;
}

/** Payload of an `exec.node.heartbeat` bus message. */
export interface ExecutionNodeHeartbeat {
  id: string;
  health?: ExecutionNodeHealth;
}

/** Typed failure codes surfaced by the scheduler. */
export type ExecutionMeshErrorCode =
  | 'RESOURCE_EXHAUSTED'
  | 'NO_NODE_AVAILABLE'
  | 'DEADLINE_EXCEEDED'
  | 'NODE_ERROR';

// ---------------------------------------------------------------------------
// Bus subjects — the control-plane <-> data-plane wire contract (spec §4).
// Kept here so the scheduler (capability-registry) and every node-agent
// (exec-node-mcp, future worker/codespace) share ONE definition, no drift.
// ---------------------------------------------------------------------------

/** A node announces itself to the control plane. */
export const EXEC_NODE_REGISTER = 'exec.node.register';

/** A node's periodic liveness heartbeat. */
export const EXEC_NODE_HEARTBEAT = 'exec.node.heartbeat';

/** Per-runtime request queue the scheduler enqueues to for remote nodes. */
export const execRequestSubject = (runtime: ExecutionRuntime): string =>
  `exec.request.${runtime}`;

/** Correlated result topic a node publishes to (observability / RPC reply). */
export const execResultSubject = (correlationId: string): string =>
  `exec.result.${correlationId}`;

/** Streaming partials for long-running tools (build logs, agent tokens). */
export const execStreamSubject = (correlationId: string): string =>
  `exec.stream.${correlationId}`;
