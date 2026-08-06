import type { KnowledgeIngestRequest, KnowledgeRelationship, KnowledgeType } from '@uaip/types';
import { getIntelligenceDb } from '../drizzle/clients/index';
import { knowledgeItems, knowledgeRelationships } from '../drizzle/schemas/intelligence_schema';
import { eq, and, inArray, desc, sql, gte, arrayOverlaps } from 'drizzle-orm';

export type KnowledgeRow = typeof knowledgeItems.$inferSelect;
export type RelationshipRow = typeof knowledgeRelationships.$inferSelect;

interface KnowledgeFilters {
  type?: KnowledgeType;
  agentId?: string;
  userId?: string;
  accessLevel?: string;
  limit?: number;
  offset?: number;
}

type KnowledgeIngestRequestExtended = KnowledgeIngestRequest & {
  userId?: string;
  agentId?: string;
  summary?: string;
};

type KnowledgeCreateRequest =
  | typeof knowledgeItems.$inferInsert
  | KnowledgeIngestRequestExtended
  | object;

function isKnowledgeIngestRequestExtended(v: object): v is KnowledgeIngestRequestExtended {
  return 'source' in v && typeof (v as { source: unknown }).source === 'object' && (v as { source: unknown }).source !== null;
}

type RelationshipCreateRequest =
  | typeof knowledgeRelationships.$inferInsert
  | Pick<KnowledgeRelationship, 'sourceItemId' | 'targetItemId' | 'relationshipType' | 'confidence'>;

export class KnowledgeRepository {
  private get db() {
    return getIntelligenceDb();
  }

  async create(request: KnowledgeCreateRequest): Promise<KnowledgeRow> {
    const normalizedRequest = this.normalizeCreateRequest(request);
    const [row] = await this.db
      .insert(knowledgeItems)
      .values(normalizedRequest)
      .returning();
    return row;
  }

  async findById(id: string): Promise<KnowledgeRow | null> {
    const [row] = await this.db
      .select()
      .from(knowledgeItems)
      .where(eq(knowledgeItems.id, id))
      .limit(1);
    return row ?? null;
  }

  async findAll(): Promise<KnowledgeRow[]> {
    return this.db.select().from(knowledgeItems).orderBy(desc(knowledgeItems.createdAt));
  }

  async findBySourceIdentifier(sourceId: string): Promise<KnowledgeRow | null> {
    const [row] = await this.db
      .select()
      .from(knowledgeItems)
      .where(eq(knowledgeItems.sourceIdentifier, sourceId))
      .limit(1);
    return row ?? null;
  }

  async findByFilters(filters: KnowledgeFilters): Promise<KnowledgeRow[]> {
    return this.applyFilters(filters);
  }

  async applyFilters(filters: KnowledgeFilters): Promise<KnowledgeRow[]> {
    const conditions = [];
    if (filters.type) conditions.push(eq(knowledgeItems.type, filters.type));
    if (filters.agentId) conditions.push(eq(knowledgeItems.agentId, filters.agentId));
    if (filters.userId) conditions.push(eq(knowledgeItems.userId, filters.userId));
    if (filters.accessLevel) conditions.push(eq(knowledgeItems.accessLevel, filters.accessLevel));
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;
    const query = this.db.select().from(knowledgeItems);
    if (conditions.length > 0) {
      return query
        .where(and(...conditions))
        .orderBy(desc(knowledgeItems.createdAt))
        .limit(limit)
        .offset(offset);
    }
    return query.orderBy(desc(knowledgeItems.createdAt)).limit(limit).offset(offset);
  }

  async findByScope(scope: {
    agentId?: string;
    userId?: string;
    accessLevel?: string;
  }): Promise<KnowledgeRow[]> {
    return this.applyFilters(scope);
  }

  async findByDomain(domain: string, limit = 50): Promise<KnowledgeRow[]> {
    return this.db
      .select()
      .from(knowledgeItems)
      .where(sql`${knowledgeItems.tags} @> ARRAY[${domain}] OR ${knowledgeItems.type} = ${domain}`)
      .orderBy(desc(knowledgeItems.createdAt))
      .limit(limit);
  }

  async findByTags(tags: string[], limit = 20): Promise<KnowledgeRow[]> {
    if (tags.length === 0) return [];
    // NOTE: raw `sql\`${col} && ${jsArray}\`` interpolates a JS array as a
    // Postgres row constructor `($1, $2, ...)`, not an array literal — that
    // throws "operator does not exist: text[] && record" at runtime. Use the
    // typed `arrayOverlaps` helper, which parameterizes it correctly.
    return this.db
      .select()
      .from(knowledgeItems)
      .where(arrayOverlaps(knowledgeItems.tags, tags))
      .orderBy(desc(knowledgeItems.createdAt))
      .limit(limit);
  }

