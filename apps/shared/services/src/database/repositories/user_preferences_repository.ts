import { eq } from 'drizzle-orm';
import { getControlDb } from '../drizzle/clients/index';
import { userPreferences } from '../drizzle/schemas/control.schema';
import { logger } from '@uaip/utils';

type UserPreferencesRow = typeof userPreferences.$inferSelect;
type NewUserPreferences = typeof userPreferences.$inferInsert;

export class UserPreferencesRepository {
    private get db() {
        return getControlDb();
    }

    async findById(id: string): Promise<UserPreferencesRow | null> {
        try {
            const [row] = await this.db
                .select()
                .from(userPreferences)
                .where(eq(userPreferences.id, id))
                .limit(1);
            return row ?? null;
        } catch (error: unknown) {
            logger.error('UserPreferencesRepository.findById failed', {
                id,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async findByUserId(userId: string): Promise<UserPreferencesRow | null> {
        try {
            const [row] = await this.db
                .select()
                .from(userPreferences)
                .where(eq(userPreferences.userId, userId))
                .limit(1);
            return row ?? null;
        } catch (error: unknown) {
            logger.error('UserPreferencesRepository.findByUserId failed', {
                userId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async create(data: NewUserPreferences): Promise<UserPreferencesRow> {
        try {
            const [row] = await this.db.insert(userPreferences).values(data).returning();
            return row;
        } catch (error: unknown) {
            logger.error('UserPreferencesRepository.create failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async update(id: string, data: Partial<NewUserPreferences>): Promise<UserPreferencesRow | null> {
        try {
            const [row] = await this.db
                .update(userPreferences)
                .set(data)
                .where(eq(userPreferences.id, id))
                .returning();
            return row ?? null;
        } catch (error: unknown) {
            logger.error('UserPreferencesRepository.update failed', {
                id,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const result = await this.db.delete(userPreferences).where(eq(userPreferences.id, id));
            return (result.rowCount ?? 0) > 0;
        } catch (error: unknown) {
            logger.error('UserPreferencesRepository.delete failed', {
                id,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
}
