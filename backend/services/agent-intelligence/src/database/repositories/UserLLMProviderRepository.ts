import { Repository } from 'typeorm';
import { BaseRepository } from '../base/BaseRepository.js';
import {
  UserLLMProvider,
  UserLLMProviderType,
  UserLLMProviderStatus,
} from '../../entities/userLLMProvider.entity.js';
import { Agent } from '../../entities/agent.entity.js';
import { logger } from '@uaip/utils';

export class UserLLMProviderRepository extends BaseRepository<UserLLMProvider> {
  constructor(typeormService?: any) {
    super(UserLLMProvider, typeormService);
  }

  /**
   * Find all active providers for a user ordered by priority
   */
  async findActiveProvidersByUser(userId: string): Promise<UserLLMProvider[]> {
    try {
      return await this.repository.find({
        where: {
          userId,
        },
        order: {
          priority: 'ASC',
          createdAt: 'ASC',
        },
      });
    } catch (error) {
      logger.error('Error finding active user LLM providers', { userId, error });
      throw error;
    }
  }

  /**
   * Find all providers for a user (including inactive)
   */
  async findAllProvidersByUser(userId: string): Promise<UserLLMProvider[]> {
    try {
      return await this.repository.find({
        where: { userId },
        order: {
          priority: 'ASC',
          createdAt: 'ASC',
        },
      });
    } catch (error) {
      logger.error('Error finding user LLM providers', { userId, error });
      throw error;
    }
  }

  /**
   * Find all active providers across all users
   */
  async findActiveProviders(): Promise<UserLLMProvider[]> {
    try {
      return await this.repository.find({
        where: [
          { isActive: true, status: 'active' },
          { isActive: true, status: 'testing' },
        ],
        order: {
          priority: 'ASC',
          createdAt: 'ASC',
        },
      });
    } catch (error) {
      logger.error('Error finding active user LLM providers', { error });
      throw error;
    }
  }

  /**
   * Find provider by user and type
   */
  async findByUserAndType(
    userId: string,
    type: UserLLMProviderType
  ): Promise<UserLLMProvider | null> {
    try {
      return await this.repository.findOne({
        where: { userId, type },
      });
    } catch (error) {
      logger.error('Error finding user LLM provider by type', { userId, type, error });
      throw error;
    }
  }

  /**
   * Find the best available provider for a user and optional type
   */
  async findBestProviderForUser(
    userId: string,
    type?: UserLLMProviderType
  ): Promise<UserLLMProvider | null> {
    try {
      const whereCondition: any = {
        userId,
        isActive: true,
        status: 'active',
      };

      if (type) {
        whereCondition.type = type;
      }

      return await this.repository.findOne({
        where: whereCondition,
        order: {
          priority: 'ASC',
          lastUsedAt: 'ASC', // Prefer less recently used providers for load balancing
        },
      });
    } catch (error) {
      logger.error('Error finding best user LLM provider', { userId, type, error });
      throw error;
    }
  }

  /**
   * Create a new user LLM provider
   */
  async createUserProvider(data: {
    userId: string;
    name: string;
    description?: string;
    type: UserLLMProviderType;
    baseUrl?: string;
    apiKey?: string;
    defaultModel?: string;
    modelsList?: string[];
    configuration?: any;
    priority?: number;
  }): Promise<UserLLMProvider> {
    try {
      // Check if user already has a provider with this name
      const existingByName = await this.repository.findOne({
        where: { userId: data.userId, name: data.name },
      });
      if (existingByName) {
        throw new Error(
          `Provider name "${data.name}" is already in use. Please choose a different name.`
        );
      }

      const provider = this.repository.create({
        ...data,
        isActive: true,
        status: 'testing' as UserLLMProviderStatus,
        totalTokensUsed: '0',
        totalRequests: '0',
        totalErrors: '0',
      });

      // Set encrypted API key if provided
      if (data.apiKey) {
        provider.setApiKey(data.apiKey);
      }

      const savedProvider = await this.repository.save(provider);

      logger.info('Created new user LLM provider', {
        id: savedProvider.id,
        userId: savedProvider.userId,
        name: savedProvider.name,
        type: savedProvider.type,
      });

      return savedProvider;
    } catch (error) {
      logger.error('Error creating user LLM provider', { data, error });
      throw error;
    }
  }

