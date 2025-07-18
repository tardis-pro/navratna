import { Repository, DataSource } from 'typeorm';
import { LLMModel } from '../entities/llmModel.entity.js';

export class LLMModelRepository extends Repository<LLMModel> {
  constructor(dataSource: DataSource) {
    super(LLMModel, dataSource.createEntityManager());
  }

  // Find all available models
  async findAvailableModels(): Promise<LLMModel[]> {
    return this.find({
      where: { isAvailable: true, isActive: true },
      relations: ['provider'],
      order: { priority: 'ASC', name: 'ASC' }
    });
  }

  // Find models by provider ID
  async findByProviderId(providerId: string): Promise<LLMModel[]> {
    return this.find({
      where: { providerId, isActive: true },
      relations: ['provider'],
      order: { priority: 'ASC', name: 'ASC' }
    });
  }

  // Find models for a specific user (based on their providers)
  async findByUserProviders(providerIds: string[]): Promise<LLMModel[]> {
    if (providerIds.length === 0) {
      return [];
    }

    return this.createQueryBuilder('model')
      .innerJoin('model.provider', 'provider')
      .where('model.providerId IN (:...providerIds)', { providerIds })
      .andWhere('model.isActive = :isActive', { isActive: true })
      .andWhere('model.isAvailable = :isAvailable', { isAvailable: true })
      .andWhere('provider.isActive = :providerIsActive', { providerIsActive: true })
      .orderBy('model.priority', 'ASC')
      .addOrderBy('model.name', 'ASC')
      .getMany();
  }

  // Find model by name and provider
  async findByNameAndProvider(name: string, providerId: string): Promise<LLMModel | null> {
    return this.findOne({
      where: { name, providerId },
      relations: ['provider']
    });
  }

  // Upsert model (create or update)
  async upsertModel(modelData: Partial<LLMModel>): Promise<LLMModel> {
    const existingModel = await this.findByNameAndProvider(
      modelData.name!,
      modelData.providerId!
    );

    if (existingModel) {
      // Update existing model
      Object.assign(existingModel, modelData);
      existingModel.lastCheckedAt = new Date();
      return this.save(existingModel);
    } else {
      // Create new model
      const newModel = this.create(modelData);
      newModel.lastCheckedAt = new Date();
      return this.save(newModel);
    }
  }

  // Batch upsert models for a provider
  async upsertModelsForProvider(providerId: string, models: Partial<LLMModel>[]): Promise<LLMModel[]> {
    const results: LLMModel[] = [];

    for (const modelData of models) {
      const model = await this.upsertModel({
        ...modelData,
        providerId
      });
      results.push(model);
    }

    // Mark models not in the current list as unavailable
    const currentModelNames = models.map(m => m.name);
    if (currentModelNames.length > 0) {
      await this.createQueryBuilder()
        .update(LLMModel)
        .set({ isAvailable: false, lastCheckedAt: new Date() })
        .where('providerId = :providerId', { providerId })
        .andWhere('name NOT IN (:...names)', { names: currentModelNames })
        .execute();
    }

    return results;
  }

  // Get model statistics
  async getModelStats(modelId: string): Promise<{
    totalRequests: string;
    totalTokensUsed: string;
    totalErrors: string;
    errorRate: number;
  } | null> {
    const model = await this.findOne({ where: { id: modelId } });
    if (!model) {
      return null;
    }

    const totalRequests = BigInt(model.totalRequests);
    const totalErrors = BigInt(model.totalErrors);
    const errorRate = totalRequests > 0 ? Number(totalErrors) / Number(totalRequests) : 0;

    return {
      totalRequests: model.totalRequests,
      totalTokensUsed: model.totalTokensUsed,
      totalErrors: model.totalErrors,
      errorRate
    };
  }

  // Get popular models (by usage)
  async getPopularModels(limit: number = 10): Promise<LLMModel[]> {
    return this.createQueryBuilder('model')
      .innerJoin('model.provider', 'provider')
      .where('model.isActive = :isActive', { isActive: true })
      .andWhere('model.isAvailable = :isAvailable', { isAvailable: true })
      .orderBy('CAST(model.totalRequests AS BIGINT)', 'DESC')
      .limit(limit)
      .getMany();
  }

  // Mark models as unhealthy if not checked recently
  async markStaleModelsAsUnavailable(staleThresholdHours: number = 24): Promise<void> {
    const staleThreshold = new Date(Date.now() - staleThresholdHours * 60 * 60 * 1000);
    
    await this.createQueryBuilder()
      .update(LLMModel)
      .set({ isAvailable: false })
      .where('lastCheckedAt < :threshold', { threshold: staleThreshold })
      .andWhere('isAvailable = :isAvailable', { isAvailable: true })
      .execute();
  }
}