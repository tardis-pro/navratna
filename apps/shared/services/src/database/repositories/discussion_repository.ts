import { logger } from '@uaip/utils';
import { getIntelligenceDb } from '../drizzle/clients/index';
import { discussionParticipants, discussions } from '../drizzle/schemas/intelligence_schema';
import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';

type DiscussionSearchValue = string | string[] | Date | undefined;
type DiscussionRow = typeof discussions.$inferSelect;
type DiscussionStatusValue = DiscussionRow['status'];
type DiscussionVisibilityValue = DiscussionRow['visibility'];

type DiscussionSearchFilters = {
  textQuery?: string;
  status?: string | string[];
  visibility?: string | string[];
  createdBy?: string | string[];
  participantUserId?: string;
  organizationId?: string;
  teamId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
};

const toArray = (value: DiscussionSearchValue): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item) => item.trim().length > 0);
  }
  return typeof value === 'string' && value.trim().length > 0 ? [value.trim()] : [];
};

export class DiscussionRepository {
  private get db() {
    return getIntelligenceDb();
  }

  async searchDiscussions(
    filters: DiscussionSearchFilters
  ): Promise<{ discussions: (typeof discussions.$inferSelect)[]; total: number }> {
    try {
      const conditions = [];
      const statusValues = toArray(filters.status) as DiscussionStatusValue[];
      const visibilityValues = toArray(filters.visibility) as DiscussionVisibilityValue[];
      const createdByValues = toArray(filters.createdBy);

      if (filters.textQuery && filters.textQuery.trim().length > 0) {
        const query = `%${filters.textQuery.trim()}%`;
        conditions.push(
          or(
            ilike(discussions.title, query),
            ilike(discussions.topic, query),
            ilike(discussions.description, query)
          )
        );
      }

      if (statusValues.length > 0) {
        conditions.push(inArray(discussions.status, statusValues));
      }

      if (visibilityValues.length > 0) {
        conditions.push(inArray(discussions.visibility, visibilityValues));
      }

      if (filters.organizationId) {
        conditions.push(eq(discussions.organizationId, filters.organizationId));
      }

      if (filters.teamId) {
        conditions.push(eq(discussions.teamId, filters.teamId));
      }

      if (filters.createdAfter) {
        conditions.push(gte(discussions.createdAt, filters.createdAfter));
      }

      if (filters.createdBefore) {
        conditions.push(lte(discussions.createdAt, filters.createdBefore));
      }

      if (filters.participantUserId) {
        conditions.push(
          or(
            inArray(
              discussions.createdBy,
              createdByValues.length > 0 ? createdByValues : [filters.participantUserId]
            ),
            sql`exists (
              select 1
              from ${discussionParticipants}
              where ${discussionParticipants.discussionId} = ${discussions.id}
                and ${discussionParticipants.userId} = ${filters.participantUserId}
                and ${discussionParticipants.isActive} = true
            )`
          )
        );
      } else if (createdByValues.length > 0) {
        conditions.push(inArray(discussions.createdBy, createdByValues));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const allDiscussions = await this.db
        .select()
        .from(discussions)
        .where(whereClause)
        .orderBy(desc(discussions.createdAt))
        .limit(filters.limit ?? 50)
        .offset(filters.offset ?? 0);

      const [totalRow] = await this.db
        .select({ value: count() })
        .from(discussions)
        .where(whereClause);

      return { discussions: allDiscussions, total: totalRow?.value ?? 0 };
    } catch (error) {
      logger.error('DiscussionRepository.searchDiscussions failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findById(id: string): Promise<typeof discussions.$inferSelect | null> {
    const [row] = await this.db.select().from(discussions).where(eq(discussions.id, id)).limit(1);
    return row ?? null;
  }

  async findByCreator(userId: string): Promise<(typeof discussions.$inferSelect)[]> {
    return this.db
      .select()
      .from(discussions)
      .where(eq(discussions.createdBy, userId))
      .orderBy(desc(discussions.createdAt));
  }
}
