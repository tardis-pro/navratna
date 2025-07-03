import Redis from 'ioredis';
import { logger } from '@uaip/utils';
import { WebSocketConnection } from './discussionWebSocketHandler.js';

export interface WebSocketSession {
  connectionId: string;
  userId: string;
  discussionId: string;
  participantId?: string;
  securityLevel: number;
  authenticated: boolean;
  connectedAt: Date;
  lastActivity: Date;
  messageCount: number;
  rateLimitReset: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface RateLimitData {
  messages: { count: number; resetTime: number };
  typing: { count: number; resetTime: number };
  reactions: { count: number; resetTime: number };
  turns: { count: number; resetTime: number };
}

export class RedisSessionManager {
  private redis: Redis;
  private readonly SESSION_PREFIX = 'ws:session:';
  private readonly USER_CONNECTIONS_PREFIX = 'ws:user:';
  private readonly DISCUSSION_CONNECTIONS_PREFIX = 'ws:discussion:';
  private readonly RATE_LIMIT_PREFIX = 'ws:ratelimit:';
  private readonly SESSION_TTL = 24 * 60 * 60; // 24 hours
  private readonly RATE_LIMIT_TTL = 60; // 1 minute

  constructor(redisConfig?: any) {
    this.redis = new Redis({
      host: redisConfig?.host || process.env.REDIS_HOST || 'localhost',
      port: redisConfig?.port || parseInt(process.env.REDIS_PORT || '6379'),
      password: redisConfig?.password || process.env.REDIS_PASSWORD,
      db: redisConfig?.db || parseInt(process.env.REDIS_DB || '2'), // Use DB 2 for WebSocket sessions
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      commandTimeout: 5000,
    });

    this.redis.on('connect', () => {
      logger.info('Redis WebSocket session manager connected');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis WebSocket session manager error:', error);
    });

    this.redis.on('ready', () => {
      logger.info('Redis WebSocket session manager ready');
    });
  }

