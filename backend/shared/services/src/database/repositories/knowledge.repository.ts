import { Repository, In, Between } from 'typeorm';
import {
  KnowledgeItem,
  KnowledgeIngestRequest,
  KnowledgeFilters,
  KnowledgeRelationship,
  KnowledgeType,
  SourceType,
  KnowledgeScope
} from '@uaip/types';
import { KnowledgeItemEntity } from '../../entities/knowledge-item.entity.js';
import { KnowledgeRelationshipEntity } from '../../entities/knowledge-relationship.entity.js';

export class KnowledgeRepository {
  constructor(
    private readonly knowledgeRepo: Repository<KnowledgeItemEntity>,
    private readonly relationshipRepo: Repository<KnowledgeRelationshipEntity>
  ) {}

  async create(request: KnowledgeIngestRequest & { userId?: string; agentId?: string; summary?: string }): Promise<KnowledgeItem> {
    const entity = this.knowledgeRepo.create({
      content: request.content,
      type: request.type || KnowledgeType.FACTUAL,
      sourceType: request.source.type,
      sourceIdentifier: request.source.identifier,
      sourceUrl: request.source.url,
      tags: request.tags || [],
      confidence: request.confidence || 0.8,
      metadata: request.source.metadata || {},
      createdBy: request.createdBy,
      organizationId: request.organizationId,
      accessLevel: request.accessLevel || 'public',
      // Three-layered knowledge architecture
      userId: request.userId,
      agentId: request.agentId,
      summary: request.summary
    });

    const saved = await this.knowledgeRepo.save(entity);
    return this.entityToModel(saved);
  }

  async update(id: string, updates: Partial<KnowledgeItem>): Promise<KnowledgeItem> {
    const numericId = id;
    await this.knowledgeRepo.update(numericId, {
      ...updates,
      updatedAt: new Date()
    });

    const updated = await this.knowledgeRepo.findOne({ where: { id: numericId } });
    if (!updated) {
      throw new Error(`Knowledge item not found: ${id}`);
    }

    return this.entityToModel(updated);
  }

  async delete(id: string): Promise<void> {
    const numericId = id;
    // Delete relationships first
    await this.relationshipRepo.delete({
      sourceItemId: numericId
    });
    await this.relationshipRepo.delete({
      targetItemId: numericId
    });

    // Delete the knowledge item
    await this.knowledgeRepo.delete(numericId);
  }

  async findById(id: string): Promise<KnowledgeItem | null> {
    const entity = await this.knowledgeRepo.findOne({ where: { id: id } });
    return entity ? this.entityToModel(entity) : null;
  }

  async getItems(ids: string[]): Promise<KnowledgeItem[]> {
    const numericIds = ids.map(id => id);
    const entities = await this.knowledgeRepo.find({
      where: { id: In(numericIds) }
    });
    return entities.map(entity => this.entityToModel(entity));
  }

  async applyFilters(vectorResults: any[], filters?: KnowledgeFilters, scope?: KnowledgeScope): Promise<KnowledgeItem[]> {
    if (!vectorResults.length) return [];

    const knowledgeItemIds = vectorResults.map(r => r.payload?.knowledge_item_id).filter(Boolean);
    
    let query = this.knowledgeRepo.createQueryBuilder('ki')
      .where('ki.id IN (:...ids)', { ids: knowledgeItemIds });

    // Apply scope filtering
    if (scope) {
      query = this.applyScopeFilter(query, scope);
    }

    if (filters) {
      if (filters.tags?.length) {
        query = query.andWhere('ki.tags && :tags', { tags: filters.tags });
      }

      if (filters.types?.length) {
        query = query.andWhere('ki.type IN (:...types)', { types: filters.types });
      }

      if (filters.confidence) {
        query = query.andWhere('ki.confidence >= :confidence', { confidence: filters.confidence });
      }

      if (filters.sourceTypes?.length) {
        query = query.andWhere('ki.sourceType IN (:...sourceTypes)', { sourceTypes: filters.sourceTypes });
      }

      if (filters.timeRange) {
        query = query.andWhere('ki.createdAt BETWEEN :start AND :end', {
          start: filters.timeRange.start,
          end: filters.timeRange.end
        });
      }
    }

    const entities = await query.getMany();
    
    // Maintain the order from vector search results
    const entityMap = new Map(entities.map(e => [e.id, e]));
    const orderedEntities = knowledgeItemIds
      .map(id => entityMap.get(id))
      .filter(Boolean) as KnowledgeItemEntity[];

    return orderedEntities.map(entity => this.entityToModel(entity));
  }

