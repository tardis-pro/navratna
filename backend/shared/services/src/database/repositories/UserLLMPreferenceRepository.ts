import { Repository, FindOptionsWhere } from 'typeorm';
import { UserLLMPreference } from '../../entities/userLLMPreference.entity.js';
import { LLMTaskType, LLMProviderType } from '@uaip/types';

export interface CreateUserLLMPreferenceData {
  userId: string;
  taskType: LLMTaskType;
  preferredProvider: LLMProviderType;
  preferredModel: string;
  fallbackModel?: string;
  settings?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    systemPrompt?: string;
    customSettings?: Record<string, any>;
  };
  description?: string;
  priority?: number;
}

export interface UpdateUserLLMPreferenceData {
  preferredProvider?: LLMProviderType;
  preferredModel?: string;
  fallbackModel?: string;
  settings?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    systemPrompt?: string;
    customSettings?: Record<string, any>;
  };
  description?: string;
  priority?: number;
  isActive?: boolean;
}

export class UserLLMPreferenceRepository {
  constructor(
    private repository: Repository<UserLLMPreference>
  ) {}

  async create(data: CreateUserLLMPreferenceData): Promise<UserLLMPreference> {
    const preference = this.repository.create({
      ...data,
      isActive: true,
      priority: data.priority || 50,
      usageCount: '0'
    });
    
    return this.repository.save(preference);
  }

  async findById(id: string): Promise<UserLLMPreference | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByUserAndTask(userId: string, taskType: LLMTaskType): Promise<UserLLMPreference | null> {
    return this.repository.findOne({
      where: { userId, taskType, isActive: true }
    });
  }

  async findByUser(userId: string): Promise<UserLLMPreference[]> {
    return this.repository.find({
      where: { userId, isActive: true },
      order: { taskType: 'ASC', priority: 'DESC' }
    });
  }

  async findByTaskType(taskType: LLMTaskType): Promise<UserLLMPreference[]> {
    return this.repository.find({
      where: { taskType, isActive: true },
      order: { priority: 'DESC', createdAt: 'DESC' }
    });
  }

  async update(id: string, data: UpdateUserLLMPreferenceData): Promise<UserLLMPreference | null> {
    await this.repository.update(id, {
      ...data,
      updatedAt: new Date()
    });
    
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected ? result.affected > 0 : false;
  }

  async setActive(id: string, isActive: boolean): Promise<UserLLMPreference | null> {
    await this.repository.update(id, { 
      isActive,
      updatedAt: new Date()
    });
    
    return this.findById(id);
  }

  async getTopPerformingPreferences(limit: number = 10): Promise<UserLLMPreference[]> {
    return this.repository
      .createQueryBuilder('preference')
      .where('preference.isActive = :isActive', { isActive: true })
      .andWhere('preference.usageCount > :minUsage', { minUsage: '5' })
      .orderBy('preference.successRate', 'DESC')
      .addOrderBy('preference.averageResponseTime', 'ASC')
      .limit(limit)
      .getMany();
  }

  async getUserPreferenceStats(userId: string): Promise<{
    totalPreferences: number;
    activePreferences: number;
    totalUsage: number;
    averageSuccessRate: number;
    averageResponseTime: number;
  }> {
    const preferences = await this.findByUser(userId);
    
    const totalUsage = preferences.reduce((sum, pref) => sum + Number(pref.usageCount), 0);
    const successRates = preferences.filter(p => p.successRate !== undefined).map(p => p.successRate!);
    const responseTimes = preferences.filter(p => p.averageResponseTime !== undefined).map(p => p.averageResponseTime!);
    
    return {
      totalPreferences: preferences.length,
      activePreferences: preferences.filter(p => p.isActive).length,
      totalUsage,
      averageSuccessRate: successRates.length > 0 ? successRates.reduce((a, b) => a + b, 0) / successRates.length : 0,
      averageResponseTime: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0
    };
  }

  async bulkUpsert(preferences: CreateUserLLMPreferenceData[]): Promise<UserLLMPreference[]> {
    const results: UserLLMPreference[] = [];
    
    for (const prefData of preferences) {
      const existing = await this.findByUserAndTask(prefData.userId, prefData.taskType);
      
      if (existing) {
        const updated = await this.update(existing.id, {
          preferredProvider: prefData.preferredProvider,
          preferredModel: prefData.preferredModel,
          fallbackModel: prefData.fallbackModel,
          settings: prefData.settings,
          description: prefData.description,
          priority: prefData.priority
        });
        if (updated) results.push(updated);
      } else {
        const created = await this.create(prefData);
        results.push(created);
      }
    }
    
    return results;
  }
}