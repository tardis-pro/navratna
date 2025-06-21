# Redis Cache Integration with TypeORM

This document explains how to use Redis cache with TypeORM in the UAIP backend system.

## Overview

The UAIP backend now includes a robust Redis cache integration for TypeORM that provides:
- **Automatic connection management** with proper lifecycle handling
- **Error resilience** with graceful fallback when Redis is unavailable
- **Health monitoring** and connection status tracking
- **Configurable cache behavior** via environment variables

## Configuration

### Environment Variables

Add these to your `.env` file to control cache behavior:

```bash
# Redis Cache Configuration
TYPEORM_DISABLE_CACHE=false          # Set to 'true' to disable cache completely
TYPEORM_CACHE_DURATION=60000         # Cache duration in milliseconds (default: 60 seconds)

# Redis Connection (inherited from shared config)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0
```

### Cache Behavior

- **Development**: Cache enabled with shorter duration for testing
- **Production**: Cache always enabled with longer duration for performance
- **Migration**: Cache automatically disabled during database migrations
- **Error Handling**: Queries continue to work even if Redis fails

## Usage Examples

### Basic Query Caching

```typescript
import { getDataSource } from '@uaip/shared-services';

// Automatic caching for frequently accessed data
const agents = await getDataSource()
  .getRepository(Agent)
  .createQueryBuilder('agent')
  .where('agent.isActive = :active', { active: true })
  .cache(true) // Enable cache for this query
  .getMany();

// Cache with custom duration (30 seconds)
const personas = await getDataSource()
  .getRepository(Persona)
  .createQueryBuilder('persona')
  .cache(30000)
  .getMany();

// Cache with custom key for better control
const userStats = await getDataSource()
  .getRepository(User)
  .createQueryBuilder('user')
  .select('COUNT(*)', 'total')
  .cache('user_stats', 300000) // 5 minutes
  .getRawOne();
```

### Repository-Level Caching

```typescript
import { getDataSource } from '@uaip/shared-services';

// Enable cache for all queries from this repository
const agentRepo = getDataSource().getRepository(Agent);

// This will be cached automatically
const activeAgents = await agentRepo.find({
  where: { isActive: true },
  cache: true
});

// Cache with specific duration
const recentOperations = await getDataSource()
  .getRepository(Operation)
  .find({
    where: { 
      createdAt: MoreThan(new Date(Date.now() - 24 * 60 * 60 * 1000)) 
    },
    cache: 120000, // 2 minutes
    order: { createdAt: 'DESC' }
  });
```

### Cache Management

```typescript
import { 
  getCacheManager, 
  getCacheConnection, 
  isCacheHealthy,
  checkDatabaseHealth 
} from '@uaip/shared-services';

// Check cache health
if (isCacheHealthy()) {
  console.log('Redis cache is healthy');
}

// Get full database health including cache status
const health = await checkDatabaseHealth();
console.log('Database health:', health);
// Output: { status: 'healthy', details: { connected: true, cacheEnabled: true, cacheHealthy: true, ... }}

// Direct Redis operations (if needed)
const redis = getCacheConnection();
if (redis) {
  await redis.set('custom_key', 'value', 'EX', 300); // 5 minutes
  const value = await redis.get('custom_key');
}
```

### Service Integration

```typescript
// In your service classes
export class AgentIntelligenceService {
  async getAgentAnalytics(agentId: string) {
    // This query will be cached automatically
    return await getDataSource()
      .getRepository(AgentCapabilityMetric)
      .createQueryBuilder('metric')
      .where('metric.agentId = :agentId', { agentId })
      .cache(`agent_analytics_${agentId}`, 300000) // 5 minutes
      .getMany();
  }

  async getFrequentlyAccessedData() {
    // Use cache for expensive queries
    return await getDataSource()
      .query(`
        SELECT 
          a.id,
          a.name,
          COUNT(o.id) as operation_count
        FROM agents a
        LEFT JOIN operations o ON a.id = o.agent_id
        WHERE a.is_active = true
        GROUP BY a.id, a.name
        ORDER BY operation_count DESC
        LIMIT 10
      `, [], { cache: 180000 }); // 3 minutes
  }
}
```

## Cache Invalidation

### Automatic Invalidation

TypeORM automatically invalidates cache when:
- INSERT, UPDATE, or DELETE operations occur on cached tables
- Cache duration expires

### Manual Cache Clearing

