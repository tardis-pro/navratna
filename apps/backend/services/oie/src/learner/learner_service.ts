import { Queue, Worker, type Job } from 'bullmq';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import type { VerificationResult } from '../verifier/verifier_service.js';
import type { IncidentOutcome } from '../types/learner.js';

const OIE_VERIFICATION_TOPIC = 'oie.verification.completed';

function getRedisOptions() {
  return {
    host: config.redis?.host ?? 'localhost',
    port: config.redis?.port ?? 6379,
    password: config.redis?.password ?? undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

export class LearnerService {
  private inputWorker: Worker | null = null;

  async start(): Promise<void> {
    const connection = getRedisOptions();

    this.inputWorker = new Worker(
      OIE_VERIFICATION_TOPIC,
      async (job: Job) => this.storeOutcome(job),
      { connection, concurrency: 2 },
    );

    this.inputWorker.on('failed', (job, err) => {
      logger.error('LearnerService: job failed', { jobId: job?.id, error: err.message });
    });

    logger.info('LearnerService started');
  }

  private async storeOutcome(job: Job): Promise<void> {
    const result = job.data as VerificationResult;

    const outcome: IncidentOutcome = {
      incidentId: result.incidentId,
      errorCode: '',
      service: '',
      rootCauseSummary: '',
      outcome: result.outcome,
      latencyDeltaMs: result.latencyAfter != null && result.latencyBefore != null
        ? result.latencyAfter - result.latencyBefore
        : undefined,
      errorRateDelta: result.errorRateAfter != null && result.errorRateBefore != null
        ? result.errorRateAfter - result.errorRateBefore
        : undefined,
      projectId: '',
      createdAt: result.verifiedAt,
    };

    logger.info('LearnerService: storing outcome', {
      incidentId: outcome.incidentId,
      outcome: outcome.outcome,
    });
  }

  async stop(): Promise<void> {
    await this.inputWorker?.close();
    logger.info('LearnerService stopped');
  }
}
