import { Queue, Worker, type Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import jwt from 'jsonwebtoken';
import * as winston from 'winston';
import { config } from '@uaip/config';
import { ApiError } from '@uaip/utils';
import type {
  UAIPEvent,
  EventBusMessage,
  EventBusHandler,
  EventBusSubscriptionOptions,
  EventBusConfig,
  EventBusPublishContext,
  EventBusWrappedEvent,
} from '@uaip/types';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { getRedisTLSOptions } from './redis_tls.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEventBusMessage(event: EventBusWrappedEvent): event is EventBusMessage {
  return event.timestamp instanceof Date;
}

type RpcResponseShape<T> = { error?: { message?: string; code?: string }; data?: T };

function isRpcResponse<T>(data: unknown): data is RpcResponseShape<T> {
  return typeof data === 'object' && data !== null;
}

function getRedisOptions(): RedisOptions {
  const host = config.redis?.host || 'localhost';
  const opts: RedisOptions = {
    host,
    port: config.redis?.port || 6379,
    password: config.redis?.password || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...getRedisTLSOptions(host),
  };
  return opts;
}

function getBullMQConnection(): ConnectionOptions {
  const host = config.redis?.host || 'localhost';
  const connection: ConnectionOptions = {
    host,
    port: config.redis?.port || 6379,
    password: config.redis?.password || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...getRedisTLSOptions(host),
  };
  return connection;
}

// Singleton state lives on globalThis, NOT in module statics. Bun resolves src/ and dist/
// as separate module copies (tsconfig paths vs package.json exports), so a module-level
// static would give each copy its own null instance — a consumer that imports a different
// copy than the entry point then throws "requires config" and never sees the initialized
// bus. Same fix the drizzle plane clients use.
interface EventBusSingletonState {
  instance: EventBusService | null;
  defaultConfig: EventBusConfig | null;
  defaultLogger: winston.Logger | null;
}
const EVENT_BUS_GLOBAL_KEY = '__uaip_event_bus_singleton__' as const;
function eventBusState(): EventBusSingletonState {
  const g = globalThis as Record<string, unknown>;
  if (!g[EVENT_BUS_GLOBAL_KEY]) {
    g[EVENT_BUS_GLOBAL_KEY] = { instance: null, defaultConfig: null, defaultLogger: null };
  }
  return g[EVENT_BUS_GLOBAL_KEY] as EventBusSingletonState;
}

export class EventBusService {
  private redis: Redis;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private subscribers: Map<string, EventBusHandler[]> = new Map();
  private replyHandlers: Map<string, (msg: EventBusMessage) => void> = new Map();
  private replyWorker: Worker | null = null;
  public isConnected: boolean = false;
  private config: EventBusConfig;
  private logger: winston.Logger;
  private isClosing: boolean = false;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(eventBusConfig: EventBusConfig, eventBusLogger: winston.Logger) {
    this.config = eventBusConfig;
    this.logger = eventBusLogger;

    this.redis = new Redis(getRedisOptions());

    this.redis.on('connect', () => {
      this.isConnected = true;
      this.logger.info('Redis connection established for EventBus');
    });

    this.redis.on('ready', () => {
      this.isConnected = true;
    });

    this.redis.on('close', () => {
      this.isConnected = false;
      this.logger.warn('Redis connection closed for EventBus');
    });

    this.redis.on('error', (err: Error) => {
      this.logger.error('Redis error in EventBus', { error: err.message });
    });

    this.setupProcessHandlers();
    this.logger.info('EventBusService initialized with BullMQ on Redis');
  }

  public static getInstance(
    instanceConfig?: EventBusConfig,
    instanceLogger?: winston.Logger
  ): EventBusService {
    const state = eventBusState();
    if (!state.instance) {
      let resolvedConfig = instanceConfig;
      let resolvedLogger = instanceLogger;
      if (!resolvedConfig || !resolvedLogger) {
        if (!state.defaultConfig || !state.defaultLogger) {
          throw new Error('EventBusService requires config and logger for initial creation');
        }
        resolvedConfig = state.defaultConfig;
        resolvedLogger = state.defaultLogger;
      } else {
        state.defaultConfig = resolvedConfig;
        state.defaultLogger = resolvedLogger;
      }
      state.instance = new EventBusService(resolvedConfig, resolvedLogger);
    }
    return state.instance;
  }

