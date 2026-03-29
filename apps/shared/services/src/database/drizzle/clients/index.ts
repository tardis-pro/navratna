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
import pg from 'pg';
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
        process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production'
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

let _intelligenceDb: IntelligenceDB | null = null;
let _controlDb: ControlDB | null = null;
let _intelligencePool: pg.Pool | null = null;
let _controlPool: pg.Pool | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Initializer — call once at service startup
// ─────────────────────────────────────────────────────────────────────────────

export async function initializePlanes(): Promise<{
  intelligenceDb: IntelligenceDB;
  controlDb: ControlDB;
}> {
  if (_intelligenceDb && _controlDb) {
    return { intelligenceDb: _intelligenceDb, controlDb: _controlDb };
  }

  // Intelligence plane (PC-A)
  _intelligencePool = makePool('POSTGRES_URL_INTELLIGENCE');
  const iClient = await _intelligencePool.connect();
  await iClient.query('SELECT 1');
  iClient.release();
  _intelligenceDb = drizzle(_intelligencePool, {
    schema: intelligenceSchema,
    logger: process.env.NODE_ENV === 'development',
  });

  // Control plane (PC-B)
  _controlPool = makePool('POSTGRES_URL_CONTROL');
  const cClient = await _controlPool.connect();
  await cClient.query('SELECT 1');
  cClient.release();
  _controlDb = drizzle(_controlPool, {
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

  return { intelligenceDb: _intelligenceDb, controlDb: _controlDb };
}

// ─────────────────────────────────────────────────────────────────────────────
// Getters — use after initializePlanes()
// ─────────────────────────────────────────────────────────────────────────────

export function getIntelligenceDb(): IntelligenceDB {
  if (!_intelligenceDb)
    throw new Error('Intelligence plane not initialized. Call initializePlanes().');
  return _intelligenceDb;
}

export function getControlDb(): ControlDB {
  if (!_controlDb) throw new Error('Control plane not initialized. Call initializePlanes().');
  return _controlDb;
}

export async function closePlanes(): Promise<void> {
  await _intelligencePool?.end();
  await _controlPool?.end();
  _intelligenceDb = _controlDb = null;
  _intelligencePool = _controlPool = null;
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

  const [intelligence, control] = await Promise.all([
    check(_intelligencePool),
    check(_controlPool),
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
  if (!_intelligencePool) throw new Error('Intelligence pool not initialized.');
  return _intelligencePool;
}

export function getControlPool(): pg.Pool {
  if (!_controlPool) throw new Error('Control pool not initialized.');
  return _controlPool;
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export schemas for consumers
// ─────────────────────────────────────────────────────────────────────────────

export { intelligenceSchema, controlSchema };
export { eq, ne, gt, gte, lt, lte, and, or, not, isNull, isNotNull, inArray, notInArray, like, ilike, between, desc, asc, sql, count, sum, avg, max, min } from 'drizzle-orm';
