import { Queue, Worker, type Job } from 'bullmq';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { getRedisTLSOptions } from '@uaip/infra';
import type { RedisOptions } from 'ioredis';
import { KnowledgeRepository } from '../database/repositories/knowledge_repository';

const QUEUE_NAME = 'knowledge-summary-enrichment';
const JOB_NAME = 'knowledge:summary:enrich';

export type SummaryEnrichmentPayload = {
  itemId: string;
  content: string;
};

export type SummarizeFn = (content: string) => Promise<string>;

type RedisConnection = {
  host: string;
  port: number;
  password: string | undefined;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
  tls?: RedisOptions['tls'];
};

function getConnection(): RedisConnection {
  return {
    host: config.redis?.host ?? 'localhost',
    port: config.redis?.port ?? 6379,
    password: config.redis?.password ?? undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
    ...getRedisTLSOptions(config.redis?.host),
  };
}

export class KnowledgeSummaryEnrichmentJob {
  private queue: Queue<SummaryEnrichmentPayload> | null = null;
  private worker: Worker<SummaryEnrichmentPayload> | null = null;
  private readonly repository = new KnowledgeRepository();

  async enqueue(payload: SummaryEnrichmentPayload): Promise<void> {
    if (!this.queue) {
      this.queue = new Queue<SummaryEnrichmentPayload>(QUEUE_NAME, { connection: getConnection() });
    }
    await this.queue.add(JOB_NAME, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 86400, count: 100 },
      removeOnFail: { age: 604800, count: 50 },
    });
  }

  startWorker(summarize: SummarizeFn): void {
    if (this.worker) return;
    const connection = getConnection();
    this.worker = new Worker<SummaryEnrichmentPayload>(
      QUEUE_NAME,
      async (job: Job<SummaryEnrichmentPayload>) => {
        const { itemId, content } = job.data;
        const summary = (await summarize(content)).trim();
        if (!summary) throw new Error('summarizer returned empty summary');
        await this.repository.update(itemId, { summary });
      },
      { connection, concurrency: 3 }
    );
    this.worker.on('failed', (job, err) => {
      logger.error('KnowledgeSummaryEnrichmentJob: job failed', {
        jobId: job?.id,
        error: err.message,
      });
    });
    logger.info('KnowledgeSummaryEnrichmentJob worker started');
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.worker = null;
    this.queue = null;
  }
}

let singleton: KnowledgeSummaryEnrichmentJob | null = null;

export function getKnowledgeSummaryEnrichmentJob(): KnowledgeSummaryEnrichmentJob {
  if (!singleton) singleton = new KnowledgeSummaryEnrichmentJob();
  return singleton;
}