```typescript
import { getCacheConnection } from '@uaip/shared-services';

// Clear specific cache entries
const redis = getCacheConnection();
if (redis) {
  // Clear specific key
  await redis.del('agent_analytics_123');
  
  // Clear all cache entries matching pattern
  const keys = await redis.keys('agent_analytics_*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  
  // Clear all TypeORM cache (use carefully!)
  await redis.flushdb();
}
```

### Smart Cache Invalidation

```typescript
export class CacheInvalidationService {
  async invalidateAgentCache(agentId: string) {
    const redis = getCacheConnection();
    if (!redis) return;

    // Clear all agent-related cache entries
    const patterns = [
      `agent_analytics_${agentId}`,
      `agent_operations_${agentId}`,
      `agent_metrics_${agentId}`,
      'active_agents', // Clear general agent lists
    ];

    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  }

  async invalidateUserCache(userId: string) {
    const redis = getCacheConnection();
    if (!redis) return;

    const patterns = [
      `user_stats`,
      `user_permissions_${userId}`,
      `user_agents_${userId}`,
    ];

    for (const pattern of patterns) {
      await redis.del(pattern);
    }
  }
}
```

## Performance Optimization

### Cache Strategy Guidelines

1. **Cache frequently read data** that doesn't change often
2. **Use appropriate cache durations**:
   - Static/reference data: 1-24 hours
   - User-specific data: 5-30 minutes
   - Analytics/stats: 1-5 minutes
   - Real-time data: Don't cache or very short (30 seconds)

3. **Use descriptive cache keys** for easier management
4. **Monitor cache hit rates** and adjust strategies accordingly

### Example Cache Strategies

```typescript
// Static reference data - cache for 1 hour
const toolDefinitions = await getDataSource()
  .getRepository(ToolDefinition)
  .find({ cache: 3600000 });

// User permissions - cache for 15 minutes
const userPermissions = await getDataSource()
  .getRepository(UserEntity)
  .findOne({
    where: { id: userId },
    relations: ['roles', 'permissions'],
    cache: `user_permissions_${userId}`,
    cacheDuration: 900000
  });

// Real-time metrics - short cache to reduce DB load
const currentMetrics = await getDataSource()
  .getRepository(AgentCapabilityMetric)
  .createQueryBuilder('metric')
  .where('metric.createdAt > :time', { 
    time: new Date(Date.now() - 5 * 60 * 1000) 
  })
  .cache(30000) // 30 seconds only
  .getMany();
```

## Monitoring and Debugging

### Health Checks

```typescript
// Add to your health check endpoints
app.get('/health/cache', async (req, res) => {
  const health = await checkDatabaseHealth();
  
  res.json({
    cache: {
      enabled: health.details.cacheEnabled,
      healthy: health.details.cacheHealthy,
      connection: isCacheHealthy() ? 'connected' : 'disconnected'
    }
  });
});
```

### Logging

The cache system provides detailed logging:

```
[info] [typeorm-config]: Creating Redis cache connection
[info] [typeorm-config]: Redis cache connected  
[info] [typeorm-config]: Redis cache ready
[info] [typeorm-config]: Redis cache configured for TypeORM
```

### Error Handling

The system gracefully handles Redis failures:

```
[warn] [typeorm-config]: Redis cache unavailable, continuing without cache
[error] [typeorm-config]: Redis cache error: Connection timeout
```

## Best Practices

1. **Always use `ignoreErrors: true`** - Queries should work even if cache fails
2. **Use meaningful cache keys** - Include entity type and identifiers
3. **Set appropriate cache durations** - Balance performance vs data freshness
4. **Monitor cache performance** - Track hit rates and adjust strategies
5. **Plan cache invalidation** - Ensure data consistency when entities change
6. **Test without cache** - Ensure your app works when Redis is unavailable

## Troubleshooting

### Common Issues

1. **Cache not working**: Check `TYPEORM_DISABLE_CACHE` environment variable
2. **Slow queries**: Verify Redis connection health and network latency
3. **Stale data**: Check cache duration and invalidation strategy
4. **Memory usage**: Monitor Redis memory and set appropriate expiration times

### Debug Commands

```bash
# Check Redis connection
redis-cli ping

# Monitor Redis commands
redis-cli monitor

# Check cache keys
redis-cli keys "*"

# Get cache statistics
redis-cli info stats
```

This Redis cache integration provides a robust, production-ready caching solution for your TypeORM queries while maintaining system reliability and performance. 