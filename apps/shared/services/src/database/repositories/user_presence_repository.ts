import { eq } from 'drizzle-orm';
import { getControlDb } from '../drizzle/clients/index';
import { userPresence } from '../drizzle/schemas/control_schema';
import { logger } from '@uaip/utils';

type UserPresenceRow = typeof userPresence.$inferSelect;
type NewUserPresence = typeof userPresence.$inferInsert;

export class UserPresenceRepository {
  private get db() {
    return getControlDb();
  }

  async findById(id: string): Promise<UserPresenceRow | null> {
    try {
      const [row] = await this.db.select().from(userPresence).where(eq(userPresence.id, id)).limit(1);
      return row ?? null;
    } catch (error: unknown) {
      logger.error('UserPresenceRepository.findById failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<UserPresenceRow | null> {
    try {
      const [row] = await this.db
        .select()
        .from(userPresence)
        .where(eq(userPresence.userId, userId))
        .limit(1);
      return row ?? null;
    } catch (error: unknown) {
      logger.error('UserPresenceRepository.findByUserId failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async create(data: NewUserPresence): Promise<UserPresenceRow> {
    try {
      const [row] = await this.db.insert(userPresence).values(data).returning();
      return row;
    } catch (error: unknown) {
      logger.error('UserPresenceRepository.create failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async update(id: string, data: Partial<NewUserPresence>): Promise<UserPresenceRow | null> {
    try {
      const [row] = await this.db
        .update(userPresence)
        .set(data)
        .where(eq(userPresence.id, id))
        .returning();
      return row ?? null;
    } catch (error: unknown) {
      logger.error('UserPresenceRepository.update failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.delete(userPresence).where(eq(userPresence.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error: unknown) {
      logger.error('UserPresenceRepository.delete failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
