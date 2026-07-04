// Infrastructure services re-export
// Core infrastructure from @uaip/infra
export { EventBusService } from './event_bus.js';
export type {
  EventBusMessage,
  EventBusHandler,
  EventBusSubscriptionOptions,
  EventBusConfig,
  EventBusPublishContext,
  EventBusWrappedEvent,
} from '@uaip/types';

// Cache services
export {
  RedisCacheService,
  redisCacheService,
  initializeRedisCache,
  getRedisClient,
  isRedisCacheHealthy,
} from './cache/index.js';

// Redis TLS helper (Upstash / rediss:// support)
export { getRedisTLSOptions, shouldUseRedisTLS } from './redis_tls.js';

// Database services
export { DatabaseService, DatabaseError } from './database/database_service.js';
export { PgService, pgService } from './database/pg_service.js';
