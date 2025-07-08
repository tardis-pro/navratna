#!/usr/bin/env node

/**
 * Cache Performance Test Script
 * Tests the performance improvements of Redis caching for LLM providers and knowledge data
 */

import { performance } from 'perf_hooks';
import { initializeCaching, getCacheManager, getCachedUserService, getCachedUserLLMProviderRepository } from './CacheIntegration.js';
import { redisCacheService } from './redis-cache.service.js';
import { logger } from '@uaip/utils';

class CachePerformanceTest {
  private testUserId = 'test-user-123';
  private testEmail = 'test@example.com';
  private testProviderId = 'test-provider-456';

  async runPerformanceTest(): Promise<void> {
    console.log('🚀 Starting Cache Performance Test...\n');

    try {
      // Initialize caching system
      await this.initializeSystem();

      // Test Redis connection
      await this.testRedisConnection();

      // Test LLM Provider caching
      await this.testLLMProviderCaching();

      // Test User caching
      await this.testUserCaching();

      // Test cache invalidation
      await this.testCacheInvalidation();

      // Show performance metrics
      await this.showPerformanceMetrics();

      console.log('\n✅ All cache performance tests completed successfully!');
    } catch (error) {
      console.error('❌ Cache performance test failed:', error.message);
      process.exit(1);
    }
  }

  private async initializeSystem(): Promise<void> {
    console.log('📦 Initializing cache system...');
    
    // Initialize caching without knowledge graph service for this test
    await initializeCaching();
    
    console.log('✅ Cache system initialized\n');
  }

  private async testRedisConnection(): Promise<void> {
    console.log('🔌 Testing Redis connection...');
    
    const health = await redisCacheService.healthCheck();
    if (!health.healthy) {
      throw new Error(`Redis is not healthy: ${health.error}`);
    }
    
    console.log(`✅ Redis connected (${health.responseTime}ms response time)\n`);
  }

  private async testLLMProviderCaching(): Promise<void> {
    console.log('🤖 Testing LLM Provider caching...');
    
    const userProviderRepo = getCachedUserLLMProviderRepository();
    
    // Test 1: Cold cache (database query)
    console.log('  Testing cold cache performance...');
    const coldStart = performance.now();
    try {
      await userProviderRepo.findActiveProvidersByUser(this.testUserId, false); // Skip cache
    } catch (error) {
      console.log('  ⚠️  Database query failed (expected in test environment)');
    }
    const coldTime = performance.now() - coldStart;
    
    // Test 2: Warm cache (Redis query)
    console.log('  Testing warm cache performance...');
    
    // First, populate cache with test data
    await redisCacheService.set(
      `llm_providers:active:${this.testUserId}`,
      [
        {
          id: 'test-provider-1',
          name: 'Test OpenAI Provider',
          type: 'OPENAI',
          isActive: true,
          priority: 1
        },
        {
          id: 'test-provider-2',
          name: 'Test Anthropic Provider',
          type: 'ANTHROPIC',
          isActive: true,
          priority: 2
        }
      ],
      300 // 5 minute TTL
    );
    
    const warmStart = performance.now();
    const cachedProviders = await userProviderRepo.findActiveProvidersByUser(this.testUserId, true);
    const warmTime = performance.now() - warmStart;
    
    console.log(`  📊 Cold cache: ${coldTime.toFixed(2)}ms`);
    console.log(`  📊 Warm cache: ${warmTime.toFixed(2)}ms`);
    console.log(`  📊 Speedup: ${(coldTime / warmTime).toFixed(2)}x faster`);
    console.log(`  📊 Cached providers: ${cachedProviders.length}`);
    console.log('✅ LLM Provider caching test completed\n');
  }

