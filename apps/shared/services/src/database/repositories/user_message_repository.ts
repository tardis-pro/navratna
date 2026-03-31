import { eq, or } from 'drizzle-orm';
import { getControlDb } from '../drizzle/clients/index';
import { userMessages } from '../drizzle/schemas/control.schema';
import { logger } from '@uaip/utils';

type UserMessageRow = typeof userMessages.$inferSelect;
type NewUserMessage = typeof userMessages.$inferInsert;

export class UserMessageRepository {
    private get db() {
        return getControlDb();
    }

    async findById(id: string): Promise<UserMessageRow | null> {
        try {
            const [row] = await this.db.select().from(userMessages).where(eq(userMessages.id, id)).limit(1);
            return row ?? null;
        } catch (error: unknown) {
            logger.error('UserMessageRepository.findById failed', {
                id,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async findByUserId(userId: string): Promise<UserMessageRow[]> {
        try {
            return this.db
                .select()
                .from(userMessages)
                .where(or(eq(userMessages.fromUserId, userId), eq(userMessages.toUserId, userId))!);
        } catch (error: unknown) {
            logger.error('UserMessageRepository.findByUserId failed', {
                userId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async create(data: NewUserMessage): Promise<UserMessageRow> {
        try {
            const [row] = await this.db.insert(userMessages).values(data).returning();
            return row;
        } catch (error: unknown) {
            logger.error('UserMessageRepository.create failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async update(id: string, data: Partial<NewUserMessage>): Promise<UserMessageRow | null> {
        try {
            const [row] = await this.db
                .update(userMessages)
                .set(data)
                .where(eq(userMessages.id, id))
                .returning();
            return row ?? null;
        } catch (error: unknown) {
            logger.error('UserMessageRepository.update failed', {
                id,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const result = await this.db.delete(userMessages).where(eq(userMessages.id, id));
            return (result.rowCount ?? 0) > 0;
        } catch (error: unknown) {
            logger.error('UserMessageRepository.delete failed', {
                id,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
}
