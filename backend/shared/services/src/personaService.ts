import { 
  Persona, 
  PersonaSearchFilters, 
  CreatePersonaRequest, 
  UpdatePersonaRequest,
  PersonaRecommendation,
  PersonaAnalytics,
  PersonaTemplate,
  PersonaValidation,
  PersonaUsageStats,
  PersonaStatus,
  PersonaVisibility,
  ExpertiseDomain,
  PersonaTrait
} from '@uaip/types';
import { DatabaseService } from './databaseService.js';
import { EventBusService } from './eventBusService.js';
import { logger } from '@uaip/utils';
import { Persona as PersonaEntity } from './entities/persona.entity.js';
import { SelectQueryBuilder } from 'typeorm';

export interface PersonaServiceConfig {
  databaseService: DatabaseService;
  eventBusService: EventBusService;
  enableAnalytics?: boolean;
  enableRecommendations?: boolean;
  enableCaching?: boolean;
  cacheTimeout?: number;
}

export class PersonaService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private enableAnalytics: boolean;
  private enableRecommendations: boolean;
  private enableCaching: boolean;
  private cacheTimeout: number;
  private personaCache: Map<string, { persona: Persona; timestamp: number }>;

  constructor(config: PersonaServiceConfig) {
    this.databaseService = config.databaseService;
    this.eventBusService = config.eventBusService;
    this.enableAnalytics = config.enableAnalytics ?? true;
    this.enableRecommendations = config.enableRecommendations ?? true;
    this.enableCaching = config.enableCaching ?? true;
    this.cacheTimeout = config.cacheTimeout ?? 300000; // 5 minutes
    this.personaCache = new Map();
  }

  // ===== PERSONA CRUD OPERATIONS =====

  async createPersona(request: CreatePersonaRequest): Promise<Persona> {
    try {
      logger.info('Creating new persona', { name: request.name, role: request.role });

      // Validate the persona data
      const validation = await this.validatePersona(request);

      const personaRepo = await this.databaseService.getRepository(PersonaEntity);
      
      const personaData = {
        name: request.name,
        role: request.role,
        description: request.description,
        traits: request.traits || [],
        expertise: this.extractExpertiseNames(request.expertise || []),
        background: request.background,
        systemPrompt: request.systemPrompt,
        conversationalStyle: request.conversationalStyle,
        status: request.status || PersonaStatus.ACTIVE,
        visibility: request.visibility || PersonaVisibility.PRIVATE,
        createdBy: request.createdBy || 'system',
        organizationId: request.organizationId,
        teamId: request.teamId,
        version: 1,
        parentPersonaId: request.parentPersonaId,
        tags: request.tags || [],
        validation,
        usageStats: {
          totalUsages: 0,
          uniqueUsers: 0,
          averageSessionDuration: 0,
          popularityScore: 0,
          feedbackCount: 0
        },
        configuration: request.configuration || {},
        capabilities: request.capabilities || [],
        restrictions: request.restrictions || {},
        metadata: request.metadata,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const savedEntity = await personaRepo.save(personaData);
      const persona = this.entityToPersona(savedEntity);

      this.cachePersona(persona);

      await this.safePublishEvent('persona.created', {
        personaId: persona.id,
        createdBy: persona.createdBy,
        name: persona.name,
        timestamp: new Date()
      });

      logger.info('Persona created successfully', { personaId: persona.id });
      return persona;

    } catch (error) {
      logger.error('Failed to create persona', { error: (error as Error).message, request });
      throw error;
    }
  }

  async getPersona(id: string): Promise<Persona | null> {
    try {
      const cached = this.getCachedPersona(id);
      if (cached) {
        return cached;
      }

      const personaRepo = await this.databaseService.getRepository(PersonaEntity);
      const entity = await personaRepo.findOne({ where: { id } });
      
      if (!entity) {
        return null;
      }

      const persona = this.entityToPersona(entity);
      this.cachePersona(persona);
      return persona;

    } catch (error) {
      logger.error('Failed to get persona', { error: (error as Error).message, personaId: id });
      throw error;
    }
  }

  async updatePersona(id: string, updates: UpdatePersonaRequest): Promise<Persona> {
    try {
      logger.info('Updating persona', { personaId: id, updates: Object.keys(updates) });

      const existingPersona = await this.getPersona(id);
      if (!existingPersona) {
        throw new Error(`Persona not found: ${id}`);
      }

      const updatedPersona = { ...existingPersona, ...updates };
      const validation = await this.validatePersona(updatedPersona);
      
      const updateData: any = { ...updates };
      if (updates.expertise) {
        updateData.expertise = this.extractExpertiseNames(updates.expertise);
      }
      
      const personaRepo = await this.databaseService.getRepository(PersonaEntity);
      await personaRepo.update(id, {
        ...updateData,
        validation,
        version: existingPersona.version + 1,
        updatedAt: new Date()
      });

      const updatedEntity = await personaRepo.findOne({ where: { id } });
      if (!updatedEntity) {
        throw new Error(`Failed to update persona: ${id}`);
      }

      const persona = this.entityToPersona(updatedEntity);
      this.cachePersona(persona);

      await this.safePublishEvent('persona.updated', {
        personaId: persona.id,
        updatedBy: existingPersona.createdBy,
        changes: Object.keys(updates),
        timestamp: new Date()
      });

      logger.info('Persona updated successfully', { personaId: id });
      return persona;

    } catch (error) {
      logger.error('Failed to update persona', { error: (error as Error).message, personaId: id });
      throw error;
    }
  }

  async deletePersona(id: string, deletedBy: string): Promise<void> {
    try {
      logger.info('Deleting persona', { personaId: id, deletedBy });

      const persona = await this.getPersona(id);
      if (!persona) {
        throw new Error(`Persona not found: ${id}`);
      }

      const usageCount = await this.getPersonaUsageCount(id);
      if (usageCount > 0) {
        await this.updatePersona(id, { 
          status: PersonaStatus.ARCHIVED,
          updatedAt: new Date()
        });
        logger.info('Persona archived due to active usage', { personaId: id, usageCount });
        return;
      }

      const personaRepo = await this.databaseService.getRepository(PersonaEntity);
      await personaRepo.delete(id);

      this.personaCache.delete(id);

      await this.safePublishEvent('persona.deleted', {
        personaId: id,
        deletedBy,
        timestamp: new Date()
      });

      logger.info('Persona deleted successfully', { personaId: id });

    } catch (error) {
      logger.error('Failed to delete persona', { error: (error as Error).message, personaId: id });
      throw error;
    }
  }

  // ===== PERSONA SEARCH AND DISCOVERY =====

  async searchPersonas(filters: PersonaSearchFilters, limit = 20, offset = 0): Promise<{
    personas: Persona[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const personaRepo = await this.databaseService.getRepository(PersonaEntity);
      const queryBuilder = personaRepo.createQueryBuilder('persona');

      this.applySearchFilters(queryBuilder, filters);

      const total = await queryBuilder.getCount();

      queryBuilder
        .orderBy('persona.createdAt', 'DESC')
        .skip(offset)
        .take(limit);

      const entities = await queryBuilder.getMany();
      const personas = entities.map(entity => this.entityToPersona(entity));

      return {
        personas,
        total,
        hasMore: offset + personas.length < total
      };

    } catch (error) {
      logger.error('Failed to search personas', { error: (error as Error).message, filters });
      throw error;
    }
  }

  async getPersonaRecommendations(
    userId: string,
    context?: string,
    limit = 10
  ): Promise<PersonaRecommendation[]> {
    if (!this.enableRecommendations) {
      return [];
    }

    try {
      logger.debug('Getting persona recommendations', { userId, context, limit });

      const userHistory = await this.getUserPersonaHistory(userId);
      const recommendations = await this.generateRecommendations(userHistory, context, limit);

      return recommendations;

    } catch (error) {
      logger.error('Failed to get persona recommendations', { error: (error as Error).message, userId });
      throw error;
    }
  }

  // ===== PERSONA VALIDATION =====

  async validatePersona(persona: Partial<Persona>): Promise<PersonaValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    try {
      if (!persona.name || persona.name.trim().length === 0) {
        errors.push('Persona name is required');
      }

      if (!persona.role || persona.role.trim().length === 0) {
        errors.push('Persona role is required');
      }

      if (!persona.systemPrompt || persona.systemPrompt.trim().length < 10) {
        errors.push('System prompt must be at least 10 characters long');
      }

      if (persona.description && persona.description.length < 20) {
        warnings.push('Description is quite short, consider adding more detail');
      }

      if (persona.background && persona.background.length < 50) {
        warnings.push('Background is quite brief, consider expanding');
      }

      if (persona.expertise && persona.expertise.length === 0) {
        warnings.push('No expertise domains defined');
      }

      if (persona.traits && persona.traits.length === 0) {
        suggestions.push('Consider adding personality traits for better persona definition');
      }

      if (persona.conversationalStyle) {
        const style = persona.conversationalStyle;
        if (style.empathy < 0.1 && style.assertiveness > 0.9) {
          warnings.push('Very low empathy with high assertiveness may create harsh interactions');
        }
      }

      const score = this.calculateValidationScore(persona, errors, warnings);

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        suggestions,
        score,
        validatedAt: new Date()
      };

    } catch (error) {
      logger.error('Persona validation failed', { error: (error as Error).message });
      throw error;
    }
  }

  // ===== PERSONA ANALYTICS =====

  async getPersonaAnalytics(personaId: string, timeframe?: {
    start: Date;
    end: Date;
  }): Promise<PersonaAnalytics | null> {
    if (!this.enableAnalytics) {
      return null;
    }

    try {
      const persona = await this.getPersona(personaId);
      if (!persona) {
        return null;
      }

      const defaultTimeframe = {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date()
      };

      const analyticsTimeframe = timeframe || defaultTimeframe;

      const metrics = await this.calculatePersonaMetrics(personaId, analyticsTimeframe);
      const trends = await this.calculatePersonaTrends(personaId, analyticsTimeframe);
      const topInteractions = await this.getTopInteractions(personaId, analyticsTimeframe);
      const commonIssues = await this.getCommonIssues(personaId, analyticsTimeframe);

      return {
        personaId,
        timeframe: analyticsTimeframe,
        metrics,
        trends,
        topInteractions,
        commonIssues
      };

    } catch (error) {
      logger.error('Failed to get persona analytics', { error: (error as Error).message, personaId });
      throw error;
    }
  }

  async updatePersonaUsage(personaId: string, sessionData: {
    userId: string;
    duration: number;
    messageCount: number;
    satisfactionScore?: number;
  }): Promise<void> {
    try {
      const persona = await this.getPersona(personaId);
      if (!persona) {
        return;
      }

      const currentStats = persona.usageStats || {
        totalUsages: 0,
        uniqueUsers: 0,
        averageSessionDuration: 0,
        popularityScore: 0,
        feedbackCount: 0
      };

      const updatedStats: PersonaUsageStats = {
        ...currentStats,
        totalUsages: currentStats.totalUsages + 1,
        lastUsedAt: new Date(),
        averageSessionDuration: this.calculateNewAverage(
          currentStats.averageSessionDuration,
          currentStats.totalUsages,
          sessionData.duration
        )
      };

      if (sessionData.satisfactionScore !== undefined) {
        updatedStats.feedbackScore = this.calculateNewAverage(
          currentStats.feedbackScore || 0,
          currentStats.feedbackCount,
          sessionData.satisfactionScore
        );
        updatedStats.feedbackCount = currentStats.feedbackCount + 1;
      }

      updatedStats.popularityScore = this.calculatePopularityScore(updatedStats);

      await this.updatePersona(personaId, { usageStats: updatedStats });

      await this.safePublishEvent('persona.used', {
        personaId,
        userId: sessionData.userId,
        duration: sessionData.duration,
        messageCount: sessionData.messageCount,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Failed to update persona usage', { error: (error as Error).message, personaId });
      throw error;
    }
  }

  // ===== PERSONA TEMPLATES =====

  async getPersonaTemplates(category?: string): Promise<PersonaTemplate[]> {
    try {
      const personaRepo = await this.databaseService.getRepository(PersonaEntity);
      const queryBuilder = personaRepo.createQueryBuilder('persona');

      if (category) {
        queryBuilder.where('persona.tags LIKE :category', { category: `%${category}%` });
      }

      queryBuilder.orderBy('persona.totalInteractions', 'DESC');
      const entities = await queryBuilder.getMany();

      return entities.map(entity => ({
        id: entity.id,
        name: entity.name,
        description: entity.description,
        category: 'general',
        traits: entity.traits,
        expertise: entity.expertise,
        usageCount: entity.totalInteractions
      }));

    } catch (error) {
      logger.error('Failed to get persona templates', { error: (error as Error).message, category });
      throw error;
    }
  }

  async createPersonaFromTemplate(
    templateId: string,
    customizations: Partial<CreatePersonaRequest>,
    createdBy: string
  ): Promise<Persona> {
    try {
      const templatePersona = await this.getPersona(templateId);
      if (!templatePersona) {
        throw new Error(`Template persona not found: ${templateId}`);
      }

      const personaRequest: CreatePersonaRequest = {
        name: customizations.name || `${templatePersona.name} (Copy)`,
        role: customizations.role || templatePersona.role,
        description: customizations.description || templatePersona.description,
        traits: customizations.traits || templatePersona.traits,
        expertise: customizations.expertise || templatePersona.expertise,
        background: customizations.background || templatePersona.background,
        systemPrompt: customizations.systemPrompt || templatePersona.systemPrompt,
        conversationalStyle: customizations.conversationalStyle || templatePersona.conversationalStyle,
        status: customizations.status || PersonaStatus.ACTIVE,
        visibility: customizations.visibility || PersonaVisibility.PRIVATE,
        createdBy,
        organizationId: customizations.organizationId || templatePersona.organizationId,
        teamId: customizations.teamId || templatePersona.teamId,
        parentPersonaId: templateId,
        tags: customizations.tags || templatePersona.tags,
        configuration: customizations.configuration || templatePersona.configuration,
        capabilities: customizations.capabilities || templatePersona.capabilities,
        restrictions: customizations.restrictions || templatePersona.restrictions,
        metadata: customizations.metadata || templatePersona.metadata
      };

      const persona = await this.createPersona(personaRequest);

      await this.updatePersonaUsage(templateId, {
        userId: createdBy,
        duration: 0,
        messageCount: 0
      });

      return persona;

    } catch (error) {
      logger.error('Failed to create persona from template', { error: (error as Error).message, templateId });
      throw error;
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private extractExpertiseNames(expertise: ExpertiseDomain[]): string[] {
    return expertise.map(exp => exp.name);
  }

  private cachePersona(persona: Persona): void {
    this.personaCache.set(persona.id!, {
      persona,
      timestamp: Date.now()
    });
  }

  private getCachedPersona(id: string): Persona | null {
    const cached = this.personaCache.get(id);
    if (!cached) {
      return null;
    }

    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.personaCache.delete(id);
      return null;
    }

    return cached.persona;
  }

  private applySearchFilters(queryBuilder: SelectQueryBuilder<PersonaEntity>, filters: PersonaSearchFilters): void {
    if (filters.query) {
      queryBuilder.andWhere(
        '(persona.name ILIKE :query OR persona.description ILIKE :query OR persona.role ILIKE :query)',
        { query: `%${filters.query}%` }
      );
    }

    if (filters.expertise && filters.expertise.length > 0) {
      queryBuilder.andWhere(
        'EXISTS (SELECT 1 FROM jsonb_array_elements_text(persona.expertise) AS exp WHERE exp = ANY(:expertise))',
        { expertise: filters.expertise }
      );
    }

    if (filters.status && filters.status.length > 0) {
      queryBuilder.andWhere('persona.status IN (:...status)', { status: filters.status });
    }

    if (filters.visibility && filters.visibility.length > 0) {
      queryBuilder.andWhere('persona.visibility IN (:...visibility)', { visibility: filters.visibility });
    }

    if (filters.createdBy && filters.createdBy.length > 0) {
      queryBuilder.andWhere('persona.createdBy IN (:...createdBy)', { createdBy: filters.createdBy });
    }

    if (filters.organizationId) {
      queryBuilder.andWhere('persona.organizationId = :organizationId', { organizationId: filters.organizationId });
    }

    if (filters.teamId) {
      queryBuilder.andWhere('persona.teamId = :teamId', { teamId: filters.teamId });
    }

    if (filters.tags && filters.tags.length > 0) {
      queryBuilder.andWhere(
        'EXISTS (SELECT 1 FROM jsonb_array_elements_text(persona.tags) AS tag WHERE tag = ANY(:tags))',
        { tags: filters.tags }
      );
    }

    if (filters.minUsageCount !== undefined) {
      queryBuilder.andWhere('persona.totalInteractions >= :minUsageCount', { minUsageCount: filters.minUsageCount });
    }

    if (filters.minFeedbackScore !== undefined) {
      queryBuilder.andWhere('persona.userSatisfaction >= :minFeedbackScore', { minFeedbackScore: filters.minFeedbackScore });
    }

    if (filters.createdAfter) {
      queryBuilder.andWhere('persona.createdAt >= :createdAfter', { createdAfter: filters.createdAfter });
    }

    if (filters.createdBefore) {
      queryBuilder.andWhere('persona.createdAt <= :createdBefore', { createdBefore: filters.createdBefore });
    }
  }

  private async getPersonaUsageCount(personaId: string): Promise<number> {
    return 0;
  }

  private async getUserPersonaHistory(userId: string): Promise<any[]> {
    return [];
  }

  private async generateRecommendations(
    userHistory: any[],
    context?: string,
    limit = 10
  ): Promise<PersonaRecommendation[]> {
    return [];
  }

  private calculateValidationScore(
    persona: Partial<Persona>,
    errors: string[],
    warnings: string[]
  ): number {
    let score = 100;

    score -= errors.length * 20;
    score -= warnings.length * 5;

    if (persona.description && persona.description.length > 100) score += 5;
    if (persona.background && persona.background.length > 200) score += 5;
    if (persona.expertise && persona.expertise.length > 2) score += 5;
    if (persona.traits && persona.traits.length > 3) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private async calculatePersonaMetrics(personaId: string, timeframe: { start: Date; end: Date }): Promise<any> {
    return {
      totalSessions: 0,
      totalMessages: 0,
      averageSessionDuration: 0,
      uniqueUsers: 0,
      satisfactionScore: 0,
      completionRate: 0,
      errorRate: 0
    };
  }

  private async calculatePersonaTrends(personaId: string, timeframe: { start: Date; end: Date }): Promise<any> {
    return {
      usageGrowth: 0,
      satisfactionTrend: 0,
      popularityRank: 1
    };
  }

  private async getTopInteractions(personaId: string, timeframe: { start: Date; end: Date }): Promise<any[]> {
    return [];
  }

  private async getCommonIssues(personaId: string, timeframe: { start: Date; end: Date }): Promise<any[]> {
    return [];
  }

  private calculateNewAverage(currentAverage: number, count: number, newValue: number): number {
    return (currentAverage * count + newValue) / (count + 1);
  }

  private calculatePopularityScore(stats: PersonaUsageStats): number {
    let score = 0;
    
    score += Math.min(stats.totalUsages * 2, 50);
    score += Math.min(stats.uniqueUsers * 3, 30);
    
    if (stats.feedbackScore && stats.feedbackCount > 0) {
      score += stats.feedbackScore * 20;
    }
    
    return Math.min(score, 100);
  }

  private async safePublishEvent(eventType: string, data: any): Promise<void> {
    try {
      await this.eventBusService.publish(eventType, data);
    } catch (error) {
      logger.warn(`Failed to publish event ${eventType}, continuing without event:`, error);
    }
  }

  /**
   * Convert PersonaEntity to Persona type
   */
  private entityToPersona(entity: PersonaEntity): Persona {
    return {
      id: entity.id,
      name: entity.name,
      role: entity.role,
      description: entity.description,
      traits: entity.traits || [],
      expertise: (entity.expertise || []).map((expName, index) => ({
        id: `${Date.now()}-${index}`,
        name: expName,
        description: '',
        category: 'general',
        level: 'intermediate' as const,
        keywords: [],
        relatedDomains: []
      })),
      background: entity.background,
      systemPrompt: entity.systemPrompt,
      conversationalStyle: entity.conversationalStyle!,
      status: entity.status,
      visibility: entity.visibility,
      createdBy: entity.createdBy,
      organizationId: entity.organizationId,
      teamId: entity.teamId,
      version: entity.version,
      parentPersonaId: entity.parentPersonaId,
      tags: entity.tags || [],
      validation: entity.validation,
      usageStats: entity.usageStats || {
        totalUsages: entity.totalInteractions,
        uniqueUsers: 0,
        averageSessionDuration: 0,
        lastUsedAt: entity.lastUsedAt || undefined,
        popularityScore: 0,
        feedbackScore: entity.userSatisfaction,
        feedbackCount: 0
      },
      configuration: entity.configuration || {},
      capabilities: entity.capabilities || [],
      restrictions: entity.restrictions || {},
      metadata: entity.metadata,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    };
  }
} 