  /**
   * Update provider configuration
   */
  async updateProviderConfig(
    id: string,
    userId: string,
    config: {
      name?: string;
      description?: string;
      baseUrl?: string;
      defaultModel?: string;
      priority?: number;
      configuration?: any;
    }
  ): Promise<void> {
    try {
      const provider = await this.repository.findOne({ where: { id, userId } });
      if (!provider) {
        throw new Error(`User LLM provider with id ${id} not found for user ${userId}`);
      }

      // Update only provided fields
      if (config.name !== undefined) provider.name = config.name;
      if (config.description !== undefined) provider.description = config.description;
      if (config.baseUrl !== undefined) provider.baseUrl = config.baseUrl;
      if (config.defaultModel !== undefined) provider.defaultModel = config.defaultModel;
      if (config.priority !== undefined) provider.priority = config.priority;
      if (config.configuration !== undefined) provider.configuration = config.configuration;

      provider.updatedAt = new Date();

      await this.repository.save(provider);

      logger.info('Updated user LLM provider configuration', {
        id,
        userId,
        name: provider.name,
        updatedFields: Object.keys(config),
      });
    } catch (error) {
      logger.error('Error updating user LLM provider configuration', { id, userId, config, error });
      throw error;
    }
  }

  /**
   * Update provider API key
   */
  async updateApiKey(id: string, apiKey: string, userId: string): Promise<void> {
    try {
      const provider = await this.repository.findOne({ where: { id, userId } });
      if (!provider) {
        throw new Error(`User LLM provider with id ${id} not found for user ${userId}`);
      }

      provider.setApiKey(apiKey);
      provider.updatedAt = new Date();

      await this.repository.save(provider);

      logger.info('Updated user LLM provider API key', { id, userId, name: provider.name });
    } catch (error) {
      logger.error('Error updating user LLM provider API key', { id, userId, error });
      throw error;
    }
  }

  /**
   * Update provider status
   */
  async updateStatus(id: string, status: UserLLMProviderStatus, userId: string): Promise<void> {
    try {
      const result = await this.repository.update(
        { id, userId },
        {
          status,
          updatedAt: new Date(),
        }
      );

      if (result.affected === 0) {
        throw new Error(`User LLM provider with id ${id} not found for user ${userId}`);
      }

      logger.info('Updated user LLM provider status', { id, userId, status });
    } catch (error) {
      logger.error('Error updating user LLM provider status', { id, userId, status, error });
      throw error;
    }
  }

  /**
   * Update provider usage statistics
   */
  async updateUsageStats(id: string, tokensUsed: number, isError: boolean = false): Promise<void> {
    try {
      const provider = await this.repository.findOne({ where: { id } });
      if (!provider) {
        throw new Error(`User LLM provider with id ${id} not found`);
      }

      provider.updateUsageStats(tokensUsed, isError);
      await this.repository.save(provider);

      logger.debug('Updated user LLM provider usage stats', {
        id,
        userId: provider.userId,
        tokensUsed,
        isError,
        totalRequests: provider.totalRequests,
      });
    } catch (error) {
      logger.error('Error updating user LLM provider usage stats', {
        id,
        tokensUsed,
        isError,
        error,
      });
      throw error;
    }
  }

  /**
   * Update health check result
   */
  async updateHealthCheck(
    id: string,
    result: { status: 'healthy' | 'unhealthy'; latency?: number; error?: string }
  ): Promise<void> {
    try {
      const provider = await this.repository.findOne({ where: { id } });
      if (!provider) {
        throw new Error(`User LLM provider with id ${id} not found`);
      }

      provider.updateHealthCheck(result);
      await this.repository.save(provider);

      logger.info('Updated user LLM provider health check', {
        id,
        userId: provider.userId,
        status: result.status,
        latency: result.latency,
      });
    } catch (error) {
      logger.error('Error updating user LLM provider health check', { id, result, error });
      throw error;
    }
  }

