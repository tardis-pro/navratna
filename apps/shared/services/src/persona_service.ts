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
    PersonaTrait as _PersonaTrait,
    ConversationalStyle,
} from '@uaip/types';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/event_bus';
import { logger, NotFoundError, InternalServerError } from '@uaip/utils';
import { PersonaRepository } from './database/repositories/agent_repository';
import type { Persona as PersonaRow, NewPersona } from './database/drizzle/schemas/intelligence_schema';

type QueryParam = string | number | boolean | Date | string[];
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | Date | JsonValue[] | { [key: string]: JsonValue };

type PersonaHistoryItem = {
    personaId: string;
    usedAt: Date;
    duration: number;
    messageCount: number;
};
type PersonaMetricsSnapshot = {
    totalSessions: number;
    totalMessages: number;
    averageSessionDuration: number;
    uniqueUsers: number;
    satisfactionScore: number;
    completionRate: number;
    errorRate: number;
};
type PersonaTrendSnapshot = {
    usageGrowth: number;
    satisfactionTrend: number;
    popularityRank: number;
};
type PersonaInteractionStat = { type: string; count: number; averageDuration: number };
type PersonaIssueStat = {
    severity: 'low' | 'medium' | 'high';
    frequency: number;
    issue: string;
};

export interface PersonaServiceConfig {
    databaseService: DatabaseService;
    eventBusService: EventBusService;
    enableAnalytics?: boolean;
    enableRecommendations?: boolean;
    enableCaching?: boolean;
    cacheTimeout?: number;
    cacheConfig?: {
        redis?: string;
        ttl?: number;
        securityLevel?: number;
    };
}

export class PersonaService {
    private databaseService: DatabaseService;
    private eventBusService: EventBusService;
    private enableAnalytics: boolean;
    private enableRecommendations: boolean;
    private enableCaching: boolean;
    private cacheTimeout: number;
    private personaCache: Map<string, { persona: Persona; timestamp: number }>;
    private personaRepo: PersonaRepository;

    constructor(config: PersonaServiceConfig) {
        this.databaseService = config.databaseService;
        this.eventBusService = config.eventBusService;
        this.personaRepo = new PersonaRepository();
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
                    feedbackCount: 0,
                },
                configuration: request.configuration || {},
                capabilities: request.capabilities || [],
                restrictions: request.restrictions || {},
                metadata: request.metadata,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const newPersonaRecord: NewPersona = {
                name: personaData.name,
                role: personaData.role,
                description: personaData.description,
                traits: personaData.traits,
                expertise: personaData.expertise,
                background: personaData.background,
                systemPrompt: personaData.systemPrompt,
                conversationalStyle: personaData.conversationalStyle,
                status: personaData.status,
                visibility: personaData.visibility,
                createdBy: personaData.createdBy,
                organizationId: personaData.organizationId,
                teamId: personaData.teamId,
                version: personaData.version,
                parentPersonaId: personaData.parentPersonaId,
                tags: personaData.tags,
                validation: personaData.validation,
                usageStats: personaData.usageStats,
                configuration: personaData.configuration,
                capabilities: personaData.capabilities,
                restrictions: personaData.restrictions,
                metadata: personaData.metadata,
            };
            const savedEntity = await this.personaRepo.createPersona(newPersonaRecord);
            const persona = this.entityToPersona(savedEntity);

            this.cachePersona(persona);

            await this.safePublishEvent('persona.created', {
                personaId: persona.id,
                createdBy: persona.createdBy,
                name: persona.name,
                timestamp: new Date(),
            });

