import Bull from 'bull';
import type { Job as BullJobInstance } from 'bull';
import type { Queue } from 'bull';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';
import * as fs from 'fs';

const DEFAULT_CRON_JOBS_PATH =
  '/Users/pronitdas/workspaces/bmad-navratna/openclaw-infra/config/cron-jobs.json';

export interface OpenClawCronJob {
  id: string;
  agentId?: string;
  sessionKey?: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: {
    kind: 'cron' | 'every';
    expr?: string;
    everyMs?: number;
    anchorMs?: number;
    tz?: string;
  };
  sessionTarget: 'isolated' | 'main';
  wakeMode: 'now';
  payload: {
    kind: 'agentTurn' | 'systemEvent';
    message?: string;
    text?: string;
    model?: string;
    timeoutSeconds?: number;
    thinking?: string;
  };
  delivery: {
    mode: 'none' | 'channel';
    channel?: string;
    to?: string;
    bestEffort?: boolean;
  };
  state: Record<string, unknown>;
  deleteAfterRun?: boolean;
}

export interface OpenClawCronJobsDoc {
  version: number;
  jobs: OpenClawCronJob[];
}

export interface MigratedCronJob {
  jobId: string;
  name: string;
  agentId: string;
  bullJobKey: string;
  schedule: string;
  enabled: boolean;
}

// Bull is CJS-only. Bull is the namespace/factory which at runtime has both
// the Queue constructor and instance methods. TypeScript sees `typeof Bull`
// as only the factory overloads — we cast `Bull as unknown as Queue` to
// access all Queue instance methods (add, getRepeatableJobs, on, close, etc.).
type BullJobType = BullJobInstance;

export class CronMigrationService {
  private queues = new Map<string, Queue>();
  private migratedJobs: MigratedCronJob[] = [];
  private cronJobsPath: string;

  constructor(cronJobsPath: string = DEFAULT_CRON_JOBS_PATH) {
    this.cronJobsPath = cronJobsPath;
  }

