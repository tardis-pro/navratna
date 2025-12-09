import { CacheManager } from './CacheManager.js';
import { CachedUserService } from './services/CachedUserService.js';
import { CachedUserKnowledgeService } from './CachedUserKnowledgeService.js';
import { CachedUserLLMProviderRepository } from './database/repositories/CachedUserLLMProviderRepository.js';
import { CachedLLMProviderRepository } from './database/repositories/CachedLLMProviderRepository.js';
import { KnowledgeGraphService } from './knowledge-graph/knowledge-graph.service.js';
import { logger } from '@uaip/utils';

/**
 * Cache Integration Service
 * Easy-to-use service for integrating caching throughout the application
 */
export class CacheIntegration {
  private static instance: CacheIntegration;
  private cacheManager: CacheManager;
  private cachedUserService: CachedUserService | null = null;
  private cachedUserKnowledgeService: CachedUserKnowledgeService | null = null;
  private cachedUserLLMProviderRepository: CachedUserLLMProviderRepository | null = null;
  private cachedLLMProviderRepository: CachedLLMProviderRepository | null = null;
  private initialized = false;

  private constructor() {
    this.cacheManager = CacheManager.getInstance();
  }

  public static getInstance(): CacheIntegration {
    if (!CacheIntegration.instance) {
      CacheIntegration.instance = new CacheIntegration();
    }
    return CacheIntegration.instance;
  }

  /**
   * Initialize cache integration with all services
   */
  public async initialize(knowledgeGraphService?: KnowledgeGraphService): Promise<void> {
    if (this.initialized) {
      logger.debug('Cache integration already initialized');
      return;
    }

    logger.info('Initializing cache integration...');

    try {
      // Initialize cached services
      this.cachedUserService = new CachedUserService();
      this.cachedUserLLMProviderRepository = new CachedUserLLMProviderRepository();
      this.cachedLLMProviderRepository = new CachedLLMProviderRepository();

      if (knowledgeGraphService) {
        this.cachedUserKnowledgeService = new CachedUserKnowledgeService(knowledgeGraphService);
      }

      // Initialize cache manager with services
      await this.cacheManager.initialize({
        userService: this.cachedUserService,
        userKnowledgeService: this.cachedUserKnowledgeService,
        userLLMProviderRepository: this.cachedUserLLMProviderRepository,
        llmProviderRepository: this.cachedLLMProviderRepository,
      });

      // Warm up global caches
      await this.cacheManager.warmUpGlobalCache();

      // Start cache maintenance
      this.cacheManager.startCacheMaintenance(30); // Every 30 minutes

      this.initialized = true;
      logger.info('Cache integration initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize cache integration', { error: error.message });
      throw error;
    }
  }

  /**
   * Get cached user service
   */
  public getUserService(): CachedUserService {
    if (!this.cachedUserService) {
      throw new Error('Cache integration not initialized. Call initialize() first.');
    }
    return this.cachedUserService;
  }

  /**
   * Get cached user knowledge service
   */
  public getUserKnowledgeService(): CachedUserKnowledgeService {
    if (!this.cachedUserKnowledgeService) {
      throw new Error(
        'User knowledge service not initialized. Ensure KnowledgeGraphService is provided during initialization.'
      );
    }
    return this.cachedUserKnowledgeService;
  }

  /**
   * Get cached user LLM provider repository
   */
  public getUserLLMProviderRepository(): CachedUserLLMProviderRepository {
    if (!this.cachedUserLLMProviderRepository) {
      throw new Error('Cache integration not initialized. Call initialize() first.');
    }
    return this.cachedUserLLMProviderRepository;
  }

  /**
   * Get cached LLM provider repository
   */
  public getLLMProviderRepository(): CachedLLMProviderRepository {
    if (!this.cachedLLMProviderRepository) {
      throw new Error('Cache integration not initialized. Call initialize() first.');
    }
    return this.cachedLLMProviderRepository;
  }

  /**
   * Get cache manager
   */
  public getCacheManager(): CacheManager {
    return this.cacheManager;
  }

  /**
   * Quick cache operations
   */
  public async invalidateUserCache(
    userId: string,
    options?: {
      includeProviders?: boolean;
      includeKnowledge?: boolean;
    }
  ): Promise<void> {
    await this.cacheManager.invalidateUserCache(userId, options);
  }

  public async warmUpUserCache(userId: string): Promise<void> {
    await this.cacheManager.warmUpUserCache(userId);
  }

  public async invalidateProviderCache(providerId: string, userId?: string): Promise<void> {
    await this.cacheManager.invalidateProviderCache(providerId, userId);
  }

  public async invalidateKnowledgeCache(userId: string, itemId?: string): Promise<void> {
    await this.cacheManager.invalidateKnowledgeCache(userId, itemId);
  }

  /**
   * Cache health and monitoring
   */
  public async getHealthStatus(): Promise<any> {
    return this.cacheManager.getHealthStatus();
  }

  public async getPerformanceMetrics(): Promise<any> {
    return this.cacheManager.getPerformanceMetrics();
  }

  /**
   * Bulk operations
   */
  public async bulkInvalidateUserCaches(userIds: string[]): Promise<void> {
    await this.cacheManager.bulkInvalidateUserCaches(userIds);
  }

  public async bulkWarmUpUserCaches(userIds: string[]): Promise<void> {
    await this.cacheManager.bulkWarmUpUserCaches(userIds);
  }

  /**
   * Emergency operations
   */
  public async flushAllCaches(): Promise<void> {
    await this.cacheManager.flushAllCaches();
  }

  /**
   * Check if cache integration is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down cache integration...');

    try {
      // Perform any cleanup operations here
      this.initialized = false;
      logger.info('Cache integration shutdown completed');
    } catch (error) {
      logger.error('Error during cache integration shutdown', { error: error.message });
    }
  }
}

// Export singleton instance
export const cacheIntegration = CacheIntegration.getInstance();

// Export convenience functions
export const initializeCaching = (knowledgeGraphService?: KnowledgeGraphService) =>
  cacheIntegration.initialize(knowledgeGraphService);

export const getCachedUserService = () => cacheIntegration.getUserService();
export const getCachedUserKnowledgeService = () => cacheIntegration.getUserKnowledgeService();
export const getCachedUserLLMProviderRepository = () =>
  cacheIntegration.getUserLLMProviderRepository();
export const getCachedLLMProviderRepository = () => cacheIntegration.getLLMProviderRepository();
export const getCacheManager = () => cacheIntegration.getCacheManager();

export const invalidateUserCache = (userId: string, options?: any) =>
  cacheIntegration.invalidateUserCache(userId, options);

export const warmUpUserCache = (userId: string) => cacheIntegration.warmUpUserCache(userId);

export const getCacheHealthStatus = () => cacheIntegration.getHealthStatus();

export const getCachePerformanceMetrics = () => cacheIntegration.getPerformanceMetrics();
