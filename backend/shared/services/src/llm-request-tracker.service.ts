/**
 * Redis-based LLM Request Tracker Service
 *
 * Provides persistent storage for pending LLM requests to prevent
 * "unknown response" issues when services restart or scale.
 */

import { Redis } from 'ioredis';
import { logger } from '@uaip/utils';
import { redisCacheService } from './redis-cache.service.js';

export interface PendingLLMRequest {
  requestId: string;
  timestamp: number;
  timeoutMs: number;
  service: string;
  reject: (error: Error) => void;
  resolve: (value: any) => void;
}

export interface SerializablePendingRequest {
  requestId: string;
  timestamp: number;
  timeoutMs: number;
  service: string;
  expiresAt: number;
}

export class LLMRequestTracker {
  private keyPrefix: string;
  private defaultTimeoutMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Keep resolve/reject functions in memory (can't serialize these)
  private pendingCallbacks = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor(service: string = 'llm-tracker', defaultTimeoutMs: number = 30000) {
    this.keyPrefix = `llm-requests:${service}`;
    this.defaultTimeoutMs = defaultTimeoutMs;

    // Start cleanup process for expired requests
    this.startCleanupProcess();

    logger.info('LLM Request Tracker initialized', {
      service,
      keyPrefix: this.keyPrefix,
      defaultTimeoutMs,
    });
  }

  /**
   * Add a pending LLM request
   */
  async addPendingRequest(
    requestId: string,
    resolve: (value: any) => void,
    reject: (error: Error) => void,
    timeoutMs?: number,
    service?: string
  ): Promise<void> {
    const timeout = timeoutMs || this.defaultTimeoutMs;
    const timestamp = Date.now();
    const expiresAt = timestamp + timeout;

    const pendingRequest: SerializablePendingRequest = {
      requestId,
      timestamp,
      timeoutMs: timeout,
      service: service || 'unknown',
      expiresAt,
    };

    try {
      // Store in Redis with expiration
      const redis = await redisCacheService.getClient();
      const key = `${this.keyPrefix}:${requestId}`;
      await redis.setex(
        key,
        Math.ceil(timeout / 1000), // Redis TTL in seconds
        JSON.stringify(pendingRequest)
      );

      // Store callbacks in memory
      this.pendingCallbacks.set(requestId, { resolve, reject });

      // Set timeout to clean up if no response
      setTimeout(() => {
        this.handleTimeout(requestId);
      }, timeout);

      logger.debug('Added pending LLM request', { requestId, timeout, service });
    } catch (error) {
      logger.error('Failed to add pending LLM request', { requestId, error });
      throw error;
    }
  }

  /**
   * Complete a pending LLM request with success
   */
  async completePendingRequest(requestId: string, result: any): Promise<boolean> {
    try {
      const callbacks = this.pendingCallbacks.get(requestId);
      if (!callbacks) {
        logger.debug('No callbacks found for request', { requestId });
        return false;
      }

      // Remove from Redis and memory
      await this.removePendingRequest(requestId);

      // Resolve the promise
      callbacks.resolve(result);

      logger.debug('Completed pending LLM request', { requestId });
      return true;
    } catch (error) {
      logger.error('Failed to complete pending LLM request', { requestId, error });
      return false;
    }
  }

  /**
   * Fail a pending LLM request with error
   */
  async failPendingRequest(requestId: string, error: Error): Promise<boolean> {
    try {
      const callbacks = this.pendingCallbacks.get(requestId);
      if (!callbacks) {
        logger.debug('No callbacks found for failed request', { requestId });
        return false;
      }

      // Remove from Redis and memory
      await this.removePendingRequest(requestId);

      // Reject the promise
      callbacks.reject(error);

      logger.debug('Failed pending LLM request', { requestId, error: error.message });
      return true;
    } catch (err) {
      logger.error('Failed to fail pending LLM request', { requestId, error: err });
      return false;
    }
  }

  /**
   * Check if a request is pending
   */
  async isPending(requestId: string): Promise<boolean> {
    try {
      const redis = await redisCacheService.getClient();
      const key = `${this.keyPrefix}:${requestId}`;
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Failed to check pending request', { requestId, error });
      return false;
    }
  }

  /**
   * Get pending request details
   */
  async getPendingRequest(requestId: string): Promise<SerializablePendingRequest | null> {
    try {
      const redis = await redisCacheService.getClient();
      const key = `${this.keyPrefix}:${requestId}`;
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as SerializablePendingRequest;
    } catch (error) {
      logger.error('Failed to get pending request', { requestId, error });
      return null;
    }
  }

  /**
   * Get count of pending requests
   */
  async getPendingCount(): Promise<number> {
    try {
      const redis = await redisCacheService.getClient();
      const pattern = `${this.keyPrefix}:*`;
      const keys = await redis.keys(pattern);
      return keys.length;
    } catch (error) {
      logger.error('Failed to get pending count', { error });
      return 0;
    }
  }

  /**
   * Get all pending request IDs
   */
  async getPendingRequestIds(): Promise<string[]> {
    try {
      const redis = await redisCacheService.getClient();
      const pattern = `${this.keyPrefix}:*`;
      const keys = await redis.keys(pattern);

      // Extract request IDs from keys
      const requestIds = keys.map((key) => {
        const parts = key.split(':');
        return parts[parts.length - 1]; // Last part is the request ID
      });

      return requestIds;
    } catch (error) {
      logger.error('Failed to get pending request IDs', { error });
      return [];
    }
  }

  /**
   * Remove a pending request
   */
  private async removePendingRequest(requestId: string): Promise<void> {
    try {
      const redis = await redisCacheService.getClient();
      const key = `${this.keyPrefix}:${requestId}`;
      await redis.del(key);
      this.pendingCallbacks.delete(requestId);
    } catch (error) {
      logger.error('Failed to remove pending request', { requestId, error });
    }
  }

  /**
   * Handle request timeout
   */
  private async handleTimeout(requestId: string): Promise<void> {
    const callbacks = this.pendingCallbacks.get(requestId);
    if (callbacks) {
      await this.failPendingRequest(
        requestId,
        new Error(`LLM request timeout after ${this.defaultTimeoutMs}ms`)
      );
    }
  }

  /**
   * Start cleanup process for expired requests
   */
  private startCleanupProcess(): void {
    // Clean up expired requests every 60 seconds
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredRequests();
    }, 60000);
  }

  /**
   * Clean up expired requests that Redis TTL might have missed
   */
  private async cleanupExpiredRequests(): Promise<void> {
    try {
      const redis = await redisCacheService.getClient();
      const pattern = `${this.keyPrefix}:*`;
      const keys = await redis.keys(pattern);
      const now = Date.now();
      let cleanedCount = 0;

      for (const key of keys) {
        try {
          const data = await redis.get(key);
          if (data) {
            const request = JSON.parse(data) as SerializablePendingRequest;
            if (request.expiresAt < now) {
              await redis.del(key);
              this.pendingCallbacks.delete(request.requestId);
              cleanedCount++;
            }
          }
        } catch (error) {
          // If we can't parse the data, remove the key
          await redis.del(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug('Cleaned up expired LLM requests', { count: cleanedCount });
      }
    } catch (error) {
      logger.error('Failed to cleanup expired requests', { error });
    }
  }

  /**
   * Shutdown the tracker
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Fail all pending requests
    const pendingIds = Array.from(this.pendingCallbacks.keys());
    for (const requestId of pendingIds) {
      await this.failPendingRequest(requestId, new Error('Service shutting down'));
    }

    logger.info('LLM Request Tracker shut down');
  }
}
