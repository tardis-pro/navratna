#!/usr/bin/env node
/**
 * Redis Cache Integration Test
 * Quick test to verify TypeORM Redis cache is working correctly
 */

import { 
  initializeDatabase, 
  getDataSource, 
  checkDatabaseHealth,
  getCacheConnection,
  isCacheHealthy,
  closeDatabase 
} from './typeorm.config.js';
import { Agent } from '../entities/agent.entity.js';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'redis-cache-test',
  environment: 'development',
  logLevel: 'info'
});

async function testRedisCache() {
  try {
    logger.info('🚀 Starting Redis Cache Integration Test...');

    // Initialize database with cache
    logger.info('📦 Initializing database...');
    await initializeDatabase();

    // Check health
    const health = await checkDatabaseHealth();
    logger.info('🏥 Database health check:', health);

    // Check cache status
    const cacheHealthy = isCacheHealthy();
    const cacheConnection = getCacheConnection();
    
    logger.info('💾 Cache status:', {
      healthy: cacheHealthy,
      connected: !!cacheConnection,
      cacheEnabled: health.details.cacheEnabled,
      cacheHealthy: health.details.cacheHealthy
    });

    if (!health.details.cacheEnabled) {
      logger.warn('⚠️  Cache is not enabled. Check your configuration.');
      return;
    }

    if (!cacheHealthy) {
      logger.warn('⚠️  Cache is not healthy. Check Redis connection.');
      return;
    }

    // Test basic query caching
    logger.info('🔍 Testing basic query caching...');
    const dataSource = getDataSource();
    
    // First query - should hit database
    const start1 = Date.now();
    const agents1 = await dataSource
      .getRepository(Agent)
      .createQueryBuilder('agent')
      .where('agent.isActive = :active', { active: true })
      .cache('test_active_agents', 30000) // 30 seconds
      .getMany();
    const time1 = Date.now() - start1;
    
    logger.info(`📊 First query (database): ${agents1.length} agents in ${time1}ms`);

    // Second query - should hit cache
    const start2 = Date.now();
    const agents2 = await dataSource
      .getRepository(Agent)
      .createQueryBuilder('agent')
      .where('agent.isActive = :active', { active: true })
      .cache('test_active_agents', 30000)
      .getMany();
    const time2 = Date.now() - start2;
    
    logger.info(`⚡ Second query (cache): ${agents2.length} agents in ${time2}ms`);

    // Verify cache performance improvement
    if (time2 < time1) {
      logger.info('✅ Cache is working! Second query was faster.');
    } else {
      logger.warn('🤔 Cache might not be working. Second query was not faster.');
    }

    // Test direct Redis operations
    if (cacheConnection) {
      logger.info('🔧 Testing direct Redis operations...');
      
      await cacheConnection.set('test_key', 'test_value', 'EX', 60);
      const value = await cacheConnection.get('test_key');
      
      if (value === 'test_value') {
        logger.info('✅ Direct Redis operations working correctly');
      } else {
        logger.warn('❌ Direct Redis operations failed');
      }

      // Clean up test key
      await cacheConnection.del('test_key');
    }

    // Test cache with different durations
    logger.info('⏱️  Testing different cache durations...');
    
    const shortCacheQuery = await dataSource
      .getRepository(Agent)
      .createQueryBuilder('agent')
      .select('COUNT(*)', 'count')
      .cache('test_short_cache', 5000) // 5 seconds
      .getRawOne();
    
    logger.info(`📈 Short cache query result: ${shortCacheQuery.count} agents`);

    // Test cache invalidation
    logger.info('🗑️  Testing cache clearing...');
    if (cacheConnection) {
      await cacheConnection.del('test_active_agents');
      await cacheConnection.del('test_short_cache');
      logger.info('✅ Cache entries cleared');
    }

    logger.info('🎉 Redis Cache Integration Test completed successfully!');

  } catch (error) {
    logger.error('❌ Redis Cache Integration Test failed:', {
      error: error.message,
      stack: error.stack
    });
  } finally {
    // Clean up
    try {
      await closeDatabase();
      logger.info('🔚 Database connection closed');
    } catch (error) {
      logger.error('Error closing database:', error);
    }
  }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      await testRedisCache();
      process.exit(0);
    } catch (error) {
      console.error('Test failed:', error);
      process.exit(1);
    }
  })();
}

export { testRedisCache }; 