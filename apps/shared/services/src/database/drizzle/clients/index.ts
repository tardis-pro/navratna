/**
 * Drizzle Multi-Plane Clients — Navratna v3.0
 *
 * Two Drizzle database clients, one per operational plane:
 *
 *   intelligenceDb — Intelligence Plane (PC-A)
 *     Domain: agents, personas, knowledge, discussions, artifacts, LLM
 *     Env var: POSTGRES_URL_INTELLIGENCE (falls back to POSTGRES_URL)
 *
 *   controlDb — Control Plane (PC-B)
 *     Domain: users, auth, security, operations, tools, MCP, capabilities
 *     Env var: POSTGRES_URL_CONTROL (falls back to POSTGRES_URL)
 *
 * ─── Single-machine (development / single-node production) ───────────────
 *   Both env vars unset → both clients point to POSTGRES_URL (same DB).
 *   Foreign keys work natively within each plane's tables.
 *
 * ─── Multi-machine (PC-A + PC-B topology per 04-INFRASTRUCTURE-TOPOLOGY.md) ─
 *   POSTGRES_URL_INTELLIGENCE=postgresql://pc-a-navratna.tailnet:5432/navratna
 *   POSTGRES_URL_CONTROL=postgresql://pc-b-navratna.tailnet:5432/navratna
 *   Cross-plane references are UUIDs only — no DB-level FK constraints.
 *   Use CrossPlaneGuard.verify() to enforce referential integrity at app level.
 *
 * ─── Cross-plane foreign key pattern ─────────────────────────────────────
 *   // "agent" lives in intelligenceDb, "operation" lives in controlDb
 *   // Before inserting an operation that references an agent:
 *   await CrossPlaneGuard.verify(intelligenceDb, agents, agentId, 'agent');
 *   await controlDb.insert(operations).values({ agentId, ... });
 */

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createLogger } from '@uaip/utils';
import * as intelligenceSchema from '../schemas/intelligence_schema';
import * as controlSchema from '../schemas/control_schema';

