import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  OperationState,
  Checkpoint,
  CheckpointType,
  WorkflowInstance
} from '@uaip/types';
import { logger, ApiError } from '@uaip/utils';
import { config } from '@uaip/config';
import { DatabaseService } from './databaseService';

export interface StateUpdateOptions {
  status?: string;
  currentStep?: string;
  completedSteps?: string[];
  failedSteps?: string[];
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
}

// Helper function to safely extract error messages
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}

export class StateManagerService {
  private redis: Redis;
  private databaseService: DatabaseService;
  private compressionEnabled: boolean;
  private maxCheckpointSize: number;
  private isConnected = false;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
    this.redis = new Redis(config.getRedisConfig());
    this.compressionEnabled = config.getStateConfig().compressionEnabled;
    this.maxCheckpointSize = config.getStateConfig().maxCheckpointSize;

    this.setupRedisListeners();
  }

  /**
   * Initialize operation state
   */
  public async initializeOperationState(
    operationId: string,
    initialState: OperationState
  ): Promise<void> {
    try {
      logger.debug('Initializing operation state', { operationId });

      // Validate state
      this.validateOperationState(initialState);

      // Store in Redis for fast access
      await this.setOperationStateInCache(operationId, initialState);

      // Store in database for persistence
      await this.databaseService.saveOperationState(operationId, initialState);

      logger.info('Operation state initialized', {
        operationId,
        stateKeys: Object.keys(initialState)
      });

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to initialize operation state', {
        operationId,
        error: errorMessage
      });
      throw new ApiError(500, `Failed to initialize operation state: ${errorMessage}`);
    }
  }

  /**
   * Get operation state
   */
  public async getOperationState(operationId: string): Promise<OperationState | null> {
    try {
      // Try Redis first for performance
      let state = await this.getOperationStateFromCache(operationId);
      
      if (state) {
        logger.debug('Operation state retrieved from cache', { operationId });
        return state;
      }

      // Fallback to database
      state = await this.databaseService.getOperationState(operationId);
      
      if (state) {
        // Cache for future requests
        await this.setOperationStateInCache(operationId, state);
        logger.debug('Operation state retrieved from database and cached', { operationId });
      }

      return state;

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to get operation state', {
        operationId,
        error: errorMessage
      });
      throw new ApiError(500, `Failed to get operation state: ${errorMessage}`);
    }
  }

  /**
   * Update operation state
   */
  public async updateOperationState(
    operationId: string,
    updates: StateUpdateOptions
  ): Promise<void> {
    try {
      logger.debug('Updating operation state', { operationId, updates: Object.keys(updates) });

      // Get current state
      const currentState = await this.getOperationState(operationId);
      if (!currentState) {
        throw new Error(`Operation state not found for ${operationId}`);
      }

      // Apply updates
      const updatedState: OperationState = {
        ...currentState,
        ...(updates.currentStep && { currentStep: updates.currentStep }),
        ...(updates.completedSteps && { completedSteps: updates.completedSteps }),
        ...(updates.failedSteps && { failedSteps: updates.failedSteps }),
        ...(updates.variables && { 
          variables: { ...currentState.variables, ...updates.variables }
        }),
        lastUpdated: new Date()
      };

      // Validate updated state
      this.validateOperationState(updatedState);

      // Update in cache
      await this.setOperationStateInCache(operationId, updatedState);

      // Update in database
      await this.databaseService.updateOperationState(operationId, updatedState, updates);

      // Create automatic checkpoint if significant changes
      if (this.shouldCreateAutomaticCheckpoint(updates)) {
        await this.createAutomaticCheckpoint(operationId, updatedState);
      }

      logger.debug('Operation state updated successfully', {
        operationId,
        updatedFields: Object.keys(updates)
      });

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to update operation state', {
        operationId,
        error: errorMessage
      });
      throw new ApiError(500, `Failed to update operation state: ${errorMessage}`);
    }
  }

  /**
   * Save checkpoint
   */
  public async saveCheckpoint(
    operationId: string,
    checkpoint: Checkpoint
  ): Promise<void> {
    try {
      logger.debug('Saving checkpoint', {
        operationId,
        checkpointId: checkpoint.id,
        type: checkpoint.type
      });

      // Validate checkpoint size
      const checkpointSize = this.calculateCheckpointSize(checkpoint);
      if (checkpointSize > this.maxCheckpointSize) {
        throw new Error(`Checkpoint size (${checkpointSize}) exceeds maximum allowed (${this.maxCheckpointSize})`);
      }

      // Compress if enabled
      const processedCheckpoint = this.compressionEnabled 
        ? await this.compressCheckpoint(checkpoint)
        : checkpoint;

      // Save to Redis with expiration
      if (!checkpoint.id) {
        throw new Error('Checkpoint ID is required');
      }
      
      const cacheKey = this.getCheckpointCacheKey(operationId, checkpoint.id);
      await this.redis.setex(
        cacheKey,
        3600, // 1 hour TTL
        JSON.stringify(processedCheckpoint)
      );

      // Save to database for long-term storage
      await this.databaseService.saveCheckpoint(operationId, processedCheckpoint);

      // Update state to include checkpoint reference
      const currentState = await this.getOperationState(operationId);
      if (currentState && checkpoint.id) {
        // Initialize checkpoints array if it doesn't exist
        if (!currentState.checkpoints) {
          currentState.checkpoints = [];
        }
        // Add checkpoint ID to the checkpoints array (assuming it's an array of IDs)
        if (!currentState.checkpoints.includes(checkpoint.id)) {
          currentState.checkpoints.push(checkpoint.id);
        }
        await this.setOperationStateInCache(operationId, currentState);
      }

      logger.info('Checkpoint saved successfully', {
        operationId,
        checkpointId: checkpoint.id,
        type: checkpoint.type,
        size: checkpointSize
      });

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to save checkpoint', {
        operationId,
        checkpointId: checkpoint.id,
        error: errorMessage
      });
      throw new ApiError(500, `Failed to save checkpoint: ${errorMessage}`);
    }
  }

  /**
   * Get checkpoint
   */
  public async getCheckpoint(
    operationId: string,
    checkpointId: string
  ): Promise<Checkpoint | null> {
    try {
      logger.debug('Retrieving checkpoint', { operationId, checkpointId });

      // Try cache first
      const cacheKey = this.getCheckpointCacheKey(operationId, checkpointId);
      const cachedData = await this.redis.get(cacheKey);
      
      if (cachedData) {
        const checkpoint = JSON.parse(cachedData);
        const decompressedCheckpoint = this.compressionEnabled
          ? await this.decompressCheckpoint(checkpoint)
          : checkpoint;
        
        logger.debug('Checkpoint retrieved from cache', { operationId, checkpointId });
        return decompressedCheckpoint;
      }

      // Fallback to database
      const checkpoint = await this.databaseService.getCheckpoint(operationId, checkpointId);
      
      if (checkpoint) {
        const decompressedCheckpoint = this.compressionEnabled
          ? await this.decompressCheckpoint(checkpoint)
          : checkpoint;

        // Cache for future requests
        await this.redis.setex(cacheKey, 3600, JSON.stringify(checkpoint));
        
        logger.debug('Checkpoint retrieved from database and cached', { operationId, checkpointId });
        return decompressedCheckpoint;
      }

      return null;

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to get checkpoint', {
        operationId,
        checkpointId,
        error: errorMessage
      });
      throw new ApiError(500, `Failed to get checkpoint: ${errorMessage}`);
    }
  }

  /**
   * List checkpoints for an operation
   */
  public async listCheckpoints(operationId: string): Promise<Checkpoint[]> {
    try {
      logger.debug('Listing checkpoints', { operationId });

      const checkpoints = await this.databaseService.listCheckpoints(operationId);
      
      // Sort by timestamp (newest first)
      checkpoints.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      logger.debug('Checkpoints retrieved', {
        operationId,
        count: checkpoints.length
      });

      return checkpoints;

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to list checkpoints', {
        operationId,
        error: errorMessage
      });
      throw new ApiError(500, `Failed to list checkpoints: ${errorMessage}`);
    }
  }

  /**
   * Restore operation state from checkpoint
   */
  public async restoreFromCheckpoint(
    operationId: string,
    checkpointId: string
  ): Promise<OperationState> {
    try {
      logger.info('Restoring operation from checkpoint', { operationId, checkpointId });

      const checkpoint = await this.getCheckpoint(operationId, checkpointId);
      if (!checkpoint) {
        throw new Error(`Checkpoint ${checkpointId} not found for operation ${operationId}`);
      }

      if (!checkpoint.data || !checkpoint.data.operationState) {
        throw new Error(`Checkpoint ${checkpointId} does not contain operation state`);
      }

      const restoredState = checkpoint.data.operationState as OperationState;
      
      // Validate restored state
      this.validateOperationState(restoredState);

      // Update cache and database
      await this.setOperationStateInCache(operationId, restoredState);
      await this.databaseService.updateOperationState(operationId, restoredState, {
        metadata: { restoredFromCheckpoint: checkpointId, restoredAt: new Date() }
      });

      logger.info('Operation state restored from checkpoint', {
        operationId,
        checkpointId,
        restoredState: {
          currentStep: restoredState.currentStep,
          completedSteps: restoredState.completedSteps?.length || 0,
          failedSteps: restoredState.failedSteps?.length || 0
        }
      });

      return restoredState;

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to restore from checkpoint', {
        operationId,
        checkpointId,
        error: errorMessage
      });
      throw new ApiError(500, `Failed to restore from checkpoint: ${errorMessage}`);
    }
  }

  /**
   * Clean up old state data
   */
  public async cleanupOldStates(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      logger.info('Starting state cleanup', { maxAgeMs: maxAge });

      const cutoffDate = new Date(Date.now() - maxAge);
      
      // Clean up database
      const deletedCount = await this.databaseService.deleteOldOperationStates(cutoffDate);
      
      // Clean up cache (Redis handles TTL automatically)
      // But we can clean up keys that match patterns
      const pattern = this.getOperationStateCacheKey('*');
      const keys = await this.redis.keys(pattern);
      
      let expiredKeys = 0;
      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1) { // No expiration set
          await this.redis.expire(key, 3600); // Set 1 hour expiration
          expiredKeys++;
        }
      }

      logger.info('State cleanup completed', {
        deletedFromDatabase: deletedCount,
        cacheKeysExpired: expiredKeys
      });

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to cleanup old states', { error: errorMessage });
      throw new ApiError(500, `Failed to cleanup old states: ${errorMessage}`);
    }
  }

  /**
   * Get state statistics
   */
  public async getStateStatistics(): Promise<{
    totalOperations: number;
    activeOperations: number;
    totalCheckpoints: number;
    cacheHitRate: number;
    averageStateSize: number;
  }> {
    try {
      const stats = await this.databaseService.getStateStatistics();
      
      // Get cache statistics
      const cacheInfo = await this.redis.info('stats');
      const cacheStats = this.parseCacheStats(cacheInfo);

      return {
        totalOperations: stats.totalOperations,
        activeOperations: stats.activeOperations,
        totalCheckpoints: stats.totalCheckpoints,
        cacheHitRate: cacheStats.hitRate,
        averageStateSize: stats.averageStateSize
      };

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to get state statistics', { error: errorMessage });
      throw new ApiError(500, `Failed to get state statistics: ${errorMessage}`);
    }
  }

  /**
   * Private methods
   */

  private setupRedisListeners(): void {
    this.redis.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis connection established');
    });

    this.redis.on('disconnect', () => {
      this.isConnected = false;
      logger.warn('Redis connection lost');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis error', { error: error.message });
    });

    this.redis.on('ready', () => {
      logger.info('Redis client ready');
    });
  }

  private async getOperationStateFromCache(operationId: string): Promise<OperationState | null> {
    try {
      const cacheKey = this.getOperationStateCacheKey(operationId);
      const data = await this.redis.get(cacheKey);
      
      if (!data) {
        return null;
      }

      return JSON.parse(data);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.warn('Failed to get state from cache', { operationId, error: errorMessage });
      return null;
    }
  }

  private async setOperationStateInCache(
    operationId: string,
    state: OperationState,
    ttl: number = 3600
  ): Promise<void> {
    try {
      const cacheKey = this.getOperationStateCacheKey(operationId);
      await this.redis.setex(cacheKey, ttl, JSON.stringify(state));
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.warn('Failed to set state in cache', { operationId, error: errorMessage });
    }
  }

  private validateOperationState(state: OperationState): void {
    if (!state.operationId) {
      throw new Error('Operation state must have operationId');
    }

    if (!Array.isArray(state.completedSteps)) {
      throw new Error('completedSteps must be an array');
    }

    if (!Array.isArray(state.failedSteps)) {
      throw new Error('failedSteps must be an array');
    }

    if (typeof state.variables !== 'object' || state.variables === null) {
      throw new Error('variables must be an object');
    }

    if (!Array.isArray(state.checkpoints)) {
      throw new Error('checkpoints must be an array');
    }
  }

  private shouldCreateAutomaticCheckpoint(updates: StateUpdateOptions): boolean {
    return !!(
      updates.status ||
      updates.completedSteps ||
      updates.failedSteps ||
      updates.currentStep
    );
  }

  private async createAutomaticCheckpoint(
    operationId: string,
    state: OperationState
  ): Promise<void> {
    try {
      const checkpoint: Checkpoint = {
        id: uuidv4(),
        stepId: state.currentStep || '',
        type: CheckpointType.STATE_SNAPSHOT,
        data: {
          timestamp: new Date(),
          version: '1.0',
          operationState: state
        },
        timestamp: new Date()
      };

      await this.saveCheckpoint(operationId, checkpoint);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.warn('Failed to create automatic checkpoint', {
        operationId,
        error: errorMessage
      });
    }
  }

  private calculateCheckpointSize(checkpoint: Checkpoint): number {
    return Buffer.byteLength(JSON.stringify(checkpoint), 'utf8');
  }

  private async compressCheckpoint(checkpoint: Checkpoint): Promise<Checkpoint> {
    // Simple implementation - in production, use zlib or similar
    // For now, just add a flag to indicate compression would be applied
    const compressed: Checkpoint = {
      ...checkpoint,
      data: {
        ...checkpoint.data,
        compressed: true
      } as any // Type assertion for the compression flag
    };
    return compressed;
  }

  private async decompressCheckpoint(checkpoint: Checkpoint): Promise<Checkpoint> {
    // Simple implementation - in production, use zlib or similar
    const checkpointData = checkpoint.data as any;
    if (checkpointData.compressed) {
      const decompressed: Checkpoint = {
        ...checkpoint,
        data: {
          ...checkpoint.data
        }
      };
      // Remove compression flag
      const decompressedData = { ...decompressed.data } as any;
      delete decompressedData.compressed;
      decompressed.data = decompressedData;
      return decompressed;
    }
    return checkpoint;
  }

  private getOperationStateCacheKey(operationId: string): string {
    return `operation:state:${operationId}`;
  }

  private getCheckpointCacheKey(operationId: string, checkpointId: string): string {
    return `operation:checkpoint:${operationId}:${checkpointId}`;
  }

  private parseCacheStats(cacheInfo: string): { hitRate: number } {
    // Parse Redis INFO output to extract hit rate
    const lines = cacheInfo.split('\r\n');
    let hits = 0;
    let misses = 0;

    for (const line of lines) {
      if (line.startsWith('keyspace_hits:')) {
        hits = parseInt(line.split(':')[1]);
      } else if (line.startsWith('keyspace_misses:')) {
        misses = parseInt(line.split(':')[1]);
      }
    }

    const total = hits + misses;
    return { hitRate: total > 0 ? hits / total : 0 };
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    redis: boolean;
    database: boolean;
    overall: boolean;
  }> {
    const redisHealth = this.isConnected;
    const databaseHealthResult = await this.databaseService.healthCheck();
    const databaseHealth = databaseHealthResult.status === 'healthy';
    
    return {
      redis: redisHealth,
      database: databaseHealth,
      overall: redisHealth && databaseHealth
    };
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    try {
      logger.info('Cleaning up StateManagerService');
      await this.redis.quit();
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Error during StateManagerService cleanup', { error: errorMessage });
    }
  }
} 