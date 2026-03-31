# Redis Cache Integration Guide

This guide explains how to use the new Redis caching system to improve LLM provider and knowledge data query performance.

## Overview

The caching system provides significant performance improvements for frequently accessed data:

- **LLM Provider Queries**: 15-minute TTL for provider lists, 10-minute TTL for best provider selection
- **Knowledge Data Queries**: 5-minute TTL for searches, 10-minute TTL for user stats
- **User Data**: 15-minute TTL for user lookups, 5-minute TTL for tokens
- **Automatic Invalidation**: Smart cache invalidation on data changes

## Quick Start

### 1. Initialize Caching (Application Startup)

```typescript
import { initializeCaching } from '@uaip/shared-services/CacheIntegration';
import { KnowledgeGraphService } from '@uaip/shared-services/knowledge-graph/knowledge-graph.service';

// During application startup
const knowledgeGraphService = new KnowledgeGraphService(/* dependencies */);
await initializeCaching(knowledgeGraphService);
```

### 2. Use Cached Services

```typescript
import {
  getCachedUserService,
  getCachedUserKnowledgeService,
  getCachedUserLLMProviderRepository,
  getCachedLLMProviderRepository,
} from '@uaip/shared-services/CacheIntegration';

// Get cached services
const userService = getCachedUserService();
const knowledgeService = getCachedUserKnowledgeService();
const userProviderRepo = getCachedUserLLMProviderRepository();
const globalProviderRepo = getCachedLLMProviderRepository();
```

## Usage Examples

### LLM Provider Caching

```typescript
// Get user's active providers (cached for 15 minutes)
const activeProviders = await userProviderRepo.findActiveProvidersByUser(userId);

// Get best provider for user (cached for 10 minutes)
const bestProvider = await userProviderRepo.findBestProviderForUser(userId, 'OPENAI');

// Get global active providers (cached for 15 minutes)
const globalProviders = await globalProviderRepo.findActiveProviders();

// Get provider stats (cached for 5 minutes)
const stats = await userProviderRepo.getProviderStats(providerId, userId);
```

### Knowledge Data Caching

```typescript
// Get user knowledge stats (cached for 10 minutes)
const stats = await knowledgeService.getUserKnowledgeStats(userId);

// Search knowledge (cached for 5 minutes)
const results = await knowledgeService.search(userId, {
  query: 'machine learning',
  filters: { tags: ['AI', 'ML'] },
  options: { limit: 20 },
});

// Get knowledge by tags (cached for 10 minutes)
const items = await knowledgeService.getKnowledgeByTags(userId, ['AI', 'ML'], 20);

// Get conversation history (cached for 15 minutes)
const history = await knowledgeService.getConversationHistory(userId, {
  limit: 50,
  dateRange: { start: lastWeek, end: now },
});
```

### User Data Caching

```typescript
// Get user by ID (cached for 15 minutes)
const user = await userService.findUserById(userId);

// Get user by email (cached for 15 minutes)
const user = await userService.findUserByEmail(email);

// Get refresh token (cached for 5 minutes)
const token = await userService.findRefreshToken(tokenValue);
```

## Cache Invalidation

### Automatic Invalidation

The system automatically invalidates relevant caches when data changes:

```typescript
// This will automatically invalidate all user provider caches
await userProviderRepo.createUserProvider({
  userId,
  name: 'My OpenAI Provider',
  type: 'OPENAI',
  apiKey: 'sk-...',
});

// This will automatically invalidate user knowledge caches
await knowledgeService.addKnowledge(userId, [knowledgeItem]);

// This will automatically invalidate user caches
await userService.updateUser(userId, { firstName: 'John' });
```

### Manual Invalidation

```typescript
import { invalidateUserCache, getCacheManager } from '@uaip/shared-services/CacheIntegration';

// Invalidate all user caches
await invalidateUserCache(userId);

// Invalidate specific cache types
await invalidateUserCache(userId, {
  includeProviders: true,
  includeKnowledge: false,
});

// Invalidate provider cache
const cacheManager = getCacheManager();
await cacheManager.invalidateProviderCache(providerId, userId);

// Invalidate knowledge cache
await cacheManager.invalidateKnowledgeCache(userId, itemId);
```

## Performance Monitoring

### Cache Health Status