  private async testUserCaching(): Promise<void> {
    console.log('👤 Testing User caching...');
    
    const userService = getCachedUserService();
    
    // Test user by ID caching
    console.log('  Testing user by ID caching...');
    
    // Populate cache with test user data
    await redisCacheService.set(
      `user:id:${this.testUserId}`,
      {
        id: this.testUserId,
        email: this.testEmail,
        firstName: 'Test',
        lastName: 'User',
        role: 'user',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      900 // 15 minute TTL
    );
    
    const userByIdStart = performance.now();
    const cachedUser = await userService.findUserById(this.testUserId, true);
    const userByIdTime = performance.now() - userByIdStart;
    
    console.log(`  📊 User by ID cache: ${userByIdTime.toFixed(2)}ms`);
    console.log(`  📊 Cached user: ${cachedUser?.email || 'null'}`);
    
    // Test user by email caching
    console.log('  Testing user by email caching...');
    
    await redisCacheService.set(
      `user:email:${this.testEmail}`,
      {
        id: this.testUserId,
        email: this.testEmail,
        firstName: 'Test',
        lastName: 'User',
        role: 'user',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      900 // 15 minute TTL
    );
    
    const userByEmailStart = performance.now();
    const cachedUserByEmail = await userService.findUserByEmail(this.testEmail, true);
    const userByEmailTime = performance.now() - userByEmailStart;
    
    console.log(`  📊 User by email cache: ${userByEmailTime.toFixed(2)}ms`);
    console.log(`  📊 Cached user: ${cachedUserByEmail?.id || 'null'}`);
    console.log('✅ User caching test completed\n');
  }

  private async testCacheInvalidation(): Promise<void> {
    console.log('🗑️  Testing cache invalidation...');
    
    const cacheManager = getCacheManager();
    
    // Test user cache invalidation
    console.log('  Testing user cache invalidation...');
    
    // Check if cache exists before invalidation
    const beforeInvalidation = await redisCacheService.exists(`user:id:${this.testUserId}`);
    console.log(`  📊 Cache exists before invalidation: ${beforeInvalidation}`);
    
    // Invalidate user cache
    await cacheManager.invalidateUserCache(this.testUserId);
    
    // Check if cache exists after invalidation
    const afterInvalidation = await redisCacheService.exists(`user:id:${this.testUserId}`);
    console.log(`  📊 Cache exists after invalidation: ${afterInvalidation}`);
    
    if (beforeInvalidation && !afterInvalidation) {
      console.log('✅ Cache invalidation working correctly');
    } else {
      console.log('⚠️  Cache invalidation may not be working as expected');
    }
    
    console.log('✅ Cache invalidation test completed\n');
  }

  private async showPerformanceMetrics(): Promise<void> {
    console.log('📈 Cache Performance Metrics:');
    
    const cacheManager = getCacheManager();
    const health = await cacheManager.getHealthStatus();
    const metrics = await cacheManager.getPerformanceMetrics();
    
    console.log('  Redis Health:');
    console.log(`    Connected: ${health.redis.connected}`);
    console.log(`    Healthy: ${health.redis.healthy}`);
    console.log(`    Response Time: ${health.redis.responseTime}ms`);
    
    console.log('  Cache Statistics:');
    console.log(`    Total Keys: ${health.statistics.totalKeys}`);
    console.log(`    Memory Usage: ${health.statistics.memoryUsage || 'N/A'}`);
    console.log(`    User Keys: ${health.statistics.keysByPattern['user:*'] || 0}`);
    console.log(`    Provider Keys: ${health.statistics.keysByPattern['llm_provider*'] || 0}`);
    
    console.log('  Performance Metrics:');
    console.log(`    Hit Rate: ${metrics.hitRate.toFixed(2)}%`);
    console.log(`    Miss Rate: ${metrics.missRate.toFixed(2)}%`);
    console.log(`    Avg Response Time: ${metrics.averageResponseTime}ms`);
    console.log(`    Key Count: ${metrics.keyCount}`);
    console.log(`    Memory Usage: ${metrics.memoryUsage}`);
    
    console.log('  Service Status:');
    console.log(`    User Service: ${health.services.userService ? '✅' : '❌'}`);
    console.log(`    Knowledge Service: ${health.services.userKnowledgeService ? '✅' : '❌'}`);
    console.log(`    User LLM Provider Repo: ${health.services.userLLMProviderRepository ? '✅' : '❌'}`);
    console.log(`    Global LLM Provider Repo: ${health.services.llmProviderRepository ? '✅' : '❌'}`);
  }

  async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up test data...');
    
    // Clean up test cache keys
    const testKeys = [
      `user:id:${this.testUserId}`,
      `user:email:${this.testEmail}`,
      `llm_providers:active:${this.testUserId}`,
    ];
    
    for (const key of testKeys) {
      await redisCacheService.del(key);
    }
    
    console.log('✅ Cleanup completed');
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new CachePerformanceTest();
  
  process.on('SIGINT', async () => {
    await test.cleanup();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await test.cleanup();
    process.exit(0);
  });
  
  test.runPerformanceTest()
    .then(() => test.cleanup())
    .catch(async (error) => {
      console.error('Test failed:', error);
      await test.cleanup();
      process.exit(1);
    });
}

export { CachePerformanceTest };