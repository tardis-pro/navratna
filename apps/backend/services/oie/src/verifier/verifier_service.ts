import { Queue, Worker, type Job } from 'bullmq';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import type { RootCauseAnalysis } from '../analyst/analyst_agent.js';
import type { OutcomeResult } from '../types/learner.js';

const OIE_ANALYSIS_TOPIC = 'oie.analysis.completed';
const OIE_VERIFICATION_TOPIC = 'oie.verification.completed';

export interface VerificationResult {
  incidentId: string;
  outcome: OutcomeResult;
  errorRateBefore?: number;
  errorRateAfter?: number;
  latencyBefore?: number;
  latencyAfter?: number;
  verifiedAt: Date;
}

function getRedisOptions() {
  return {
    host: config.redis?.host ?? 'localhost',
    port: config.redis?.port ?? 6379,
    password: config.redis?.password ?? undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

export class VerifierService {
  private inputWorker: Worker | null = null;
  private outputQueue: Queue | null = null;

  async start(): Promise<void> {
    const connection = getRedisOptions();
    this.outputQueue = new Queue(OIE_VERIFICATION_TOPIC, { connection });

    this.inputWorker = new Worker(
      OIE_ANALYSIS_TOPIC,
      async (job: Job) => this.scheduleVerification(job),
      { connection, concurrency: 2 },
    );

    this.inputWorker.on('failed', (job, err) => {
      logger.error('VerifierService: job failed', { jobId: job?.id, error: err.message });
    });

    logger.info('VerifierService started');
  }

  private async scheduleVerification(job: Job): Promise<void> {
    const analysis = job.data as RootCauseAnalysis;
    logger.info('VerifierService: scheduling 7-day verification window', { incidentId: analysis.incidentId });
  }

  async stop(): Promise<void> {
    await this.inputWorker?.close();
    await this.outputQueue?.close();
    logger.info('VerifierService stopped');
  }
}
