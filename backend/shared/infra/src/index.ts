// Infrastructure services re-export
// Core infrastructure from @uaip/infra
export { EventBusService } from './eventBus.js';
export type {
  EventBusMessage,
  EventBusHandler,
  EventBusSubscriptionOptions,
  EventBusConfig,
  EventBusPublishContext,
  EventBusWrappedEvent,
} from '@uaip/types';

// Cache services
export { RedisCacheService, redisCacheService } from './cache/index.js';

// Placeholder re-exports for services still in shared/services
// TODO: Move these to @uaip/infra as part of P3 refactoring
// export { default as DatabaseService } from '../services/databaseService.js';
