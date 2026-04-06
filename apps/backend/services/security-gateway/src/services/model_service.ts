import { LLMModelRepository, getControlPool } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import type { ModelForUser } from '@uaip/types';

export class ModelService {
  private llmModelRepository = new LLMModelRepository();

  async getModelsForUser(userId: string): Promise<ModelForUser[]> {
    try {
      const userProviderIds = await this.getUserProviderIds(userId);
      if (userProviderIds.length === 0) {
        logger.warn('No LLM providers found for user', { userId });
        return [];
      }
      const models = await this.llmModelRepository.findByUserProviders(userProviderIds);
      logger.info('Retrieved models for user from database', { userId, modelCount: models.length });
      return models.map((model) => this.transformToLegacyFormat(model));
    } catch (error) {
      logger.error('Error getting models for user', { error, userId });
      throw error;
    }
  }

  async getAllAvailableModels(): Promise<ModelForUser[]> {
    try {
      const models = await this.llmModelRepository.findAvailableModels();
      logger.info('Retrieved all available models from database', { modelCount: models.length });
      return models.map((model) => this.transformToLegacyFormat(model));
    } catch (error) {
      logger.error('Error getting all available models', { error });
      throw error;
    }
  }

  async getModelsForProvider(providerId: string): Promise<ModelForUser[]> {
    try {
      const models = await this.llmModelRepository.findByProviderId(providerId);
      logger.info('Retrieved models for provider', { providerId, modelCount: models.length });
      return models.map((model) => this.transformToLegacyFormat(model));
    } catch (error) {
      logger.error('Error getting models for provider', { error, providerId });
      throw error;
    }
  }

  private async getUserProviderIds(userId: string): Promise<string[]> {
    try {
      const pool = getControlPool();
      const result = await pool.query<{ id: string }>(
        `SELECT DISTINCT id FROM "user_llm_providers" WHERE "user_id" = $1 AND "is_active" = true AND "status" IN ('active', 'testing')`,
        [userId]
      );
      return result.rows.map((row) => row.id);
    } catch (error) {
      logger.error('Error getting user provider IDs', { error, userId });
      return [];
    }
  }

  private transformToLegacyFormat(model: Record<string, unknown>): ModelForUser {
    const providerName = typeof model.apiType === 'string' ? model.apiType : 'unknown';
    const name = typeof model.name === 'string' ? model.name : '';
    return {
      id: `${providerName}-${name}`,
      name,
      description: typeof model.description === 'string' ? model.description : `${name} from ${providerName}`,
      source: providerName,
      apiEndpoint: typeof model.apiEndpoint === 'string' ? model.apiEndpoint : undefined,
      apiType: typeof model.apiType === 'string' ? model.apiType : undefined,
      provider: providerName,
      providerId: typeof model.providerId === 'string' ? model.providerId : '',
      isAvailable: typeof model.isEnabled === 'boolean' ? model.isEnabled : true,
      isDefault: false,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const pool = getControlPool();
      await pool.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Model service health check failed', { error });
      return false;
    }
  }
}
