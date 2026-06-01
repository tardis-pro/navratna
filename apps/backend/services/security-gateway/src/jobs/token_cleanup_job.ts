import { Queue, Worker, type Job } from 'bullmq';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { UserService } from '@uaip/shared-services';
import { getControlDb, lt } from '@uaip/shared-services/drizzle/clients';
import { passwordResetTokens } from '@uaip/shared-services/drizzle/control';

const QUEUE_NAME = 'token-cleanup';
const JOB_NAME = 'token:cleanup:daily';
const INTERVAL_MS = 24 * 60 * 60 * 1000;

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

export class TokenCleanupJob {
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
      async (_job: Job) => this.runCleanup(_job),
      { connection, concurrency: 1 },
    );

    this.worker.on('failed', (_job, err) => {
      logger.error('TokenCleanupJob: job failed', { jobId: _job?.id, error: err.message });
    });

    logger.info('TokenCleanupJob started', { intervalMs: INTERVAL_MS });
  }

  private async runCleanup(_job: Job): Promise<void> {
    const userService = UserService.getInstance();
    await userService.cleanupExpiredTokens();
    logger.info('TokenCleanupJob: refresh token cleanup complete');

    const db = getControlDb();
    const result = await db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, new Date()));

    const deletedCount = (result as { rowCount?: number | null }).rowCount ?? 0;

    logger.info('TokenCleanupJob: password reset token cleanup complete', { deletedCount });
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    logger.info('TokenCleanupJob stopped');
  }
}
