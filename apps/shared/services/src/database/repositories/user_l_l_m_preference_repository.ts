import { eq } from 'drizzle-orm';
import { getControlDb } from '../drizzle/clients/index';
import { userLLMPreferences } from '../drizzle/schemas/control_schema';
import { logger } from '@uaip/utils';

export { AgentLLMPreferenceRepository } from './agent_l_l_m_preference_repository';

type UserLLMPreferenceRow = typeof userLLMPreferences.$inferSelect;
type NewUserLLMPreference = typeof userLLMPreferences.$inferInsert;

export class UserLLMPreferenceRepository {
  private get db() {
    return getControlDb();
  }

  async findById(id: string): Promise<UserLLMPreferenceRow | null> {
    try {
      const [row] = await this.db
        .select()
        .from(userLLMPreferences)
        .where(eq(userLLMPreferences.id, id))
        .limit(1);
      return row ?? null;
    } catch (error: unknown) {
      logger.error('UserLLMPreferenceRepository.findById failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<UserLLMPreferenceRow[]> {
    try {
      return this.db.select().from(userLLMPreferences).where(eq(userLLMPreferences.userId, userId));
    } catch (error: unknown) {
      logger.error('UserLLMPreferenceRepository.findByUserId failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async upsertForUser(
    userId: string,
    data: Partial<NewUserLLMPreference>
  ): Promise<UserLLMPreferenceRow> {
    try {
      const [existing] = await this.db
        .select()
        .from(userLLMPreferences)
        .where(eq(userLLMPreferences.userId, userId))
        .limit(1);

      if (existing) {
        const [updated] = await this.db
          .update(userLLMPreferences)
          .set(data)
          .where(eq(userLLMPreferences.id, existing.id))
          .returning();
        return updated ?? existing;
      }

      const [created] = await this.db
        .insert(userLLMPreferences)
        .values({ ...data, userId })
        .returning();
      return created;
    } catch (error: unknown) {
      logger.error('UserLLMPreferenceRepository.upsertForUser failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
