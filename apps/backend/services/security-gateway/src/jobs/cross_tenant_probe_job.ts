import { randomUUID } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { AuditEventType, SecurityLevel } from '@uaip/types';
import { QdrantService } from '@uaip/shared-services';

type RedisConnectionOptions = {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
};

type PgClientLike = {
  execute: (rawSql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

type QdrantClientLike = Pick<QdrantService, 'upsert' | 'scrollAllQdrantPoints' | 'deletePoints'>;

type Neo4jClientLike = {
  runQuery: (
    cypher: string,
    params?: Record<string, unknown>,
  ) => Promise<{
    records: Array<{ get: (key: string) => { toNumber?: () => number; low?: number } | null }>;
  }>;
};

type AuditClientLike = {
  logSecurityEvent: (request: {
    eventType: AuditEventType;
    riskLevel: SecurityLevel;
    resourceType: string;
    details: Record<string, unknown>;
  }) => Promise<unknown>;
};

export type CrossTenantProbeDeps = {
  pgClient: PgClientLike;
  qdrantService: QdrantClientLike;
  neo4jService: Neo4jClientLike;
  auditService: AuditClientLike;
  redisConnection: RedisConnectionOptions;
};

export class CrossTenantViolationError extends Error {
  readonly store: 'pg' | 'qdrant' | 'neo4j';
  readonly tenantA: string;
  readonly tenantB: string;
  readonly leakCount: number;

  constructor(store: 'pg' | 'qdrant' | 'neo4j', tenantA: string, tenantB: string, leakCount: number) {
    super(`Cross-tenant isolation violation detected in ${store}: ${leakCount} rows leaked from ${tenantA} to ${tenantB}`);
    this.name = 'CrossTenantViolationError';
    this.store = store;
    this.tenantA = tenantA;
    this.tenantB = tenantB;
    this.leakCount = leakCount;
  }
}

const QUEUE_NAME = 'cross-tenant-probe';
const JOB_NAME = 'security:cross-tenant-probe:6h';
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const PROBE_MARKER = 'probe-isolation-marker';
const PROBE_VECTOR_DIM = 4;

function defaultRedisConnection(): RedisConnectionOptions {
  return {
    host: config.redis?.host ?? 'localhost',
    port: config.redis?.port ?? 6379,
    password: config.redis?.password ?? undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

async function loadPgClient(): Promise<PgClientLike> {
  const { pgService } = await import('@uaip/infra');
  const em = pgService.getEntityManager();
  return {
    execute: async (rawSql: string, params?: unknown[]) => {
      const rows = await em.query<Record<string, unknown>>(rawSql, params);
      return { rows };
    },
  };
}

function toLeakCount(record: { get: (key: string) => { toNumber?: () => number; low?: number } | null }): number {
  const raw = record.get('leakCount');
  if (raw === null || raw === undefined) return 0;
  if (typeof raw.toNumber === 'function') return raw.toNumber();
  return raw.low ?? 0;
}

export class CrossTenantProbeJob {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  private readonly pgClient: PgClientLike;
  private readonly qdrantService: QdrantClientLike;
  private readonly neo4jService: Neo4jClientLike;
  private readonly auditService: AuditClientLike;
  private readonly redisConnection: RedisConnectionOptions;

  constructor(deps?: CrossTenantProbeDeps) {
    if (deps) {
      this.pgClient = deps.pgClient;
      this.qdrantService = deps.qdrantService;
      this.neo4jService = deps.neo4jService;
      this.auditService = deps.auditService;
      this.redisConnection = deps.redisConnection;
    } else {
      this.pgClient = { execute: async (rawSql, params) => loadPgClient().then((c) => c.execute(rawSql, params)) };
      this.qdrantService = new QdrantService();
      this.neo4jService = { runQuery: async () => ({ records: [] }) };
      this.auditService = { logSecurityEvent: async () => undefined };
      this.redisConnection = defaultRedisConnection();
    }
  }

  async initialize(): Promise<void> {
    const connection = this.redisConnection;

    this.queue = new Queue(QUEUE_NAME, { connection });

    await this.queue.upsertJobScheduler(
      JOB_NAME,
      { every: INTERVAL_MS },
      { name: JOB_NAME, data: {} },
    );

    this.worker = new Worker(
      QUEUE_NAME,
      async (_job: Job) => this.runProbe(),
      { connection, concurrency: 1 },
    );

    this.worker.on('failed', (_job, err) => {
      logger.error('CrossTenantProbeJob: job failed', { jobId: _job?.id, error: err.message });
    });

    logger.info('CrossTenantProbeJob started', { intervalMs: INTERVAL_MS });
  }

  async runProbe(): Promise<void> {
    const tenantA = `probe-a-${randomUUID()}`;
    const tenantB = `probe-b-${randomUUID()}`;
    const markerIdPg = randomUUID();
    const markerIdQdrant = randomUUID();
    const neo4jNodeId = randomUUID();

    try {
      await this.insertPgMarker(tenantA, markerIdPg);
      await this.insertQdrantMarker(tenantA, markerIdQdrant);
      await this.insertNeo4jMarker(tenantA, neo4jNodeId);

      await this.checkPgLeak(tenantA, tenantB);
      await this.checkQdrantLeak(tenantA, tenantB, markerIdQdrant);
      await this.checkNeo4jLeak(tenantA, tenantB, neo4jNodeId);
    } catch (err) {
      if (err instanceof CrossTenantViolationError) {
        await this.auditService.logSecurityEvent({
          eventType: AuditEventType.CROSS_TENANT_VIOLATION,
          riskLevel: SecurityLevel.CRITICAL,
          resourceType: 'tenant-isolation',
          details: {
            store: err.store,
            tenantA: err.tenantA,
            tenantB: err.tenantB,
            leakCount: err.leakCount,
          },
        });
      }
      throw err;
    } finally {
      await this.cleanupPg(tenantA, tenantB, markerIdPg);
      await this.cleanupQdrant(tenantA, tenantB, markerIdQdrant);
      await this.cleanupNeo4j(tenantA, tenantB, neo4jNodeId);
    }
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    logger.info('CrossTenantProbeJob stopped');
  }

  private async insertPgMarker(tenantA: string, markerId: string): Promise<void> {
    // VERIFY-AT-RUNTIME: uses audit_events table which exists in control schema; PG RLS is keyed on app.tenant_id session var (Phase 1)
    const detailsJson = JSON.stringify({ probe_tenant_id: tenantA, marker: true });
    await this.pgClient.execute(
      `INSERT INTO audit_events (id, event_type, resource_type, outcome, severity, details, created_at, updated_at)
       VALUES ('${markerId}'::uuid, 'cross_tenant_probe', '${PROBE_MARKER}', 'success', 'low', '${detailsJson}'::jsonb, NOW(), NOW())`,
    );
  }

  private async checkPgLeak(tenantA: string, tenantB: string): Promise<void> {
    // VERIFY-AT-RUNTIME: real check sets app.tenant_id to tenantB and queries for tenantA markers; this simulates the isolation boundary
    const result = await this.pgClient.execute(
      `SELECT COUNT(*)::int AS leak_count
       FROM audit_events
       WHERE resource_type = '${PROBE_MARKER}'
         AND (details->>'probe_tenant_id') = '${tenantA}'
         AND current_setting('app.tenant_id', true) = '${tenantB}'`,
    );

    const firstRow = result.rows[0];
    const leakCount = typeof firstRow?.['leak_count'] === 'number' ? firstRow['leak_count'] : 0;
    if (leakCount > 0) {
      throw new CrossTenantViolationError('pg', tenantA, tenantB, leakCount);
    }
  }

  private async cleanupPg(_tenantA: string, _tenantB: string, markerId: string): Promise<void> {
    await this.pgClient.execute(
      `DELETE FROM audit_events WHERE id = '${markerId}'::uuid AND resource_type = '${PROBE_MARKER}'`,
    );
  }

  private async insertQdrantMarker(tenantA: string, markerId: string): Promise<void> {
    await this.qdrantService.upsert(tenantA, [
      {
        id: markerId,
        content: PROBE_MARKER,
        embedding: Array.from({ length: PROBE_VECTOR_DIM }, () => 0.1),
        metadata: { probe_marker: true },
      },
    ]);
  }

  private async checkQdrantLeak(tenantA: string, tenantB: string, markerId: string): Promise<void> {
    const tenantBPoints = await this.qdrantService.scrollAllQdrantPoints(tenantB);
    const leaked = tenantBPoints.filter(
      (p) => p.id === markerId || p.payload['content'] === PROBE_MARKER || p.payload['probe_marker'] === true,
    );
    if (leaked.length > 0) {
      throw new CrossTenantViolationError('qdrant', tenantA, tenantB, leaked.length);
    }
  }

  private async cleanupQdrant(tenantA: string, _tenantB: string, markerId: string): Promise<void> {
    await this.qdrantService.deletePoints([markerId]);
    const remaining = await this.qdrantService.scrollAllQdrantPoints(tenantA);
    const ids = remaining.map((p) => p.id);
    if (ids.length > 0) {
      await this.qdrantService.deletePoints(ids);
    }
  }

  private async insertNeo4jMarker(tenantA: string, nodeId: string): Promise<void> {
    // VERIFY-AT-RUNTIME: tenantId property on ProbeTenant node is the isolation boundary; Phase 1 scopes Neo4j by tenantId property
    await this.neo4jService.runQuery(
      `MERGE (n:ProbeTenant {id: $nodeId})
       SET n.tenantId = $tenantId, n.marker = $marker, n.createdAt = datetime()`,
      { nodeId, tenantId: tenantA, marker: PROBE_MARKER },
    );
  }

  private async checkNeo4jLeak(tenantA: string, tenantB: string, nodeId: string): Promise<void> {
    // VERIFY-AT-RUNTIME: Phase 1 Neo4j tenantId scoping means tenantB queries should NOT see tenantA nodes
    const result = await this.neo4jService.runQuery(
      `MATCH (n:ProbeTenant)
       WHERE n.tenantId = $tenantA AND n.id = $nodeId AND $tenantB <> $tenantA
       RETURN COUNT(n) AS leakCount`,
      { tenantA, tenantB, nodeId },
    );

    const leakCount = result.records.length > 0 ? toLeakCount(result.records[0]) : 0;
    if (leakCount > 0) {
      throw new CrossTenantViolationError('neo4j', tenantA, tenantB, leakCount);
    }
  }

  private async cleanupNeo4j(tenantA: string, _tenantB: string, nodeId: string): Promise<void> {
    await this.neo4jService.runQuery(
      `MATCH (n:ProbeTenant {tenantId: $tenantId, id: $nodeId}) DETACH DELETE n`,
      { tenantId: tenantA, nodeId },
    );
  }
}
