import { and, desc, eq } from 'drizzle-orm';
import { getControlDb } from '../drizzle/clients/index';
import { userLLMProviders } from '../drizzle/schemas/control_schema';
import { logger } from '@uaip/utils';

type UserLLMProviderRow = typeof userLLMProviders.$inferSelect;
type NewUserLLMProvider = typeof userLLMProviders.$inferInsert;

export class UserLLMProviderRepository {
  private get db() {
    return getControlDb();
  }

  async findAllProvidersByUser(userId: string) { return this.findByUserId(userId); }
  async createUserProvider(data: NewUserLLMProvider) { return this.create(data); }
  async deleteUserProvider(id: string) { return this.delete(id); }

  async updateApiKey(id: string, apiKey: string) {
    const patch: Partial<NewUserLLMProvider> = { apiKeyEncrypted: apiKey };
    return this.update(id, patch);
  }

  async updateProviderConfig(id: string, config: Partial<NewUserLLMProvider>) {
    return this.update(id, config);
  }

  async updateStatus(id: string, status: string) {
    // status is stored in configuration.status — no top-level status column on userLLMProviders
    const patch: Partial<NewUserLLMProvider> = {
      configuration: { status },
    };
    return this.update(id, patch);
  }

  async getProviderStats(userId: string): Promise<{ total: number; active: number }> {
    const providers = await this.findByUserId(userId);
    return { total: providers.length, active: providers.length };
  }

  async findById(id: string): Promise<UserLLMProviderRow | null> {
    try {
      const [row] = await this.db
        .select()
        .from(userLLMProviders)
        .where(eq(userLLMProviders.id, id))
        .limit(1);
      return row ?? null;
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.findById failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<UserLLMProviderRow[]> {
    try {
      return this.db
        .select()
        .from(userLLMProviders)
        .where(eq(userLLMProviders.userId, userId))
        .orderBy(desc(userLLMProviders.isDefault), desc(userLLMProviders.createdAt));
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.findByUserId failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findActiveByUserId(userId: string): Promise<UserLLMProviderRow[]> {
    try {
      return this.db
        .select()
        .from(userLLMProviders)
        .where(eq(userLLMProviders.userId, userId))
        .orderBy(desc(userLLMProviders.isDefault), desc(userLLMProviders.createdAt));
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.findActiveByUserId failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findDefaultForUser(userId: string): Promise<UserLLMProviderRow | null> {
    try {
      const [row] = await this.db
        .select()
        .from(userLLMProviders)
        .where(eq(userLLMProviders.userId, userId))
        .orderBy(desc(userLLMProviders.isDefault), desc(userLLMProviders.createdAt))
        .limit(1);

      if (!row || !row.isDefault) {
        return null;
      }

      return row;
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.findDefaultForUser failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async setDefault(userId: string, providerId: string): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .update(userLLMProviders)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(userLLMProviders.userId, userId));

        await tx
          .update(userLLMProviders)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(and(eq(userLLMProviders.id, providerId), eq(userLLMProviders.userId, userId)));
      });
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.setDefault failed', {
        userId,
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async create(data: NewUserLLMProvider): Promise<UserLLMProviderRow> {
    try {
      const [row] = await this.db.insert(userLLMProviders).values(data).returning();
      return row;
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.create failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<NewUserLLMProvider>
  ): Promise<UserLLMProviderRow | null> {
    try {
      const [row] = await this.db
        .update(userLLMProviders)
        .set(data)
        .where(eq(userLLMProviders.id, id))
        .returning();
      return row ?? null;
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.update failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.delete(userLLMProviders).where(eq(userLLMProviders.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error: unknown) {
      logger.error('UserLLMProviderRepository.delete failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
