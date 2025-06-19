import { Repository } from 'typeorm';
import { BaseRepository } from '../base/BaseRepository.js';
import { LLMProvider  } from '../../entities/llmProvider.entity.js';
import { logger } from '@uaip/utils';
import { LLMProviderType, LLMProviderStatus } from '@uaip/types';

export class LLMProviderRepository extends BaseRepository<LLMProvider> {
  constructor(typeormService?: any) {
    super(LLMProvider, typeormService);
  }

  /**
   * Find all active providers ordered by priority
   */
  async findActiveProviders(): Promise<LLMProvider[]> {
    try {
      return await this.repository.find({
        where: { 
          isActive: true,
          status: LLMProviderStatus.ACTIVE
        },
        order: { 
          priority: 'ASC',
          createdAt: 'ASC'
        }
      });
    } catch (error) {
      logger.error('Error finding active LLM providers', { error });
      throw error;
    }
  }

  /**
   * Find providers by type
   */
  async findByType(type: LLMProviderType): Promise<LLMProvider[]> {
    try {
      return await this.repository.find({
        where: { 
          type,
          isActive: true
        },
        order: { 
          priority: 'ASC',
          createdAt: 'ASC'
        }
      });
    } catch (error) {
      logger.error('Error finding LLM providers by type', { type, error });
      throw error;
    }
  }

  /**
   * Find provider by name
   */
  async findByName(name: string): Promise<LLMProvider | null> {
    try {
      return await this.repository.findOne({
        where: { name }
      });
    } catch (error) {
      logger.error('Error finding LLM provider by name', { name, error });
      throw error;
    }
  }

  /**
   * Find the best available provider for a given type
   * Returns the highest priority (lowest number) active provider
   */
  async findBestProvider(type?: LLMProviderType): Promise<LLMProvider | null> {
    try {
      const whereCondition: any = {
        isActive: true,
        status: 'active'
      };

      if (type) {
        whereCondition.type = type;
      }

      return await this.repository.findOne({
        where: whereCondition,
        order: { 
          priority: 'ASC',
          lastUsedAt: 'ASC' // Prefer less recently used providers for load balancing
        }
      });
    } catch (error) {
      logger.error('Error finding best LLM provider', { type, error });
      throw error;
    }
  }

  /**
   * Create a new LLM provider
   */
  async createProvider(data: {
    name: string;
    description?: string;
    type: LLMProviderType;
    baseUrl: string;
    apiKey?: string;
    defaultModel?: string;
    modelsList?: string[];
    configuration?: any;
    priority?: number;
    createdBy?: string;
  }): Promise<LLMProvider> {
    try {
      const provider = this.repository.create({
        ...data,
        isActive: true,
        status: 'testing' as LLMProviderStatus,
        totalTokensUsed: '0',
        totalRequests: '0',
        totalErrors: '0'
      });

      // Set encrypted API key if provided
      if (data.apiKey) {
        provider.setApiKey(data.apiKey);
      }

      const savedProvider = await this.repository.save(provider);
      
      logger.info('Created new LLM provider', { 
        id: savedProvider.id, 
        name: savedProvider.name,
        type: savedProvider.type
      });

      return savedProvider;
    } catch (error) {
      logger.error('Error creating LLM provider', { data, error });
      throw error;
    }
  }

  /**
   * Update provider API key
   */
  async updateApiKey(id: string, apiKey: string, updatedBy?: string): Promise<void> {
    try {
      const provider = await this.repository.findOne({ where: { id } });
      if (!provider) {
        throw new Error(`LLM provider with id ${id} not found`);
      }

      provider.setApiKey(apiKey);
      provider.updatedBy = updatedBy;
      
      await this.repository.save(provider);
      
      logger.info('Updated LLM provider API key', { id, name: provider.name });
    } catch (error) {
      logger.error('Error updating LLM provider API key', { id, error });
      throw error;
    }
  }