            logger.info('Persona created successfully', { personaId: persona.id });
            return persona;
        } catch (error) {
            logger.error('Failed to create persona', { error: error instanceof Error ? error.message : String(error), request });
            throw error;
        }
    }

    async getPersona(id: string): Promise<Persona | null> {
        try {
            const cached = this.getCachedPersona(id);
            if (cached) {
                return cached;
            }

            const entity = await this.personaRepo.findById(id);

            if (!entity) {
                return null;
            }

            const persona = this.entityToPersona(entity);
            this.cachePersona(persona);
            return persona;
        } catch (error) {
            logger.error('Failed to get persona', { error: error instanceof Error ? error.message : String(error), personaId: id });
            throw error;
        }
    }

    async updatePersona(id: string, updates: UpdatePersonaRequest): Promise<Persona> {
        try {
            logger.info('Updating persona', { personaId: id, updates: Object.keys(updates) });

            const existingPersona = await this.getPersona(id);
            if (!existingPersona) {
                throw new NotFoundError(`Persona not found: ${id}`);
            }

            const updatedPersona = { ...existingPersona, ...updates };
            const validation = await this.validatePersona(updatedPersona);

            const updateData: Partial<NewPersona> = {
                name: updates.name,
                role: updates.role,
                description: updates.description,
                background: updates.background,
                systemPrompt: updates.systemPrompt,
                conversationalStyle: updates.conversationalStyle,
                status: updates.status,
                visibility: updates.visibility,
                tags: updates.tags,
                capabilities: updates.capabilities,
                restrictions: updates.restrictions,
                configuration: updates.configuration,
                metadata: updates.metadata,
                teamId: updates.teamId,
                organizationId: updates.organizationId,
                parentPersonaId: updates.parentPersonaId,
                traits: updates.traits,
                expertise: updates.expertise ? this.extractExpertiseNames(updates.expertise) : undefined,
                validation,
                version: existingPersona.version + 1,
            };

            const updatedEntity = await this.personaRepo.updatePersona(id, updateData);

            if (!updatedEntity) {
                throw new InternalServerError(`Failed to update persona: ${id}`);
            }

            const persona = this.entityToPersona(updatedEntity);
            this.cachePersona(persona);

            await this.safePublishEvent('persona.updated', {
                personaId: persona.id,
                updatedBy: existingPersona.createdBy,
                changes: Object.keys(updates),
                timestamp: new Date(),
            });

            logger.info('Persona updated successfully', { personaId: id });
            return persona;
        } catch (error) {
            logger.error('Failed to update persona', { error: error instanceof Error ? error.message : String(error), personaId: id });
            throw error;
        }
    }

    async deletePersona(id: string, deletedBy: string): Promise<void> {
        try {
            logger.info('Deleting persona', { personaId: id, deletedBy });

            const persona = await this.getPersona(id);
            if (!persona) {
                throw new NotFoundError(`Persona not found: ${id}`);
            }

            const usageCount = await this.getPersonaUsageCount(id);
            if (usageCount > 0) {
                await this.updatePersona(id, {
                    status: PersonaStatus.ARCHIVED,
                    updatedAt: new Date(),
                });
                logger.info('Persona archived due to active usage', { personaId: id, usageCount });
                return;
            }

            await this.personaRepo.deletePersona(id);

            this.personaCache.delete(id);

            await this.safePublishEvent('persona.deleted', {
                personaId: id,
                deletedBy,
                timestamp: new Date(),
            });

            logger.info('Persona deleted successfully', { personaId: id });
        } catch (error) {
            logger.error('Failed to delete persona', { error: error instanceof Error ? error.message : String(error), personaId: id });
            throw error;
        }
    }

    // ===== PERSONA SEARCH AND DISCOVERY =====

    async searchPersonas(
        filters: PersonaSearchFilters,
        limit = 20,
        offset = 0
    ): Promise<{
        personas: Persona[];
        total: number;
        hasMore: boolean;
    }> {
        try {
            const { whereClause, params, orderBy } = this.buildSearchQuery(filters);

            // Get total count
            const countQuery = `SELECT COUNT(*)::int as cnt FROM "personas"${whereClause ? ` WHERE ${whereClause}` : ''}`;
            const countResult = await this.databaseService.executeQuery<{ cnt: number }>(countQuery, params);
            const total = countResult[0]?.cnt ?? 0;

            // Get paginated results
            const dataQuery = `
        SELECT
          id,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          name,
          role,
          description,
          background,
          system_prompt AS "systemPrompt",
          traits,
          expertise,
          tone,
          style,
          energy_level AS "energyLevel",
          chattiness,
          empathy_level AS "empathyLevel",
          parent_personas AS "parentPersonas",
          hybrid_traits AS "hybridTraits",
          dominant_expertise AS "dominantExpertise",
          personality_blend AS "personalityBlend",
          conversational_style AS "conversationalStyle",
          status,
          visibility,
          created_by AS "createdBy",
          organization_id AS "organizationId",
          team_id AS "teamId",
          version,
          parent_persona_id AS "parentPersonaId",
          tags,
          validation,
          usage_stats AS "usageStats",
          configuration,
          capabilities,
          restrictions,
          metadata,
          quality_score AS "qualityScore",
          consistency_score AS "consistencyScore",
          user_satisfaction AS "userSatisfaction",
          total_interactions AS "totalInteractions",
          successful_interactions AS "successfulInteractions",
          last_used_at AS "lastUsedAt",
          last_updated_by AS "lastUpdatedBy"
        FROM "personas"
        ${whereClause ? `WHERE ${whereClause}` : ''}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `;
            const dataParams = [...params, limit, offset];
            const entities = await this.databaseService.executeQuery<PersonaRow>(dataQuery, dataParams);
            const personas = entities.map((entity) => this.entityToPersona(entity));

            return {
                personas,
                total,
                hasMore: offset + personas.length < total,
            };
        } catch (error) {
            logger.error('Failed to search personas', { error: error instanceof Error ? error.message : String(error), filters });
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
            logger.error('Failed to get persona recommendations', { error: error instanceof Error ? error.message : String(error), userId, });
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
                validatedAt: new Date(),
            };
        } catch (error) {
            logger.error('Persona validation failed', { error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }

    // ===== PERSONA ANALYTICS =====

    async getPersonaAnalytics(
        personaId: string,
        timeframe?: {
            start: Date;
            end: Date;
        }
    ): Promise<PersonaAnalytics | null> {
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
                end: new Date(),
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
                commonIssues,
            };
        } catch (error) {
            logger.error('Failed to get persona analytics', { error: error instanceof Error ? error.message : String(error), personaId, });
            throw error;
        }
    }

    async updatePersonaUsage(
        personaId: string,
        sessionData: {
            userId: string;
            duration: number;
            messageCount: number;
            satisfactionScore?: number;
        }
    ): Promise<void> {
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
                feedbackCount: 0,
            };

            const updatedStats: PersonaUsageStats = {
                ...currentStats,
                totalUsages: currentStats.totalUsages + 1,
                lastUsedAt: new Date(),
                averageSessionDuration: this.calculateNewAverage(
                    currentStats.averageSessionDuration,
                    currentStats.totalUsages,
                    sessionData.duration
                ),
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
                timestamp: new Date(),
            });
        } catch (error) {
            logger.error('Failed to update persona usage', { error: error instanceof Error ? error.message : String(error), personaId, });
            throw error;
        }
    }

    // ===== PERSONA TEMPLATES =====

    async getPersonaTemplates(category?: string): Promise<PersonaTemplate[]> {
        try {
            let query = `SELECT * FROM "personas"`;
            const params: QueryParam[] = [];

            if (category) {
                query += ` WHERE tags LIKE $1`;
                params.push(`%${category}%`);
            }

            query += ` ORDER BY totalInteractions DESC`;

            const entities = await this.databaseService.executeQuery<PersonaRow>(query, params);

            return entities.map((entity) => ({
                id: entity.id,
                name: entity.name,
                description: entity.description ?? '',
                category: 'general',
                traits: entity.traits.map((t) => (typeof t === 'string' ? t : String(t))),
                expertise: entity.expertise,
                usageCount: entity.totalInteractions,
            }));
        } catch (error) {
            logger.error('Failed to get persona templates', { error: error instanceof Error ? error.message : String(error), category, });
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
                throw new NotFoundError(`Template persona not found: ${templateId}`);
            }

            const personaRequest: CreatePersonaRequest = {
                name: customizations.name || `${templatePersona.name} (Copy)`,
                role: customizations.role || templatePersona.role,
                description: customizations.description || templatePersona.description,
                traits: customizations.traits || templatePersona.traits,
                expertise: customizations.expertise || templatePersona.expertise,
                background: customizations.background || templatePersona.background,
                systemPrompt: customizations.systemPrompt || templatePersona.systemPrompt,
                conversationalStyle:
                    customizations.conversationalStyle || templatePersona.conversationalStyle,
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
                metadata: customizations.metadata || templatePersona.metadata,
            };

            const persona = await this.createPersona(personaRequest);

            await this.updatePersonaUsage(templateId, {
                userId: createdBy,
                duration: 0,
                messageCount: 0,
            });

            return persona;
        } catch (error) {
            logger.error('Failed to create persona from template', { error: error instanceof Error ? error.message : String(error), templateId, });
            throw error;
        }
    }

    // ===== PRIVATE HELPER METHODS =====

    private extractExpertiseNames(expertise: ExpertiseDomain[]): string[] {
        return expertise.map((exp) => exp.name);
    }

    private cachePersona(persona: Persona): void {
        this.personaCache.set(persona.id!, {
            persona,
            timestamp: Date.now(),
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

    private buildSearchQuery(filters: PersonaSearchFilters): {
        whereClause: string;
        params: QueryParam[];
        orderBy: string;
    } {
        const conditions: string[] = [];
        const params: QueryParam[] = [];
        let paramIndex = 1;

        if (filters.query) {
            conditions.push(
                `(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR role ILIKE $${paramIndex})`
            );
            params.push(`%${filters.query}%`);
            paramIndex++;
        }

        if (filters.expertise && filters.expertise.length > 0) {
            conditions.push(
                `EXISTS (SELECT 1 FROM jsonb_array_elements_text(expertise) AS exp WHERE exp = ANY($${paramIndex}::text[]))`
            );
            params.push(filters.expertise);
            paramIndex++;
        }

        if (filters.status && filters.status.length > 0) {
            const statusList = filters.status.map(() => `$${paramIndex++}`).join(', ');
            conditions.push(`status IN (${statusList})`);
            params.push(...filters.status);
        }

        if (filters.visibility && filters.visibility.length > 0) {
            const visibilityList = filters.visibility.map(() => `$${paramIndex++}`).join(', ');
            conditions.push(`visibility IN (${visibilityList})`);
            params.push(...filters.visibility);
        }

        if (filters.createdBy && filters.createdBy.length > 0) {
            const createdByList = filters.createdBy.map(() => `$${paramIndex++}`).join(', ');
            conditions.push(`created_by IN (${createdByList})`);
            params.push(...filters.createdBy);
        }

        if (filters.organizationId) {
            conditions.push(`organization_id = $${paramIndex++}`);
            params.push(filters.organizationId);
        }

        if (filters.teamId) {
            conditions.push(`team_id = $${paramIndex++}`);
            params.push(filters.teamId);
        }

        if (filters.tags && filters.tags.length > 0) {
            conditions.push(
                `EXISTS (SELECT 1 FROM jsonb_array_elements_text(tags) AS tag WHERE tag = ANY($${paramIndex}::text[]))`
            );
            params.push(filters.tags);
            paramIndex++;
        }

        if (filters.minUsageCount !== undefined) {
            conditions.push(`total_interactions >= $${paramIndex++}`);
            params.push(filters.minUsageCount);
        }

        if (filters.minFeedbackScore !== undefined) {
            conditions.push(`user_satisfaction >= $${paramIndex++}`);
            params.push(filters.minFeedbackScore);
        }

        if (filters.createdAfter) {
            conditions.push(`created_at >= $${paramIndex++}`);
            params.push(filters.createdAfter);
        }

        if (filters.createdBefore) {
            conditions.push(`created_at <= $${paramIndex++}`);
            params.push(filters.createdBefore);
        }

        return {
            whereClause: conditions.join(' AND '),
            params,
            orderBy: 'created_at DESC',
        };
    }

    private async getPersonaUsageCount(_personaId: string): Promise<number> {
        return 0;
    }

    private async getUserPersonaHistory(_userId: string): Promise<PersonaHistoryItem[]> {
        return [];
    }

    private async generateRecommendations(
        _userHistory: PersonaHistoryItem[],
        _context?: string,
        _limit = 10
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

    private async calculatePersonaMetrics(
        _personaId: string,
        _timeframe: { start: Date; end: Date }
    ): Promise<PersonaMetricsSnapshot> {
        return {
            totalSessions: 0,
            totalMessages: 0,
            averageSessionDuration: 0,
            uniqueUsers: 0,
            satisfactionScore: 0,
            completionRate: 0,
            errorRate: 0,
        };
    }

    private async calculatePersonaTrends(
        _personaId: string,
        _timeframe: { start: Date; end: Date }
    ): Promise<PersonaTrendSnapshot> {
        return {
            usageGrowth: 0,
            satisfactionTrend: 0,
            popularityRank: 1,
        };
    }

    private async getTopInteractions(
        _personaId: string,
        _timeframe: { start: Date; end: Date }
    ): Promise<PersonaInteractionStat[]> {
        return [];
    }

    private async getCommonIssues(
        _personaId: string,
        _timeframe: { start: Date; end: Date }
    ): Promise<PersonaIssueStat[]> {
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

    private async safePublishEvent(eventType: string, data: Record<string, JsonValue>): Promise<void> {
        try {
            await this.eventBusService.publish(eventType, data);
        } catch (error) {
            logger.warn(`Failed to publish event ${eventType}, continuing without event:`, error);
        }
    }

    /**
     * Convert entity record to Persona type
     */
    private entityToPersona(entity: PersonaRow): Persona {
        const expertise = entity.expertise || [];
        const tags = entity.tags || [];
        const capabilities = entity.capabilities || [];
        const restrictions = entity.restrictions || {};
        const configuration = entity.configuration || {};
        const validation: PersonaValidation | undefined = entity.validation ?? undefined;
        const usageStats: PersonaUsageStats | undefined = entity.usageStats ?? undefined;

        return {
            id: entity.id,
            name: entity.name,
            role: entity.role,
            description: entity.description,
            traits: entity.traits,
            expertise: expertise.map(
                (expName: string, index: number): ExpertiseDomain => ({
                    id: `${Date.now()}-${index}`,
                    name: expName,
                    description: '',
                    category: 'general',
                    level: 'intermediate',
                    keywords: [],
                    relatedDomains: [],
                })
            ),
            background: entity.background ?? undefined,
            systemPrompt: entity.systemPrompt,
            conversationalStyle: entity.conversationalStyle,
            status: entity.status,
            visibility: entity.visibility,
            createdBy: entity.createdBy,
            organizationId: entity.organizationId ?? undefined,
            teamId: entity.teamId ?? undefined,
            version: entity.version,
            parentPersonaId: entity.parentPersonaId ?? undefined,
            tags,
            validation,
            usageStats: usageStats || {
                totalUsages: entity.totalInteractions || 0,
                uniqueUsers: 0,
                averageSessionDuration: 0,
                lastUsedAt: entity.lastUsedAt ?? undefined,
                popularityScore: 0,
                feedbackScore: entity.userSatisfaction ?? undefined,
                feedbackCount: 0,
            },
            configuration,
            capabilities,
            restrictions,
            metadata: entity.metadata ?? undefined,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        };
    }

    // ===== SIMPLIFIED FRONTEND API METHODS =====

    /**
     * Get personas with simplified data for frontend display
     * Returns only: id, name, role, description, tags, expertise (as strings), status
     */
    async getPersonasForDisplay(filters?: PersonaSearchFilters): Promise<{
        personas: Array<{
            id: string;
            name: string;
            role: string;
            description: string;
            tags: string[];
            expertise: string[];
            status: PersonaStatus;
            category: string; // Derived from role
        }>;
        total: number;
        hasMore: boolean;
    }> {
        try {
            const searchResult = await this.searchPersonas(filters || {});

            const displayPersonas = searchResult.personas.map((persona) => ({
                id: persona.id,
                name: persona.name,
                role: persona.role,
                description: persona.description,
                tags: persona.tags,
                expertise: this.extractExpertiseNames(persona.expertise),
                status: persona.status,
                category: this.categorizePersonaRole(persona.role),
            }));

            return {
                personas: displayPersonas,
                total: searchResult.total,
                hasMore: searchResult.hasMore,
            };
        } catch (error) {
            logger.error('Failed to get personas for display', { error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }

    /**
     * Get single persona with simplified data for frontend display
     */
    async getPersonaForDisplay(id: string): Promise<{
        id: string;
        name: string;
        role: string;
        description: string;
        tags: string[];
        expertise: string[];
        status: PersonaStatus;
        category: string;
        background?: string;
        conversationalStyle?: ConversationalStyle;
    } | null> {
        try {
            const persona = await this.getPersona(id);
            if (!persona) return null;

            return {
                id: persona.id,
                name: persona.name,
                role: persona.role,
                description: persona.description,
                tags: persona.tags,
                expertise: this.extractExpertiseNames(persona.expertise),
                status: persona.status,
                category: this.categorizePersonaRole(persona.role),
                background: persona.background,
                conversationalStyle: persona.conversationalStyle,
            };
        } catch (error) {
            logger.error('Failed to get persona for display', { error: error instanceof Error ? error.message : String(error), personaId: id, });
            throw error;
        }
    }

    /**
     * Search personas with text query - simplified for frontend
     */
    async searchPersonasSimple(
        query?: string,
        expertiseFilter?: string
    ): Promise<{
        personas: Array<{
            id: string;
            name: string;
            role: string;
            description: string;
            tags: string[];
            expertise: string[];
            category: string;
        }>;
    }> {
        try {
            const filters: PersonaSearchFilters = {};

            if (query) {
                filters.query = query;
            }

            if (expertiseFilter) {
                filters.expertise = [expertiseFilter];
            }

            const result = await this.getPersonasForDisplay(filters);

            return {
                personas: result.personas.map((p) => ({
                    id: p.id,
                    name: p.name,
                    role: p.role,
                    description: p.description,
                    tags: p.tags,
                    expertise: p.expertise,
                    category: p.category,
                })),
            };
        } catch (error) {
            logger.error('Failed to search personas', {
                error: error instanceof Error ? error.message : String(error), query,
                expertiseFilter,
            });
            throw error;
        }
    }

    /**
     * Get persona categories for frontend filtering
     */
    getPersonaCategories(): string[] {
        return [
            'Development',
            'Policy',
            'Creative',
            'Analysis',
            'Business',
            'Social',
            'Technical',
            'Management',
            'Research',
            'Design',
        ];
    }

    /**
     * Categorize persona role into display category
     */
    private categorizePersonaRole(role: string): string {
        const roleToCategory: Record<string, string> = {
            // Development roles
            'Software Engineer': 'Development',
            'Senior Software Engineer': 'Development',
            'Junior Developer': 'Development',
            'Full Stack Developer': 'Development',
            'Frontend Developer': 'Development',
            'Backend Developer': 'Development',
            'Mobile Developer': 'Development',
            'DevOps Engineer': 'Technical',
            'Site Reliability Engineer': 'Technical',
            'Infrastructure Engineer': 'Technical',
            'Cloud Engineer': 'Technical',
            'Platform Engineer': 'Technical',

            // Management/Leadership
            'Tech Lead': 'Management',
            'Engineering Manager': 'Management',
            'Team Lead': 'Management',
            'Project Manager': 'Management',
            'Scrum Master': 'Management',
            'Product Manager': 'Business',
            'Product Owner': 'Business',

            // Quality/Analysis
            'QA Engineer': 'Analysis',
            'Test Engineer': 'Analysis',
            'Quality Analyst': 'Analysis',
            'Automation Engineer': 'Analysis',
            'Business Analyst': 'Analysis',
            'Systems Analyst': 'Analysis',
            'Data Analyst': 'Analysis',
            'Data Scientist': 'Analysis',

            // Security
            'Security Engineer': 'Technical',
            'Security Analyst': 'Analysis',
            'Cybersecurity Specialist': 'Technical',

            // Policy/Legal
            'Policy Analyst': 'Policy',
            'Legal Expert': 'Policy',
            Economist: 'Policy',
            'Social Scientist': 'Policy',
            'Environmental Expert': 'Policy',

            // Creative/Design
            'UX Designer': 'Creative',
            'UI Designer': 'Creative',
            'Product Designer': 'Creative',
            'Design Lead': 'Creative',
            'Creative Director': 'Creative',
            'Graphic Designer': 'Creative',
            'Innovation Consultant': 'Creative',

            // Research/Academic
            Researcher: 'Research',
            'Academic Researcher': 'Research',
            Educator: 'Research',

            // Social/Community
            Psychologist: 'Social',
            'Community Organizer': 'Social',
            Philosopher: 'Analysis', // Moved to Analysis as it's more analytical thinking

            // Business/Entrepreneurship
            Entrepreneur: 'Business',
            'Business Development': 'Business',
            'Sales Manager': 'Business',
            'Marketing Manager': 'Business',

            // Generic roles
            Assistant: 'Business',
            Specialist: 'Technical',
            Analyzer: 'Analysis',
            Orchestrator: 'Management',
            'General Assistant': 'Business',
            Expert: 'Technical',
            Consultant: 'Business',
        };

        // Log the role categorization for debugging
        const category = roleToCategory[role] || 'Business';

        return category;
    }
}
