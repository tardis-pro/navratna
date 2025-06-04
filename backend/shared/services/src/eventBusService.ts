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
}

export class EventBusService {
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private subscribers: Map<string, EventHandler[]> = new Map();
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private config: EventBusConfig;
  private logger: winston.Logger;
  private isClosing: boolean = false;

  constructor(config: EventBusConfig, logger: winston.Logger) {
    this.config = config;
    this.logger = logger;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.reconnectDelay = config.reconnectDelay || 5000;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
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
        this.scheduleReconnect();
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.channel.on('error', (err: Error) => {
        this.logger.error('RabbitMQ channel error', { error: err.message });
      });

      this.channel.on('close', () => {
        this.logger.warn('RabbitMQ channel closed');
      });

      // Create default exchanges
      await this.setupExchanges();

      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      this.logger.info('Successfully connected to RabbitMQ');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to connect to RabbitMQ', { error: errorMessage });
      this.scheduleReconnect();
      throw new ApiError(500, 'Failed to connect to event bus', 'EVENT_BUS_ERROR');
    }
  }

  private async setupExchanges(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not available');
    }

    // Create topic exchange for events
    await this.channel.assertExchange('events', 'topic', { durable: true });
    
    // Create direct exchange for RPC-style communication
    await this.channel.assertExchange('rpc', 'direct', { durable: true });
    
    // Create dead letter exchange
    await this.channel.assertExchange('events.dlx', 'topic', { durable: true });

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
        
        // Re-establish all subscriptions
        const subscriberEntries = Array.from(this.subscribers.entries());
        for (const [eventType, handlers] of subscriberEntries) {
          for (const handler of handlers) {
            await this.subscribe(eventType, handler);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Reconnection attempt failed', { error: errorMessage });
      }
    }, delay);
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
    if (!this.isConnected || !this.channel) {
      throw new ApiError(500, 'Event bus not connected', 'EVENT_BUS_NOT_CONNECTED');
    }

    const message: EventMessage = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: eventType,
      source: this.config.serviceName,
      data,
      timestamp: new Date(),
      version: '1.0.0',
      correlationId: options?.correlationId,
      metadata: options?.metadata
    };

    try {
      const exchange = options?.exchange || 'events';
      const routingKey = options?.routingKey || eventType;
      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      const publishOptions = {
        persistent: options?.persistent !== false,
        messageId: message.id,
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
    if (!this.isConnected || !this.channel) {
      // Store subscription for later when connected
      if (!this.subscribers.has(eventType)) {
        this.subscribers.set(eventType, []);
      }
      this.subscribers.get(eventType)!.push(handler);
      return;
    }

    try {
      const queueName = options?.queue || `${this.config.serviceName}.${eventType}`;
      const exchange = 'events';
      
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

      // Set up consumer
      await this.channel.consume(queueName, async (msg: amqp.ConsumeMessage | null) => {
        if (!msg) return;

        try {
          const content = msg.content.toString();
          const eventMessage: EventMessage = JSON.parse(content);

          this.logger.debug('Processing event', {
            eventId: eventMessage.id,
            eventType: eventMessage.type,
            source: eventMessage.source
          });

          // Execute handler
          await handler(eventMessage);

          // Acknowledge message if not auto-ack
          if (!options?.autoAck && this.channel) {
            this.channel.ack(msg);
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
          if (options?.deadLetterExchange && this.channel) {
            this.channel.nack(msg, false, false);
          } else if (this.channel) {
            this.channel.nack(msg, false, true); // Requeue
          }
        }
      }, {
        noAck: options?.autoAck || false
      });

      // Store subscription
      if (!this.subscribers.has(eventType)) {
        this.subscribers.set(eventType, []);
      }
      this.subscribers.get(eventType)!.push(handler);

      this.logger.info('Successfully subscribed to event', {
        eventType,
        queueName,
        handlerCount: this.subscribers.get(eventType)!.length
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
}

// Export types
export type { EventMessage, EventHandler, SubscriptionOptions, EventBusConfig }; 