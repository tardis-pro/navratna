import { Repository } from 'typeorm';
import { AgentLLMPreference } from '../../entities/agentLLMPreference.entity.js';
import { LLMTaskType, LLMProviderType } from '@uaip/types';

export interface CreateAgentLLMPreferenceData {
  agentId: string;
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
  reasoning?: string;
  priority?: number;
}

export interface UpdateAgentLLMPreferenceData {
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
  reasoning?: string;
  priority?: number;
  isActive?: boolean;
}

export class AgentLLMPreferenceRepository {
  constructor(
    private repository: Repository<AgentLLMPreference>
  ) {}

  async create(data: CreateAgentLLMPreferenceData): Promise<AgentLLMPreference> {
    const preference = this.repository.create({
      ...data,
      isActive: true,
      priority: data.priority || 50,
      usageCount: '0'
    });
    
    return this.repository.save(preference);
  }

  async findById(id: string): Promise<AgentLLMPreference | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByAgentAndTask(agentId: string, taskType: LLMTaskType): Promise<AgentLLMPreference | null> {
    return this.repository.findOne({
      where: { agentId, taskType, isActive: true }
    });
  }

  async findByAgent(agentId: string): Promise<AgentLLMPreference[]> {
    return this.repository.find({
      where: { agentId, isActive: true },
      order: { taskType: 'ASC', priority: 'DESC' }
    });
  }

  async findByTaskType(taskType: LLMTaskType): Promise<AgentLLMPreference[]> {
    return this.repository.find({
      where: { taskType, isActive: true },
      order: { priority: 'DESC', createdAt: 'DESC' }
    });
  }

  async findOptimalAgentsForTask(taskType: LLMTaskType, limit: number = 10): Promise<AgentLLMPreference[]> {
    return this.repository
      .createQueryBuilder('preference')
      .leftJoinAndSelect('preference.agent', 'agent')
      .where('preference.taskType = :taskType', { taskType })
      .andWhere('preference.isActive = :isActive', { isActive: true })
      .andWhere('preference.usageCount > :minUsage', { minUsage: '5' })
      .orderBy('preference.successRate', 'DESC')
      .addOrderBy('preference.qualityScore', 'DESC')
      .addOrderBy('preference.averageResponseTime', 'ASC')
      .limit(limit)
      .getMany();
  }

  async update(id: string, data: UpdateAgentLLMPreferenceData): Promise<AgentLLMPreference | null> {
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

  async setActive(id: string, isActive: boolean): Promise<AgentLLMPreference | null> {
    await this.repository.update(id, { 
      isActive,
      updatedAt: new Date()
    });
    
    return this.findById(id);
  }

  async getAgentPreferenceStats(agentId: string): Promise<{
    totalPreferences: number;
    activePreferences: number;
    totalUsage: number;
    averageSuccessRate: number;
    averageResponseTime: number;
    averageQualityScore: number;
    optimalPreferences: number;
  }> {
    const preferences = await this.findByAgent(agentId);
    
    const totalUsage = preferences.reduce((sum, pref) => sum + Number(pref.usageCount), 0);
    const successRates = preferences.filter(p => p.successRate !== undefined).map(p => p.successRate!);
    const responseTimes = preferences.filter(p => p.averageResponseTime !== undefined).map(p => p.averageResponseTime!);
    const qualityScores = preferences.filter(p => p.qualityScore !== undefined).map(p => p.qualityScore!);
    const optimalCount = preferences.filter(p => p.isOptimalForTask()).length;
    
    return {
      totalPreferences: preferences.length,
      activePreferences: preferences.filter(p => p.isActive).length,
      totalUsage,
      averageSuccessRate: successRates.length > 0 ? successRates.reduce((a, b) => a + b, 0) / successRates.length : 0,
      averageResponseTime: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      averageQualityScore: qualityScores.length > 0 ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0,
      optimalPreferences: optimalCount
    };
  }

  async getTaskAnalysis(taskType: LLMTaskType): Promise<{
    totalAgents: number;
    averagePerformance: number;
    topModel: string;
    topProvider: LLMProviderType;
    recommendedSettings: any;
  }> {
    const preferences = await this.findByTaskType(taskType);
    
    if (preferences.length === 0) {
      return {
        totalAgents: 0,
        averagePerformance: 0,
        topModel: '',
        topProvider: LLMProviderType.CUSTOM,
        recommendedSettings: {}
      };
    }

    const performanceScores = preferences.map(p => p.getPerformanceScore());
    const averagePerformance = performanceScores.reduce((a, b) => a + b, 0) / performanceScores.length;
    
    // Find most common model and provider
    const modelCounts = preferences.reduce((acc, pref) => {
      acc[pref.preferredModel] = (acc[pref.preferredModel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const providerCounts = preferences.reduce((acc, pref) => {
      acc[pref.preferredProvider] = (acc[pref.preferredProvider] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topModel = Object.entries(modelCounts).sort(([,a], [,b]) => b - a)[0]?.[0] || '';
    const topProvider = Object.entries(providerCounts).sort(([,a], [,b]) => b - a)[0]?.[0] as LLMProviderType;
    
    // Calculate recommended settings based on high-performing preferences
    const highPerformers = preferences.filter(p => p.getPerformanceScore() > 0.8);
    const settings = highPerformers.map(p => p.getEffectiveSettings()).filter(s => s.temperature !== undefined);
    
    const recommendedSettings = {
      temperature: settings.length > 0 ? settings.reduce((sum, s) => sum + (s.temperature || 0), 0) / settings.length : undefined,
      maxTokens: settings.length > 0 ? Math.round(settings.reduce((sum, s) => sum + (s.maxTokens || 0), 0) / settings.length) : undefined
    };

    return {
      totalAgents: preferences.length,
      averagePerformance,
      topModel,
      topProvider,
      recommendedSettings
    };
  }

  async bulkUpsert(preferences: CreateAgentLLMPreferenceData[]): Promise<AgentLLMPreference[]> {
    const results: AgentLLMPreference[] = [];
    
    for (const prefData of preferences) {
      const existing = await this.findByAgentAndTask(prefData.agentId, prefData.taskType);
      
      if (existing) {
        const updated = await this.update(existing.id, {
          preferredProvider: prefData.preferredProvider,
          preferredModel: prefData.preferredModel,
          fallbackModel: prefData.fallbackModel,
          settings: prefData.settings,
          description: prefData.description,
          reasoning: prefData.reasoning,
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