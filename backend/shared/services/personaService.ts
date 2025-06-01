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
import { logger } from '@uaip/utils/logger';

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
      logger.info('Creating new persona', { name: request.name, createdBy: request.createdBy });

      // Validate persona data
      const validation = await this.validatePersona(request);
      if (!validation.isValid) {
        throw new Error(`Persona validation failed: ${validation.errors.join(', ')}`);
      }

      // Create persona in database
      const persona = await this.databaseService.create<Persona>('personas', {
        ...request,
        id: crypto.randomUUID(),
        status: PersonaStatus.DRAFT,
        version: 1,
        usageStats: {
          totalUsages: 0,
          uniqueUsers: 0,
          averageSessionDuration: 0,
          popularityScore: 0,
          feedbackCount: 0
        },
        validation,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Cache the persona
      this.cachePersona(persona);

      // Emit creation event
      await this.eventBusService.publish('persona.created', {
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
      // Check cache first
      const cached = this.getCachedPersona(id);
      if (cached) {
        return cached;
      }

      // Fetch from database
      const persona = await this.databaseService.findById<Persona>('personas', id);
      if (persona) {
        this.cachePersona(persona);
      }

      return persona;

    } catch (error) {
      logger.error('Failed to get persona', { error: (error as Error).message, personaId: id });
      throw error;
    }
  }

  async updatePersona(id: string, updates: UpdatePersonaRequest): Promise<Persona> {
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
      
      // Update persona in database
      const persona = await this.databaseService.update<Persona>('personas', id, {
        ...updates,
        validation,
        version: existingPersona.version + 1,
        updatedAt: new Date()
      });

      if (!persona) {
        throw new Error(`Failed to update persona: ${id}`);
      }

      // Update cache
      this.cachePersona(persona);

      // Emit update event
      await this.eventBusService.publish('persona.updated', {
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

      // Hard delete
      await this.databaseService.delete('personas', id);

      // Remove from cache
      this.personaCache.delete(id);

      // Emit deletion event
      await this.eventBusService.publish('persona.deleted', {
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
      logger.debug('Searching personas', { filters, limit, offset });

      const query = this.buildSearchQuery(filters);
      const personas = await this.databaseService.findMany<Persona>('personas', query, {
        limit,
        offset,
        orderBy: 'createdAt DESC'
      });

      const total = await this.databaseService.count('personas', query);

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
        if (style.empathy < 0.1 && style.assertiveness > 0.9) {
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

      // Update usage statistics
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

      // Update feedback score if provided
      if (sessionData.satisfactionScore !== undefined) {
        updatedStats.feedbackScore = this.calculateNewAverage(
          currentStats.feedbackScore || 0,
          currentStats.feedbackCount,
          sessionData.satisfactionScore
        );
        updatedStats.feedbackCount = currentStats.feedbackCount + 1;
      }

      // Recalculate popularity score
      updatedStats.popularityScore = this.calculatePopularityScore(updatedStats);

      await this.updatePersona(personaId, { usageStats: updatedStats });

      // Emit usage event
      await this.eventBusService.publish('persona.used', {
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
      const filters: any = { isPublic: true };
      if (category) {
        filters.category = category;
      }

      return await this.databaseService.findMany<PersonaTemplate>('persona_templates', filters, {
        orderBy: 'usageCount DESC'
      });

    } catch (error) {
      logger.error('Failed to get persona templates', { error: (error as Error).message });
      throw error;
    }
  }

  async createPersonaFromTemplate(
    templateId: string,
    customizations: Partial<CreatePersonaRequest>,
    createdBy: string
  ): Promise<Persona> {
    try {
      const template = await this.databaseService.findById<PersonaTemplate>('persona_templates', templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      // Merge template with customizations
      const personaRequest: CreatePersonaRequest = {
        ...template.template,
        ...customizations,
        createdBy
      };

      const persona = await this.createPersona(personaRequest);

      // Update template usage count
      await this.databaseService.update('persona_templates', templateId, {
        usageCount: template.usageCount + 1
      });

      return persona;

    } catch (error) {
      logger.error('Failed to create persona from template', { error: (error as Error).message, templateId });
      throw error;
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private cachePersona(persona: Persona): void {
    this.personaCache.set(persona.id, {
      persona,
      timestamp: Date.now()
    });
  }

  private getCachedPersona(id: string): Persona | null {
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

  private buildSearchQuery(filters: PersonaSearchFilters): any {
    const query: any = {};

    if (filters.query) {
      query.$or = [
        { name: { $regex: filters.query, $options: 'i' } },
        { description: { $regex: filters.query, $options: 'i' } },
        { role: { $regex: filters.query, $options: 'i' } }
      ];
    }

    if (filters.expertise && filters.expertise.length > 0) {
      query['expertise.name'] = { $in: filters.expertise };
    }

    if (filters.status && filters.status.length > 0) {
      query.status = { $in: filters.status };
    }

    if (filters.visibility && filters.visibility.length > 0) {
      query.visibility = { $in: filters.visibility };
    }

    if (filters.createdBy && filters.createdBy.length > 0) {
      query.createdBy = { $in: filters.createdBy };
    }

    if (filters.organizationId) {
      query.organizationId = filters.organizationId;
    }

    if (filters.teamId) {
      query.teamId = filters.teamId;
    }

    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags };
    }

    if (filters.minUsageCount !== undefined) {
      query['usageStats.totalUsages'] = { $gte: filters.minUsageCount };
    }

    if (filters.minFeedbackScore !== undefined) {
      query['usageStats.feedbackScore'] = { $gte: filters.minFeedbackScore };
    }

    if (filters.createdAfter) {
      query.createdAt = { ...query.createdAt, $gte: filters.createdAfter };
    }

    if (filters.createdBefore) {
      query.createdAt = { ...query.createdAt, $lte: filters.createdBefore };
    }

    return query;
  }

  private async getPersonaUsageCount(personaId: string): Promise<number> {
    // This would check active discussions, sessions, etc.
    // For now, return 0 as placeholder
    return 0;
  }

  private async getUserPersonaHistory(userId: string): Promise<any[]> {
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

  private async calculatePersonaMetrics(personaId: string, timeframe: { start: Date; end: Date }): Promise<any> {
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

  private async calculatePersonaTrends(personaId: string, timeframe: { start: Date; end: Date }): Promise<any> {
    // Calculate persona trends
    // Placeholder implementation
    return {
      usageGrowth: 0,
      satisfactionTrend: 0,
      popularityRank: 1
    };
  }

  private async getTopInteractions(personaId: string, timeframe: { start: Date; end: Date }): Promise<any[]> {
    // Get top interactions for the persona
    // Placeholder implementation
    return [];
  }

  private async getCommonIssues(personaId: string, timeframe: { start: Date; end: Date }): Promise<any[]> {
    // Get common issues for the persona
    // Placeholder implementation
    return [];
  }

  private calculateNewAverage(currentAverage: number, count: number, newValue: number): number {
    return (currentAverage * count + newValue) / (count + 1);
  }

  private calculatePopularityScore(stats: PersonaUsageStats): number {
    // Calculate popularity score based on usage statistics
    let score = 0;

    // Base score from usage count
    score += Math.min(stats.totalUsages * 2, 50);

    // Bonus for unique users
    score += Math.min(stats.uniqueUsers * 3, 30);

    // Bonus for feedback score
    if (stats.feedbackScore && stats.feedbackCount > 0) {
      score += (stats.feedbackScore / 5) * 20;
    }

    return Math.min(100, score);
  }
} 