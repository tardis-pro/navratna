import { UserService } from './UserService.js';
import { CachedUserLLMProviderRepository } from '../database/repositories/CachedUserLLMProviderRepository.js';
import { CachedLLMProviderRepository } from '../database/repositories/CachedLLMProviderRepository.js';
import { UserEntity } from '../entities/user.entity.js';
import { UserLLMProviderType } from '../entities/userLLMProvider.entity.js';
import { LLMProviderType } from '@uaip/types';
import { redisCacheService } from '../redis-cache.service.js';
import { logger } from '@uaip/utils';

/**
 * Cached User Service
 * Extends UserService with Redis caching for improved performance
 */
export class CachedUserService extends UserService {
  private cachedUserLLMProviderRepository: CachedUserLLMProviderRepository | null = null;
  private cachedLLMProviderRepository: CachedLLMProviderRepository | null = null;

  constructor() {
    super();
  }

  private readonly CACHE_TTL = {
    USER_BY_EMAIL: 900, // 15 minutes
    USER_BY_ID: 900, // 15 minutes
    REFRESH_TOKEN: 300, // 5 minutes
    PASSWORD_RESET_TOKEN: 300, // 5 minutes
  };

  private readonly CACHE_KEYS = {
    USER_BY_EMAIL: (email: string) => `user:email:${email}`,
    USER_BY_ID: (id: string) => `user:id:${id}`,
    REFRESH_TOKEN: (token: string) => `refresh_token:${token}`,
    PASSWORD_RESET_TOKEN: (token: string) => `password_reset_token:${token}`,
  };

  /**
   * Get cached user LLM provider repository
   */
  public getCachedUserLLMProviderRepository(): CachedUserLLMProviderRepository {
    if (!this.cachedUserLLMProviderRepository) {
      this.cachedUserLLMProviderRepository = new CachedUserLLMProviderRepository();
    }
    return this.cachedUserLLMProviderRepository;
  }

  /**
   * Get cached LLM provider repository
   */
  public getCachedLLMProviderRepository(): CachedLLMProviderRepository {
    if (!this.cachedLLMProviderRepository) {
      this.cachedLLMProviderRepository = new CachedLLMProviderRepository();
    }
    return this.cachedLLMProviderRepository;
  }

