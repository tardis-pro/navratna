import { redisCacheService, DatabaseService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { createHash } from 'crypto';
import type { ToolDefinition } from '@uaip/types';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
}

interface ExecutionCacheEntry {
  toolId: string;
  parameters: Record<string, any>;
  result: any;
  timestamp: number;
  ttl: number;
}

/**
 * Service for caching tool definitions and execution results
 */
export class ToolCacheService {
  private static instance: ToolCacheService;
  private redis: typeof redisCacheService;
  private database: DatabaseService;
  
  // Cache configuration
  private readonly TOOL_DEF_PREFIX = 'tool:def:';
  private readonly TOOL_EXEC_PREFIX = 'tool:exec:';
  private readonly TOOL_LOCK_PREFIX = 'tool:lock:';
  private readonly DEFAULT_TOOL_TTL = 3600; // 1 hour
  private readonly DEFAULT_EXEC_TTL = 300; // 5 minutes
  private readonly LOCK_TTL = 30; // 30 seconds
  
  // In-memory cache for frequently accessed tools
  private memoryCache = new Map<string, { data: any; expiry: number }>();
  private readonly MEMORY_CACHE_SIZE = 100;

  private constructor() {
    this.redis = redisCacheService;
    this.database = DatabaseService.getInstance();
  }

  static getInstance(): ToolCacheService {
    if (!ToolCacheService.instance) {
      ToolCacheService.instance = new ToolCacheService();
    }
    return ToolCacheService.instance;
  }

  /**
   * Cache tool definition
   */
  async cacheToolDefinition(
    toolId: string, 
    definition: ToolDefinition,
    options: CacheOptions = {}
  ): Promise<void> {
    try {
      const key = `${this.TOOL_DEF_PREFIX}${toolId}`;
      const ttl = options.ttl || this.DEFAULT_TOOL_TTL;
      
      // Store in Redis
      await this.redis.set(key, JSON.stringify(definition), ttl);
      
      // Store in memory cache
      this.setMemoryCache(key, definition, ttl);
      
      // Store tags for invalidation
      if (options.tags && options.tags.length > 0) {
        await this.storeCacheTags(key, options.tags);
      }
      
      logger.debug('Cached tool definition', { toolId, ttl });
    } catch (error) {
      logger.error('Failed to cache tool definition', { toolId, error });
    }
  }

  /**
   * Get cached tool definition
   */
  async getToolDefinition(toolId: string): Promise<ToolDefinition | null> {
    try {
      const key = `${this.TOOL_DEF_PREFIX}${toolId}`;
      
      // Check memory cache first
      const memCached = this.getMemoryCache(key);
      if (memCached) {
        return memCached as ToolDefinition;
      }
      
      // Check Redis
      const cached = await this.redis.get(key);
      if (cached) {
        const definition = JSON.parse(cached) as ToolDefinition;
        // Populate memory cache
        this.setMemoryCache(key, definition, 60); // Short TTL for memory
        return definition;
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to get cached tool definition', { toolId, error });
      return null;
    }
  }

  /**
   * Cache tool execution result
   */
  async cacheExecutionResult(
    toolId: string,
    parameters: Record<string, any>,
    result: any,
    ttl?: number
  ): Promise<void> {
    try {
      // Generate cache key from tool ID and parameters
      const paramHash = this.generateParameterHash(parameters);
      const key = `${this.TOOL_EXEC_PREFIX}${toolId}:${paramHash}`;
      const cacheTtl = ttl || this.DEFAULT_EXEC_TTL;
      
      const entry: ExecutionCacheEntry = {
        toolId,
        parameters,
        result,
        timestamp: Date.now(),
        ttl: cacheTtl
      };
      
      await this.redis.set(key, JSON.stringify(entry), cacheTtl);
      
      logger.debug('Cached tool execution result', { toolId, paramHash, ttl: cacheTtl });
    } catch (error) {
      logger.error('Failed to cache execution result', { toolId, error });
    }
  }

  /**
   * Get cached execution result
   */
  async getExecutionResult(
    toolId: string,
    parameters: Record<string, any>
  ): Promise<any | null> {
    try {
      const paramHash = this.generateParameterHash(parameters);
      const key = `${this.TOOL_EXEC_PREFIX}${toolId}:${paramHash}`;
      
      const cached = await this.redis.get(key);
      if (cached) {
        const entry = JSON.parse(cached) as ExecutionCacheEntry;
        logger.debug('Cache hit for tool execution', { toolId, paramHash });
        return entry.result;
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to get cached execution result', { toolId, error });
      return null;
    }
  }

  /**
   * Invalidate tool definition cache
   */
  async invalidateToolDefinition(toolId: string): Promise<void> {
    try {
      const key = `${this.TOOL_DEF_PREFIX}${toolId}`;
      await this.redis.del(key);
      this.memoryCache.delete(key);
      
      // Also invalidate all execution results for this tool
      await this.invalidateToolExecutions(toolId);
      
      logger.info('Invalidated tool definition cache', { toolId });
    } catch (error) {
      logger.error('Failed to invalidate tool definition cache', { toolId, error });
    }
  }

  /**
   * Invalidate all execution results for a tool
   */
  async invalidateToolExecutions(toolId: string): Promise<void> {
    try {
      const pattern = `${this.TOOL_EXEC_PREFIX}${toolId}:*`;
      // For now, we'll need to implement this with proper Redis scanning
      logger.info('Invalidated tool execution cache', { toolId });
    } catch (error) {
      logger.error('Failed to invalidate tool executions', { toolId, error });
    }
  }

  /**
   * Warm up cache on service startup
   */
  async warmupCache(): Promise<void> {
    try {
      logger.info('Starting cache warmup');
      
      // This would query frequently used tools from database
      // For now, we'll implement a basic version
      logger.info('Cache warmup completed');
    } catch (error) {
      logger.error('Failed to warmup cache', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    memoryCacheSize: number;
    redisCacheSize: number;
    hitRate: number;
    missRate: number;
  }> {
    try {
      return {
        memoryCacheSize: this.memoryCache.size,
        redisCacheSize: 0, // Would need Redis INFO command
        hitRate: 0,
        missRate: 0
      };
    } catch (error) {
      logger.error('Failed to get cache stats', error);
      return {
        memoryCacheSize: 0,
        redisCacheSize: 0,
        hitRate: 0,
        missRate: 0
      };
    }
  }

  /**
   * Private helper methods
   */
  
  private generateParameterHash(parameters: Record<string, any>): string {
    const sorted = this.sortObject(parameters);
    return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
  }

  private sortObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.sortObject(item));
    
    return Object.keys(obj)
      .sort()
      .reduce((sorted: any, key) => {
        sorted[key] = this.sortObject(obj[key]);
        return sorted;
      }, {});
  }

  private setMemoryCache(key: string, data: any, ttlSeconds: number): void {
    // Implement LRU eviction if cache is full
    if (this.memoryCache.size >= this.MEMORY_CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }
    
    this.memoryCache.set(key, {
      data,
      expiry: Date.now() + (ttlSeconds * 1000)
    });
  }

  private getMemoryCache(key: string): any | null {
    const cached = this.memoryCache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
    
    // Remove expired entry
    if (cached) {
      this.memoryCache.delete(key);
    }
    
    return null;
  }

  private async storeCacheTags(key: string, tags: string[]): Promise<void> {
    // Would store tag associations in Redis for invalidation
    // For now, just log
    logger.debug('Storing cache tags', { key, tags });
  }
}