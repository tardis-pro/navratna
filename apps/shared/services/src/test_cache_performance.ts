#!/usr/bin/env node

/**
 * Cache Performance Test Script
 * Tests the performance improvements of Redis caching for LLM providers and knowledge data
 */

import { performance } from 'perf_hooks';
import {
  initializeCaching,
  getCacheManager,
  getCachedUserService,
  getCachedUserLLMProviderRepository,
} from './cache_integration';
import { redisCacheService } from './redis_cache_service';
import { logger as _logger } from '@uaip/utils';

class CachePerformanceTest {
  private testUserId = 'test-user-123';
  private testEmail = 'test@example.com';
  private testProviderId = 'test-provider-456';

  async runPerformanceTest(): Promise<void> {
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
    } catch (error) {
      console.error('❌ Cache performance test failed:', error.message);
      process.exit(1);
    }
  }

  private async initializeSystem(): Promise<void> {
    // Initialize caching without knowledge graph service for this test
    await initializeCaching();
  }

  private async testRedisConnection(): Promise<void> {
    const health = await redisCacheService.healthCheck();
    if (!health.healthy) {
      throw new Error(`Redis is not healthy: ${health.error}`);
    }
  }

  private async testLLMProviderCaching(): Promise<void> {
    const userProviderRepo = getCachedUserLLMProviderRepository();

    // Test 1: Cold cache (database query)

    const coldStart = performance.now();
    try {
      await userProviderRepo.findActiveProvidersByUser(this.testUserId, false); // Skip cache
    } catch {}
    const _coldTime = performance.now() - coldStart;

    // Test 2: Warm cache (Redis query)

    // First, populate cache with test data
    await redisCacheService.set(
      `llm_providers:active:${this.testUserId}`,
      [
        {
          id: 'test-provider-1',
          name: 'Test OpenAI Provider',
          type: 'OPENAI',
          isActive: true,
          priority: 1,
        },
        {
          id: 'test-provider-2',
          name: 'Test Anthropic Provider',
          type: 'ANTHROPIC',
          isActive: true,
          priority: 2,
        },
      ],
      300 // 5 minute TTL
    );

    const warmStart = performance.now();
    const _cachedProviders = await userProviderRepo.findActiveProvidersByUser(
      this.testUserId,
      true
    );
    const _warmTime = performance.now() - warmStart;
  }

  private async testUserCaching(): Promise<void> {
    const userService = getCachedUserService();

    // Test user by ID caching

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
        updatedAt: new Date(),
      },
      900 // 15 minute TTL
    );

    const userByIdStart = performance.now();
    const _cachedUser = await userService.findUserById(this.testUserId, true);
    const _userByIdTime = performance.now() - userByIdStart;

    // Test user by email caching

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
        updatedAt: new Date(),
      },
      900 // 15 minute TTL
    );

    const userByEmailStart = performance.now();
    const _cachedUserByEmail = await userService.findUserByEmail(this.testEmail, true);
    const _userByEmailTime = performance.now() - userByEmailStart;
  }

  private async testCacheInvalidation(): Promise<void> {
    const cacheManager = getCacheManager();

    // Test user cache invalidation

    // Check if cache exists before invalidation
    const beforeInvalidation = await redisCacheService.exists(`user:id:${this.testUserId}`);

    // Invalidate user cache
    await cacheManager.invalidateUserCache(this.testUserId);

    // Check if cache exists after invalidation
    const afterInvalidation = await redisCacheService.exists(`user:id:${this.testUserId}`);

    if (beforeInvalidation && !afterInvalidation) {
    } else {
    }
  }

  private async showPerformanceMetrics(): Promise<void> {
    const cacheManager = getCacheManager();
    const _health = await cacheManager.getHealthStatus();
    const _metrics = await cacheManager.getPerformanceMetrics();
  }

  async cleanup(): Promise<void> {
    // Clean up test cache keys
    const testKeys = [
      `user:id:${this.testUserId}`,
      `user:email:${this.testEmail}`,
      `llm_providers:active:${this.testUserId}`,
    ];

    await Promise.all(testKeys.map((key) => redisCacheService.del(key)));
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

  test
    .runPerformanceTest()
    .then(() => test.cleanup())
    .catch(async (error) => {
      console.error('Test failed:', error);
      await test.cleanup();
      process.exit(1);
    });
}

export { CachePerformanceTest };
