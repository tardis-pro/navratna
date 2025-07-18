import { LLMModel, LLMModelRepository } from '@uaip/shared-services';
import { DataSource } from 'typeorm';
import { logger } from '@uaip/utils';

export interface ModelForUser {
  id: string;
  name: string;
  description?: string;
  source: string;
  apiEndpoint?: string;
  apiType?: string;
  provider: string;
  providerId: string;
  isAvailable: boolean;
  isDefault: boolean;
}

export class ModelService {
  private llmModelRepository: LLMModelRepository;

  constructor(private dataSource: DataSource) {
    this.llmModelRepository = new LLMModelRepository(dataSource);
  }

  /**
   * Get all models available to a user (based on their LLM provider configurations)
   * This method only reads from the database - no external API calls
   */
  async getModelsForUser(userId: string): Promise<ModelForUser[]> {
    try {
      // Get user's provider IDs from the database (UserLLMProvider IDs)
      const userProviderIds = await this.getUserProviderIds(userId);
      
      if (userProviderIds.length === 0) {
        logger.warn('No LLM providers found for user', { userId });
        return [];
      }

      // Get models from database using UserLLMProvider IDs as providerId
      const models = await this.llmModelRepository.findByUserProviders(userProviderIds);
      
      logger.info('Retrieved models for user from database', { 
        userId, 
        modelCount: models.length, 
        providerCount: userProviderIds.length 
      });

      return models.map(model => this.transformToLegacyFormat(model));
    } catch (error) {
      logger.error('Error getting models for user', { error, userId });
      throw error;
    }
  }

  /**
   * Get all available models from database
   */
  async getAllAvailableModels(): Promise<ModelForUser[]> {
    try {
      const models = await this.llmModelRepository.findAvailableModels();
      
      logger.info('Retrieved all available models from database', { 
        modelCount: models.length 
      });

      return models.map(model => this.transformToLegacyFormat(model));
    } catch (error) {
      logger.error('Error getting all available models', { error });
      throw error;
    }
  }

  /**
   * Get models for a specific provider
   */
  async getModelsForProvider(providerId: string): Promise<ModelForUser[]> {
    try {
      const models = await this.llmModelRepository.findByProviderId(providerId);
      
      logger.info('Retrieved models for provider from database', { 
        providerId,
        modelCount: models.length 
      });

      return models.map(model => this.transformToLegacyFormat(model));
    } catch (error) {
      logger.error('Error getting models for provider', { error, providerId });
      throw error;
    }
  }

  /**
   * Get user's provider IDs from database (UserLLMProvider IDs)
   */
  private async getUserProviderIds(userId: string): Promise<string[]> {
    try {
      const result = await this.dataSource.query(`
        SELECT DISTINCT id 
        FROM user_llm_providers 
        WHERE "userId" = $1 
        AND "isActive" = true
        AND status IN ('active', 'testing')
      `, [userId]);

      return result.map((row: any) => row.id);
    } catch (error) {
      logger.error('Error getting user provider IDs', { error, userId });
      return [];
    }
  }

  /**
   * Transform LLMModel entity to legacy format for compatibility
   */
  private transformToLegacyFormat(model: LLMModel): ModelForUser {
    return {
      id: `${model.provider?.name || 'unknown'}-${model.name}`,
      name: model.name,
      description: model.description || `${model.name} from ${model.provider?.name || 'unknown'}`,
      source: model.provider?.name || 'unknown',
      apiEndpoint: model.apiEndpoint,
      apiType: model.apiType,
      provider: model.provider?.name || 'unknown',
      providerId: model.providerId,
      isAvailable: model.isAvailable,
      isDefault: false // We don't have this info in the new format
    };
  }

  /**
   * Check if the model service is healthy (database connection)
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Model service health check failed', { error });
      return false;
    }
  }
}