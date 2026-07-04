/**
 * Navratna API Gateway — Cloudflare Containers Worker
 *
 * Fronts api.navratna.tardis.digital and routes to two container-backed
 * Durable Objects:
 *   - GatewayContainer (navratna-gateway): auth, security, users, operations,
 *     tasks, projects, tools, capabilities, mcp, federation, audit, approvals
 *   - CoreContainer (navratna-core): agents, personas, discussions, artifacts,
 *     llm, knowledge, deploy, compose, onboarding + Socket.IO
 *
 * Each container listens on port 8080. A single instance per class is used
 * (idFromName("singleton")) so the container holds warm connections to the
 * managed data layer (Supabase / Upstash / Aura / Qdrant).
 */

import { Container, getContainer } from '@cloudflare/containers';
import { env as workerEnv } from 'cloudflare:workers';

interface Env {
  CORE_CONTAINER: DurableObjectNamespace<CoreContainer>;
  GATEWAY_CONTAINER: DurableObjectNamespace<GatewayContainer>;
  [key: string]: unknown;
}

// Worker secrets/vars are NOT auto-forwarded to the container's Firecracker VM.
// @cloudflare/containers only injects `this.envVars` into the container process
// env, and ONLY at container start. envVars must therefore be a class-level
// property resolved at module load from `cloudflare:workers` env — resolving it
// inside fetch() is too late once an instance is already running.
const CONTAINER_ENV_KEYS = [
  'POSTGRES_URL',
  'REDIS_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'REDIS_TLS',
  'NEO4J_URI',
  'NEO4J_URL',
  'NEO4J_USER',
  'NEO4J_PASSWORD',
  'QDRANT_URL',
  'QDRANT_API_KEY',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DELETION_HASH_SALT',
  'DISABLE_SIGNAL_EXIT',
  'BOOT_SINK_URL',
] as const;

function buildContainerEnv(): Record<string, string> {
  const out: Record<string, string> = { NODE_ENV: 'production', DB_SSL: 'true' };
  const source = workerEnv as Record<string, unknown>;
  for (const key of CONTAINER_ENV_KEYS) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return out;
}

const CONTAINER_ENV = buildContainerEnv();

const CONTAINER_INSTANCE_TIMEOUT = '20m';

// The app connects to Supabase / Aura / Qdrant / Upstash on boot and only binds
// port 8080 after ~8–20s under Cloudflare cold start (Firecracker VM + registry
// pull + network handshakes). The base Container.fetch() waits only ~8s for the
// port, then reports "container is not running". Raise the port-ready window.
const PORT_READY_TIMEOUT_MS = 120_000;

/** navratna-core container (agents, discussions, artifacts, llm, knowledge, socket.io) */
export class CoreContainer extends Container {
  defaultPort = 8080;
  sleepAfter = CONTAINER_INSTANCE_TIMEOUT;
  enableInternet = true;
  envVars = CONTAINER_ENV;

  lastStop = '';
  lastError = '';

  override onStop(params: { exitCode?: number; reason?: string }): void {
    this.lastStop = `exitCode=${params.exitCode} reason=${params.reason} at=${new Date().toISOString()}`;
  }

  override onError(error: unknown): void {
    this.lastError = error instanceof Error ? (error.stack ?? error.message) : String(error);
  }

  override async fetch(request: Request): Promise<Response> {
    const envKeys = Object.keys(this.envVars).sort().join(',');
    try {
      await this.startAndWaitForPorts({
        ports: [this.defaultPort],
        cancellationOptions: { portReadyTimeoutMS: PORT_READY_TIMEOUT_MS },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.stack ?? err.message : String(err);
      return new Response(`core startAndWaitForPorts failed: ${msg}\nlastStop: ${this.lastStop}\nlastError: ${this.lastError}\nenvKeys: ${envKeys}`, { status: 503 });
    }
    return this.containerFetch(request, this.defaultPort);
  }
}

/** navratna-gateway container (auth, security, orchestration, capabilities) */
export class GatewayContainer extends Container {
  defaultPort = 8080;
  sleepAfter = CONTAINER_INSTANCE_TIMEOUT;
  enableInternet = true;
  envVars = CONTAINER_ENV;

  override async fetch(request: Request): Promise<Response> {
    try {
      await this.startAndWaitForPorts({
        ports: [this.defaultPort],
        cancellationOptions: { portReadyTimeoutMS: PORT_READY_TIMEOUT_MS },
      });
    } catch (err) {
      return new Response(`gateway startAndWaitForPorts failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`, { status: 503 });
    }
    return this.containerFetch(request, this.defaultPort);
  }
}

// Path prefixes owned by the gateway (security-gateway + orchestration-pipeline + capability-registry).
// Everything else (agents, personas, discussions, artifacts, llm, knowledge, socket.io) goes to core.
const GATEWAY_PREFIXES = [
  '/api/v1/auth',
  '/api/v1/users',
  '/api/v1/security',
  '/api/v1/mfa',
  '/api/v1/oauth',
  '/api/v1/approvals',
  '/api/v1/audit',
  '/api/v1/operations',
  '/api/v1/tasks',
  '/api/v1/projects',
  '/api/v1/workflows',
  '/api/v1/tools',
  '/api/v1/capabilities',
  '/api/v1/mcp',
  '/api/v1/federation',
  '/api/v1/workspace',
];

function routesToGateway(pathname: string): boolean {
  return GATEWAY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (routesToGateway(url.pathname)) {
        const container = getContainer(env.GATEWAY_CONTAINER, 'singleton');
        return await container.fetch(request);
      }

      const container = getContainer(env.CORE_CONTAINER, 'singleton');
      return await container.fetch(request);
    } catch (err) {
      return new Response(`worker fetch failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`, { status: 502 });
    }
  },
};
