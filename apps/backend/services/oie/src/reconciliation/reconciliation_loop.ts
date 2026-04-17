import { Queue, Worker, type Job } from 'bullmq';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import type { SLOConfig, DriftVector } from '../types/learner.js';
import type { ObservabilityAdapter } from '../types/observability_adapter.js';

const RECONCILIATION_QUEUE = 'oie-reconciliation';
const RECONCILIATION_JOB = 'oie:reconcile';
const OIE_RECONCILIATION_TOPIC = 'oie.reconciliation.report';
const RECONCILE_INTERVAL_MS = 5 * 60_000;

const DEFAULT_SLO: Omit<SLOConfig, 'projectId' | 'updatedAt'> = {
  targetErrorRatePct: 0.1,
  targetP99LatencyMs: 500,
  maxDlqAgeHours: 24,
  maxCriticalUnresolved: 0,
};

function getRedisOptions() {
  return {
    host: config.redis?.host ?? 'localhost',
    port: config.redis?.port ?? 6379,
    password: config.redis?.password ?? undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

export class ReconciliationLoop {
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private reportQueue: Queue | null = null;
  private adapters: ObservabilityAdapter[] = [];
  private sloConfigs = new Map<string, SLOConfig>();

  registerAdapter(adapter: ObservabilityAdapter): void {
    this.adapters.push(adapter);
  }

  setSLO(projectId: string, slo: Partial<Omit<SLOConfig, 'projectId' | 'updatedAt'>>): void {
    this.sloConfigs.set(projectId, {
      projectId,
      ...DEFAULT_SLO,
      ...slo,
      updatedAt: new Date(),
    });
  }

  async start(): Promise<void> {
    const connection = getRedisOptions();
    this.queue = new Queue(RECONCILIATION_QUEUE, { connection });
    this.reportQueue = new Queue(OIE_RECONCILIATION_TOPIC, { connection });

    await this.queue.upsertJobScheduler(
      RECONCILIATION_JOB,
      { every: RECONCILE_INTERVAL_MS },
      { name: RECONCILIATION_JOB, data: {} },
    );

    this.worker = new Worker(
      RECONCILIATION_QUEUE,
      async (job: Job) => this.reconcile(job),
      { connection, concurrency: 1 },
    );

    this.worker.on('failed', (job, err) => {
      logger.error('ReconciliationLoop: job failed', { jobId: job?.id, error: err.message });
    });

    logger.info('ReconciliationLoop started', { intervalMs: RECONCILE_INTERVAL_MS });
  }

  private async reconcile(_job: Job): Promise<void> {
    const drifts: DriftVector[] = [];

    for (const [projectId, slo] of this.sloConfigs) {
      const drift = await this.computeDrift(projectId, slo);
      if (drift.overallDriftScore > 0) {
        drifts.push(drift);
        logger.warn('ReconciliationLoop: SLO drift detected', {
          projectId,
          driftScore: drift.overallDriftScore,
          unresolvedCritical: drift.unresolvedCriticalCount,
        });
      }
    }

    if (drifts.length > 0) {
      await this.reportQueue?.add('oie.reconciliation', { drifts, timestamp: new Date() });
    }

    logger.info('ReconciliationLoop: cycle complete', { projects: this.sloConfigs.size, drifted: drifts.length });
  }

  private async computeDrift(projectId: string, slo: SLOConfig): Promise<DriftVector> {
    let unresolvedCritical = 0;
    const since = new Date(Date.now() - 5 * 60_000);

    for (const adapter of this.adapters) {
      try {
        const incidents = await adapter.getIncidents(since);
        unresolvedCritical += incidents.filter((i) => i.severity === 'critical' && !i.resolved).length;
      } catch (err) {
        logger.warn('ReconciliationLoop: adapter query failed', { adapterId: adapter.id, error: err instanceof Error ? err.message : err });
      }
    }

    const criticalDrift = Math.max(0, unresolvedCritical - slo.maxCriticalUnresolved);
    const overallDriftScore = criticalDrift;

    return {
      projectId,
      errorRateDrift: 0,
      latencyDrift: 0,
      dlqDepthDrift: 0,
      unresolvedCriticalCount: unresolvedCritical,
      overallDriftScore,
      detectedAt: new Date(),
    };
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.reportQueue?.close();
    logger.info('ReconciliationLoop stopped');
  }
}
