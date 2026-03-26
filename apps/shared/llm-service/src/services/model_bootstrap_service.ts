import { logger } from '@uaip/utils';
import { LLMService } from '../l_l_m_service.js';
import { UserLLMService } from '../user_l_l_m_service.js';
import { RedisCacheService, UserService } from '@uaip/shared-services';
import { ModelSyncService } from './model_sync_service.js';

interface BootstrapStatus {
  timestamp: string;
  version: string;
  status: 'completed';
}

interface CachedModelEntry {
  id: string;
  name: string;
  description?: string;
  source: string;
  apiEndpoint: string;
  provider: string;
  isAvailable: boolean;
}

interface UserModelSummaryEntry {
  userId: string;
  modelCount: number;
  providers: string[];
}

interface UserModelsSummary {
  userCount: number;
  timestamp: string;
  users: UserModelSummaryEntry[];
}

/**
 * Service responsible for boot-time model discovery and caching
 * Ensures all user models are cached on system startup
 */
export class ModelBootstrapService {
  private static instance: ModelBootstrapService;
  private cacheService: RedisCacheService;
  private llmService: LLMService;
  private userLLMService: UserLLMService;
  private userService: UserService;
  private modelSyncService: ModelSyncService;

  // Cache keys and TTL (6 hours for boot cache = 21600 seconds)
  private static readonly BOOT_CACHE_TTL = 21600;
  private static readonly ALL_USER_MODELS_CACHE_KEY = 'llm:models:all_users_boot';
  private static readonly USER_MODELS_CACHE_PREFIX = 'llm:models:user:';
  private static readonly GLOBAL_MODELS_CACHE_KEY = 'llm:models:global_boot';
  private static readonly BOOTSTRAP_STATUS_KEY = 'llm:bootstrap:status';

  private constructor() {
    this.cacheService = RedisCacheService.getInstance();
    this.llmService = LLMService.getInstance();
    this.userLLMService = new UserLLMService();
    this.userService = UserService.getInstance();
    // Initialize ModelSyncService lazily to avoid async in constructor
    this.modelSyncService = null as unknown as ModelSyncService;
  }

  public static getInstance(): ModelBootstrapService {
    if (!ModelBootstrapService.instance) {
      ModelBootstrapService.instance = new ModelBootstrapService();
    }
    return ModelBootstrapService.instance;
  }

  /**
   * Bootstrap all models on system startup
   * This is called during service initialization
   */
  async bootstrapAllModels(options: { force?: boolean } = {}): Promise<void> {
    const startTime = Date.now();
    logger.info('Starting model bootstrap process...');

    try {
      // Check if bootstrap was recently completed
      if (!options.force) {
        const lastBootstrap = await this.cacheService.get<BootstrapStatus>(
          ModelBootstrapService.BOOTSTRAP_STATUS_KEY
        );
        if (lastBootstrap) {
          const lastBootstrapTime = new Date(lastBootstrap.timestamp);
          const timeSinceLastBootstrap = Date.now() - lastBootstrapTime.getTime();
          const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds

          if (timeSinceLastBootstrap < oneHour) {
            logger.info('Model bootstrap was completed recently, skipping...', {
              lastBootstrap: lastBootstrapTime,
              timeSinceLastBootstrap: `${Math.round(timeSinceLastBootstrap / 1000 / 60)} minutes`,
            });
            return;
          }
        }
      }

      // Step 1: Sync models to database and cache global system models
      await this.syncModelsToDatabase();
      await this.cacheGlobalModels();

      // Step 2: Cache all user-specific models
      await this.cacheAllUserModels();

      // Step 3: Mark bootstrap as completed
      await this.markBootstrapCompleted();

      const totalTime = Date.now() - startTime;
      logger.info('Model bootstrap process completed successfully', {
        duration: `${totalTime}ms`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Model bootstrap process failed', {
        error: error instanceof Error ? error.message : error,
        duration: `${Date.now() - startTime}ms`,
      });
      // Don't throw - let the system continue even if bootstrap fails
    }
  }

