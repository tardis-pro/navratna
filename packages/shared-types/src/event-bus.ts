import type { Actor, Tenant, UAIPEvent } from './index.js';

export interface EventBusMessage {
  id: string;
  type: string;
  source: string;
  data: unknown;
  timestamp: Date;
  version: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export type EventBusHandler = (message: EventBusMessage) => Promise<void>;

export interface EventBusSubscriptionOptions {
  queue?: string;
  durable?: boolean;
  autoAck?: boolean;
  prefetch?: number;
  deadLetterExchange?: string;
  retryAttempts?: number;
}

export interface EventBusConfig {
  url: string;
  serviceName: string;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  exchangePrefix?: string;
  complianceMode?: boolean;
}

export interface EventBusPublishContext {
  actor?: Actor;
  tenant?: Tenant;
}

export type EventBusWrappedEvent = EventBusMessage | UAIPEvent;
