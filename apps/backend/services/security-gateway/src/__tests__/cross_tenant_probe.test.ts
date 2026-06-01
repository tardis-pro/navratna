import { describe, it, expect, vi } from 'vitest';
import { AuditEventType, SecurityLevel } from '@uaip/types';
import { CrossTenantProbeJob, CrossTenantViolationError } from '../jobs/cross_tenant_probe_job.js';
import type { CrossTenantProbeDeps } from '../jobs/cross_tenant_probe_job.js';

function makePgMock(leakCount: number = 0) {
  return {
    execute: vi.fn().mockResolvedValue({ rows: [{ leak_count: leakCount }] }) as (
      rawSql: string,
      params?: unknown[],
    ) => Promise<{ rows: Array<Record<string, unknown>> }>,
  };
}

function makeQdrantMock(leakCount: number = 0) {
  return {
    upsert: vi.fn().mockResolvedValue(undefined),
    scrollAllQdrantPoints: vi.fn().mockResolvedValue(
      leakCount > 0
        ? Array.from({ length: leakCount }, (_, i) => ({
            id: `point-${i}`,
            vector: [],
            payload: { probe_marker: true, content: 'probe-isolation-marker' },
          }))
        : [],
    ),
    deletePoints: vi.fn().mockResolvedValue(undefined),
  };
}

function makeNeo4jMock(leakCount: number = 0) {
  return {
    runQuery: vi.fn().mockImplementation((cypher: string) => {
      if (/MERGE|CREATE|DELETE|DETACH/i.test(cypher)) {
        return Promise.resolve({ records: [] });
      }
      return Promise.resolve({
        records: [
          {
            get: (key: string) => {
              if (key === 'leakCount') return { toNumber: () => leakCount, low: leakCount };
              return null;
            },
          },
        ],
      });
    }),
    isConnected: true,
  };
}

function makeAuditMock() {
  return {
    logSecurityEvent: vi.fn().mockResolvedValue({}),
  };
}

