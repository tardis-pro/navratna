import {
  LLMModel,
  LLMModelRepository,
  getIntelligencePool,
  getControlPool,
} from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { BaseProvider } from '../providers/base_provider.js';
import { OllamaProvider } from '../providers/ollama_provider.js';
import { LLMStudioProvider } from '../providers/l_l_m_studio_provider.js';
import { OpenAIProvider } from '../providers/open_a_i_provider.js';
import type { LLMProviderConfig, ModelSyncResult, ModelData } from '@uaip/types';

export type { ModelSyncResult, ModelData };

export class ModelSyncService {
  private llmModelRepository = new LLMModelRepository();

  private toProviderConfig(config: unknown): LLMProviderConfig {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid provider configuration');
    }

    // @ts-expect-error -- TS narrows to `object` but not `Record<string,unknown>`; index access is safe after the typeof check above
    const configRecord: Record<string, unknown> = config;
    const type = configRecord.type;
    const baseUrl = configRecord.baseUrl;

    if (typeof type !== 'string' || typeof baseUrl !== 'string') {
      throw new Error('Provider configuration must include type and baseUrl');
    }

    const validTypes = new Set<unknown>(['ollama', 'openai', 'llmstudio', 'anthropic', 'custom']);
    const isValidProviderType = (t: unknown): t is LLMProviderConfig['type'] =>
      validTypes.has(t);
    const normalizedType: LLMProviderConfig['type'] =
      type === 'google'
        ? 'custom'
        : isValidProviderType(type)
          ? type
          : 'custom';

    return {
      type: normalizedType,
      baseUrl,
      apiKey: typeof configRecord.apiKey === 'string' ? configRecord.apiKey : undefined,
      apiKeyEncrypted:
        typeof configRecord.apiKeyEncrypted === 'string' ? configRecord.apiKeyEncrypted : undefined,
      defaultModel:
        typeof configRecord.defaultModel === 'string' ? configRecord.defaultModel : undefined,
      timeout: typeof configRecord.timeout === 'number' ? configRecord.timeout : undefined,
      retries: typeof configRecord.retries === 'number' ? configRecord.retries : undefined,
    };
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
  async syncAllProvidersModels(): Promise<ModelSyncResult[]> {
    const results: ModelSyncResult[] = [];

    // Get all active user providers from database
    const pool = getControlPool();
    const providerResult = await pool.query<Record<string, unknown>>(
      `SELECT * FROM "user_llm_providers" WHERE "is_active" = true ORDER BY "created_at" DESC`
    );
    const dbProviders = providerResult.rows;

    logger.info('Starting model sync for all user providers', {
      providerCount: dbProviders.length,
    });

    for (const dbProvider of dbProviders) {
      let provider: BaseProvider | null = null;
      try {
        const providerWithMethod = {
          type: String(dbProvider.provider_type ?? dbProvider.type ?? ''),
          name: String(dbProvider.name ?? ''),
          getProviderConfig: () => dbProvider.configuration ?? dbProvider.config ?? {},
        };
        provider = this.createProviderInstance(providerWithMethod);
      } catch (error) {
        logger.warn('Provider implementation not found', {
          providerId: dbProvider.id,
          providerType: dbProvider.provider_type ?? dbProvider.type,
          error,
        });
      }
      if (!provider) {
        continue;
      }

      const result = await this.syncModelsFromProvider(provider, String(dbProvider.id));
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

  private createProviderInstance(dbProvider: {
    type: string;
    name: string;
    getProviderConfig: () => unknown;
  }): BaseProvider {
    const config = this.toProviderConfig(dbProvider.getProviderConfig());

    switch (dbProvider.type) {
      case 'ollama':
        return new OllamaProvider(config, dbProvider.name);
      case 'llmstudio':
        return new LLMStudioProvider(config, dbProvider.name);
      case 'openai':
      case 'anthropic':
      case 'custom':
      case 'google':
        return new OpenAIProvider(config, dbProvider.name);
      default:
        throw new Error(`Unsupported provider type: ${dbProvider.type}`);
    }
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

    const pool = getIntelligencePool();
    const placeholders = availableModelNames.map((_n, i) => `$${i + 2}`).join(', ');
    const pgResult = await pool.query(
      `UPDATE "llm_models" SET "is_enabled" = false, "updated_at" = NOW() WHERE "provider_id" = $1 AND "name" NOT IN (${placeholders}) AND "is_enabled" = true`,
      [providerId, ...availableModelNames]
    );
    return pgResult.rowCount ?? 0;
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
    const iPool = getIntelligencePool();
    const cPool = getControlPool();
    const [totalRes, availRes, totalProv, activeProv] = await Promise.all([
      iPool.query<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM "llm_models"`),
      iPool.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM "llm_models" WHERE "is_enabled" = true`
      ),
      cPool.query<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM "user_llm_providers"`),
      cPool.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM "user_llm_providers" WHERE "is_active" = true`
      ),
    ]);
    const totalModels = totalRes.rows[0]?.cnt ?? 0;
    const availableModels = availRes.rows[0]?.cnt ?? 0;
    const totalProviders = totalProv.rows[0]?.cnt ?? 0;
    const activeProviders = activeProv.rows[0]?.cnt ?? 0;

    const lastSyncRes = await iPool.query<{ updated_at: Date }>(
      `SELECT "updated_at" FROM "llm_models" ORDER BY "updated_at" DESC LIMIT 1`
    );
    const lastSyncResult = lastSyncRes.rows[0];

    return {
      totalModels,
      availableModels,
      totalProviders,
      activeProviders,
      lastSyncTime: lastSyncResult?.updated_at,
    };
  }
}