const logger = createLogger({
  serviceName: 'drizzle-clients',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

// ─────────────────────────────────────────────────────────────────────────────
// Connection factory
// ─────────────────────────────────────────────────────────────────────────────

function makePool(urlEnvVar: string, fallbackEnvVar = 'POSTGRES_URL'): pg.Pool {
  const url = process.env[urlEnvVar] || process.env[fallbackEnvVar];

  if (url) {
    return new pg.Pool({
      connectionString: url,
      max: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
      connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT || '30000'),
      ssl:
        process.env.DB_SSL === 'false'
          ? undefined
          : process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : undefined,
    });
  }

  return new pg.Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'uaip_user',
    password: process.env.POSTGRES_PASSWORD || 'uaip_password',
    database: process.env.POSTGRES_DB || 'uaip',
    max: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT || '30000'),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed DB instances
// ─────────────────────────────────────────────────────────────────────────────

export type IntelligenceDB = NodePgDatabase<typeof intelligenceSchema>;
export type ControlDB = NodePgDatabase<typeof controlSchema>;

// Store plane state on globalThis to prevent dual-module-instance bugs.
// Bun resolves src/ and dist/ as separate modules (tsconfig paths vs package.json exports),
// so module-level variables would be duplicated. globalThis is shared across all copies.
interface DrizzlePlaneState {
  intelligenceDb: IntelligenceDB | null;
  controlDb: ControlDB | null;
  intelligencePool: pg.Pool | null;
  controlPool: pg.Pool | null;
}

const GLOBAL_KEY = '__uaip_drizzle_planes__' as const;
function getPlaneState(): DrizzlePlaneState {
  if (!(globalThis as Record<string, unknown>)[GLOBAL_KEY]) {
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
      intelligenceDb: null,
      controlDb: null,
      intelligencePool: null,
      controlPool: null,
    };
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as DrizzlePlaneState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initializer — call once at service startup
// ─────────────────────────────────────────────────────────────────────────────

export async function initializePlanes(): Promise<{
  intelligenceDb: IntelligenceDB;
  controlDb: ControlDB;
}> {
  const state = getPlaneState();
  if (state.intelligenceDb && state.controlDb) {
    return { intelligenceDb: state.intelligenceDb, controlDb: state.controlDb };
  }

  // Intelligence plane (PC-A)
  state.intelligencePool = makePool('POSTGRES_URL_INTELLIGENCE');
  const iClient = await state.intelligencePool.connect();
  await iClient.query('SELECT 1');
  iClient.release();
  state.intelligenceDb = drizzle(state.intelligencePool, {
    schema: intelligenceSchema,
    logger: process.env.NODE_ENV === 'development',
  });

  // Control plane (PC-B)
  state.controlPool = makePool('POSTGRES_URL_CONTROL');
  const cClient = await state.controlPool.connect();
  await cClient.query('SELECT 1');
  cClient.release();
  state.controlDb = drizzle(state.controlPool, {
    schema: controlSchema,
    logger: process.env.NODE_ENV === 'development',
  });

  const intelligenceHost =
    process.env.POSTGRES_URL_INTELLIGENCE || process.env.POSTGRES_URL || 'localhost';
  const controlHost = process.env.POSTGRES_URL_CONTROL || process.env.POSTGRES_URL || 'localhost';
  const singleNode = intelligenceHost === controlHost;

  logger.info('Drizzle planes initialized', {
    intelligence: intelligenceHost.replace(/:[^:@]*@/, ':***@'),
    control: controlHost.replace(/:[^:@]*@/, ':***@'),
    topology: singleNode ? 'single-node' : 'multi-machine',
  });

  return { intelligenceDb: state.intelligenceDb, controlDb: state.controlDb };
}

// ─────────────────────────────────────────────────────────────────────────────
// Getters — use after initializePlanes()
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Tenant transaction routing (Postgres RLS)
// ─────────────────────────────────────────────────────────────────────────────
//
// RLS policies read `current_setting('app.tenant_id')`. That GUC is only visible
// on the exact connection it was set on, so every query in a tenant-scoped
// request must run on ONE connection inside ONE transaction that set it. We bind
// that transaction into AsyncLocalStorage and make getIntelligenceDb() return it,
// so ALL existing repository code runs against the tenant connection with zero
// changes. Outside a tenant transaction, getIntelligenceDb() returns the pool as
// before.

interface TenantTxStore {
  intelligenceTx: IntelligenceDB;
}
const tenantTxStore = new AsyncLocalStorage<TenantTxStore>();

export function getIntelligenceDb(): IntelligenceDB {
  const tx = tenantTxStore.getStore()?.intelligenceTx;
  if (tx) return tx;
  const state = getPlaneState();
  if (!state.intelligenceDb)
    throw new Error('Intelligence plane not initialized. Call initializePlanes().');
  return state.intelligenceDb;
}

/**
 * Run `fn` with the intelligence plane bound to a single transaction that has
 * `app.tenant_id` set to `tenantId` (via set_config, parameterized — safe from
 * injection). Every getIntelligenceDb() call inside `fn`, at any await depth,
 * resolves to this transaction, so RLS sees the tenant. The transaction commits
 * when `fn` resolves and rolls back if it throws.
 *
 * Control-plane queries are unaffected (they carry no RLS today) and continue to
 * use the control pool.
 */
export async function runInTenantTransaction<T>(
  tenantId: string,
  fn: () => Promise<T>
): Promise<T> {
  const state = getPlaneState();
  if (!state.intelligenceDb)
    throw new Error('Intelligence plane not initialized. Call initializePlanes().');

  return state.intelligenceDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return tenantTxStore.run({ intelligenceTx: tx as unknown as IntelligenceDB }, fn);
  });
}

/** True when the current async context is inside a tenant transaction. */
export function hasTenantContext(): boolean {
  return tenantTxStore.getStore()?.intelligenceTx !== undefined;
}

