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
  private personaCache: Map<number, { persona: Persona; timestamp: number }>;

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

  // Helper function to safely parse JSON or return object if already parsed
  private safeJsonParse(value: any, defaultValue: any = null): any {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (error) {
        logger.warn('Failed to parse JSON string', { value, error: (error as Error).message });
        return defaultValue;
      }
    }
    // If it's already an object, return as-is
    return value;
  }

  async createPersona(request: CreatePersonaRequest): Promise<Persona> {
    try {
      logger.info('Creating new persona', { name: request.name, role: request.role });

      // Validate the persona data
      const validation = await this.validatePersona(request);

      // Create persona using TypeORM repository
      const personaRepo = await this.databaseService.getRepository(PersonaEntity);
      
      // Convert expertise from complex objects to simple strings for entity
      const expertiseStrings = request.expertise?.map(exp => 
        typeof exp === 'string' ? exp : exp.name || exp.category || 'Unknown'
      ) || [];

      const personaData = {
        id: this.generatePersonaId(),
        name: request.name,
        role: request.role,
        description: request.description,
        traits: request.traits || [],
        expertise: expertiseStrings,
        background: request.background,
        systemPrompt: request.systemPrompt,
        conversationalStyle: request.conversationalStyle,
        status: request.status || PersonaStatus.ACTIVE,
        visibility: request.visibility || PersonaVisibility.PRIVATE,
        createdBy: request.createdBy,
        organizationId: request.organizationId,
        teamId: request.teamId,
        version: 1,
        parentPersonaId: request.parentPersonaId,
        tags: request.tags || [],
        validation,
        usageStats: {
          totalSessions: 0,
          totalMessages: 0,
          averageSessionDuration: 0,
          averageSatisfactionScore: 0,
          lastUsed: null,
          popularityScore: 0
        },
        configuration: request.configuration || {},
        capabilities: request.capabilities || [],
        restrictions: request.restrictions || {},
        metadata: request.metadata,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const savedEntity = await personaRepo.save(personaData);

      // Convert entity back to Persona type for return
      const persona: Persona = this.entityToPersona(savedEntity);

      // Cache the persona
      this.cachePersona(persona);

      // Emit creation event
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

  async getPersona(id: number): Promise<Persona | null> {
    try {
      // Check cache first
      const cached = this.getCachedPersona(id);
      if (cached) {
        return cached;
      }

      // Fetch from database using TypeORM repository
      const personaRepo = await this.databaseService.getRepository(PersonaEntity);
      const entity = await personaRepo.findOne({ where: { id } });
      
      if (!entity) {
        return null;
      }

      const persona = this.entityToPersona(entity);

      if (persona) {
        this.cachePersona(persona);
      }

      return persona;

    } catch (error) {
      logger.error('Failed to get persona', { error: (error as Error).message, personaId: id });
      throw error;
    }
  }

  async updatePersona(id: number, updates: UpdatePersonaRequest): Promise<Persona> {
    try {
      logger.info('Updating persona', { personaId: id, updates: Object.keys(updates) });

      // Get existing persona
      const existingPersona = await this.getPersona(id);
      if (!existingPersona) {
        throw new Error(`Persona not found: ${id}`);
      }

      // Validate updates
      const updatedPersona = { ...existingPersona, ...updates };
      const validation = await this.validatePersona(updatedPersona);
      
      // Convert expertise if provided
      const updateData: any = { ...updates };
      if (updates.expertise) {
        updateData.expertise = updates.expertise.map(exp => 
          typeof exp === 'string' ? exp : exp.name || exp.category || 'Unknown'
        );
      }
      
      // Update persona using TypeORM repository
      const personaRepo = await this.databaseService.getRepository(PersonaEntity);
      await personaRepo.update(id, {
        ...updateData,
        validation,
        version: (existingPersona.version || 0) + 1,
        updatedAt: new Date()
      });

      const updatedEntity = await personaRepo.findOne({ where: { id } });
      if (!updatedEntity) {
        throw new Error(`Failed to update persona: ${id}`);
      }

      const persona = this.entityToPersona(updatedEntity);

      // Update cache
      this.cachePersona(persona);

      // Emit update event
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

  async deletePersona(id: number, deletedBy: number): Promise<void> {
    try {
      logger.info('Deleting persona', { personaId: id, deletedBy });

      // Check if persona exists
      const persona = await this.getPersona(id);
      if (!persona) {
        throw new Error(`Persona not found: ${id}`);
      }

      // Check if persona is in use
      const usageCount = await this.getPersonaUsageCount(id);
      if (usageCount > 0) {
        // Soft delete - mark as archived instead
        await this.updatePersona(id, { 
          status: PersonaStatus.ARCHIVED,
          updatedAt: new Date()
        });
        logger.info('Persona archived due to active usage', { personaId: id, usageCount });
        return;
      }

      // Hard delete using TypeORM repository
      const personaRepo = await this.databaseService.getRepository(PersonaEntity);
      await personaRepo.delete(id);

      // Remove from cache
      this.personaCache.delete(id);

      // Emit deletion event
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

      // Apply filters using TypeORM QueryBuilder
      this.applySearchFilters(queryBuilder, filters);

      // Get total count
      const total = await queryBuilder.getCount();

      // Apply pagination and ordering
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
    userId: number,
    context?: string,
    limit = 10
  ): Promise<PersonaRecommendation[]> {
    if (!this.enableRecommendations) {
      return [];
    }

    try {
      logger.debug('Getting persona recommendations', { userId, context, limit });

      // Get user's persona usage history
      const userHistory = await this.getUserPersonaHistory(userId);
      
      // Get similar personas based on usage patterns
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
      // Required field validation
      if (!persona.name || persona.name.trim().length === 0) {
        errors.push('Persona name is required');
      }

      if (!persona.role || persona.role.trim().length === 0) {
        errors.push('Persona role is required');
      }

      if (!persona.systemPrompt || persona.systemPrompt.trim().length < 10) {
        errors.push('System prompt must be at least 10 characters long');
      }

      // Content quality validation
      if (persona.description && persona.description.length < 20) {
        warnings.push('Description is quite short, consider adding more detail');
      }

      if (persona.background && persona.background.length < 50) {
        warnings.push('Background is quite brief, consider expanding');
      }

      // Expertise validation
      if (persona.expertise && persona.expertise.length === 0) {
        warnings.push('No expertise domains defined');
      }

      // Traits validation
      if (persona.traits && persona.traits.length === 0) {
        suggestions.push('Consider adding personality traits for better persona definition');
      }

      // Conversational style validation
      if (persona.conversationalStyle) {
        const style = persona.conversationalStyle;
        if ((style.empathy || 0) < 0.1 && (style.assertiveness || 0) > 0.9) {
          warnings.push('Very low empathy with high assertiveness may create harsh interactions');
        }
      }

      // Calculate validation score
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

  async getPersonaAnalytics(personaId: number, timeframe?: {
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
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        end: new Date()
      };

      const analyticsTimeframe = timeframe || defaultTimeframe;

      // Get usage metrics
      const metrics = await this.calculatePersonaMetrics(personaId, analyticsTimeframe);
      
      // Get trends
      const trends = await this.calculatePersonaTrends(personaId, analyticsTimeframe);

      // Get interaction data
      const topInteractions = await this.getTopInteractions(personaId, analyticsTimeframe);

      // Get common issues
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

  async updatePersonaUsage(personaId: number, sessionData: {
    userId: number;
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

      // Update usage statistics
      const updatedStats: PersonaUsageStats = {
        ...currentStats,
        totalUsages: (currentStats.totalUsages || 0) + 1,
        lastUsedAt: new Date(),
        averageSessionDuration: this.calculateNewAverage(
          currentStats.averageSessionDuration || 0,
          currentStats.totalUsages || 0,
          sessionData.duration
        )
      };

      // Update feedback score if provided
      if (sessionData.satisfactionScore !== undefined) {
        updatedStats.feedbackScore = this.calculateNewAverage(
          currentStats.feedbackScore || 0,
          currentStats.feedbackCount || 0,
          sessionData.satisfactionScore
        );
        updatedStats.feedbackCount = (currentStats.feedbackCount || 0) + 1;
      }

      // Recalculate popularity score
      updatedStats.popularityScore = this.calculatePopularityScore(updatedStats);

      await this.updatePersona(personaId, { usageStats: updatedStats });

      // Emit usage event
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
        // Note: Would need to add category field to entity for proper filtering
        queryBuilder.where('persona.tags LIKE :category', { category: `%${category}%` });
      }

      queryBuilder.orderBy('persona.totalInteractions', 'DESC');
      const entities = await queryBuilder.getMany();

      // Convert entities to templates (simplified for now)
      return entities.map(entity => ({
        id: entity.id,
        name: entity.name,
        description: entity.description,
        category: 'general', // Would need to add category field to entity
        traits: entity.traits,
        expertise: entity.expertise,
        usageCount: entity.totalInteractions || 0
      }));

    } catch (error) {
      logger.error('Failed to get persona templates', { error: (error as Error).message, category });
      throw error;
    }
  }

  async createPersonaFromTemplate(
    templateId: number,
    customizations: Partial<CreatePersonaRequest>,
    createdBy: number
  ): Promise<Persona> {
    try {
      // Get template persona (using existing persona as template)
      const templatePersona = await this.getPersona(templateId);
      if (!templatePersona) {
        throw new Error(`Template persona not found: ${templateId}`);
      }

      // Merge template with customizations
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
        parentPersonaId: templateId, // Link to template
        tags: customizations.tags || templatePersona.tags,
        configuration: customizations.configuration || templatePersona.configuration,
        capabilities: customizations.capabilities || templatePersona.capabilities,
        restrictions: customizations.restrictions || templatePersona.restrictions,
        metadata: customizations.metadata || templatePersona.metadata
      };

      const persona = await this.createPersona(personaRequest);

      // Update template usage stats
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

  private cachePersona(persona: Persona): void {
    this.personaCache.set(persona.id!, {
      persona,
      timestamp: Date.now()
    });
  }

  private getCachedPersona(id: number): Persona | null {
    const cached = this.personaCache.get(id);
    if (!cached) {
      return null;
    }

    // Check if cache is expired
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
      // For JSON array field, use JSON operations
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

  private async getPersonaUsageCount(personaId: number): Promise<number> {
    // This would check active discussions, sessions, etc.
    // For now, return 0 as placeholder
    return 0;
  }

  private async getUserPersonaHistory(userId: number): Promise<any[]> {
    // Get user's persona usage history from database
    // Placeholder implementation
    return [];
  }

  private async generateRecommendations(
    userHistory: any[],
    context?: string,
    limit = 10
  ): Promise<PersonaRecommendation[]> {
    // Generate persona recommendations based on user history and context
    // Placeholder implementation
    return [];
  }

  private calculateValidationScore(
    persona: Partial<Persona>,
    errors: string[],
    warnings: string[]
  ): number {
    let score = 100;

    // Deduct points for errors and warnings
    score -= errors.length * 20;
    score -= warnings.length * 5;

    // Add points for completeness
    if (persona.description && persona.description.length > 100) score += 5;
    if (persona.background && persona.background.length > 200) score += 5;
    if (persona.expertise && persona.expertise.length > 2) score += 5;
    if (persona.traits && persona.traits.length > 3) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private async calculatePersonaMetrics(personaId: number, timeframe: { start: Date; end: Date }): Promise<any> {
    // Calculate persona metrics for the given timeframe
    // Placeholder implementation
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

  private async calculatePersonaTrends(personaId: number, timeframe: { start: Date; end: Date }): Promise<any> {
    // Calculate persona trends
    // Placeholder implementation
    return {
      usageGrowth: 0,
      satisfactionTrend: 0,
      popularityRank: 1
    };
  }

  private async getTopInteractions(personaId: number, timeframe: { start: Date; end: Date }): Promise<any[]> {
    // Get top interactions for the persona
    // Placeholder implementation
    return [];
  }

    private async getCommonIssues(personaId: number, timeframe: { start: Date; end: Date }): Promise<any[]> {
    // Get common issues for the persona
    // Placeholder implementation
    return [];
  }

  private calculateNewAverage(currentAverage: number, count: number, newValue: number): number {
    return (currentAverage * count + newValue) / (count + 1);
  }

  private calculatePopularityScore(stats: PersonaUsageStats): number {
    let score = 0;
    
    // Usage frequency (max 50 points)
    score += Math.min((stats.totalUsages || 0) * 2, 50);
    
    // User diversity (max 30 points)
    score += Math.min((stats.uniqueUsers || 0) * 3, 30);
    
    // Feedback quality (max 20 points)
    if (stats.feedbackScore && (stats.feedbackCount || 0) > 0) {
      score += stats.feedbackScore * 20;
    }
    
    return Math.min(score, 100);
  }

  private generatePersonaId(): number {
    return Date.now(); // Use timestamp as simple numeric ID
  }

  private async safePublishEvent(eventType: string, data: any): Promise<void> {
    try {
      await this.eventBusService.publish(eventType, data);
    } catch (error) {
      logger.warn(`Failed to publish event ${eventType}, continuing without event:`, error);
      // Don't throw - allow operation to continue even if event publishing fails
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
      expertise: (entity.expertise || []).map((exp, index) => ({
        id: Date.now() + index, // Use timestamp + index as simple numeric ID
        name: exp,
        description: '',
        category: 'general',
        level: 'intermediate' as const,
        keywords: [],
        relatedDomains: []
      })),
      background: entity.background,
      systemPrompt: entity.systemPrompt,
      conversationalStyle: entity.conversationalStyle,
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
        totalUsages: entity.totalInteractions || 0,
        uniqueUsers: 0,
        averageSessionDuration: 0,
        lastUsedAt: entity.lastUsedAt || null,
        popularityScore: 0,
        feedbackScore: entity.userSatisfaction || 0,
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