import { eq, desc, count } from 'drizzle-orm';
import { getIntelligenceDb } from '../drizzle/clients/index';
import { llmProviders, llmModels } from '../drizzle/schemas/intelligence_schema';
import { logger } from '@uaip/utils';

type LLMProviderRow = typeof llmProviders.$inferSelect;
type NewLLMProvider = typeof llmProviders.$inferInsert;
type LLMModelRow = typeof llmModels.$inferSelect;
type NewLLMModel = typeof llmModels.$inferInsert;

export class LLMProviderRepository {
  private get db() {
    return getIntelligenceDb();
  }

  async findById(id: string): Promise<LLMProviderRow | null> {
    try {
      const [row] = await this.db.select().from(llmProviders).where(eq(llmProviders.id, id)).limit(1);
      return row ?? null;
    } catch (error: unknown) {
      logger.error('LLMProviderRepository.findById failed', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async findMany(conditions: { isActive?: boolean } = {}): Promise<LLMProviderRow[]> {
    try {
      const query = this.db.select().from(llmProviders).orderBy(desc(llmProviders.priority), desc(llmProviders.createdAt));

      if (conditions.isActive === undefined) {
        return query;
      }

      return query.where(eq(llmProviders.isActive, conditions.isActive));
    } catch (error: unknown) {
      logger.error('LLMProviderRepository.findMany failed', {
        conditions,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async findActiveProviders(): Promise<LLMProviderRow[]> {
    try {
      return this.findMany({ isActive: true });
    } catch (error: unknown) {
      logger.error('LLMProviderRepository.findActiveProviders failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async create(data: NewLLMProvider): Promise<LLMProviderRow> {
    try {
      const [row] = await this.db.insert(llmProviders).values(data).returning();
      return row;
    } catch (error: unknown) {
      logger.error('LLMProviderRepository.create failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async update(id: string, data: Partial<NewLLMProvider>): Promise<LLMProviderRow | null> {
    try {
      const [row] = await this.db.update(llmProviders).set(data).where(eq(llmProviders.id, id)).returning();
      return row ?? null;
    } catch (error: unknown) {
      logger.error('LLMProviderRepository.update failed', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.delete(llmProviders).where(eq(llmProviders.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error: unknown) {
      logger.error('LLMProviderRepository.delete failed', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async count(): Promise<number> {
    try {
      const [result] = await this.db.select({ total: count() }).from(llmProviders);
      return Number(result?.total ?? 0);
    } catch (error: unknown) {
      logger.error('LLMProviderRepository.count failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}

export class LLMModelRepository {
  private get db() {
    return getIntelligenceDb();
  }

  async findById(id: string): Promise<LLMModelRow | null> {
    try {
      const [row] = await this.db.select().from(llmModels).where(eq(llmModels.id, id)).limit(1);
      return row ?? null;
    } catch (error: unknown) {
      logger.error('LLMModelRepository.findById failed', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async findByProviderId(providerId: string): Promise<LLMModelRow[]> {
    try {
      return this.db.select().from(llmModels).where(eq(llmModels.providerId, providerId)).orderBy(desc(llmModels.createdAt));
    } catch (error: unknown) {
      logger.error('LLMModelRepository.findByProviderId failed', {
        providerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async findAll(): Promise<LLMModelRow[]> {
    try {
      return this.db.select().from(llmModels).orderBy(desc(llmModels.createdAt));
    } catch (error: unknown) {
      logger.error('LLMModelRepository.findAll failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async create(data: NewLLMModel): Promise<LLMModelRow> {
    try {
      const [row] = await this.db.insert(llmModels).values(data).returning();
      return row;
    } catch (error: unknown) {
      logger.error('LLMModelRepository.create failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async update(id: string, data: Partial<NewLLMModel>): Promise<LLMModelRow | null> {
    try {
      const [row] = await this.db.update(llmModels).set(data).where(eq(llmModels.id, id)).returning();
      return row ?? null;
    } catch (error: unknown) {
      logger.error('LLMModelRepository.update failed', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