  async findRecentItems(limit = 20, since?: Date): Promise<KnowledgeRow[]> {
    if (since) {
      return this.db
        .select()
        .from(knowledgeItems)
        .where(gte(knowledgeItems.createdAt, since))
        .orderBy(desc(knowledgeItems.createdAt))
        .limit(limit);
    }
    return this.db
      .select()
      .from(knowledgeItems)
      .orderBy(desc(knowledgeItems.createdAt))
      .limit(limit);
  }

  async getItems(ids: string[]): Promise<KnowledgeRow[]> {
    if (ids.length === 0) return [];
    return this.db.select().from(knowledgeItems).where(inArray(knowledgeItems.id, ids));
  }

  async update(
    id: string,
    data: Partial<typeof knowledgeItems.$inferInsert>
  ): Promise<KnowledgeRow | null> {
    const [row] = await this.db
      .update(knowledgeItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(knowledgeItems.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(knowledgeItems).where(eq(knowledgeItems.id, id));
    return ((result as { rowCount?: number }).rowCount ?? 0) > 0;
  }

  async createRelationship(data: RelationshipCreateRequest): Promise<RelationshipRow> {
    const normalizedData = this.normalizeRelationshipRequest(data);
    const [row] = await this.db
      .insert(knowledgeRelationships)
      .values(normalizedData)
      .returning();
    return row;
  }

  async createRelationships(items: RelationshipCreateRequest[]): Promise<RelationshipRow[]> {
    if (items.length === 0) return [];
    const normalizedItems = items.map((item) => this.normalizeRelationshipRequest(item));
    const rows = await this.db
      .insert(knowledgeRelationships)
      .values(normalizedItems)
      .returning();
    return rows;
  }

  private normalizeCreateRequest(request: KnowledgeCreateRequest): typeof knowledgeItems.$inferInsert {
    if (typeof request === 'object' && request !== null && isKnowledgeIngestRequestExtended(request)) {
      const ingestRequest = request;
      return {
        content: ingestRequest.content,
        type: ingestRequest.type,
        sourceType: ingestRequest.source.type,
        sourceIdentifier: ingestRequest.source.identifier,
        sourceUrl: ingestRequest.source.url,
        tags: ingestRequest.tags ?? [],
        confidence: ingestRequest.confidence ?? 0.8,
        metadata: ingestRequest.source.metadata ?? {},
        createdBy: ingestRequest.createdBy,
        organizationId: ingestRequest.organizationId,
        accessLevel: ingestRequest.accessLevel,
        userId: ingestRequest.userId,
        agentId: ingestRequest.agentId,
        summary: ingestRequest.summary,
      };
    }

    return request as typeof knowledgeItems.$inferInsert;
  }

  private normalizeRelationshipRequest(
    request: RelationshipCreateRequest
  ): typeof knowledgeRelationships.$inferInsert {
    if ('sourceItemId' in request) {
      return {
        sourceId: request.sourceItemId,
        targetId: request.targetItemId,
        relationshipType: request.relationshipType,
        strength: request.confidence,
      };
    }

    return request;
  }

  async deleteRelationship(id: string): Promise<boolean> {
    const result = await this.db
      .delete(knowledgeRelationships)
      .where(eq(knowledgeRelationships.id, id));
    return ((result as { rowCount?: number }).rowCount ?? 0) > 0;
  }

  async findRelationshipById(id: string): Promise<RelationshipRow | null> {
    const [row] = await this.db
      .select()
      .from(knowledgeRelationships)
      .where(eq(knowledgeRelationships.id, id))
      .limit(1);
    return row ?? null;
  }

  async findRelationships(sourceId: string): Promise<RelationshipRow[]> {
    if (sourceId === 'all') {
      return this.db
        .select()
        .from(knowledgeRelationships)
        .orderBy(desc(knowledgeRelationships.createdAt));
    }
    return this.db
      .select()
      .from(knowledgeRelationships)
      .where(eq(knowledgeRelationships.sourceId, sourceId));
  }

  async findAllRelationships(): Promise<RelationshipRow[]> {
    return this.db
      .select()
      .from(knowledgeRelationships)
      .orderBy(desc(knowledgeRelationships.createdAt));
  }

  async getRelationships(itemId: string): Promise<RelationshipRow[]> {
    return this.db
      .select()
      .from(knowledgeRelationships)
      .where(
        sql`${knowledgeRelationships.sourceId} = ${itemId} OR ${knowledgeRelationships.targetId} = ${itemId}`
      );
  }

  async getStatistics(): Promise<{
    totalItems: number;
    byType: Record<string, number>;
    recentItems: number;
  }> {
    const [total] = await this.db.select({ cnt: sql<number>`count(*)::int` }).from(knowledgeItems);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [recent] = await this.db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(knowledgeItems)
      .where(gte(knowledgeItems.createdAt, weekAgo));
    return { totalItems: total?.cnt ?? 0, byType: {}, recentItems: recent?.cnt ?? 0 };
  }

  async getStats(): Promise<{ totalItems: number; byType: Record<string, number> }> {
    return this.getStatistics();
  }
}