  async migrateAll(): Promise<MigratedCronJob[]> {
    logger.info('Starting OpenClaw cron job migration...');

    const doc = await this.loadCronJobsDoc();
    const jobs = doc.jobs;

    logger.info(`Found ${jobs.length} OpenClaw cron jobs to migrate`);

    for (const job of jobs) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        const migrated = await this.migrateJob(job);
        if (migrated) {
          this.migratedJobs.push(migrated);
        }
      } catch (error: any) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to migrate cron job ${job.id} (${job.name})`, { error: msg });
      }
    }

    logger.info(`Migration complete: ${this.migratedJobs.length}/${jobs.length} jobs migrated`, {
      jobs: this.migratedJobs.map((j) => ({ id: j.jobId, name: j.name })),
    });

    return this.migratedJobs;
  }

  async fireJob(jobId: string): Promise<BullJobType | null> {
    const migrated = this.migratedJobs.find((j) => j.jobId === jobId);
    if (!migrated) {
      logger.warn(`Cron job not found: ${jobId}`);
      return null;
    }

    const queue = this.queues.get(migrated.agentId);
    if (!queue) {
      logger.warn(`Queue not found for agent: ${migrated.agentId}`);
      return null;
    }

    const job = await queue.add(
      migrated.name,
      {
        kind: 'manual_trigger',
        jobId: migrated.jobId,
        firedAt: new Date().toISOString(),
      },
      {
        removeOnComplete: true,
        removeOnFail: 100,
      }
    );

    logger.info(`Manually fired cron job: ${migrated.name}`, { jobId: job.id });
    return job as BullJobType;
  }

  async disableJob(jobId: string): Promise<boolean> {
    const migrated = this.migratedJobs.find((j) => j.jobId === jobId);
    if (!migrated) {
      return false;
    }

    const queue = this.queues.get(migrated.agentId);
    if (!queue) {
      return false;
    }

    try {
      const repeatableJobs = await queue.getRepeatableJobs();
      const bullJob = repeatableJobs.find((j) => j.name === migrated.name);
      if (bullJob) {
        await queue.removeRepeatableByKey(bullJob.key);
        migrated.enabled = false;
        logger.info(`Disabled cron job: ${migrated.name}`);
        return true;
      }
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to disable cron job: ${migrated.name}`, { error: msg });
    }

    return false;
  }

  getMigratedJobs(): MigratedCronJob[] {
    return [...this.migratedJobs];
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down cron migration service...');
    for (const [agentId, queue] of this.queues) {
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      await queue.close();
      logger.debug(`Closed queue for agent: ${agentId}`);
    }
    this.queues.clear();
    this.migratedJobs = [];
  }

  private async loadCronJobsDoc(): Promise<OpenClawCronJobsDoc> {
    const raw = await fs.promises.readFile(this.cronJobsPath, 'utf-8');
    return JSON.parse(raw) as OpenClawCronJobsDoc;
  }

  private getRedisConfig() {
    return {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      db: config.redis.db ?? 0,
    };
  }

  private getOrCreateQueue(agentId: string): Queue {
    const existing = this.queues.get(agentId);
    if (existing) {
      return existing;
    }

    // Bull is CJS-only; use cast to access all Queue instance methods at runtime.
    const queue = new (Bull as unknown as { new (name: string, opts?: object): Queue })(
      `openclaw-cron-${agentId}`,
      {
        redis: this.getRedisConfig(),
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: 100,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      }
    );

    queue.on('error', (error: Error) => {
      logger.error(`Queue error for agent ${agentId}:`, { error: error.message });
    });

    queue.on('failed', (job: BullJobType, error: Error) => {
      logger.error(`Job ${job.id} failed for agent ${agentId}:`, { error: error.message });
    });

    this.queues.set(agentId, queue);
    logger.debug(`Created Bull queue for agent: ${agentId}`);

    return queue;
  }

  private async migrateJob(job: OpenClawCronJob): Promise<MigratedCronJob | null> {
    if (!job.enabled) {
      logger.debug(`Skipping disabled job: ${job.name} (${job.id})`);
      return null;
    }

    const agentId = job.agentId ?? 'main';
    const queue = this.getOrCreateQueue(agentId);

    const jobData = {
      openClawJobId: job.id,
      agentId,
      sessionKey: job.sessionKey,
      sessionTarget: job.sessionTarget,
      payload: job.payload,
      delivery: job.delivery,
      deleteAfterRun: job.deleteAfterRun ?? false,
    };

    const repeatOptions = this.buildRepeatOptions(job);
    const bullJobKey = `openclaw:${job.id}`;

    const bullJob = await queue.add(job.name, jobData, {
      ...repeatOptions,
      jobId: bullJobKey,
    });

    logger.info(`Migrated cron job: ${job.name} → ${agentId}`, {
      openClawId: job.id,
      bullJobId: bullJob.id,
      schedule:
        job.schedule.kind === 'cron' ? job.schedule.expr : `every ${job.schedule.everyMs}ms`,
    });

    return {
      jobId: job.id,
      name: job.name,
      agentId,
      bullJobKey,
      schedule:
        job.schedule.kind === 'cron' ? (job.schedule.expr ?? '') : `every:${job.schedule.everyMs}`,
      enabled: job.enabled,
    };
  }

  private buildRepeatOptions(job: OpenClawCronJob): Record<string, unknown> {
    const { schedule } = job;

    if (schedule.kind === 'cron' && schedule.expr) {
      return {
        repeat: {
          cron: schedule.expr,
          tz: schedule.tz ?? 'Asia/Kolkata',
        },
      };
    }

    if (schedule.kind === 'every' && schedule.everyMs) {
      const everySeconds = Math.max(1, Math.round(schedule.everyMs / 1000));
      return {
        repeat: {
          every: everySeconds * 1000,
        },
      };
    }

    logger.warn(`No valid schedule for job ${job.id}, treating as one-time job`);
    return {};
  }
}

let migrationServiceInstance: CronMigrationService | null = null;

export function getCronMigrationService(): CronMigrationService {
  if (!migrationServiceInstance) {
    migrationServiceInstance = new CronMigrationService();
  }
  return migrationServiceInstance;
}