  /**
   * Create a new WebSocket session
   */
  async createSession(connection: WebSocketConnection, ipAddress?: string, userAgent?: string): Promise<void> {
    try {
      const session: WebSocketSession = {
        connectionId: connection.connectionId,
        userId: connection.userId!,
        discussionId: connection.discussionId,
        participantId: connection.participantId,
        securityLevel: connection.securityLevel,
        authenticated: connection.authenticated,
        connectedAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0,
        rateLimitReset: Date.now() + 60000,
        ipAddress,
        userAgent
      };

      const pipeline = this.redis.pipeline();
      
      // Store session data
      pipeline.setex(
        `${this.SESSION_PREFIX}${connection.connectionId}`,
        this.SESSION_TTL,
        JSON.stringify(session)
      );

      // Add connection to user's connection set
      pipeline.sadd(
        `${this.USER_CONNECTIONS_PREFIX}${connection.userId}`,
        connection.connectionId
      );
      pipeline.expire(`${this.USER_CONNECTIONS_PREFIX}${connection.userId}`, this.SESSION_TTL);

      // Add connection to discussion's connection set
      pipeline.sadd(
        `${this.DISCUSSION_CONNECTIONS_PREFIX}${connection.discussionId}`,
        connection.connectionId
      );
      pipeline.expire(`${this.DISCUSSION_CONNECTIONS_PREFIX}${connection.discussionId}`, this.SESSION_TTL);

      // Initialize rate limiting data
      const rateLimitData: RateLimitData = {
        messages: { count: 0, resetTime: Date.now() + 60000 },
        typing: { count: 0, resetTime: Date.now() + 60000 },
        reactions: { count: 0, resetTime: Date.now() + 60000 },
        turns: { count: 0, resetTime: Date.now() + 60000 }
      };
      
      pipeline.setex(
        `${this.RATE_LIMIT_PREFIX}${connection.connectionId}`,
        this.RATE_LIMIT_TTL,
        JSON.stringify(rateLimitData)
      );

      await pipeline.exec();

      logger.info('WebSocket session created in Redis', {
        connectionId: connection.connectionId,
        userId: connection.userId,
        discussionId: connection.discussionId,
        securityLevel: connection.securityLevel
      });

    } catch (error) {
      logger.error('Failed to create WebSocket session in Redis', {
        connectionId: connection.connectionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get session data for a connection
   */
  async getSession(connectionId: string): Promise<WebSocketSession | null> {
    try {
      const sessionData = await this.redis.get(`${this.SESSION_PREFIX}${connectionId}`);
      
      if (!sessionData) {
        return null;
      }

      const session = JSON.parse(sessionData) as WebSocketSession;
      
      // Convert date strings back to Date objects
      session.connectedAt = new Date(session.connectedAt);
      session.lastActivity = new Date(session.lastActivity);

      return session;
    } catch (error) {
      logger.error('Failed to get WebSocket session from Redis', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Update session activity
   */
  async updateActivity(connectionId: string, messageCount?: number): Promise<void> {
    try {
      const session = await this.getSession(connectionId);
      if (!session) {
        logger.warn('Cannot update activity: session not found', { connectionId });
        return;
      }

      session.lastActivity = new Date();
      if (messageCount !== undefined) {
        session.messageCount = messageCount;
      }

      await this.redis.setex(
        `${this.SESSION_PREFIX}${connectionId}`,
        this.SESSION_TTL,
        JSON.stringify(session)
      );

    } catch (error) {
      logger.error('Failed to update session activity', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Remove session and clean up all references
   */
  async removeSession(connectionId: string): Promise<void> {
    try {
      // Get session first to know what to clean up
      const session = await this.getSession(connectionId);
      
      if (session) {
        const pipeline = this.redis.pipeline();
        
        // Remove session data
        pipeline.del(`${this.SESSION_PREFIX}${connectionId}`);
        
        // Remove from user connections
        pipeline.srem(`${this.USER_CONNECTIONS_PREFIX}${session.userId}`, connectionId);
        
        // Remove from discussion connections
        pipeline.srem(`${this.DISCUSSION_CONNECTIONS_PREFIX}${session.discussionId}`, connectionId);
        
        // Remove rate limiting data
        pipeline.del(`${this.RATE_LIMIT_PREFIX}${connectionId}`);
        
        await pipeline.exec();

        logger.info('WebSocket session removed from Redis', {
          connectionId,
          userId: session.userId,
          discussionId: session.discussionId
        });
      } else {
        // Still try to clean up any orphaned data
        const pipeline = this.redis.pipeline();
        pipeline.del(`${this.SESSION_PREFIX}${connectionId}`);
        pipeline.del(`${this.RATE_LIMIT_PREFIX}${connectionId}`);
        await pipeline.exec();
      }

    } catch (error) {
      logger.error('Failed to remove WebSocket session from Redis', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get all connections for a user
   */
  async getUserConnections(userId: string): Promise<string[]> {
    try {
      return await this.redis.smembers(`${this.USER_CONNECTIONS_PREFIX}${userId}`);
    } catch (error) {
      logger.error('Failed to get user connections from Redis', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Get all connections for a discussion
   */
  async getDiscussionConnections(discussionId: string): Promise<string[]> {
    try {
      return await this.redis.smembers(`${this.DISCUSSION_CONNECTIONS_PREFIX}${discussionId}`);
    } catch (error) {
      logger.error('Failed to get discussion connections from Redis', {
        discussionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Check connection limits for a user
   */
  async checkConnectionLimits(userId: string, maxConnections: number = 5): Promise<boolean> {
    try {
      const connections = await this.getUserConnections(userId);
      return connections.length < maxConnections;
    } catch (error) {
      logger.error('Failed to check connection limits', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false; // Deny on error
    }
  }

  /**
   * Check and update rate limits
   */
  async checkRateLimit(connectionId: string, type: keyof RateLimitData, maxPerMinute: number): Promise<boolean> {
    try {
      const rateLimitData = await this.redis.get(`${this.RATE_LIMIT_PREFIX}${connectionId}`);
      
      if (!rateLimitData) {
        // Initialize if not exists
        const newRateLimitData: RateLimitData = {
          messages: { count: 0, resetTime: Date.now() + 60000 },
          typing: { count: 0, resetTime: Date.now() + 60000 },
          reactions: { count: 0, resetTime: Date.now() + 60000 },
          turns: { count: 0, resetTime: Date.now() + 60000 }
        };
        
        await this.redis.setex(
          `${this.RATE_LIMIT_PREFIX}${connectionId}`,
          this.RATE_LIMIT_TTL,
          JSON.stringify(newRateLimitData)
        );
        
        newRateLimitData[type].count = 1;
        await this.redis.setex(
          `${this.RATE_LIMIT_PREFIX}${connectionId}`,
          this.RATE_LIMIT_TTL,
          JSON.stringify(newRateLimitData)
        );
        
        return true;
      }

      const limits = JSON.parse(rateLimitData) as RateLimitData;
      const now = Date.now();
      const typeLimit = limits[type];

      // Reset counter if time window has passed
      if (now > typeLimit.resetTime) {
        typeLimit.count = 0;
        typeLimit.resetTime = now + 60000;
      }

      // Check if under limit
      if (typeLimit.count >= maxPerMinute) {
        return false;
      }

      // Increment counter
      typeLimit.count++;
      
      // Update in Redis
      await this.redis.setex(
        `${this.RATE_LIMIT_PREFIX}${connectionId}`,
        this.RATE_LIMIT_TTL,
        JSON.stringify(limits)
      );

      return true;

    } catch (error) {
      logger.error('Failed to check rate limit', {
        connectionId,
        type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false; // Deny on error
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    totalSessions: number;
    activeUsers: number;
    activeDiscussions: number;
  }> {
    try {
      const sessionKeys = await this.redis.keys(`${this.SESSION_PREFIX}*`);
      const userKeys = await this.redis.keys(`${this.USER_CONNECTIONS_PREFIX}*`);
      const discussionKeys = await this.redis.keys(`${this.DISCUSSION_CONNECTIONS_PREFIX}*`);

      return {
        totalSessions: sessionKeys.length,
        activeUsers: userKeys.length,
        activeDiscussions: discussionKeys.length
      };
    } catch (error) {
      logger.error('Failed to get session stats', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        totalSessions: 0,
        activeUsers: 0,
        activeDiscussions: 0
      };
    }
  }

  /**
   * Clean up expired sessions (should be called periodically)
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      // Redis will automatically expire keys, but we can clean up orphaned references
      const userKeys = await this.redis.keys(`${this.USER_CONNECTIONS_PREFIX}*`);
      const discussionKeys = await this.redis.keys(`${this.DISCUSSION_CONNECTIONS_PREFIX}*`);

      for (const userKey of userKeys) {
        const connections = await this.redis.smembers(userKey);
        const validConnections = [];
        
        for (const connectionId of connections) {
          const exists = await this.redis.exists(`${this.SESSION_PREFIX}${connectionId}`);
          if (exists) {
            validConnections.push(connectionId);
          }
        }
        
        if (validConnections.length !== connections.length) {
          if (validConnections.length === 0) {
            await this.redis.del(userKey);
          } else {
            await this.redis.del(userKey);
            await this.redis.sadd(userKey, ...validConnections);
            await this.redis.expire(userKey, this.SESSION_TTL);
          }
        }
      }

      // Same for discussion connections
      for (const discussionKey of discussionKeys) {
        const connections = await this.redis.smembers(discussionKey);
        const validConnections = [];
        
        for (const connectionId of connections) {
          const exists = await this.redis.exists(`${this.SESSION_PREFIX}${connectionId}`);
          if (exists) {
            validConnections.push(connectionId);
          }
        }
        
        if (validConnections.length !== connections.length) {
          if (validConnections.length === 0) {
            await this.redis.del(discussionKey);
          } else {
            await this.redis.del(discussionKey);
            await this.redis.sadd(discussionKey, ...validConnections);
            await this.redis.expire(discussionKey, this.SESSION_TTL);
          }
        }
      }

      logger.debug('WebSocket session cleanup completed');

    } catch (error) {
      logger.error('Failed to cleanup expired sessions', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Close Redis connection
   */
  async destroy(): Promise<void> {
    try {
      await this.redis.quit();
      logger.info('Redis WebSocket session manager disconnected');
    } catch (error) {
      logger.error('Error closing Redis connection', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}