  /**
   * Update provider status
   */
  async updateStatus(id: string, status: LLMProviderStatus, updatedBy?: string): Promise<void> {
    try {
      await this.repository.update(
        { id },
        { 
          status, 
          updatedBy,
          updatedAt: new Date()
        }
      );
      
      logger.info('Updated LLM provider status', { id, status });
    } catch (error) {
      logger.error('Error updating LLM provider status', { id, status, error });
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
        throw new Error(`LLM provider with id ${id} not found`);
      }

      provider.updateUsageStats(tokensUsed, isError);
      await this.repository.save(provider);
      
      logger.debug('Updated LLM provider usage stats', { 
        id, 
        tokensUsed, 
        isError,
        totalRequests: provider.totalRequests
      });
    } catch (error) {
      logger.error('Error updating LLM provider usage stats', { id, tokensUsed, isError, error });
      throw error;
    }
  }

  /**
   * Update provider health check result
   */
  async updateHealthCheck(
    id: string, 
    result: { status: 'healthy' | 'unhealthy'; latency?: number; error?: string }
  ): Promise<void> {
    try {
      const provider = await this.repository.findOne({ where: { id } });
      if (!provider) {
        throw new Error(`LLM provider with id ${id} not found`);
      }

      provider.updateHealthCheck(result);
      await this.repository.save(provider);
      
      logger.info('Updated LLM provider health check', { 
        id, 
        name: provider.name,
        status: result.status,
        latency: result.latency
      });
    } catch (error) {
      logger.error('Error updating LLM provider health check', { id, result, error });
      throw error;
    }
  }

  /**
   * Get provider statistics
   */
  async getProviderStats(id: string): Promise<{
    totalRequests: string;
    totalTokensUsed: string;
    totalErrors: string;
    errorRate: number;
    lastUsedAt?: Date;
    healthStatus?: string;
  } | null> {
    try {
      const provider = await this.repository.findOne({ 
        where: { id },
        select: [
          'id', 'name', 'totalRequests', 'totalTokensUsed', 'totalErrors',
          'lastUsedAt', 'healthCheckResult'
        ]
      });

      if (!provider) {
        return null;
      }

      const totalRequests = BigInt(provider.totalRequests);
      const totalErrors = BigInt(provider.totalErrors);
      const errorRate = totalRequests > 0 
        ? Number(totalErrors) / Number(totalRequests) * 100 
        : 0;

      return {
        totalRequests: provider.totalRequests,
        totalTokensUsed: provider.totalTokensUsed,
        totalErrors: provider.totalErrors,
        errorRate: Math.round(errorRate * 100) / 100, // Round to 2 decimal places
        lastUsedAt: provider.lastUsedAt,
        healthStatus: provider.healthCheckResult?.status
      };
    } catch (error) {
      logger.error('Error getting LLM provider stats', { id, error });
      throw error;
    }
  }

  /**
   * Soft delete provider (mark as inactive)
   */
  async softDelete(id: string, deletedBy?: string): Promise<void> {
    try {
      await this.repository.update(
        { id },
        { 
          isActive: false,
          status: 'inactive' as LLMProviderStatus,
          updatedBy: deletedBy,
          updatedAt: new Date()
        }
      );
      
      logger.info('Soft deleted LLM provider', { id });
    } catch (error) {
      logger.error('Error soft deleting LLM provider', { id, error });
      throw error;
    }
  }

  /**
   * Get providers needing health check
   * Returns providers that haven't been checked recently
   */
  async getProvidersNeedingHealthCheck(minutesThreshold: number = 30): Promise<LLMProvider[]> {
    try {
      const thresholdDate = new Date();
      thresholdDate.setMinutes(thresholdDate.getMinutes() - minutesThreshold);

      return await this.repository
        .createQueryBuilder('provider')
        .where('provider.isActive = :isActive', { isActive: true })
        .andWhere(
          '(provider.lastHealthCheckAt IS NULL OR provider.lastHealthCheckAt < :threshold)',
          { threshold: thresholdDate }
        )
        .orderBy('provider.priority', 'ASC')
        .getMany();
    } catch (error) {
      logger.error('Error getting providers needing health check', { error });
      throw error;
    }
  }
} 