  private setupProcessHandlers(): void {
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
  }

  /**
   * The event type is used verbatim as the BullMQ queue name, and BullMQ rejects ':'
   * (it is the delimiter in its own Redis keys). A bad name therefore throws from deep
   * inside the Queue/Worker constructor, which previously surfaced as an opaque
   * unhandledRejection that aborted websocket mounting and silently disabled chat.
   * Reject it up front, naming the offending channel.
   */
  private assertValidEventType(eventType: string): void {
    if (eventType.includes(':')) {
      throw new Error(
        `Invalid event type "${eventType}": event types become BullMQ queue names and cannot contain ':'. Use dots (e.g. "${eventType.replace(/:/g, '.')}").`
      );
    }
  }

  public getOrCreateQueue(eventType: string): Queue {
    this.assertValidEventType(eventType);
    if (!this.queues.has(eventType)) {
      const queue = new Queue(eventType, {
        connection: getBullMQConnection(),
        defaultJobOptions: {
          removeOnComplete: { age: 86400, count: 100 },
          removeOnFail: { age: 604800, count: 50 },
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      });
      this.queues.set(eventType, queue);
    }
    return this.queues.get(eventType)!;
  }

  public async publish(
    eventType: string,
    data: unknown,
    options?: {
      correlationId?: string;
      metadata?: Record<string, unknown>;
      exchange?: string;
      routingKey?: string;
      persistent?: boolean;
      context?: EventBusPublishContext;
    }
  ): Promise<void> {
    // Must not be a purely-numeric string: it is used as the BullMQ job id, and BullMQ
    // rejects integer-like custom ids ("Custom Ids cannot be integers"), which silently
    // dropped every published event. Prefix it.
    const messageId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const timestamp = new Date();
    const correlationId =
      options?.correlationId || `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let message: EventBusWrappedEvent;

    if (options?.context?.actor || options?.context?.tenant) {
      const uaipEvent: UAIPEvent = {
        id: messageId,
        type: eventType,
        source: this.config.serviceName,
        timestamp: timestamp.toISOString(),
        correlationId,
        actor: options.context.actor || { userId: 'system', orgId: 'system', roles: [] },
        tenant: options.context.tenant || { orgId: 'system' },
        data: isRecord(data) ? data : { value: data },
        version: '1',
      };
      message = uaipEvent;
    } else {
      message = {
        id: messageId,
        type: eventType,
        source: this.config.serviceName,
        data,
        timestamp,
        version: '1.0.0',
        correlationId: options?.correlationId,
        metadata: options?.metadata,
      };
    }

    try {
      const queue = this.getOrCreateQueue(eventType);

      await queue.add(eventType, message, {
        jobId: messageId,
      });

      this.logger.debug('Event published successfully via BullMQ', {
        eventId: messageId,
        eventType,
        hasSecurityContext: !!(options?.context?.actor || options?.context?.tenant),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to publish event', {
        eventType,
        error: errorMessage,
        messageId,
      });

      if (eventType.includes('auth') || eventType.includes('security')) {
        throw new ApiError(500, 'Failed to publish event', 'EVENT_PUBLISH_ERROR', {
          eventType,
          messageId,
        });
      } else {
        this.logger.warn('Event publish failed, continuing operation', {
          eventType,
          messageId,
          error: errorMessage,
        });
      }
    }
  }

  public async subscribe(
    eventType: string,
    handler: EventBusHandler,
    options?: EventBusSubscriptionOptions
  ): Promise<void> {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }

    const handlers = this.subscribers.get(eventType)!;
    if (!handlers.includes(handler)) {
      handlers.push(handler);
    }

    if (!this.workers.has(eventType)) {
      await this.setupWorker(eventType, options);
    }
  }

  private async setupWorker(
    eventType: string,
    options?: EventBusSubscriptionOptions
  ): Promise<void> {
    this.assertValidEventType(eventType);
    if (this.workers.has(eventType)) return;

    const worker = new Worker<EventBusWrappedEvent>(
      eventType,
      async (job: Job<EventBusWrappedEvent>) => {
        const rawMessage: EventBusWrappedEvent = job.data;

        let eventTimestamp: Date;
        let eventMetadata: Record<string, unknown> | undefined;
        if (isEventBusMessage(rawMessage)) {
          eventTimestamp = rawMessage.timestamp;
          eventMetadata = rawMessage.metadata;
        } else {
          eventTimestamp = new Date(rawMessage.timestamp);
          eventMetadata = undefined;
        }

        const eventMessage: EventBusMessage = {
          id: rawMessage.id,
          type: rawMessage.type,
          source: rawMessage.source,
          data: rawMessage.data,
          timestamp: eventTimestamp,
          version: rawMessage.version,
          correlationId: rawMessage.correlationId,
          metadata: eventMetadata,
        };

        const authToken = eventMessage.metadata?.authorization;
        if (typeof authToken === 'string' && authToken.startsWith('Bearer ')) {
          const token = authToken.substring(7);
          try {
            const decoded = jwt.verify(token, config.jwt.secret, {
              algorithms: ['HS256'],
            });
            if (typeof decoded !== 'object' || decoded === null || !('type' in decoded)) {
              this.logger.warn('Invalid token payload in event message', { eventType });
              throw new Error('Invalid token payload');
            }
            if (decoded.type !== 'internal') {
              this.logger.warn('Invalid token type in event message', { eventType });
              throw new Error('Invalid token type');
            }
            // Validate scopes — service must have permission for this event topic
            if ('scopes' in decoded && Array.isArray(decoded.scopes)) {
              const topicPrefix = eventType.split('.').slice(0, 2).join('.');
              const hasScope = decoded.scopes.some((scope: string) =>
                eventType.startsWith(scope) || topicPrefix.startsWith(scope) || scope === '*'
              );
              if (!hasScope) {
                this.logger.warn('Service token lacks scope for event topic', {
                  eventType,
                  scopes: decoded.scopes,
                  serviceId: 'serviceId' in decoded ? decoded.serviceId : 'unknown',
                });
                throw new Error(`Insufficient scope for event: ${eventType}`);
              }
            }
          } catch (tokenError) {
            this.logger.warn('Failed to validate internal token in event', {
              eventType,
              error: tokenError instanceof Error ? tokenError.message : 'Unknown error',
            });
            throw tokenError;
          }
        }

        this.logger.debug('Processing event via BullMQ Worker', {
          eventId: eventMessage.id,
          eventType: eventMessage.type,
          source: eventMessage.source,
          jobId: job.id,
        });

        // FIX: Execute handlers in parallel with Promise.allSettled to avoid
        // one slow handler blocking all others. Individual failures are logged
        // but do not prevent other handlers from completing.
        const handlers = this.subscribers.get(eventType) || [];
        const results = await Promise.allSettled(handlers.map((h) => h(eventMessage)));
        for (const result of results) {
          if (result.status === 'rejected') {
            this.logger.error('Event handler failed', {
              eventType,
              eventId: eventMessage.id,
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            });
          }
        }

        this.logger.debug('Event processed successfully', {
          eventId: eventMessage.id,
          eventType: eventMessage.type,
        });
      },
      {
        connection: getBullMQConnection(),
        concurrency: options?.prefetch || 10,
        autorun: true,
      }
    );

    worker.on('failed', (job, err) => {
      this.logger.error('BullMQ job failed', {
        jobId: job?.id,
        eventType,
        error: err.message,
        attemptsMade: job?.attemptsMade,
      });
    });

    worker.on('error', (err) => {
      this.logger.error('BullMQ Worker error', { eventType, error: err.message });
    });

    this.workers.set(eventType, worker);

    this.logger.info('BullMQ Worker created for event type', {
      eventType,
      handlerCount: this.subscribers.get(eventType)?.length ?? 0,
    });
  }

  public async unsubscribe(eventType: string, handler: EventBusHandler): Promise<void> {
    const handlers = this.subscribers.get(eventType);
    if (!handlers) return;

    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);

      if (handlers.length === 0) {
        this.subscribers.delete(eventType);

        const worker = this.workers.get(eventType);
        if (worker) {
          await worker.close();
          this.workers.delete(eventType);
        }
      }

      this.logger.info('Unsubscribed from event', {
        eventType,
        remainingHandlers: handlers.length,
      });
    }
  }

  private async getOrCreateReplyWorker(): Promise<void> {
    if (this.replyWorker) return;
    this.replyWorker = new Worker<EventBusMessage>(
      'rpc.replies',
      async (job: Job<EventBusMessage>) => {
        const msg: EventBusMessage = job.data;
        const handler = this.replyHandlers.get(msg.correlationId ?? '');
        if (handler) handler(msg);
      },
      { connection: getBullMQConnection() }
    );
  }

  public async publishAndWaitForResponse<T = unknown>(
    eventType: string,
    data: unknown,
    timeout: number = 30000
  ): Promise<T> {
    await this.getOrCreateReplyWorker();
    const correlationId = `rpc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.replyHandlers.delete(correlationId);
        reject(new ApiError(408, 'RPC request timeout', 'RPC_TIMEOUT'));
      }, timeout);