function makeQueueMock() {
  return {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeWorkerMock() {
  return {
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

vi.mock('bullmq', () => {
  return {
    Queue: vi.fn().mockImplementation(function (this: unknown) { return makeQueueMock(); }),
    Worker: vi.fn().mockImplementation(function (this: unknown) { return makeWorkerMock(); }),
  };
});

function makeDeps(overrides: Partial<CrossTenantProbeDeps> = {}): CrossTenantProbeDeps {
  return {
    pgClient: makePgMock() as CrossTenantProbeDeps['pgClient'],
    qdrantService: makeQdrantMock() as unknown as CrossTenantProbeDeps['qdrantService'],
    neo4jService: makeNeo4jMock() as unknown as CrossTenantProbeDeps['neo4jService'],
    auditService: makeAuditMock() as unknown as CrossTenantProbeDeps['auditService'],
    redisConnection: { host: 'localhost', port: 6379, maxRetriesPerRequest: null, enableReadyCheck: false },
    ...overrides,
  };
}

describe('T1: no leaks — all stores clean', () => {
  it('resolves without throwing when all stores return 0 rows', async () => {
    const deps = makeDeps();
    const job = new CrossTenantProbeJob(deps);
    await expect(job.runProbe()).resolves.toBeUndefined();
  });
});

describe('T2: PG leak detected', () => {
  it('throws CrossTenantViolationError with store=pg when PG returns >0 rows', async () => {
    const deps = makeDeps({
      pgClient: makePgMock(1) as CrossTenantProbeDeps['pgClient'],
    });
    const job = new CrossTenantProbeJob(deps);

    await expect(job.runProbe()).rejects.toThrow(CrossTenantViolationError);

    try {
      await job.runProbe();
    } catch (err) {
      expect(err).toBeInstanceOf(CrossTenantViolationError);
      const violation = err as CrossTenantViolationError;
      expect(violation.store).toBe('pg');
      expect(violation.leakCount).toBeGreaterThan(0);
    }
  });
});

describe('T3: Qdrant leak detected', () => {
  it('throws CrossTenantViolationError with store=qdrant when Qdrant returns >0 points', async () => {
    const deps = makeDeps({
      qdrantService: makeQdrantMock(2) as unknown as CrossTenantProbeDeps['qdrantService'],
    });
    const job = new CrossTenantProbeJob(deps);

    await expect(job.runProbe()).rejects.toThrow(CrossTenantViolationError);

    try {
      await job.runProbe();
    } catch (err) {
      expect(err).toBeInstanceOf(CrossTenantViolationError);
      const violation = err as CrossTenantViolationError;
      expect(violation.store).toBe('qdrant');
      expect(violation.leakCount).toBeGreaterThan(0);
    }
  });
});

describe('T4: Neo4j leak detected', () => {
  it('throws CrossTenantViolationError with store=neo4j when Neo4j returns >0 nodes', async () => {
    const deps = makeDeps({
      neo4jService: makeNeo4jMock(3) as unknown as CrossTenantProbeDeps['neo4jService'],
    });
    const job = new CrossTenantProbeJob(deps);

    await expect(job.runProbe()).rejects.toThrow(CrossTenantViolationError);

    try {
      await job.runProbe();
    } catch (err) {
      expect(err).toBeInstanceOf(CrossTenantViolationError);
      const violation = err as CrossTenantViolationError;
      expect(violation.store).toBe('neo4j');
      expect(violation.leakCount).toBeGreaterThan(0);
    }
  });
});

describe('T5: cleanup in finally block', () => {
  it('calls qdrant deletePoints even when probe throws', async () => {
    const qdrantMock = makeQdrantMock(1);
    const deps = makeDeps({
      qdrantService: qdrantMock as unknown as CrossTenantProbeDeps['qdrantService'],
    });
    const job = new CrossTenantProbeJob(deps);

    await expect(job.runProbe()).rejects.toThrow(CrossTenantViolationError);

    expect(qdrantMock.deletePoints).toHaveBeenCalled();
  });

  it('calls PG delete even when probe throws PG violation', async () => {
    const pgMock = makePgMock(1);
    const deps = makeDeps({
      pgClient: pgMock as CrossTenantProbeDeps['pgClient'],
    });
    const job = new CrossTenantProbeJob(deps);

    await expect(job.runProbe()).rejects.toThrow(CrossTenantViolationError);

    expect(pgMock.execute.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('T6: audit log on violation', () => {
  it('calls auditService.logSecurityEvent with CRITICAL severity on PG leak', async () => {
    const auditMock = makeAuditMock();
    const deps = makeDeps({
      pgClient: makePgMock(1) as CrossTenantProbeDeps['pgClient'],
      auditService: auditMock as unknown as CrossTenantProbeDeps['auditService'],
    });
    const job = new CrossTenantProbeJob(deps);

    await expect(job.runProbe()).rejects.toThrow(CrossTenantViolationError);

    expect(auditMock.logSecurityEvent).toHaveBeenCalledTimes(1);
    expect(auditMock.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.CROSS_TENANT_VIOLATION,
        riskLevel: SecurityLevel.CRITICAL,
      }),
    );
  });
});

describe('T7: initialize wires 6h BullMQ scheduler', () => {
  it('calls upsertJobScheduler with 6h interval', async () => {
    const capturedQueue = makeQueueMock();

    const { Queue } = await import('bullmq');
    vi.mocked(Queue).mockImplementation(function (this: unknown) {
      return capturedQueue;
    } as unknown as typeof Queue);

    const deps = makeDeps();
    const job = new CrossTenantProbeJob(deps);
    await job.initialize();

    expect(capturedQueue.upsertJobScheduler).toHaveBeenCalledTimes(1);

    const [, scheduleOptions] = capturedQueue.upsertJobScheduler.mock.calls[0] as [string, { every: number }];
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    expect(scheduleOptions.every).toBe(SIX_HOURS_MS);

    await job.stop();
  });
});
