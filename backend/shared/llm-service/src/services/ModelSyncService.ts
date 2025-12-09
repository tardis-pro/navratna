import { LLMModel, LLMModelRepository, UserLLMProviderRepository } from '@uaip/shared-services';
import { DataSource } from 'typeorm';
import { logger } from '@uaip/utils';
import { BaseProvider } from '../providers/BaseProvider.js';

export interface ModelSyncResult {
  providerId: string;
  providerName: string;
  modelsFound: number;
  modelsCreated: number;
  modelsUpdated: number;
  modelsMarkedUnavailable: number;
  errors: string[];
}

export interface ModelData {
  name: string;
  description?: string;
  apiType?: string;
  apiEndpoint?: string;
  contextLength?: number;
  inputTokenCost?: number;
  outputTokenCost?: number;
  capabilities?: {
    streaming?: boolean;
    functionCalling?: boolean;
    vision?: boolean;
    codeGeneration?: boolean;
    reasoning?: boolean;
  };
  parameters?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };
}

export class ModelSyncService {
  private llmModelRepository: LLMModelRepository;
  private userLLMProviderRepository: UserLLMProviderRepository;

  constructor(private dataSource: DataSource) {
    this.llmModelRepository = new LLMModelRepository(dataSource);
    this.userLLMProviderRepository = new UserLLMProviderRepository(dataSource);
  }

  /**
   * Sync models from a provider's API to the database
   */
  async syncModelsFromProvider(
    provider: BaseProvider,
    providerId: string
  ): Promise<ModelSyncResult> {
    const result: ModelSyncResult = {
      providerId,
      providerName: provider.getName(),
      modelsFound: 0,
      modelsCreated: 0,
      modelsUpdated: 0,
      modelsMarkedUnavailable: 0,
      errors: [],
    };

    try {
      logger.info('Starting model sync for provider', {
        providerId,
        providerName: provider.getName(),
      });

      // Get models from provider API
      const providerModels = await provider.getAvailableModels();
      result.modelsFound = providerModels.length;

      if (providerModels.length === 0) {
        logger.warn('No models found from provider', {
          providerId,
          providerName: provider.getName(),
        });
        return result;
      }

      // Convert provider models to database format
      const modelData: Partial<LLMModel>[] = providerModels.map((model) => ({
        name: model.name,
        description: model.description,
        providerId,
        apiEndpoint: model.apiEndpoint,
        isAvailable: true, // Default to true since provider returned it
        isActive: true,
        priority: 100, // Default priority
        totalTokensUsed: '0',
        totalRequests: '0',
        totalErrors: '0',
      }));

      // Batch upsert models
      const upsertResults = await this.llmModelRepository.upsertModelsForProvider(
        providerId,
        modelData
      );

      // Count operations
      for (const upsertResult of upsertResults) {
        if (upsertResult.createdAt === upsertResult.updatedAt) {
          result.modelsCreated++;
        } else {
          result.modelsUpdated++;
        }
      }

      // Mark models not returned by provider as unavailable
      const currentModelNames = providerModels.map((m) => m.name);
      const unavailableCount = await this.markModelsUnavailable(providerId, currentModelNames);
      result.modelsMarkedUnavailable = unavailableCount;

      logger.info('Model sync completed successfully', {
        providerId,
        providerName: provider.getName(),
        result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(errorMessage);

      logger.error('Model sync failed for provider', {
        providerId,
        providerName: provider.getName(),
        error: errorMessage,
      });
    }

    return result;
  }

  /**
   * Sync models for all active providers
   */
  async syncAllProvidersModels(providers: Map<string, BaseProvider>): Promise<ModelSyncResult[]> {
    const results: ModelSyncResult[] = [];

    // Get all active user providers from database
    const dbProviders = await this.userLLMProviderRepository.findActiveProviders();

    logger.info('Starting model sync for all user providers', {
      providerCount: dbProviders.length,
    });

    for (const dbProvider of dbProviders) {
      const provider = providers.get(dbProvider.type);
      if (!provider) {
        logger.warn('Provider implementation not found', {
          providerId: dbProvider.id,
          providerType: dbProvider.type,
        });
        continue;
      }

      const result = await this.syncModelsFromProvider(provider, dbProvider.id);
      results.push(result);
    }

    // Log summary
    const totalModels = results.reduce((sum, r) => sum + r.modelsFound, 0);
    const totalCreated = results.reduce((sum, r) => sum + r.modelsCreated, 0);
    const totalUpdated = results.reduce((sum, r) => sum + r.modelsUpdated, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    logger.info('Model sync completed for all providers', {
      providerCount: results.length,
      totalModels,
      totalCreated,
      totalUpdated,
      totalErrors,
    });

    return results;
  }

  /**
   * Mark models as unavailable if they're not in the current provider's model list
   */
  private async markModelsUnavailable(
    providerId: string,
    availableModelNames: string[]
  ): Promise<number> {
    if (availableModelNames.length === 0) {
      return 0;
    }

    const result = await this.dataSource
      .createQueryBuilder()
      .update(LLMModel)
      .set({
        isAvailable: false,
        lastCheckedAt: new Date(),
      })
      .where('providerId = :providerId', { providerId })
      .andWhere('name NOT IN (:...names)', { names: availableModelNames })
      .andWhere('isAvailable = true')
      .execute();

    return result.affected || 0;
  }

  /**
   * Clean up stale models (not checked in X hours)
   */
  async cleanupStaleModels(staleThresholdHours: number = 24): Promise<number> {
    await this.llmModelRepository.markStaleModelsAsUnavailable(staleThresholdHours);

    logger.info('Cleaned up stale models', {
      staleThresholdHours,
    });

    return 0; // markStaleModelsAsUnavailable returns void
  }

  /**
   * Get sync statistics
   */
  async getSyncStatistics(): Promise<{
    totalModels: number;
    availableModels: number;
    totalProviders: number;
    activeProviders: number;
    lastSyncTime?: Date;
  }> {
    const [totalModels, availableModels, totalProviders, activeProviders] = await Promise.all([
      this.llmModelRepository.count(),
      this.llmModelRepository.count({ where: { isAvailable: true } }),
      this.userLLMProviderRepository.count(),
      this.userLLMProviderRepository.count({ where: { isActive: true } }),
    ]);

    // Get last sync time from most recently checked model
    const lastSyncResult = await this.llmModelRepository.findOne({
      order: { lastCheckedAt: 'DESC' },
      select: ['lastCheckedAt'],
    });

    return {
      totalModels,
      availableModels,
      totalProviders,
      activeProviders,
      lastSyncTime: lastSyncResult?.lastCheckedAt,
    };
  }
}
