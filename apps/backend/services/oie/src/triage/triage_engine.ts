import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { classifyEvent } from './decision_trees.js';
import type { OIEEvent } from '../types/oie_event.js';
import type { TriagedIncident } from '../types/triage.js';
import { randomUUID } from 'node:crypto';

const OIE_EVENTS_TOPIC = 'oie.events.collected';
const OIE_INCIDENTS_TOPIC = 'oie.incidents.triaged';
const DEDUP_KEY_PREFIX = 'oie:triage:dedup:';
const COUNT_1H_PREFIX = 'oie:triage:count1h:';
const COUNT_24H_PREFIX = 'oie:triage:count24h:';

const DEDUP_COOLDOWN_MS = parseInt(process.env.OIE_ERROR_DEDUP_COOLDOWN_MS ?? '30000', 10);

function getRedisOptions() {
  return {
    host: config.redis?.host ?? 'localhost',
    port: config.redis?.port ?? 6379,
    password: config.redis?.password ?? undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

export class TriageEngine {
  private inputWorker: Worker | null = null;
  private outputQueue: Queue | null = null;
  private redis: Redis | null = null;

  async start(): Promise<void> {
    const connection = getRedisOptions();
    this.redis = new Redis(connection);
    this.outputQueue = new Queue(OIE_INCIDENTS_TOPIC, { connection });

    this.inputWorker = new Worker(
      OIE_EVENTS_TOPIC,
      async (job: Job) => this.processEvent(job),
      { connection, concurrency: 5 },
    );

    this.inputWorker.on('failed', (job, err) => {
      logger.error('TriageEngine: job failed', { jobId: job?.id, error: err.message });
    });

    logger.info('TriageEngine started', { dedup_cooldown_ms: DEDUP_COOLDOWN_MS });
  }

  private async processEvent(job: Job): Promise<void> {
    const event = job.data as OIEEvent;
    const dedupKey = `${DEDUP_KEY_PREFIX}${event.projectId}:${event.fingerprint}`;
    const count1hKey = `${COUNT_1H_PREFIX}${event.fingerprint}`;
    const count24hKey = `${COUNT_24H_PREFIX}${event.fingerprint}`;

    if (!this.redis) return;

    const isDuplicate = await this.redis.get(dedupKey) !== null;

    if (isDuplicate) {
      await this.redis.incr(count1hKey);
      await this.redis.incr(count24hKey);
      logger.debug('TriageEngine: duplicate event suppressed', { fingerprint: event.fingerprint });
      return;
    }

    await this.redis.set(dedupKey, '1', 'PX', DEDUP_COOLDOWN_MS);
    await this.redis.incr(count1hKey);
    await this.redis.expire(count1hKey, 3600);
    await this.redis.incr(count24hKey);
    await this.redis.expire(count24hKey, 86400);

    const count1h = parseInt(await this.redis.get(count1hKey) ?? '1', 10);
    const count24h = parseInt(await this.redis.get(count24hKey) ?? '1', 10);

    const classification = classifyEvent(event, { count1h, count24h });

    const incident: TriagedIncident = {
      id: randomUUID(),
      oieEventId: event.id,
      projectId: event.projectId,
      service: event.service,
      errorCode: event.errorCode,
      message: event.message,
      classification,
      occurrenceCount: count24h,
      occurrences1h: count1h,
      occurrences24h: count24h,
      firstSeenAt: event.timestamp,
      lastSeenAt: event.timestamp,
      isDuplicate: false,
      sourceEvent: event,
      triagedAt: new Date(),
    };

    await this.outputQueue?.add('oie.incident', incident, {
      jobId: `${event.projectId}:${event.fingerprint}:${Date.now()}`,
    });

    logger.info('TriageEngine: incident triaged', {
      incidentId: incident.id,
      category: classification.category,
      severity: classification.severity,
      action: classification.action,
      service: event.service,
    });
  }

  async stop(): Promise<void> {
    await this.inputWorker?.close();
    await this.outputQueue?.close();
    await this.redis?.quit();
    logger.info('TriageEngine stopped');
  }
}