export function getControlDb(): ControlDB {
  const state = getPlaneState();
  if (!state.controlDb) throw new Error('Control plane not initialized. Call initializePlanes().');
  return state.controlDb;
}

export async function closePlanes(): Promise<void> {
  const state = getPlaneState();
  await state.intelligencePool?.end();
  await state.controlPool?.end();
  state.intelligenceDb = state.controlDb = null;
  state.intelligencePool = state.controlPool = null;
  logger.info('Drizzle plane connections closed');
}

// ─────────────────────────────────────────────────────────────────────────────
// Health checks
// ─────────────────────────────────────────────────────────────────────────────

export async function checkPlanesHealth(): Promise<{
  intelligence: 'healthy' | 'unhealthy';
  control: 'healthy' | 'unhealthy';
}> {
  const check = async (pool: pg.Pool | null) => {
    try {
      if (!pool) return 'unhealthy' as const;
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      return 'healthy' as const;
    } catch {
      return 'unhealthy' as const;
    }
  };

  const state = getPlaneState();
  const [intelligence, control] = await Promise.all([
    check(state.intelligencePool),
    check(state.controlPool),
  ]);

  return { intelligence, control };
}

// ─────────────────────────────────────────────────────────────────────────────
// CrossPlaneGuard — application-level referential integrity
//
// Replaces DB-level FK constraints across plane boundaries.
// Use before any write that references an entity in the other plane.
//
// Example:
//   // Verify agent exists in intelligence plane before inserting operation in control
//   await CrossPlaneGuard.verifyRaw(getIntelligenceDb(), 'agents', agentId, 'agent');
//   await getControlDb().insert(operations).values({ agentId, userId, ... });
// ─────────────────────────────────────────────────────────────────────────────

function crossPlaneError(msg: string, extra: Record<string, unknown>): Error {
  return Object.assign(new Error(msg), extra);
}

export const CrossPlaneGuard = {
  /**
   * Verify a cross-plane entity exists via raw pool query.
   * Throws if the referenced entity is not found.
   *
   * @param pool  The pg.Pool belonging to the plane that owns the entity
   * @param table Unquoted table name (e.g. 'agents', 'users')
   * @param id    UUID to look up
   * @param entityName Human-readable entity label for error messages
   */
  async verify(pool: pg.Pool, table: string, id: string, entityName: string): Promise<void> {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM ${JSON.stringify(table)} WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      throw crossPlaneError(`Cross-plane reference not found: ${entityName}(${id})`, {
        code: 'CROSS_PLANE_FK_VIOLATION',
        entityName,
        id,
      });
    }
  },

  /**
   * Verify multiple cross-plane entities in a single round-trip.
   */
  async verifyMany(pool: pg.Pool, table: string, ids: string[], entityName: string): Promise<void> {
    if (ids.length === 0) return;
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM ${JSON.stringify(table)} WHERE id = ANY($1)`,
      [ids]
    );
    const found = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw crossPlaneError(
        `Cross-plane references not found: ${entityName}(${missing.join(', ')})`,
        { code: 'CROSS_PLANE_FK_VIOLATION', entityName, missing }
      );
    }
  },
} as const;

export function getIntelligencePool(): pg.Pool {
  const state = getPlaneState();
  if (!state.intelligencePool) throw new Error('Intelligence pool not initialized.');
  return state.intelligencePool;
}

export function getControlPool(): pg.Pool {
  const state = getPlaneState();
  if (!state.controlPool) throw new Error('Control pool not initialized.');
  return state.controlPool;
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export schemas for consumers
// ─────────────────────────────────────────────────────────────────────────────

export { intelligenceSchema, controlSchema };
export { eq, ne, gt, gte, lt, lte, and, or, not, isNull, isNotNull, inArray, notInArray, like, ilike, between, desc, asc, sql, count, sum, avg, max, min } from 'drizzle-orm';