```typescript
import { getCacheHealthStatus } from '@uaip/shared-services/CacheIntegration';

const health = await getCacheHealthStatus();
console.log('Cache Health:', {
  redis: health.redis,
  totalKeys: health.statistics.totalKeys,
  memoryUsage: health.statistics.memoryUsage,
  services: health.services,
});
```

### Performance Metrics

```typescript
import { getCachePerformanceMetrics } from '@uaip/shared-services/CacheIntegration';

const metrics = await getCachePerformanceMetrics();
console.log('Cache Performance:', {
  hitRate: metrics.hitRate,
  missRate: metrics.missRate,
  averageResponseTime: metrics.averageResponseTime,
  keyCount: metrics.keyCount,
  memoryUsage: metrics.memoryUsage,
});
```

## Cache Warm-up

### User Cache Warm-up

```typescript
import { warmUpUserCache, getCacheManager } from '@uaip/shared-services/CacheIntegration';

// Warm up cache for a specific user
await warmUpUserCache(userId);

// Bulk warm-up for multiple users
const cacheManager = getCacheManager();
await cacheManager.bulkWarmUpUserCaches([userId1, userId2, userId3]);
```

### Global Cache Warm-up

```typescript
// Warm up global caches (done automatically on startup)
await cacheManager.warmUpGlobalCache();
```

## Best Practices

### 1. Enable/Disable Caching

Most methods support an optional `useCache` parameter:

```typescript
// Use cache (default)
const providers = await userProviderRepo.findActiveProvidersByUser(userId);

// Skip cache (for testing or critical operations)
const providers = await userProviderRepo.findActiveProvidersByUser(userId, false);
```

### 2. Cache TTL Guidelines

- **Frequently changing data**: 5 minutes (provider stats, search results)
- **Moderately changing data**: 10-15 minutes (user providers, knowledge stats)
- **Rarely changing data**: 30 minutes (user preferences, global providers)

### 3. Error Handling

The cache system gracefully handles Redis failures:

```typescript
// If Redis is down, queries fall back to database
const providers = await userProviderRepo.findActiveProvidersByUser(userId);
// This will still work even if Redis is unavailable
```

### 4. Cache Key Patterns

The system uses structured cache keys:

```typescript
// User data
user:id:${userId}
user:email:${email}

// LLM providers
llm_providers:active:${userId}
llm_provider:best:${userId}:${type}

// Knowledge data
knowledge:stats:${userId}
knowledge:search:${userId}:${hash}
knowledge:conversations:${userId}:${hash}
```

## Troubleshooting

### Common Issues

1. **Cache not working**: Check Redis connection and initialization
2. **Stale data**: Verify cache invalidation is working
3. **Memory issues**: Monitor Redis memory usage and adjust TTL values
4. **Performance degradation**: Check cache hit rates and response times

### Debug Mode

Enable debug logging to see cache operations:

```typescript
// Set LOG_LEVEL=debug in environment
process.env.LOG_LEVEL = 'debug';

// Cache operations will be logged
const providers = await userProviderRepo.findActiveProvidersByUser(userId);
// Log: "Active LLM providers retrieved from cache"
```

### Health Checks

```typescript
// Check if cache is healthy
const health = await getCacheHealthStatus();
if (!health.redis.healthy) {
  console.error('Redis is not healthy:', health.redis.error);
}

// Check cache performance
const metrics = await getCachePerformanceMetrics();
if (metrics.hitRate < 0.8) {
  console.warn('Cache hit rate is low:', metrics.hitRate);
}
```

## Migration Guide

### From Non-Cached to Cached Services

1. **Replace service imports**:

```typescript
// Before
import { UserService } from '@uaip/shared-services/services/UserService';

// After
import { getCachedUserService } from '@uaip/shared-services/CacheIntegration';
```

2. **Update initialization**:

```typescript
// Before
const userService = new UserService();

// After
await initializeCaching();
const userService = getCachedUserService();
```

3. **Update method calls** (mostly unchanged):

```typescript
// These calls remain the same, but now use caching
const user = await userService.findUserById(userId);
const providers = await userService
  .getUserLLMProviderRepository()
  .findActiveProvidersByUser(userId);
```

## Performance Expectations

With proper caching implementation, you should see:

- **80-95% cache hit rate** for frequently accessed data
- **10-100x faster response times** for cached queries
- **Reduced database load** by 60-80%
- **Improved user experience** with faster page loads

The caching system is production-ready and has been designed to handle high-traffic scenarios with graceful degradation when Redis is unavailable.