  /**
   * Sync models from provider APIs to database
   */
  private async syncModelsToDatabase(): Promise<void> {
    logger.info('Syncing models from provider APIs to database...');

    try {
      // Initialize ModelSyncService lazily
      if (!this.modelSyncService) {
        this.modelSyncService = new ModelSyncService();
      }

      // Sync models to database
      const syncResults = await this.modelSyncService.syncAllProvidersModels();

      // Log summary
      const totalModels = syncResults.reduce((sum, r) => sum + r.modelsFound, 0);
      const totalCreated = syncResults.reduce((sum, r) => sum + r.modelsCreated, 0);
      const totalUpdated = syncResults.reduce((sum, r) => sum + r.modelsUpdated, 0);
      const totalErrors = syncResults.reduce((sum, r) => sum + r.errors.length, 0);

      logger.info('Model sync to database completed', {
        providerCount: syncResults.length,
        totalModels,
        totalCreated,
        totalUpdated,
        totalErrors,
        results: syncResults.map((r) => ({
          provider: r.providerName,
          models: r.modelsFound,
          errors: r.errors.length,
        })),
      });

      // Clean up stale models
      await this.modelSyncService.cleanupStaleModels(24);
    } catch (error) {
      logger.error('Failed to sync models to database', { error });
      // Don't throw - let the system continue even if sync fails
    }
  }

  /**
   * Cache global system models (non-user-specific)
   */
  private async cacheGlobalModels(): Promise<void> {
    logger.info('Caching global system models...');

    try {
      // This will trigger caching in LLMService.getAvailableModels()
      const globalModels = await this.llmService.getAvailableModels();

      // Additional cache with longer TTL for boot cache
      await this.cacheService.set(
        ModelBootstrapService.GLOBAL_MODELS_CACHE_KEY,
        globalModels,
        ModelBootstrapService.BOOT_CACHE_TTL
      );

      logger.info('Global models cached successfully', {
        modelCount: globalModels.length,
        providers: [...new Set(globalModels.map((m) => m.provider))],
      });
    } catch (error) {
      logger.error('Failed to cache global models', { error });
      throw error;
    }
  }

  /**
   * Cache models for all users who have LLM providers
   */
  private async cacheAllUserModels(): Promise<void> {
    logger.info('Caching user-specific models...');

    try {
      // Get all users who have LLM providers
      const usersWithProviders = await this.getUsersWithProviders();

      logger.info('Found users with LLM providers', {
        userCount: usersWithProviders.length,
      });

      const userModelData: UserModelSummaryEntry[] = [];

      for (const userId of usersWithProviders) {
        try {
          // Cache user's models
          // eslint-disable-next-line no-await-in-loop -- sequential processing required
          const userModels = await this.cacheUserModels(userId);
          userModelData.push({
            userId,
            modelCount: userModels.length,
            providers: [...new Set(userModels.map((m) => m.provider))],
          });
        } catch (error) {
          logger.error('Failed to cache models for user', { userId, error });
          // Continue with other users
        }
      }

      // Cache overall user model summary
      await this.cacheService.set(
        ModelBootstrapService.ALL_USER_MODELS_CACHE_KEY,
        {
          userCount: usersWithProviders.length,
          timestamp: new Date().toISOString(),
          users: userModelData,
        },
        ModelBootstrapService.BOOT_CACHE_TTL
      );

      logger.info('User-specific models cached successfully', {
        totalUsers: usersWithProviders.length,
        successfulUsers: userModelData.length,
      });
    } catch (error) {
      logger.error('Failed to cache user models', { error });
      throw error;
    }
  }

  /**
   * Cache models for a specific user
   */
  private async cacheUserModels(userId: string): Promise<CachedModelEntry[]> {
    const cacheKey = `${ModelBootstrapService.USER_MODELS_CACHE_PREFIX}${userId}`;

    try {
      // Get user's models using UserLLMService
      const userModels = await this.userLLMService.getAvailableModels(userId);

      // Cache with longer TTL for boot cache
      await this.cacheService.set(cacheKey, userModels, ModelBootstrapService.BOOT_CACHE_TTL);

      logger.debug('Cached models for user', {
        userId,
        modelCount: userModels.length,
        cacheKey,
      });

      return userModels;
    } catch (error) {
      logger.error('Failed to cache models for user', { userId, error });
      throw error;
    }
  }

