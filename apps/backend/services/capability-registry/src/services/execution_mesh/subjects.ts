// Execution Mesh — bus subject constants.
// Control plane <-> data plane messaging topics over the existing EventBus.
// See docs/specs/11-HYBRID-EXECUTION-MESH.md §4.

import type { ExecutionRuntime } from '@uaip/types';

/** A node announces itself to the control plane. */
export const EXEC_NODE_REGISTER = 'exec.node.register';

/** A node's periodic liveness heartbeat. */
export const EXEC_NODE_HEARTBEAT = 'exec.node.heartbeat';

/** Per-runtime request queue the scheduler enqueues to for remote nodes. */
export const execRequestSubject = (runtime: ExecutionRuntime): string =>
  `exec.request.${runtime}`;

/** Correlated result topic a node publishes to (RPC reply). */
export const execResultSubject = (correlationId: string): string =>
  `exec.result.${correlationId}`;

/** Streaming partials for long-running tools (build logs, agent tokens). */
export const execStreamSubject = (correlationId: string): string =>
  `exec.stream.${correlationId}`;
