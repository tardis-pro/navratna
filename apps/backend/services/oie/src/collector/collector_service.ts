import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import type { ObservabilityAdapter } from '../types/observability_adapter.js';
import type { OIEEvent } from '../types/oie_event.js';
import { randomUUID } from 'node:crypto';

const OIE_EVENTS_TOPIC = 'oie.events.collected';
const LAST_POLL_KEY_PREFIX = 'oie:collector:last_poll:';
const COLLECTOR_JOB_NAME = 'oie:collect';
const COLLECTOR_QUEUE_NAME = 'oie-collector';

function getRedisOptions() {
  return {
    host: config.redis?.host ?? 'localhost',
    port: config.redis?.port ?? 6379,
    password: config.redis?.password ?? undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

export class CollectorService {
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private eventQueue: Queue | null = null;
  private redis: Redis | null = null;
  private adapters: ObservabilityAdapter[] = [];
  private projectId: string;
  private pollIntervalMs: number;
  private lookbackMs: number;

  constructor(projectId: string, pollIntervalMs?: number, lookbackMs?: number) {
    this.projectId = projectId;
    this.pollIntervalMs = pollIntervalMs ?? parseInt(process.env.OIE_POLL_INTERVAL_MS ?? '60000', 10);
    this.lookbackMs = lookbackMs ?? parseInt(process.env.OIE_LOOKBACK_MINUTES ?? '5', 10) * 60_000;
  }

  registerAdapter(adapter: ObservabilityAdapter): void {
    this.adapters.push(adapter);
    logger.info('CollectorService: adapter registered', { adapterId: adapter.id });
  }

  async start(): Promise<void> {
    const connection = getRedisOptions();
    this.redis = new Redis(connection);
    this.queue = new Queue(COLLECTOR_QUEUE_NAME, { connection });
    this.eventQueue = new Queue(OIE_EVENTS_TOPIC, { connection });

    await this.queue.upsertJobScheduler(
      COLLECTOR_JOB_NAME,
      { every: this.pollIntervalMs },
      { name: COLLECTOR_JOB_NAME, data: { projectId: this.projectId } },
    );

    this.worker = new Worker(
      COLLECTOR_QUEUE_NAME,
      async (job: Job) => this.runCollection(job),
      { connection, concurrency: 1 },
    );

    this.worker.on('failed', (job, err) => {
      logger.error('CollectorService: job failed', { jobId: job?.id, error: err.message });
    });

    logger.info('CollectorService started', { projectId: this.projectId, pollIntervalMs: this.pollIntervalMs });
  }

  private async runCollection(_job: Job): Promise<void> {
    if (this.adapters.length === 0) {
      logger.warn('CollectorService: no adapters registered, skipping poll');
      return;
    }

    const collected: OIEEvent[] = [];

    for (const adapter of this.adapters) {
      try {
        const pollKey = `${LAST_POLL_KEY_PREFIX}${this.projectId}:${adapter.id}`;
        const lastPollStr = await this.redis?.get(pollKey);
        const since = lastPollStr
          ? new Date(parseInt(lastPollStr, 10))
          : new Date(Date.now() - this.lookbackMs);

        const errors = await adapter.queryErrors({ since, limit: 100 });
        const incidents = await adapter.getIncidents(since);

        for (const error of errors) {
          collected.push(adapter.normalizeToOIEEvent(error, this.projectId));
        }
        for (const incident of incidents) {
          collected.push(adapter.normalizeToOIEEvent(incident, this.projectId));
        }

        await this.redis?.set(pollKey, Date.now().toString());
        logger.info('CollectorService: polled adapter', { adapterId: adapter.id, errors: errors.length, incidents: incidents.length });
      } catch (err) {
        logger.error('CollectorService: adapter poll failed', {
          adapterId: adapter.id,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    if (collected.length > 0) {
      await this.publishEvents(collected);
    }

    logger.info('CollectorService: collection cycle complete', { collected: collected.length });
  }

  private async publishEvents(events: OIEEvent[]): Promise<void> {
    if (!this.eventQueue) return;
    const jobs = events.map((event) => ({
      name: 'oie.event',
      data: event,
      opts: { jobId: `${event.projectId}:${event.fingerprint}:${Date.now()}` },
    }));
    await this.eventQueue.addBulk(jobs);
    logger.info('CollectorService: published events', { count: events.length, topic: OIE_EVENTS_TOPIC });
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.eventQueue?.close();
    await this.redis?.quit();
    logger.info('CollectorService stopped');
  }
}
