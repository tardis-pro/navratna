import amqp from 'amqplib';
import * as winston from 'winston';
import { ApiError } from '@uaip/utils';

interface EventMessage {
  id: string;
  type: string;
  source: string;
  data: any;
  timestamp: Date;
  version: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

interface EventHandler {
  (message: EventMessage): Promise<void>;
}

interface SubscriptionOptions {
  queue?: string;
  durable?: boolean;
  autoAck?: boolean;
  prefetch?: number;
  deadLetterExchange?: string;
  retryAttempts?: number;
}

interface EventBusConfig {
  url: string;
  serviceName: string;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  exchangePrefix?: string;
  complianceMode?: boolean;
}

export class EventBusService {
  private static instance: EventBusService | null = null;
  
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private subscribers: Map<string, EventHandler[]> = new Map();
  private activeConsumers: Set<string> = new Set();
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private config: EventBusConfig;
  private logger: winston.Logger;
  private isClosing: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: EventBusConfig, logger: winston.Logger) {
    this.config = config;
    this.logger = logger;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.reconnectDelay = config.reconnectDelay || 5000;
    this.setupEventHandlers();

    // Don't connect immediately - use lazy connection
    this.logger.info('EventBusService initialized (lazy connection mode)');
  }

  private setupEventHandlers(): void {
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
  }

