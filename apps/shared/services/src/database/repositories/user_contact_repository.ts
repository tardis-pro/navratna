import { eq } from 'drizzle-orm';
import { getControlDb } from '../drizzle/clients/index';
import { userContacts } from '../drizzle/schemas/control_schema';
import { logger } from '@uaip/utils';

type UserContactRow = typeof userContacts.$inferSelect;
type NewUserContact = typeof userContacts.$inferInsert;

export class UserContactRepository {
  private get db() {
    return getControlDb();
  }

  async findById(id: string): Promise<UserContactRow | null> {
    try {
      const [row] = await this.db.select().from(userContacts).where(eq(userContacts.id, id)).limit(1);
      return row ?? null;
    } catch (error: unknown) {
      logger.error('UserContactRepository.findById failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<UserContactRow[]> {
    try {
      return this.db.select().from(userContacts).where(eq(userContacts.userId, userId));
    } catch (error: unknown) {
      logger.error('UserContactRepository.findByUserId failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async create(data: NewUserContact): Promise<UserContactRow> {
    try {
      const [row] = await this.db.insert(userContacts).values(data).returning();
      return row;
    } catch (error: unknown) {
      logger.error('UserContactRepository.create failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async update(id: string, data: Partial<NewUserContact>): Promise<UserContactRow | null> {
    try {
      const [row] = await this.db
        .update(userContacts)
        .set(data)
        .where(eq(userContacts.id, id))
        .returning();
      return row ?? null;
    } catch (error: unknown) {
      logger.error('UserContactRepository.update failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.delete(userContacts).where(eq(userContacts.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error: unknown) {
      logger.error('UserContactRepository.delete failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export const ContactStatus = { ACTIVE: 'active', INACTIVE: 'inactive', BLOCKED: 'blocked' } as const;
export const ContactType = { USER: 'user', AGENT: 'agent', EXTERNAL: 'external' } as const;
