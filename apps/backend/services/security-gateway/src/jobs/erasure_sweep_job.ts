import { Queue, Worker, type Job } from 'bullmq';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { UserErasureService } from '@uaip/shared-services';
import { getControlDb } from '@uaip/shared-services/drizzle/clients';
import { erasureOutbox } from '@uaip/shared-services/drizzle/control';
import { eq, and, lt, sql } from '@uaip/shared-services/drizzle/clients';
import { getRedisTLSOptions } from '@uaip/infra';

const ERASURE_SWEEP_QUEUE = 'erasure-sweep';
const ERASURE_SWEEP_JOB = 'erasure:sweep:24h';

type SweepJobData = {
  batchSize: number;
};

function getRedisOptions() {
  return {
    host: config.redis?.host ?? 'localhost',
    port: config.redis?.port ?? 6379,
    password: config.redis?.password ?? undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
    ...getRedisTLSOptions(config.redis?.host),
  };
}

export class ErasureSweepJob {
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private readonly erasureService = new UserErasureService();

  async start(): Promise<void> {
    const connection = getRedisOptions();
    this.queue = new Queue(ERASURE_SWEEP_QUEUE, { connection });

    await this.queue.upsertJobScheduler(
      ERASURE_SWEEP_JOB,
      { every: 24 * 60 * 60 * 1000 },
      { name: ERASURE_SWEEP_JOB, data: { batchSize: 50 } satisfies SweepJobData },
    );

    this.worker = new Worker(
      ERASURE_SWEEP_QUEUE,
      async (job: Job) => this.runSweep(job),
      { connection, concurrency: 1 },
    );

    this.worker.on('failed', (job, err) => {
      logger.error('ErasureSweepJob: job failed', { jobId: job?.id, error: err.message });
    });

    logger.info('ErasureSweepJob started', { intervalMs: 24 * 60 * 60 * 1000 });
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    logger.info('ErasureSweepJob stopped');
  }

  private async runSweep(job: Job<SweepJobData>): Promise<void> {
    const batchSize = job.data?.batchSize ?? 50;
    const db = getControlDb();

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const rows = await db
      .select({ id: erasureOutbox.id, userId: erasureOutbox.userId })
      .from(erasureOutbox)
      .where(
        and(
          eq(erasureOutbox.status, 'completed'),
          lt(erasureOutbox.completedAt, cutoff),
          sql`completed_at > NOW() - INTERVAL '7 days'`,
        ),
      )
      .limit(batchSize);

    logger.info('ErasureSweepJob: sweep batch', { count: rows.length });

    for (const erasure of rows) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential per-erasure verification, ordering matters
        await this.erasureService.verifySweep(erasure.id, erasure.userId);
      } catch (err) {
        logger.error('ErasureSweepJob: verifySweep threw unexpectedly', {
          erasureId: erasure.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('ErasureSweepJob: sweep complete', { verified: rows.length });
  }
}