      this.replyHandlers.set(correlationId, (message: EventBusMessage) => {
        clearTimeout(timeoutId);
        this.replyHandlers.delete(correlationId);
        if (isRpcResponse<T>(message.data)) {
          if (message.data.error) {
            reject(
              new ApiError(
                500,
                message.data.error.message || 'RPC error',
                message.data.error.code || 'RPC_ERROR'
              )
            );
          } else {
            resolve(message.data.data!);
          }
        } else {
          reject(new ApiError(500, 'Invalid RPC response format', 'RPC_INVALID_RESPONSE'));
        }
      });

      this.publish(eventType, data, {
        correlationId,
        metadata: { replyTo: 'rpc.replies' },
      }).catch((err) => {
        clearTimeout(timeoutId);
        this.replyHandlers.delete(correlationId);
        reject(err);
      });
    });
  }

  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      redisReady: boolean;
      subscriberCount: number;
    };
  }> {
    try {
      const subscriberCount = Array.from(this.subscribers.values()).reduce(
        (total, handlers) => total + handlers.length,
        0
      );

      let redisAlive = false;
      try {
        const pong = await this.redis.ping();
        redisAlive = pong === 'PONG';
      } catch {
        redisAlive = false;
      }

      const connected = this.isConnected && redisAlive;

      return {
        status: connected ? 'healthy' : 'unhealthy',
        details: {
          connected,
          redisReady: connected,
          subscriberCount,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Event bus health check failed', { error: errorMessage });
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          redisReady: false,
          subscriberCount: 0,
        },
      };
    }
  }

  public getSubscriptionStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [eventType, handlers] of this.subscribers.entries()) {
      stats[eventType] = handlers.length;
    }
    return stats;
  }

  public async sweepStaleQueues(): Promise<number> {
    let cleaned = 0;

    for (const [eventType, queue] of this.queues.entries()) {
      if (this.workers.has(eventType)) continue;

      try {
        // oxlint-disable-next-line no-await-in-loop -- sweep processes queues sequentially to avoid thundering-herd on Redis
        const jobCounts = await queue.getJobCounts('active', 'waiting', 'delayed');
        const hasActiveJobs = jobCounts.active > 0 || jobCounts.waiting > 0 || jobCounts.delayed > 0;

        if (!hasActiveJobs) {
          // oxlint-disable-next-line no-await-in-loop -- must await close before deleting from map
          await queue.close();
          this.queues.delete(eventType);
          cleaned++;
          this.logger.debug('Swept stale publish-only queue', { eventType });
        }
      } catch (error) {
        this.logger.debug('Error checking queue during sweep, skipping', {
          eventType,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    if (cleaned > 0) {
      this.logger.info('Stale queue sweep completed', { cleaned, remaining: this.queues.size });
    }

    return cleaned;
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    if (this.isClosing) {
      this.logger.debug(`Event bus shutdown already in progress for ${signal}, skipping`);
      return;
    }

    this.isClosing = true;
    this.isConnected = false;
    this.logger.info(`Received ${signal}, shutting down EventBus gracefully`);

    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }

    try {
      const allWorkers = [
        ...Array.from(this.workers.values()),
        ...(this.replyWorker ? [this.replyWorker] : []),
      ];
      const workerClosePromises = allWorkers.map((w) =>
        w.close().catch((err) => {
          this.logger.debug('Worker close error (expected during shutdown)', {
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        })
      );
      await Promise.all(workerClosePromises);
      this.workers.clear();
      this.replyWorker = null;
      this.replyHandlers.clear();

      const queueClosePromises = Array.from(this.queues.values()).map((q) =>
        q.close().catch((err) => {
          this.logger.debug('Queue close error (expected during shutdown)', {
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        })
      );
      await Promise.all(queueClosePromises);
      this.queues.clear();

      await this.redis.quit().catch(() => this.redis.disconnect());

      this.logger.info('EventBus shutdown completed');
    } catch (error) {
      this.logger.error('Error during EventBus shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  public async connect(): Promise<void> {
    if (this.redis.status === 'ready') {
      this.isConnected = true;
    } else {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`EventBus Redis connect timeout after 10s (host: ${this.redis.options?.host}:${this.redis.options?.port})`));
        }, 10000);
        this.redis.once('ready', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          resolve();
        });
        this.redis.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }

    if (!this.sweepInterval) {
      this.sweepInterval = setInterval(() => {
        this.sweepStaleQueues().catch((err) => {
          this.logger.debug('Stale queue sweep error', { error: err instanceof Error ? err.message : 'Unknown' });
        });
      }, 30 * 60 * 1000);
      this.sweepInterval.unref();
    }
  }

  public async close(): Promise<void> {
    await this.gracefulShutdown('MANUAL');
  }

  public async publishEvent(eventType: string, data: unknown): Promise<void> {
    return this.publish(eventType, data);
  }

  // FIX: publishAndWait previously created ephemeral per-request BullMQ queues and
  // workers (via subscribe) that were never cleaned up, leaking Redis resources.
  // Now cleans up the ephemeral queue and worker after response or timeout.
  //
  // NOTE: For new callers, prefer publishAndWaitForResponse() which uses a single
  // shared rpc.replies worker instead of creating ephemeral queues per request.
  public async publishAndWait(
    eventType: string,
    data: unknown,
    timeoutMs: number = 30000
  ): Promise<unknown> {
    const correlationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const responseEventType = `${eventType}.response.${correlationId}`;

    // Helper to fully clean up the ephemeral queue/worker created for this request
    const cleanupEphemeralQueue = async (): Promise<void> => {
      try {
        const worker = this.workers.get(responseEventType);
        if (worker) {
          await worker.close();
          this.workers.delete(responseEventType);
        }
        const queue = this.queues.get(responseEventType);
        if (queue) {
          await queue.close();
          this.queues.delete(responseEventType);
        }
        this.subscribers.delete(responseEventType);
      } catch (cleanupErr) {
        this.logger.debug('Ephemeral queue cleanup error (non-critical)', {
          responseEventType,
          error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        });
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.unsubscribe(responseEventType, responseHandler)
          .then(() => cleanupEphemeralQueue())
          .catch((err) => {
            this.logger.warn('Failed to clean up response handler on timeout', {
              responseEventType,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const responseHandler: EventBusHandler = async (message: EventBusMessage) => {
        clearTimeout(timeout);
        await this.unsubscribe(responseEventType, responseHandler);
        await cleanupEphemeralQueue();

        if (isRpcResponse<unknown>(message.data)) {
          if (message.data.error) {
            reject(new Error(message.data.error.message || 'Unknown error'));
          } else {
            resolve(message.data.data);
          }
        } else {
          reject(new Error('Invalid response format'));
        }
      };

      this.subscribe(responseEventType, responseHandler)
        .then(() => {
          const requestData = isRecord(data) ? data : {};
          const requestMessage = {
            ...requestData,
            correlationId,
            responseEventType,
          };
          return this.publish(eventType, requestMessage);
        })
        .catch((error) => {
          clearTimeout(timeout);
          cleanupEphemeralQueue().catch(() => {});
          reject(error);
        });
    });
  }

  async request(channel: string, data: unknown): Promise<unknown> {
    try {
      return await this.publishAndWaitForResponse(channel, data);
    } catch (error) {
      this.logger.error('Request failed', { error, channel });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage, data: null };
    }
  }
}

export type {
  EventBusMessage,
  EventBusHandler,
  EventBusSubscriptionOptions,
  EventBusConfig,
  EventBusPublishContext,
};