  /**
   * Get all users who have LLM providers configured
   */
  private async getUsersWithProviders(): Promise<string[]> {
    try {
      // Use a simpler approach: query all users and check if they have providers
      const userRepository = this.userService.getUserRepository();
      const allUsers = await userRepository.findMany();

      const usersWithProviders: string[] = [];

      // Check each user for LLM providers
      for (const user of allUsers) {
        try {
          // eslint-disable-next-line no-await-in-loop -- sequential processing required
          const providers = await this.userService
            .getUserLLMProviderRepository()
            .findByUserId(user.id as string);
          if (providers.length > 0) {
            usersWithProviders.push(user.id as string);
          }
        } catch (error) {
          logger.warn('Failed to check providers for user', { userId: user.id, error });
          // Continue with other users
        }
      }

      return usersWithProviders;
    } catch (error) {
      logger.error('Failed to get users with providers', { error });
      // Return empty array rather than throwing to allow system to continue
      return [];
    }
  }

  /**
   * Mark bootstrap process as completed
   */
  private async markBootstrapCompleted(): Promise<void> {
    try {
      const status = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        status: 'completed',
      };

      await this.cacheService.set(
        ModelBootstrapService.BOOTSTRAP_STATUS_KEY,
        status,
        ModelBootstrapService.BOOT_CACHE_TTL
      );
    } catch (error) {
      logger.warn('Failed to mark bootstrap as completed', { error });
      // Don't throw - this is not critical
    }
  }

  /**
   * Get cached models for a user (fast path)
   */
  async getCachedUserModels(userId: string): Promise<CachedModelEntry[] | null> {
    const cacheKey = `${ModelBootstrapService.USER_MODELS_CACHE_PREFIX}${userId}`;

    try {
      const cachedModels = await this.cacheService.get<CachedModelEntry[]>(cacheKey);
      if (cachedModels) {
        logger.debug('Returning cached user models', {
          userId,
          modelCount: cachedModels.length,
        });
        return cachedModels;
      }

      return null;
    } catch (error) {
      logger.warn('Failed to get cached user models', { userId, error });
      return null;
    }
  }

  /**
   * Get cached global models (fast path)
   */
  async getCachedGlobalModels(): Promise<CachedModelEntry[] | null> {
    try {
      const cachedModels = await this.cacheService.get<CachedModelEntry[]>(
        ModelBootstrapService.GLOBAL_MODELS_CACHE_KEY
      );
      if (cachedModels) {
        logger.debug('Returning cached global models', {
          modelCount: cachedModels.length,
        });
        return cachedModels;
      }

      return null;
    } catch (error) {
      logger.warn('Failed to get cached global models', { error });
      return null;
    }
  }

  /**
   * Force refresh models for a specific user
   */
  async refreshUserModels(userId: string): Promise<void> {
    logger.info('Refreshing models for user', { userId });

    try {
      await this.cacheUserModels(userId);
    } catch (error) {
      logger.error('Failed to refresh user models', { userId, error });
      throw error;
    }
  }

  /**
   * Get bootstrap status for monitoring
   */
  async getBootstrapStatus(): Promise<unknown> {
    try {
      const status = await this.cacheService.get<BootstrapStatus>(
        ModelBootstrapService.BOOTSTRAP_STATUS_KEY
      );
      const globalModels = await this.cacheService.get<CachedModelEntry[]>(
        ModelBootstrapService.GLOBAL_MODELS_CACHE_KEY
      );
      const userModelsSummary = await this.cacheService.get<UserModelsSummary>(
        ModelBootstrapService.ALL_USER_MODELS_CACHE_KEY
      );

      return {
        lastBootstrap: status,
        globalModelsCount: globalModels ? globalModels.length : 0,
        userModelsSummary: userModelsSummary || null,
        cacheKeys: {
          bootstrap: ModelBootstrapService.BOOTSTRAP_STATUS_KEY,
          globalModels: ModelBootstrapService.GLOBAL_MODELS_CACHE_KEY,
          userModelsSummary: ModelBootstrapService.ALL_USER_MODELS_CACHE_KEY,
        },
      };
    } catch (error) {
      logger.error('Failed to get bootstrap status', { error });
      return { error: 'Failed to get bootstrap status' };
    }
  }
}
