/**
 * Post-Initialization Cache Enabler
 * Enables Redis cache after TypeORM is fully initialized to avoid hanging
 */

import { getDataSource, getCacheManager } from './typeorm.config.js';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'cache-enabler',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

/**
 * Enable Redis cache after TypeORM initialization
 * This is a workaround for the hanging issue during initialization
 */
export async function enableCacheAfterInit(): Promise<boolean> {
  try {
    // Check if TypeORM is initialized
    const dataSource = getDataSource();
    if (!dataSource.isInitialized) {
      logger.warn('TypeORM not initialized, cannot enable cache');
      return false;
    }

    // Get cache manager and try to establish connection if not healthy
    const cacheManager = getCacheManager();

    if (!cacheManager.isHealthy()) {
      logger.info('Redis cache manager not healthy, attempting to establish connection...');

      try {
        // Try to create Redis connection
        await cacheManager.createConnection();
        logger.info('Redis connection established successfully');
      } catch (error) {
        logger.warn('Failed to establish Redis connection', { error: error.message });
        return false;
      }
    }

    // Verify cache manager is now healthy
    if (!cacheManager.isHealthy()) {
      logger.warn('Redis cache manager still not healthy after connection attempt');
      return false;
    }

    logger.info('✅ Redis cache is ready for use with explicit .cache() calls');
    logger.info('💡 Use .cache(duration) or .cache(key, duration) in your queries');

    // Test cache functionality
    const redis = cacheManager.getConnection();
    if (redis) {
      await redis.set('cache_test', 'working', 'EX', 10);
      const testValue = await redis.get('cache_test');

      if (testValue === 'working') {
        logger.info('🧪 Cache test successful - Redis is working');
        await redis.del('cache_test');
        return true;
      } else {
        logger.warn('🧪 Cache test failed - Redis not responding correctly');
        return false;
      }
    }

    return false;
  } catch (error) {
    logger.error('Failed to enable cache after init', {
      error: error.message,
    });
    return false;
  }
}

/**
 * Example usage in your services
 */
export const cacheExamples = {
  // Cache a query for 5 minutes
  async getCachedAgents() {
    return await getDataSource()
      .getRepository('Agent')
      .find({
        where: { isActive: true },
        cache: 300000, // 5 minutes
      });
  },

  // Cache with custom key
  async getCachedStats() {
    return await getDataSource()
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from('agents', 'a')
      .where('a.is_active = true')
      .cache('active_agent_count', 180000) // 3 minutes
      .getRawOne();
  },

  // Manual cache operations
  async manualCacheOperations() {
    const cacheManager = getCacheManager();
    const redis = cacheManager.getConnection();

    if (redis) {
      // Set cache
      await redis.set('my_key', JSON.stringify({ data: 'value' }), 'EX', 300);

      // Get cache
      const cached = await redis.get('my_key');
      const data = cached ? JSON.parse(cached) : null;

      // Clear cache
      await redis.del('my_key');

      return data;
    }

    return null;
  },
};

export default enableCacheAfterInit;
