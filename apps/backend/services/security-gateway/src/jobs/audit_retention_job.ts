import { Queue, Worker, type Job } from 'bullmq';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { getControlDb, sql } from '@uaip/shared-services/drizzle/clients';

const QUEUE_NAME = 'audit-retention';
const JOB_NAME = 'audit:retention:daily';
const INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;

type RedisConnection = {
  host: string;
  port: number;
  password: string | undefined;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
};

function getConnection(): RedisConnection {
  return {
    host: config.redis?.host ?? 'localhost',
    port: config.redis?.port ?? 6379,
    password: config.redis?.password ?? undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

export class AuditRetentionJob {
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  async start(): Promise<void> {
    const connection = getConnection();

    this.queue = new Queue(QUEUE_NAME, { connection });

    await this.queue.upsertJobScheduler(
      JOB_NAME,
      { every: INTERVAL_MS },
      { name: JOB_NAME, data: {} },
    );

    this.worker = new Worker(
      QUEUE_NAME,
      async (_job: Job) => this.runRetention(_job),
      { connection, concurrency: 1 },
    );

    this.worker.on('failed', (_job, err) => {
      logger.error('AuditRetentionJob: job failed', { jobId: _job?.id, error: err.message });
    });

    logger.info('AuditRetentionJob started', { retentionDays: RETENTION_DAYS, intervalMs: INTERVAL_MS });
  }

  private async runRetention(_job: Job): Promise<void> {
    const db = getControlDb();

    const result = await db.execute(
      sql`DELETE FROM audit_events
          WHERE created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION_DAYS))} days'
          AND event_type NOT IN ('user_deleted', 'erasure_initiated', 'erasure_completed')`,
    );

    const deletedCount = (result as { rowCount?: number | null }).rowCount ?? 0;

    logger.info('AuditRetentionJob: retention complete', {
      deletedCount,
      retentionDays: RETENTION_DAYS,
    });
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    logger.info('AuditRetentionJob stopped');
  }
}
