/**
 * Standalone Redis Cache Service
 * Independent of TypeORM, can be used for general caching needs
 */

import IORedis from 'ioredis';
import { config } from '@uaip/config';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'redis-cache-service',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info'
});

export class RedisCacheService {
  private static instance: RedisCacheService;
  private redis: IORedis | null = null;
  private isConnected = false;
  private connectionPromise: Promise<IORedis> | null = null;

  private constructor() {}

  static getInstance(): RedisCacheService {
    if (!RedisCacheService.instance) {
      RedisCacheService.instance = new RedisCacheService();
    }
    return RedisCacheService.instance;
  }

  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<boolean> {
    if (this.connectionPromise) {
      try {
        await this.connectionPromise;
        return this.isConnected;
      } catch (error) {
        return false;
      }
    }

    this.connectionPromise = this.createConnection();
    
    try {
      await this.connectionPromise;
      return this.isConnected;
    } catch (error) {
      logger.error('Failed to initialize Redis cache service', { error: error.message });
      return false;
    }
  }

  private async createConnection(): Promise<IORedis> {
    try {
      const redisConfig = config.redis;

      const connectionConfig = {
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * redisConfig.retryDelayOnFailover, 2000);
          logger.info(`Redis retry attempt ${times}, delay: ${delay}ms`);
          return delay;
        },
        maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
        commandTimeout: 5000,
        connectTimeout: 10000,
        lazyConnect: true,
        enableOfflineQueue: redisConfig.enableOfflineQueue,
        keepAlive: 30000,
        family: 4, // Force IPv4
      };

      logger.info('Creating Redis cache service connection', {
        host: connectionConfig.host,
        port: connectionConfig.port,
        db: connectionConfig.db,
        hasPassword: !!connectionConfig.password
      });

      this.redis = new IORedis(connectionConfig);

      // Set up event handlers
      this.redis.on('connect', () => {
        logger.info('Redis cache service connected');
        this.isConnected = true;
      });

      this.redis.on('ready', () => {
        logger.info('Redis cache service ready');
      });

      this.redis.on('error', (error) => {
        logger.error('Redis cache service error', { error: error.message });
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        logger.info('Redis cache service connection closed');
        this.isConnected = false;
      });

      this.redis.on('reconnecting', () => {
        logger.info('Redis cache service reconnecting...');
      });

      // Test connection with timeout
      await Promise.race([
        this.redis.ping(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis ping timeout')), 5000)
        )
      ]);

      this.isConnected = true;
      logger.info('Redis cache service connection verified');
      return this.redis;

    } catch (error) {
      logger.error('Redis cache service connection failed', { error: error.message });
      await this.close();
      throw error;
    }
  }

  /**
   * Get Redis client (initialize if needed)
   */
  async getClient(): Promise<IORedis | null> {
    if (!this.isConnected || !this.redis) {
      const initialized = await this.initialize();
      if (!initialized) {
        return null;
      }
    }
    return this.redis;
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.isConnected && this.redis !== null;
  }

  /**
   * Cache operations
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      const client = await this.getClient();
      if (!client) return false;

      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (ttlSeconds) {
        await client.setex(key, ttlSeconds, serializedValue);
      } else {
        await client.set(key, serializedValue);
      }
      
      return true;
    } catch (error) {
      logger.error('Redis SET failed', { key, error: error.message });
      return false;
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const client = await this.getClient();
      if (!client) return null;

      const value = await client.get(key);
      if (!value) return null;

      try {
        return JSON.parse(value);
      } catch {
        return value as T;
      }
    } catch (error) {
      logger.error('Redis GET failed', { key, error: error.message });
      return null;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      if (!client) return false;

      await client.del(key);
      return true;
    } catch (error) {
      logger.error('Redis DEL failed', { key, error: error.message });
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      if (!client) return false;

      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS failed', { key, error: error.message });
      return false;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      const client = await this.getClient();
      if (!client) return [];

      return await client.keys(pattern);
    } catch (error) {
      logger.error('Redis KEYS failed', { pattern, error: error.message });
      return [];
    }
  }

  async flushdb(): Promise<boolean> {
    try {
      const client = await this.getClient();
      if (!client) return false;

      await client.flushdb();
      logger.info('Redis database flushed');
      return true;
    } catch (error) {
      logger.error('Redis FLUSHDB failed', { error: error.message });
      return false;
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
        logger.info('Redis cache service connection closed gracefully');
      } catch (error) {
        logger.warn('Error closing Redis cache service connection', { error: error.message });
        this.redis.disconnect();
      }
      this.redis = null;
      this.isConnected = false;
      this.connectionPromise = null;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    connected: boolean;
    responseTime?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const client = await this.getClient();
      if (!client) {
        return {
          healthy: false,
          connected: false,
          error: 'No Redis connection'
        };
      }

      await client.ping();
      const responseTime = Date.now() - startTime;

      return {
        healthy: true,
        connected: true,
        responseTime
      };
    } catch (error) {
      return {
        healthy: false,
        connected: false,
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const redisCacheService = RedisCacheService.getInstance();

// Convenience functions
export const initializeRedisCache = () => redisCacheService.initialize();
export const getRedisClient = () => redisCacheService.getClient();
export const isRedisCacheHealthy = () => redisCacheService.isHealthy();

export default redisCacheService; 