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

function getBullMQConnection(): ConnectionOptions {
  return {
    host: config.redis?.host || 'localhost',
    port: config.redis?.port || 6379,
    password: config.redis?.password || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  } as ConnectionOptions;
}

export class EventBusService {
  private static instance: EventBusService | null = null;
  private static defaultConfig: EventBusConfig | null = null;
  private static defaultLogger: winston.Logger | null = null;

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

  constructor(eventBusConfig: EventBusConfig, eventBusLogger: winston.Logger) {
    this.config = eventBusConfig;
    this.logger = eventBusLogger;

    this.redis = new Redis(getBullMQConnection() as Record<string, unknown>);

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
    if (!EventBusService.instance) {
      let resolvedConfig = instanceConfig;
      let resolvedLogger = instanceLogger;
      if (!resolvedConfig || !resolvedLogger) {
        if (!EventBusService.defaultConfig || !EventBusService.defaultLogger) {
          throw new Error('EventBusService requires config and logger for initial creation');
        }
        resolvedConfig = EventBusService.defaultConfig;
        resolvedLogger = EventBusService.defaultLogger;
      } else {
        EventBusService.defaultConfig = resolvedConfig;
        EventBusService.defaultLogger = resolvedLogger;
      }
      EventBusService.instance = new EventBusService(resolvedConfig, resolvedLogger);
    }
    return EventBusService.instance;
  }

  private setupProcessHandlers(): void {
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
  }

  private getOrCreateQueue(eventType: string): Queue {
    if (!this.queues.has(eventType)) {
      const queue = new Queue(eventType, {
        connection: getBullMQConnection(),
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
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
    const messageId = Date.now().toString();
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
        data: data as Record<string, unknown>,
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
    if (this.workers.has(eventType)) return;

    const worker = new Worker(
      eventType,
      async (job: Job) => {
        const rawMessage = job.data as EventBusWrappedEvent;

        const eventMessage: EventBusMessage = {
          id: rawMessage.id,
          type: rawMessage.type,
          source: rawMessage.source,
          data: (rawMessage as EventBusMessage).data ?? (rawMessage as UAIPEvent).data,
          timestamp:
            (rawMessage as EventBusMessage).timestamp instanceof Date
              ? (rawMessage as EventBusMessage).timestamp
              : new Date((rawMessage as UAIPEvent).timestamp ?? Date.now()),
          version: rawMessage.version,
          correlationId: rawMessage.correlationId,
          metadata: (rawMessage as EventBusMessage).metadata,
        };

        const authToken = (eventMessage.metadata as Record<string, unknown>)?.authorization;
        if (typeof authToken === 'string' && authToken.startsWith('Bearer ')) {
          const token = authToken.substring(7);
          try {
            const decoded = jwt.verify(token, config.jwt.secret);
            if (typeof decoded !== 'object' || decoded === null || !('type' in decoded)) {
              this.logger.warn('Invalid token payload in event message', { eventType });
              throw new Error('Invalid token payload');
            }
            if ((decoded as Record<string, unknown>).type !== 'internal') {
              this.logger.warn('Invalid token type in event message', { eventType });
              throw new Error('Invalid token type');
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

        const handlers = this.subscribers.get(eventType) || [];
        for (const h of handlers) {
          // eslint-disable-next-line no-await-in-loop -- sequential handler execution required
          await h(eventMessage);
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
    this.replyWorker = new Worker(
      'rpc.replies',
      async (job: Job) => {
        const msg = job.data as EventBusMessage;
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
        const responseData = message.data as {
          error?: { message?: string; code?: string };
          data?: T;
        };
        if (responseData.error) {
          reject(
            new ApiError(
              500,
              responseData.error.message || 'RPC error',
              responseData.error.code || 'RPC_ERROR'
            )
          );
        } else {
          resolve(responseData.data as T);
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

  private async gracefulShutdown(signal: string): Promise<void> {
    if (this.isClosing) {
      this.logger.debug(`Event bus shutdown already in progress for ${signal}, skipping`);
      return;
    }

    this.isClosing = true;
    this.isConnected = false;
    this.logger.info(`Received ${signal}, shutting down EventBus gracefully`);

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
      return;
    }
    await new Promise<void>((resolve) => {
      this.redis.once('ready', () => {
        this.isConnected = true;
        resolve();
      });
    });
  }

  public async close(): Promise<void> {
    await this.gracefulShutdown('MANUAL');
  }

  public async publishEvent(eventType: string, data: unknown): Promise<void> {
    return this.publish(eventType, data);
  }

  public async publishAndWait(
    eventType: string,
    data: unknown,
    timeoutMs: number = 30000
  ): Promise<unknown> {
    const correlationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const responseEventType = `${eventType}.response.${correlationId}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.unsubscribe(responseEventType, responseHandler).catch(() => {});
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const responseHandler: EventBusHandler = async (message: EventBusMessage) => {
        clearTimeout(timeout);
        await this.unsubscribe(responseEventType, responseHandler);

        const responseData = message.data as {
          error?: { message?: string };
          success?: boolean;
          data?: unknown;
        };
        if (responseData.error) {
          reject(new Error(responseData.error.message || 'Unknown error'));
        } else {
          resolve(responseData.data);
        }
      };

      this.subscribe(responseEventType, responseHandler)
        .then(() => {
          const requestMessage = {
            ...(data as Record<string, unknown>),
            correlationId,
            responseEventType,
          };
          return this.publish(eventType, requestMessage);
        })
        .catch((error) => {
          clearTimeout(timeout);
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
