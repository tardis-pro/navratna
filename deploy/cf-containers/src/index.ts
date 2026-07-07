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
  const out: Record<string, string> = { NODE_ENV: 'container', DB_SSL: 'false' };
  const source = workerEnv as Record<string, unknown>;
  for (const key of CONTAINER_ENV_KEYS) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return out;
}

const CONTAINER_ENV = buildContainerEnv();

const CONTAINER_INSTANCE_TIMEOUT = '1s';

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

async function diagResponse(): Promise<Response> {
  const source = workerEnv as Record<string, unknown>;
  const report: Record<string, unknown> = {};
  for (const key of CONTAINER_ENV_KEYS) {
    const value = source[key];
    report[key] = typeof value === 'string' ? value.length : 'MISSING';
  }
  const pgUrl = source['POSTGRES_URL'];
  if (typeof pgUrl === 'string' && pgUrl.length > 0) {
    try {
      const parsed = new URL(pgUrl);
      const pg: Record<string, unknown> = {
        host: parsed.hostname,
        port: parsed.port || '5432',
        user: parsed.username,
        db: parsed.pathname.slice(1),
      };
      try {
        const { connect } = await import('cloudflare:sockets');
        const socket = connect({ hostname: parsed.hostname, port: parseInt(parsed.port) || 5432 });
        await Promise.race([
          socket.opened,
          new Promise((_, rej) => setTimeout(() => rej(new Error('tcp timeout 8s')), 8000)),
        ]);
        pg.tcp = 'OPEN';
        await socket.close();
      } catch (e) {
        pg.tcp = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
      }
      report.postgres = pg;
    } catch (e) {
      report.postgres = `URL parse failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  report.containerEnvKeys = Object.keys(CONTAINER_ENV).sort();
  return new Response(JSON.stringify(report, null, 2), {
    headers: { 'content-type': 'application/json' },
  });
}

type SslOption = false | { rejectUnauthorized: boolean };

async function tryPgConnect(url: string, ssl: SslOption): Promise<Record<string, unknown>> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 15000,
    ssl,
  });
  const report: Record<string, unknown> = {};
  try {
    const client = await pool.connect();
    const r = await client.query('SELECT 1 as ok, current_user');
    client.release();
    report.connect = 'OK';
    report.row = r.rows[0];
  } catch (e) {
    const err = e as Error & { code?: string };
    report.connect = 'FAIL';
    report.errCode = err.code;
    report.errMessage = err.message;
  } finally {
    await pool.end().catch(() => {});
  }
  return report;
}

async function dbCheckResponse(): Promise<Response> {
  const source = workerEnv as Record<string, unknown>;
  const pgUrl = source['POSTGRES_URL'];
  if (typeof pgUrl !== 'string' || pgUrl.length === 0) {
    return Response.json({ error: 'POSTGRES_URL missing' }, { status: 500 });
  }
  const url6543 = pgUrl.replace(':5432/', ':6543/');
  const report: Record<string, unknown> = {
    ssl_object_5432: await tryPgConnect(pgUrl, { rejectUnauthorized: false }),
    ssl_off_5432: await tryPgConnect(pgUrl, false),
    ssl_object_6543: await tryPgConnect(url6543, { rejectUnauthorized: false }),
    ssl_off_6543: await tryPgConnect(url6543, false),
  };
  return Response.json(report);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/__diag') {
      return diagResponse();
    }

    if (url.pathname === '/__dbcheck') {
      return dbCheckResponse();
    }

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