  async hydrate(vectorResults: any[]): Promise<KnowledgeItem[]> {
    return this.applyFilters(vectorResults);
  }

  async createRelationships(relationships: Omit<KnowledgeRelationship, 'id' | 'createdAt'>[]): Promise<void> {
    const entities = relationships.map(rel => this.relationshipRepo.create(rel));
    await this.relationshipRepo.save(entities);
  }

  async getRelationships(itemId: string, relationshipTypes?: string[], scope?: KnowledgeScope): Promise<KnowledgeRelationship[]> {
    let query = this.relationshipRepo.createQueryBuilder('kr')
      .where('kr.sourceItemId = :itemId', { itemId: itemId });

    // Apply scope filtering
    if (scope) {
      query = this.applyRelationshipScopeFilter(query, scope);
    }

    if (relationshipTypes?.length) {
      query = query.andWhere('kr.relationshipType IN (:...types)', { types: relationshipTypes });
    }

    const entities = await query.getMany();
    return entities.map(entity => this.relationshipEntityToModel(entity));
  }

  async getStatistics(): Promise<{
    totalItems: number;
    itemsByType: Record<string, number>;
    itemsBySource: Record<string, number>;
    averageConfidence: number;
  }> {
    const totalItems = await this.knowledgeRepo.count();

    const typeStats = await this.knowledgeRepo
      .createQueryBuilder('ki')
      .select('ki.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('ki.type')
      .getRawMany();

    const sourceStats = await this.knowledgeRepo
      .createQueryBuilder('ki')
      .select('ki.sourceType', 'sourceType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('ki.sourceType')
      .getRawMany();

    const avgConfidence = await this.knowledgeRepo
      .createQueryBuilder('ki')
      .select('AVG(ki.confidence)', 'average')
      .getRawOne();

    const itemsByType = typeStats.reduce((acc, stat) => {
      acc[stat.type] = parseInt(stat.count);
      return acc;
    }, {} as Record<string, number>);

    const itemsBySource = sourceStats.reduce((acc, stat) => {
      acc[stat.sourceType] = parseInt(stat.count);
      return acc;
    }, {} as Record<string, number>);

    return {
      totalItems,
      itemsByType,
      itemsBySource,
      averageConfidence: parseFloat(avgConfidence.average)
    };
  }

  async findByTags(tags: string[], limit: number = 10): Promise<KnowledgeItem[]> {
    const entities = await this.knowledgeRepo
      .createQueryBuilder('ki')
      .where('ki.tags && :tags', { tags })
      .orderBy('ki.confidence', 'DESC')
      .limit(limit)
      .getMany();

    return entities.map(entity => this.entityToModel(entity));
  }

  async findBySourceType(sourceType: SourceType, limit: number = 10): Promise<KnowledgeItem[]> {
    const entities = await this.knowledgeRepo.find({
      where: { sourceType },
      order: { createdAt: 'DESC' },
      take: limit
    });

    return entities.map(entity => this.entityToModel(entity));
  }

  async findRecentItems(limit: number = 10): Promise<KnowledgeItem[]> {
    const entities = await this.knowledgeRepo.find({
      order: { createdAt: 'DESC' },
      take: limit
    });

    return entities.map(entity => this.entityToModel(entity));
  }

  // Scoped search methods
  async findByScope(scope: KnowledgeScope, filters?: KnowledgeFilters, limit: number = 20): Promise<KnowledgeItem[]> {
    let query = this.knowledgeRepo.createQueryBuilder('ki');
    
    query = this.applyScopeFilter(query, scope);

    if (filters) {
      if (filters.tags?.length) {
        query = query.andWhere('ki.tags && :tags', { tags: filters.tags });
      }

      if (filters.types?.length) {
        query = query.andWhere('ki.type IN (:...types)', { types: filters.types });
      }

      if (filters.confidence) {
        query = query.andWhere('ki.confidence >= :confidence', { confidence: filters.confidence });
      }

      if (filters.sourceTypes?.length) {
        query = query.andWhere('ki.sourceType IN (:...sourceTypes)', { sourceTypes: filters.sourceTypes });
      }

      if (filters.timeRange) {
        query = query.andWhere('ki.createdAt BETWEEN :start AND :end', {
          start: filters.timeRange.start,
          end: filters.timeRange.end
        });
      }
    }

    const entities = await query
      .orderBy('ki.createdAt', 'DESC')
      .limit(limit)
      .getMany();

    return entities.map(entity => this.entityToModel(entity));
  }

  private entityToModel(entity: KnowledgeItemEntity): KnowledgeItem {
    return {
      id: entity.id,
      content: entity.content,
      type: entity.type,
      sourceType: entity.sourceType,
      sourceIdentifier: entity.sourceIdentifier,
      sourceUrl: entity.sourceUrl,
      tags: entity.tags,
      confidence: entity.confidence,
      metadata: entity.metadata,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      createdBy: entity.createdBy,
      organizationId: entity.organizationId,
      accessLevel: entity.accessLevel,
      userId: entity.userId,
      agentId: entity.agentId,
      summary: entity.summary
    };
  }

  private relationshipEntityToModel(entity: KnowledgeRelationshipEntity): KnowledgeRelationship {
    return {
      id: entity.id,
      sourceItemId: entity.sourceItemId,
      targetItemId: entity.targetItemId,
      relationshipType: entity.relationshipType,
      confidence: entity.confidence,
      createdAt: entity.createdAt,
      userId: entity.userId,
      agentId: entity.agentId,
      summary: entity.summary
    };
  }

  // Private helper methods for scope filtering
  private applyScopeFilter(query: any, scope: KnowledgeScope): any {
    if (scope.agentId && scope.userId) {
      // Both agent and user specified - return items for both
      query = query.andWhere('(ki.agentId = :agentId OR ki.userId = :userId OR (ki.agentId IS NULL AND ki.userId IS NULL))', {
        agentId: scope.agentId,
        userId: scope.userId
      });
    } else if (scope.agentId) {
      // Agent-specific knowledge + general knowledge
      query = query.andWhere('(ki.agentId = :agentId OR ki.agentId IS NULL)', { agentId: scope.agentId });
    } else if (scope.userId) {
      // User-specific knowledge + general knowledge
      query = query.andWhere('(ki.userId = :userId OR ki.userId IS NULL)', { userId: scope.userId });
    }
    // If no scope provided, return all (general knowledge)
    
    return query;
  }

  private applyRelationshipScopeFilter(query: any, scope: KnowledgeScope): any {
    if (scope.agentId && scope.userId) {
      // Both agent and user specified - return relationships for both
      query = query.andWhere('(kr.agentId = :agentId OR kr.userId = :userId OR (kr.agentId IS NULL AND kr.userId IS NULL))', {
        agentId: scope.agentId,
        userId: scope.userId
      });
    } else if (scope.agentId) {
      // Agent-specific relationships + general relationships
      query = query.andWhere('(kr.agentId = :agentId OR kr.agentId IS NULL)', { agentId: scope.agentId });
    } else if (scope.userId) {
      // User-specific relationships + general relationships
      query = query.andWhere('(kr.userId = :userId OR kr.userId IS NULL)', { userId: scope.userId });
    }
    // If no scope provided, return all (general relationships)
    
    return query;
  }
} 