  private async ensureConnected(): Promise<void> {
    if (this.isConnected && this.channel) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.connect().catch((error) => {
      this.connectionPromise = null;
      this.logger.warn('Failed to establish connection, will retry on next operation', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    });

    return this.connectionPromise;
  }

  public async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to RabbitMQ', {
        url: this.config.url.replace(/\/\/.*@/, '//***@'),
        service: this.config.serviceName
      });

      this.connection = await amqp.connect(this.config.url);

      if (!this.connection) {
        throw new Error('Failed to establish connection to RabbitMQ');
      }

      this.channel = await this.connection.createChannel();

      if (!this.channel) {
        throw new Error('Failed to create channel');
      }

      // Set up connection event handlers
      this.connection.on('error', (err: Error) => {
        this.logger.error('RabbitMQ connection error', { error: err.message });
        this.isConnected = false;
        this.connectionPromise = null;
        this.activeConsumers.clear(); // Clear active consumers on connection error
        this.scheduleReconnect();
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.isConnected = false;
        this.connectionPromise = null;
        this.activeConsumers.clear(); // Clear active consumers on connection close
        this.scheduleReconnect();
      });

      this.channel.on('error', (err: Error) => {
        this.logger.error('RabbitMQ channel error', { error: err.message });
        // Clear consumers and reset channel to prevent delivery tag issues
        this.activeConsumers.clear();
        this.channel = null;
        // Recreate channel if connection is still alive
        if (this.connection && this.isConnected) {
          this.recreateChannelSafely();
        }
      });

      this.channel.on('close', () => {
        this.logger.warn('RabbitMQ channel closed');
        this.activeConsumers.clear();
        this.channel = null;
        // Recreate channel if connection is still alive
        if (this.connection && this.isConnected) {
          this.recreateChannelSafely();
        }
      });

      // Create default exchanges
      await this.setupExchanges();

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.connectionPromise = null;

      this.logger.info('Successfully connected to RabbitMQ');

      // Establish any stored subscriptions
      await this.reestablishSubscriptions();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to connect to RabbitMQ', { error: errorMessage });
      this.connectionPromise = null;
      this.scheduleReconnect();
      throw new ApiError(500, 'Failed to connect to event bus', 'EVENT_BUS_ERROR');
    }
  }

  private async setupExchanges(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not available');
    }

    // Create basic exchanges
    await this.channel.assertExchange('events', 'topic', { durable: true });
    await this.channel.assertExchange('rpc', 'direct', { durable: true });
    await this.channel.assertExchange('events.dlx', 'topic', { durable: true });

    // Create enterprise-prefixed exchanges if configured
    if (this.config.exchangePrefix) {
      const enterpriseEventsExchange = `${this.config.exchangePrefix}.events`;
      const enterpriseRpcExchange = `${this.config.exchangePrefix}.rpc`;
      const enterpriseDlxExchange = `${this.config.exchangePrefix}.events.dlx`;

      await this.channel.assertExchange(enterpriseEventsExchange, 'topic', { durable: true });
      await this.channel.assertExchange(enterpriseRpcExchange, 'direct', { durable: true });
      await this.channel.assertExchange(enterpriseDlxExchange, 'topic', { durable: true });

      this.logger.debug('Enterprise RabbitMQ exchanges set up successfully', {
        eventsExchange: enterpriseEventsExchange,
        rpcExchange: enterpriseRpcExchange,
        dlxExchange: enterpriseDlxExchange
      });
    }

    this.logger.debug('RabbitMQ exchanges set up successfully');
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached, giving up');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    this.logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    setTimeout(async () => {
      try {
        await this.connect();

        // Re-establish all subscriptions after connection is established
        await this.reestablishSubscriptions();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Reconnection attempt failed', { error: errorMessage });
      }
    }, delay);
  }

  private async recreateChannelSafely(): Promise<void> {
    try {
      if (!this.connection || !this.isConnected) {
        this.logger.warn('Cannot recreate channel - connection not available');
        return;
      }

      this.logger.info('Recreating RabbitMQ channel after error');
      this.channel = await this.connection.createChannel();

      if (!this.channel) {
        throw new Error('Failed to recreate channel');
      }

      // Set up channel event handlers again
      this.channel.on('error', (err: Error) => {
        this.logger.error('RabbitMQ channel error', { error: err.message });
        this.activeConsumers.clear();
        this.channel = null;
        // Don't immediately recreate to avoid infinite loops
        setTimeout(() => {
          if (this.connection && this.isConnected) {
            this.recreateChannelSafely();
          }
        }, 1000);
      });

      this.channel.on('close', () => {
        this.logger.warn('RabbitMQ channel closed');
        this.activeConsumers.clear();
        this.channel = null;
        // Don't immediately recreate to avoid infinite loops
        setTimeout(() => {
          if (this.connection && this.isConnected) {
            this.recreateChannelSafely();
          }
        }, 1000);
      });

      // Recreate exchanges
      await this.setupExchanges();

      // Reestablish subscriptions
      await this.reestablishSubscriptions();

      this.logger.info('RabbitMQ channel recreated successfully');
    } catch (error) {
      this.logger.error('Failed to recreate channel', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // If channel recreation fails, trigger full reconnection
      this.isConnected = false;
      this.scheduleReconnect();
    }
  }

  private async reestablishSubscriptions(): Promise<void> {
    if (!this.isConnected || !this.channel) {
      this.logger.warn('Cannot reestablish subscriptions - not connected');
      return;
    }

    // Clear active consumers since we're reestablishing everything
    this.activeConsumers.clear();

    const subscriberEntries = Array.from(this.subscribers.entries());
    this.logger.info(`Reestablishing ${subscriberEntries.length} subscriptions`);

    for (const [eventType, handlers] of subscriberEntries) {
      if (handlers.length > 0) {
        try {
          await this.setupSubscription(eventType);
          this.logger.info('Successfully reestablished subscription', {
            eventType,
            handlerCount: handlers.length
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error('Failed to reestablish subscription', {
            eventType,
            error: errorMessage
          });
        }
      }
    }
  }

  public async publish(
    eventType: string,
    data: any,
    options?: {
      correlationId?: string;
      metadata?: Record<string, any>;
      exchange?: string;
      routingKey?: string;
      persistent?: boolean;
    }
  ): Promise<void> {
    try {
      await this.ensureConnected();
    } catch (error) {
      this.logger.warn('Failed to connect to RabbitMQ for publishing, event will be lost:', {
        eventType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return; // Gracefully fail - don't throw error
    }

    if (!this.isConnected || !this.channel) {
      this.logger.warn('Event bus not connected, event will be lost:', { eventType });
      return; // Gracefully fail - don't throw error
    }

    const message: EventMessage = {
      id: Date.now().toString(),
      type: eventType,
      source: this.config.serviceName,
      data,
      timestamp: new Date(),
      version: '1.0.0',
      correlationId: options?.correlationId,
      metadata: options?.metadata
    };

    try {
      const exchange = options?.exchange || (this.config.exchangePrefix ? `${this.config.exchangePrefix}.events` : 'events');
      const routingKey = options?.routingKey || eventType;
      const messageBuffer = Buffer.from(JSON.stringify(message));

      const publishOptions = {
        persistent: options?.persistent !== false,
        messageId: message.id.toString(),
        timestamp: message.timestamp.getTime(),
        type: eventType,
        headers: {
          source: message.source,
          version: message.version,
          ...(message.correlationId && { correlationId: message.correlationId })
        }
      };

      const published = this.channel.publish(exchange, routingKey, messageBuffer, publishOptions);

      if (!published) {
        throw new Error('Failed to publish message - channel buffer full');
      }

      this.logger.debug('Event published successfully', {
        eventId: message.id,
        eventType,
        exchange,
        routingKey,
        dataSize: messageBuffer.length
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to publish event', {
        eventType,
        error: errorMessage,
        messageId: message.id
      });

      // Check if this is a channel error that requires reconnection
      if (errorMessage.includes('Channel closed') || errorMessage.includes('Connection closed')) {
        this.isConnected = false;
        this.activeConsumers.clear();
        this.connectionPromise = null;
        this.logger.warn('Connection lost during publish, will reconnect on next operation');
      }

      // For WebSocket auth, we need to throw the error so the caller can handle it
      // For other events, we could gracefully fail
      throw new ApiError(500, 'Failed to publish event', 'EVENT_PUBLISH_ERROR', {
        eventType,
        messageId: message.id
      });
    }
  }

  public async subscribe(
    eventType: string,
    handler: EventHandler,
    options?: SubscriptionOptions
  ): Promise<void> {
    // Always store subscription first
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }

    // Check if handler is already stored to avoid duplicates
    const handlers = this.subscribers.get(eventType);
    if (handlers && !handlers.includes(handler)) {
      handlers.push(handler);
    }

    // If not connected, just store the subscription for later
    if (!this.isConnected || !this.channel) {
      this.logger.debug('Storing subscription for later connection', { eventType });
      return;
    }

    // If connected, set up the subscription immediately
    await this.setupSubscription(eventType, options);
  }

  private async setupSubscription(eventType: string, options?: SubscriptionOptions): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not available for subscription setup');
    }

    // Use consistent queue names without timestamps to avoid duplicates
    const queueName = options?.queue || `${this.config.serviceName}.${eventType}`;

    // Check if we already have an active consumer for this event type
    if (this.activeConsumers.has(eventType)) {
      this.logger.debug('Consumer already active for event type', { queueName, eventType });
      return;
    }

    try {
      const exchange = this.config.exchangePrefix ? `${this.config.exchangePrefix}.events` : 'events';

      // Assert queue with options
      const queueOptions = {
        durable: options?.durable !== false,
        arguments: {
          ...(options?.deadLetterExchange && {
            'x-dead-letter-exchange': options.deadLetterExchange
          }),
          ...(options?.retryAttempts && {
            'x-max-retries': options.retryAttempts
          })
        }
      };

      await this.channel.assertQueue(queueName, queueOptions);
      await this.channel.bindQueue(queueName, exchange, eventType);

      // Set prefetch if specified
      if (options?.prefetch) {
        await this.channel.prefetch(options.prefetch);
      }

      // Set up consumer for all handlers of this event type
      const handlers = this.subscribers.get(eventType) || [];
      const consumerTag = await this.channel.consume(queueName, async (msg: amqp.ConsumeMessage | null) => {
        if (!msg) return;

        try {
          const content = msg.content.toString();
          const eventMessage: EventMessage = JSON.parse(content);

          this.logger.debug('Processing event', {
            eventId: eventMessage.id,
            eventType: eventMessage.type,
            source: eventMessage.source
          });

          // Execute all handlers for this event type
          for (const handler of handlers) {
            await handler(eventMessage);
          }

          // Acknowledge message if not auto-ack
          if (!options?.autoAck && this.channel && msg) {
            try {
              // Check if channel is still valid before acknowledging
              if (this.channel && this.isConnected) {
                this.channel.ack(msg);
              } else {
                this.logger.warn('Cannot acknowledge message - channel not available', {
                  deliveryTag: msg.fields?.deliveryTag,
                  channelExists: !!this.channel,
                  isConnected: this.isConnected
                });
              }
            } catch (ackError) {
              this.logger.warn('Failed to acknowledge message', {
                error: ackError instanceof Error ? ackError.message : 'Unknown error',
                deliveryTag: msg.fields?.deliveryTag
              });
              // Don't throw error - just log and continue
            }
          }

          this.logger.debug('Event processed successfully', {
            eventId: eventMessage.id,
            eventType: eventMessage.type
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error('Failed to process event', {
            error: errorMessage,
            messageId: msg.properties.messageId,
            eventType
          });

          // Reject message and send to dead letter queue if configured
          if (this.channel && msg && this.isConnected) {
            try {
              if (options?.deadLetterExchange) {
                this.channel.nack(msg, false, false);
              } else {
                this.channel.nack(msg, false, true); // Requeue
              }
            } catch (nackError) {
              this.logger.warn('Failed to nack message', {
                error: nackError instanceof Error ? nackError.message : 'Unknown error',
                deliveryTag: msg.fields?.deliveryTag,
                channelExists: !!this.channel,
                isConnected: this.isConnected
              });
              // Don't throw error - just log and continue
            }
          } else {
            this.logger.warn('Cannot nack message - channel not available', {
              deliveryTag: msg?.fields?.deliveryTag,
              channelExists: !!this.channel,
              isConnected: this.isConnected
            });
          }
        }
      }, {
        noAck: options?.autoAck || false
      });

      // Mark this event type as having an active consumer
      this.activeConsumers.add(eventType);

      this.logger.info('Successfully subscribed to event', {
        eventType,
        queueName,
        exchange,
        handlerCount: handlers.length,
        consumerTag: consumerTag?.consumerTag
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to subscribe to event', {
        eventType,
        error: errorMessage
      });
      throw new ApiError(500, 'Failed to subscribe to event', 'EVENT_SUBSCRIBE_ERROR', {
        eventType
      });
    }
  }

  public async unsubscribe(eventType: string, handler: EventHandler): Promise<void> {
    const handlers = this.subscribers.get(eventType);
    if (!handlers) return;

    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);

      if (handlers.length === 0) {
        this.subscribers.delete(eventType);
        // Remove from active consumers if no handlers remain
        this.activeConsumers.delete(eventType);
      }

      this.logger.info('Unsubscribed from event', {
        eventType,
        remainingHandlers: handlers.length
      });
    }
  }

  public async publishAndWaitForResponse<T = any>(
    eventType: string,
    data: any,
    timeout: number = 30000
  ): Promise<T> {
    const correlationId = `rpc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const responseQueue = `${this.config.serviceName}.rpc.response.${correlationId}`;

    if (!this.channel) {
      throw new ApiError(500, 'Event bus not connected', 'EVENT_BUS_NOT_CONNECTED');
    }

    try {
      // Create temporary response queue
      await this.channel.assertQueue(responseQueue, {
        exclusive: true,
        autoDelete: true,
        expires: timeout + 5000 // Auto-delete after timeout + buffer
      });

      // Set up response handler
      const responsePromise = new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new ApiError(408, 'RPC request timeout', 'RPC_TIMEOUT'));
        }, timeout);

        if (!this.channel) {
          reject(new ApiError(500, 'Channel not available', 'CHANNEL_NOT_AVAILABLE'));
          return;
        }

        this.channel.consume(responseQueue, (msg: amqp.ConsumeMessage | null) => {
          if (!msg) return;

          try {
            clearTimeout(timeoutId);
            const response = JSON.parse(msg.content.toString());
            if (this.channel) {
              this.channel.ack(msg);
            }

            if (response.error) {
              reject(new ApiError(500, response.error.message, response.error.code));
            } else {
              resolve(response.data);
            }
          } catch (error) {
            reject(new ApiError(500, 'Failed to parse RPC response', 'RPC_PARSE_ERROR'));
          }
        }, { noAck: false });
      });

      // Publish request
      await this.publish(eventType, data, {
        correlationId,
        exchange: 'rpc',
        routingKey: eventType,
        metadata: { replyTo: responseQueue }
      });

      return await responsePromise;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('RPC request failed', {
        eventType,
        correlationId,
        error: errorMessage
      });
      throw error;
    }
  }

  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      channelOpen: boolean;
      subscriberCount: number;
    };
  }> {
    try {
      const subscriberCount = Array.from(this.subscribers.values())
        .reduce((total, handlers) => total + handlers.length, 0);

      return {
        status: this.isConnected && this.channel !== null ? 'healthy' : 'unhealthy',
        details: {
          connected: this.isConnected,
          channelOpen: this.channel !== null,
          subscriberCount
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Event bus health check failed', { error: errorMessage });
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          channelOpen: false,
          subscriberCount: 0
        }
      };
    }
  }

  public getSubscriptionStats(): Record<string, number> {
    const stats: Record<string, number> = {};

    const subscriberEntries = Array.from(this.subscribers.entries());
    for (const [eventType, handlers] of subscriberEntries) {
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
    this.logger.info(`Received ${signal}, shutting down event bus gracefully`);

    try {
      if (this.channel) {
        await this.channel.close();
      }

      if (this.connection) {
        await this.connection.close();
      }

      // Clear active consumers on shutdown
      this.activeConsumers.clear();
      this.isConnected = false;

      this.logger.info('Event bus shutdown completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Error during event bus shutdown', { error: errorMessage });
    }
  }

  public async close(): Promise<void> {
    await this.gracefulShutdown('MANUAL');
  }

  // Alias method for compatibility
  public async publishEvent(eventType: string, data: any): Promise<void> {
    return this.publish(eventType, data);
  }

  /**
   * Publish and wait for response (request-response pattern)
   */
  public async publishAndWait(eventType: string, data: any, timeoutMs: number = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const correlationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const responseEventType = `${eventType}.response.${correlationId}`;

      // Set up timeout
      const timeout = setTimeout(() => {
        this.unsubscribe(responseEventType, responseHandler);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Set up response handler
      const responseHandler = async (message: EventMessage) => {
        clearTimeout(timeout);
        await this.unsubscribe(responseEventType, responseHandler);

        if (message.data.error) {
          reject(new Error(message.data.error));
        } else {
          resolve(message.data);
        }
      };

      // Subscribe to response
      this.subscribe(responseEventType, responseHandler).then(() => {
        // Publish request with correlation ID
        const requestMessage = {
          ...data,
          correlationId,
          responseEventType
        };

        return this.publish(eventType, requestMessage);
      }).catch(reject);
    });
  }

  /**
   * Send a request and wait for response (simple request/response pattern)
   * @param channel - The channel to send the request to
   * @param data - The data to send
   * @returns Promise with response data
   */
  async request(channel: string, data: any): Promise<any> {
    try {
      // Use the existing publishAndWaitForResponse method for request/response
      return await this.publishAndWaitForResponse(channel, data);
    } catch (error) {
      this.logger.error('Request failed', { error, channel, data });
      // Return a default response structure for compatibility
      return { success: false, error: error.message, data: null };
    }
  }

  /**
   * Get singleton instance of EventBusService
   */
  public static getInstance(config?: EventBusConfig, logger?: winston.Logger): EventBusService {
    if (!EventBusService.instance) {
      if (!config || !logger) {
        throw new Error('EventBusService requires config and logger on first instantiation');
      }
      EventBusService.instance = new EventBusService(config, logger);
    }
    return EventBusService.instance;
  }
}

// Export types
export type { EventMessage, EventHandler, SubscriptionOptions, EventBusConfig }; 