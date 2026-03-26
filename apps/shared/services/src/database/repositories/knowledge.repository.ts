import { getIntelligenceDb, getIntelligencePool } from '../drizzle/clients/index';
import { knowledgeItems, knowledgeRelationships } from '../drizzle/schemas/intelligence.schema';
import { eq, and, ilike, inArray, desc, sql, gte } from 'drizzle-orm';
import { logger } from '@uaip/utils';

export type KnowledgeRow = typeof knowledgeItems.$inferSelect;
export type RelationshipRow = typeof knowledgeRelationships.$inferSelect;

export class KnowledgeRepository {
  private get db() {
    return getIntelligenceDb();
  }
  private get pool() {
    return getIntelligencePool();
  }

  async create(request: Record<string, unknown>): Promise<KnowledgeRow> {
    const [row] = await this.db
      .insert(knowledgeItems)
      .values(request as typeof knowledgeItems.$inferInsert)
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

  async findByFilters(filters: Record<string, unknown>): Promise<KnowledgeRow[]> {
    return this.applyFilters(filters);
  }

  async applyFilters(filters: Record<string, unknown>): Promise<KnowledgeRow[]> {
    const conditions = [];
    if (filters.type)
      conditions.push(eq(knowledgeItems.type, filters.type as import('@uaip/types').KnowledgeType));
    if (filters.agentId) conditions.push(eq(knowledgeItems.agentId, filters.agentId as string));
    if (filters.userId) conditions.push(eq(knowledgeItems.userId, filters.userId as string));
    if (filters.accessLevel)
      conditions.push(eq(knowledgeItems.accessLevel, filters.accessLevel as string));
    const limit = typeof filters.limit === 'number' ? filters.limit : 100;
    const offset = typeof filters.offset === 'number' ? filters.offset : 0;
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
    return this.applyFilters(scope as Record<string, unknown>);
  }

  async findByDomain(domain: string, limit = 50): Promise<KnowledgeRow[]> {
    const rows = await this.pool.query<KnowledgeRow>(
      `SELECT * FROM "knowledge_items" WHERE tags @> ARRAY[$1] OR type = $1 ORDER BY created_at DESC LIMIT $2`,
      [domain, limit]
    );
    return rows.rows;
  }

  async findByTags(tags: string[], limit = 20): Promise<KnowledgeRow[]> {
    if (tags.length === 0) return [];
    const rows = await this.pool.query<KnowledgeRow>(
      `SELECT * FROM "knowledge_items" WHERE tags && $1 ORDER BY created_at DESC LIMIT $2`,
      [tags, limit]
    );
    return rows.rows;
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

  async createRelationship(data: Record<string, unknown>): Promise<RelationshipRow> {
    const [row] = await this.db
      .insert(knowledgeRelationships)
      .values(data as typeof knowledgeRelationships.$inferInsert)
      .returning();
    return row;
  }

  async createRelationships(items: Record<string, unknown>[]): Promise<RelationshipRow[]> {
    if (items.length === 0) return [];
    const rows = await this.db
      .insert(knowledgeRelationships)
      .values(items as (typeof knowledgeRelationships.$inferInsert)[])
      .returning();
    return rows;
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