  /**
   * Find user by email with caching
   */
  public async findUserByEmail(email: string, useCache = true): Promise<UserEntity | null> {
    const cacheKey = this.CACHE_KEYS.USER_BY_EMAIL(email);
    
    if (useCache) {
      const cached = await redisCacheService.get<UserEntity | null>(cacheKey);
      if (cached) {
        logger.debug('User by email retrieved from cache', { email });
        return cached;
      }
    }

    // Cache miss - get from database
    const user = await super.findUserByEmail(email);
    
    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, user, this.CACHE_TTL.USER_BY_EMAIL);
      logger.debug('User by email cached', { email, found: !!user });
    }

    return user;
  }

  /**
   * Find user by ID with caching
   */
  public async findUserById(id: string, useCache = true): Promise<UserEntity | null> {
    const cacheKey = this.CACHE_KEYS.USER_BY_ID(id);
    
    if (useCache) {
      const cached = await redisCacheService.get<UserEntity | null>(cacheKey);
      if (cached) {
        logger.debug('User by ID retrieved from cache', { id });
        return cached;
      }
    }

    // Cache miss - get from database
    const user = await super.findUserById(id);
    
    // Cache the result
    if (useCache) {
      await redisCacheService.set(cacheKey, user, this.CACHE_TTL.USER_BY_ID);
      logger.debug('User by ID cached', { id, found: !!user });
    }

    return user;
  }

  /**
   * Find refresh token with caching
   */
  public async findRefreshToken(token: string, useCache = true): Promise<any | null> {
    const cacheKey = this.CACHE_KEYS.REFRESH_TOKEN(token);
    
    if (useCache) {
      const cached = await redisCacheService.get(cacheKey);
      if (cached) {
        logger.debug('Refresh token retrieved from cache');
        return cached;
      }
    }

    // Cache miss - get from database
    const refreshToken = await super.findRefreshToken(token);
    
    // Cache the result
    if (useCache && refreshToken) {
      await redisCacheService.set(cacheKey, refreshToken, this.CACHE_TTL.REFRESH_TOKEN);
      logger.debug('Refresh token cached');
    }

    return refreshToken;
  }

  /**
   * Find password reset token with caching
   */
  public async findPasswordResetToken(token: string, useCache = true): Promise<any | null> {
    const cacheKey = this.CACHE_KEYS.PASSWORD_RESET_TOKEN(token);
    
    if (useCache) {
      const cached = await redisCacheService.get(cacheKey);
      if (cached) {
        logger.debug('Password reset token retrieved from cache');
        return cached;
      }
    }

    // Cache miss - get from database
    const resetToken = await super.findPasswordResetToken(token);
    
    // Cache the result
    if (useCache && resetToken) {
      await redisCacheService.set(cacheKey, resetToken, this.CACHE_TTL.PASSWORD_RESET_TOKEN);
      logger.debug('Password reset token cached');
    }

    return resetToken;
  }

  /**
   * Create user and invalidate cache
   */
  public async createUser(data: {
    email: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    department?: string;
    isOAuthUser?: boolean;
  }): Promise<UserEntity> {
    const user = await super.createUser(data);
    
    // Invalidate relevant caches
    await this.invalidateUserCache(user.id, user.email);
    
    return user;
  }

  /**
   * Update user and invalidate cache
   */
  public async updateUser(id: string, data: Partial<UserEntity>): Promise<UserEntity | null> {
    const user = await super.updateUser(id, data);
    
    if (user) {
      // Invalidate relevant caches
      await this.invalidateUserCache(id, user.email);
    }
    
    return user;
  }

  /**
   * Delete user and invalidate cache
   */
  public async deleteUser(id: string): Promise<boolean> {
    // Get user first to get email for cache invalidation
    const user = await this.findUserById(id, false);
    
    const result = await super.deleteUser(id);
    
    if (result && user) {
      // Invalidate relevant caches
      await this.invalidateUserCache(id, user.email);
    }
    
    return result;
  }

  /**
   * Revoke refresh token and invalidate cache
   */
  public async revokeRefreshToken(token: string): Promise<boolean> {
    const result = await super.revokeRefreshToken(token);
    
    if (result) {
      // Invalidate token cache
      await redisCacheService.del(this.CACHE_KEYS.REFRESH_TOKEN(token));
    }
    
    return result;
  }

  /**
   * Use password reset token and invalidate cache
   */
  public async usePasswordResetToken(token: string): Promise<boolean> {
    const result = await super.usePasswordResetToken(token);
    
    if (result) {
      // Invalidate token cache
      await redisCacheService.del(this.CACHE_KEYS.PASSWORD_RESET_TOKEN(token));
    }
    
    return result;
  }

  /**
   * Update password and invalidate cache
   */
  public async updatePassword(userId: string, newPassword: string): Promise<void> {
    await super.updatePassword(userId, newPassword);
    
    // Invalidate user cache
    const user = await this.findUserById(userId, false);
    if (user) {
      await this.invalidateUserCache(userId, user.email);
    }
  }

  /**
   * Invalidate user-specific caches
   */
  private async invalidateUserCache(userId: string, email: string): Promise<void> {
    const patterns = [
      this.CACHE_KEYS.USER_BY_ID(userId),
      this.CACHE_KEYS.USER_BY_EMAIL(email),
    ];

    for (const pattern of patterns) {
      await redisCacheService.del(pattern);
    }

    logger.debug('User cache invalidated', { userId, email });
  }

  /**
   * Invalidate all user-related caches
   */
  public async invalidateAllUserCaches(userId: string): Promise<void> {
    const patterns = [
      `user:id:${userId}`,
      `user:email:*`,
      `refresh_token:*`,
      `password_reset_token:*`,
    ];

    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        const keys = await redisCacheService.keys(pattern);
        for (const key of keys) {
          await redisCacheService.del(key);
        }
      } else {
        await redisCacheService.del(pattern);
      }
    }

    // Also invalidate LLM provider caches
    const cachedProviderRepo = this.getCachedUserLLMProviderRepository();
    await cachedProviderRepo.invalidateUserProviderCache(userId);

    logger.info('All user caches invalidated', { userId });
  }

  /**
   * Warm up cache for a user
   */
  public async warmUpUserCache(userId: string): Promise<void> {
    logger.info('Warming up user cache...', { userId });
    
    try {
      // Pre-load user data
      await this.findUserById(userId, true);
      
      // Pre-load user LLM providers
      const cachedProviderRepo = this.getCachedUserLLMProviderRepository();
      await cachedProviderRepo.findActiveProvidersByUser(userId, true);
      
      logger.info('User cache warmed up successfully', { userId });
    } catch (error) {
      logger.error('Error warming up user cache', { userId, error: error.message });
    }
  }

  /**
   * Get cache health status for user
   */
  public async getCacheHealthStatus(userId: string): Promise<{
    cached: boolean;
    keys: string[];
    stats: {
      userById: boolean;
      userByEmail: boolean;
      llmProviders: any;
    };
  }> {
    const user = await this.findUserById(userId, false);
    const keys = [
      this.CACHE_KEYS.USER_BY_ID(userId),
      user ? this.CACHE_KEYS.USER_BY_EMAIL(user.email) : null,
    ].filter(Boolean) as string[];

    const stats = {
      userById: await redisCacheService.exists(keys[0]),
      userByEmail: keys[1] ? await redisCacheService.exists(keys[1]) : false,
      llmProviders: await this.getCachedUserLLMProviderRepository().getCacheHealthStatus(userId),
    };

    return {
      cached: Object.values(stats).some(cached => typeof cached === 'boolean' ? cached : cached.cached),
      keys,
      stats
    };
  }

  /**
   * Bulk warm up caches for multiple users
   */
  public async bulkWarmUpUserCaches(userIds: string[]): Promise<void> {
    logger.info('Bulk warming up user caches...', { userCount: userIds.length });
    
    const promises = userIds.map(userId => this.warmUpUserCache(userId));
    await Promise.all(promises);
    
    logger.info('Bulk user cache warm-up completed', { userCount: userIds.length });
  }

  /**
   * Get comprehensive cache statistics
   */
  public async getCacheStatistics(): Promise<{
    totalKeys: number;
    userCacheKeys: number;
    llmProviderCacheKeys: number;
    tokenCacheKeys: number;
    cacheHealth: {
      connected: boolean;
      responseTime?: number;
    };
  }> {
    const client = await redisCacheService.getClient();
    if (!client) {
      return {
        totalKeys: 0,
        userCacheKeys: 0,
        llmProviderCacheKeys: 0,
        tokenCacheKeys: 0,
        cacheHealth: { connected: false }
      };
    }

    const [
      totalKeys,
      userKeys,
      llmProviderKeys,
      tokenKeys,
      health
    ] = await Promise.all([
      client.dbsize(),
      redisCacheService.keys('user:*'),
      redisCacheService.keys('llm_provider*'),
      redisCacheService.keys('*token*'),
      redisCacheService.healthCheck()
    ]);

    return {
      totalKeys,
      userCacheKeys: userKeys.length,
      llmProviderCacheKeys: llmProviderKeys.length,
      tokenCacheKeys: tokenKeys.length,
      cacheHealth: {
        connected: health.connected,
        responseTime: health.responseTime
      }
    };
  }
}