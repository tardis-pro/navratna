import { logger } from '@uaip/utils';
import { getIntelligenceDb } from '../drizzle/clients/index';
import { discussions, discussionParticipants } from '../drizzle/schemas/intelligence.schema';
import { eq, and, or, ilike, inArray, desc } from 'drizzle-orm';

export class DiscussionRepository {
  private get db() { return getIntelligenceDb(); }

  async searchDiscussions(filters: {
    textQuery?: string;
    status?: string | string[];
    visibility?: string | string[];
    createdBy?: string | string[];
    organizationId?: string;
    teamId?: string;
    createdAfter?: Date;
    createdBefore?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ discussions: typeof discussions.$inferSelect[]; total: number }> {
    try {
      const allDiscussions = await this.db.select().from(discussions).orderBy(desc(discussions.createdAt)).limit(filters.limit ?? 50).offset(filters.offset ?? 0);
      return { discussions: allDiscussions, total: allDiscussions.length };
    } catch (error) {
      logger.error('DiscussionRepository.searchDiscussions failed', { error: (error as Error).message });
      throw error;
    }
  }

  async findById(id: string): Promise<typeof discussions.$inferSelect | null> {
    const [row] = await this.db.select().from(discussions).where(eq(discussions.id, id)).limit(1);
    return row ?? null;
  }

  async findByCreator(userId: string): Promise<typeof discussions.$inferSelect[]> {
    return this.db.select().from(discussions).where(eq(discussions.createdBy, userId as unknown as string)).orderBy(desc(discussions.createdAt));
  }
}
