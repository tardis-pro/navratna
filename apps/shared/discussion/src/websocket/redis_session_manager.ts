import Redis from 'ioredis';
import { logger } from '@uaip/utils';
import { getRedisTLSOptions } from '@uaip/infra';
import type { WebSocketConnection, WebSocketSession, RateLimitData } from '@uaip/types';

function isWebSocketSessionShape(v: object): v is Omit<WebSocketSession, 'connectedAt' | 'lastActivity'> & { connectedAt: unknown; lastActivity: unknown } {
  return (
    'connectionId' in v && typeof v.connectionId === 'string' &&
    'userId' in v && typeof v.userId === 'string' &&
    'discussionId' in v && typeof v.discussionId === 'string' &&
    'authenticated' in v && typeof v.authenticated === 'boolean' &&
    'messageCount' in v && typeof v.messageCount === 'number' &&
    'rateLimitReset' in v && typeof v.rateLimitReset === 'number' &&
    'securityLevel' in v && typeof v.securityLevel === 'number'
  );
}

export type { WebSocketSession, RateLimitData };

// Atomic fixed-window counter. EXPIRE is set only on the first increment so the
// window starts with the first request and is not extended by later ones.
const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
if current > tonumber(ARGV[1]) then
  return 0
end
return 1
`;

export class RedisSessionManager {
  private redis: Redis;
  private readonly SESSION_PREFIX = 'ws:session:';
  private readonly USER_CONNECTIONS_PREFIX = 'ws:user:';
  private readonly DISCUSSION_CONNECTIONS_PREFIX = 'ws:discussion:';
  private readonly RATE_LIMIT_PREFIX = 'ws:ratelimit:';
  private readonly SESSION_TTL = 24 * 60 * 60; // 24 hours
  private readonly RATE_LIMIT_TTL = 60; // 1 minute

  constructor(redisConfig?: { host?: string; port?: number; password?: string; db?: number }) {
    const sessionHost = redisConfig?.host || process.env.REDIS_HOST || 'localhost';
    this.redis = new Redis({
      host: sessionHost,
      port: redisConfig?.port || parseInt(process.env.REDIS_PORT || '6379'),
      password: redisConfig?.password || process.env.REDIS_PASSWORD,
      db: redisConfig?.db || parseInt(process.env.REDIS_WS_DB || process.env.REDIS_DB || '0'),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      commandTimeout: 5000,
      ...getRedisTLSOptions(sessionHost),
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
  async createSession(
    connection: WebSocketConnection,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
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
        userAgent,
      };

      const pipeline = this.redis.pipeline();

      // Store session data
      pipeline.setex(
        `${this.SESSION_PREFIX}${connection.connectionId}`,
        this.SESSION_TTL,
        JSON.stringify(session)
      );

      // Add connection to user's connection set
      pipeline.sadd(`${this.USER_CONNECTIONS_PREFIX}${connection.userId}`, connection.connectionId);
      pipeline.expire(`${this.USER_CONNECTIONS_PREFIX}${connection.userId}`, this.SESSION_TTL);

      // Add connection to discussion's connection set
      pipeline.sadd(
        `${this.DISCUSSION_CONNECTIONS_PREFIX}${connection.discussionId}`,
        connection.connectionId
      );
      pipeline.expire(
        `${this.DISCUSSION_CONNECTIONS_PREFIX}${connection.discussionId}`,
        this.SESSION_TTL
      );

      // No rate-limit pre-seed: the atomic counter creates its own per-bucket
      // key on first use, so writing one here leaves an unread orphan.

      await pipeline.exec();

      logger.info('WebSocket session created in Redis', {
        connectionId: connection.connectionId,
        userId: connection.userId,
        discussionId: connection.discussionId,
        securityLevel: connection.securityLevel,
      });
    } catch (error) {
      logger.error('Failed to create WebSocket session in Redis', {
        connectionId: connection.connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
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

      const parsed: unknown = JSON.parse(sessionData);
      if (typeof parsed !== 'object' || parsed === null) return null;
      if (!isWebSocketSessionShape(parsed)) return null;
      const session: WebSocketSession = {
        ...parsed,
        connectedAt: new Date(parsed.connectedAt as string | number | Date),
        lastActivity: new Date(parsed.lastActivity as string | number | Date),
      };

      return session;
    } catch (error) {
      logger.error('Failed to get WebSocket session from Redis', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
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
        error: error instanceof Error ? error.message : 'Unknown error',
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

        for (const key of this.rateLimitKeys(connectionId)) {
          pipeline.del(key);
        }

        await pipeline.exec();

        logger.info('WebSocket session removed from Redis', {
          connectionId,
          userId: session.userId,
          discussionId: session.discussionId,
        });
      } else {
        // Still try to clean up any orphaned data
        const pipeline = this.redis.pipeline();
        pipeline.del(`${this.SESSION_PREFIX}${connectionId}`);
        for (const key of this.rateLimitKeys(connectionId)) {
          pipeline.del(key);
        }
        await pipeline.exec();
      }
    } catch (error) {
      logger.error('Failed to remove WebSocket session from Redis', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
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
        error: error instanceof Error ? error.message : 'Unknown error',
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
        error: error instanceof Error ? error.message : 'Unknown error',
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
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false; // Deny on error
    }
  }

  /**
   * Check and consume one unit of a rate-limit bucket.
   *
   * INCR + conditional EXPIRE run inside a single Lua script so the read and the
   * write cannot interleave: a GET/modify/SET would let concurrent callers all
   * observe the same count and overwrite each other, letting an unbounded burst
   * through. Fails CLOSED — any Redis error or unparseable reply denies.
   */
  private rateLimitKeys(connectionId: string): string[] {
    const types: Array<keyof RateLimitData> = ['messages', 'typing', 'reactions', 'turns'];
    return types.map((type) => `${this.RATE_LIMIT_PREFIX}${connectionId}:${type}`);
  }

  async checkRateLimit(
    connectionId: string,
    type: keyof RateLimitData,
    maxPerMinute: number
  ): Promise<boolean> {
    const key = `${this.RATE_LIMIT_PREFIX}${connectionId}:${type}`;

    try {
      const allowed = await this.redis.eval(
        RATE_LIMIT_SCRIPT,
        1,
        key,
        String(maxPerMinute),
        String(this.RATE_LIMIT_TTL)
      );

      if (typeof allowed === 'number') return allowed === 1;
      if (typeof allowed === 'string') return allowed === '1';

      logger.error('Rate limit script returned an unusable reply; denying', {
        connectionId,
        type,
        reply: typeof allowed,
      });
      return false;
    } catch (error) {
      logger.error('Failed to check rate limit; denying', {
        connectionId,
        type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
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
        activeDiscussions: discussionKeys.length,
      };
    } catch (error) {
      logger.error('Failed to get session stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        totalSessions: 0,
        activeUsers: 0,
        activeDiscussions: 0,
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
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        const connections = await this.redis.smembers(userKey);
        const validConnections = [];

        for (const connectionId of connections) {
          // oxlint-disable-next-line no-await-in-loop -- sequential processing required
          const exists = await this.redis.exists(`${this.SESSION_PREFIX}${connectionId}`);
          if (exists) {
            validConnections.push(connectionId);
          }
        }

        if (validConnections.length !== connections.length) {
          if (validConnections.length === 0) {
            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            await this.redis.del(userKey);
          } else {
            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            await this.redis.del(userKey);
            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            await this.redis.sadd(userKey, ...validConnections);
            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            await this.redis.expire(userKey, this.SESSION_TTL);
          }
        }
      }

      // Same for discussion connections
      for (const discussionKey of discussionKeys) {
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        const connections = await this.redis.smembers(discussionKey);
        const validConnections = [];

        for (const connectionId of connections) {
          // oxlint-disable-next-line no-await-in-loop -- sequential processing required
          const exists = await this.redis.exists(`${this.SESSION_PREFIX}${connectionId}`);
          if (exists) {
            validConnections.push(connectionId);
          }
        }

        if (validConnections.length !== connections.length) {
          if (validConnections.length === 0) {
            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            await this.redis.del(discussionKey);
          } else {
            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            await this.redis.del(discussionKey);
            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            await this.redis.sadd(discussionKey, ...validConnections);
            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            await this.redis.expire(discussionKey, this.SESSION_TTL);
          }
        }
      }

      logger.debug('WebSocket session cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', {
        error: error instanceof Error ? error.message : 'Unknown error',
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
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