  /**
   * Get provider statistics for a user
   */
  async getProviderStats(
    id: string,
    userId: string
  ): Promise<{
    totalRequests: string;
    totalTokensUsed: string;
    totalErrors: string;
    errorRate: number;
    lastUsedAt?: Date;
    healthStatus?: string;
  } | null> {
    try {
      const provider = await this.repository.findOne({ where: { id, userId } });
      if (!provider) {
        return null;
      }

      const totalRequests = BigInt(provider.totalRequests);
      const totalErrors = BigInt(provider.totalErrors);
      const errorRate = totalRequests > 0 ? Number((totalErrors * BigInt(100)) / totalRequests) : 0;

      return {
        totalRequests: provider.totalRequests,
        totalTokensUsed: provider.totalTokensUsed,
        totalErrors: provider.totalErrors,
        errorRate,
        lastUsedAt: provider.lastUsedAt,
        healthStatus: provider.healthCheckResult?.status,
      };
    } catch (error) {
      logger.error('Error getting user LLM provider stats', { id, userId, error });
      throw error;
    }
  }

  /**
   * Delete a user provider (soft delete)
   */
  async deleteUserProvider(id: string, userId: string): Promise<void> {
    try {
      // First, get the provider to check its type
      const provider = await this.repository.findOne({
        where: { id, userId },
      });

      if (!provider) {
        throw new Error(`User LLM provider with id ${id} not found for user ${userId}`);
      }

      // If provider is already inactive, return success
      if (!provider.isActive) {
        logger.info('User LLM provider already deleted', {
          id,
          userId,
          providerType: provider.type,
        });
        return;
      }

      // Check if any agents are using this provider type
      const agentRepository = this.getRepository(Agent);
      const agentsUsingProvider = await agentRepository
        .createQueryBuilder('agent')
        .where('agent.apiType = :apiType', { apiType: provider.type })
        .andWhere('agent.isActive = :isActive', { isActive: true })
        .select(['agent.id', 'agent.name', 'agent.modelId'])
        .getMany();

      if (agentsUsingProvider.length > 0) {
        const agentNames = agentsUsingProvider.map((agent) => agent.name).join(', ');
        throw new Error(
          `Cannot delete provider "${provider.name}" because it is being used by ${agentsUsingProvider.length} agent(s): ${agentNames}. Please update or deactivate these agents first.`
        );
      }

      // Proceed with soft delete if no agents are using this provider
      const result = await this.repository.update(
        { id, userId },
        {
          isActive: false,
          status: 'inactive' as UserLLMProviderStatus,
          updatedAt: new Date(),
        }
      );

      if (result.affected === 0) {
        throw new Error(`User LLM provider with id ${id} not found for user ${userId}`);
      }

      logger.info('Soft deleted user LLM provider', { id, userId, providerType: provider.type });
    } catch (error) {
      logger.error('Error deleting user LLM provider', {
        id,
        userId,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        errorName: error instanceof Error ? error.name : undefined,
      });
      throw error;
    }
  }

  /**
   * Get providers needing health check for a user
   */
  async getProvidersNeedingHealthCheck(
    userId: string,
    minutesThreshold: number = 30
  ): Promise<UserLLMProvider[]> {
    try {
      const thresholdDate = new Date(Date.now() - minutesThreshold * 60 * 1000);

      return await this.repository.find({
        where: [
          {
            userId,
            isActive: true,
            lastHealthCheckAt: null,
          },
          {
            userId,
            isActive: true,
            lastHealthCheckAt: { $lt: thresholdDate } as any,
          },
        ],
      });
    } catch (error) {
      logger.error('Error getting user providers needing health check', { userId, error });
      throw error;
    }
  }

  /**
   * Find all providers of a specific type for a user
   */
  async findProvidersByUserAndType(
    userId: string,
    type: UserLLMProviderType
  ): Promise<UserLLMProvider[]> {
    try {
      return await this.repository.find({
        where: { userId, type, isActive: true },
        order: {
          priority: 'ASC',
          lastUsedAt: 'ASC',
        },
      });
    } catch (error) {
      logger.error('Error finding user LLM providers by type', { userId, type, error });
      throw error;
    }
  }
}
