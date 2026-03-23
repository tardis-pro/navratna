import { getIntelligenceDb, getIntelligencePool, llmModels } from '../database/index';
import { eq, inArray, asc, and } from 'drizzle-orm';

type LLMModel = typeof llmModels.$inferSelect;
export type { LLMModel };

export class LLMModelRepository {
  private get db() { return getIntelligenceDb(); }
  private get pool() { return getIntelligencePool(); }

  async findAvailableModels(): Promise<LLMModel[]> {
    return this.db.select().from(llmModels)
      .where(eq(llmModels.isEnabled, true))
      .orderBy(asc(llmModels.name));
  }

  async findByProviderId(providerId: string): Promise<LLMModel[]> {
    return this.db.select().from(llmModels)
      .where(and(eq(llmModels.providerId, providerId), eq(llmModels.isEnabled, true)))
      .orderBy(asc(llmModels.name));
  }

  async findByUserProviders(providerIds: string[]): Promise<LLMModel[]> {
    if (providerIds.length === 0) return [];
    return this.db.select().from(llmModels)
      .where(and(inArray(llmModels.providerId, providerIds), eq(llmModels.isEnabled, true)))
      .orderBy(asc(llmModels.name));
  }

  async findByNameAndProvider(name: string, providerId: string): Promise<LLMModel | null> {
    const [row] = await this.db.select().from(llmModels)
      .where(and(eq(llmModels.name, name), eq(llmModels.providerId, providerId)))
      .limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<LLMModel | null> {
    const [row] = await this.db.select().from(llmModels).where(eq(llmModels.id, id)).limit(1);
    return row ?? null;
  }

  async upsertModel(modelData: Partial<LLMModel>): Promise<LLMModel> {
    const existing = modelData.name && modelData.providerId
      ? await this.findByNameAndProvider(modelData.name, modelData.providerId)
      : null;

    if (existing) {
      const [updated] = await this.db.update(llmModels)
        .set({ ...modelData, updatedAt: new Date() })
        .where(eq(llmModels.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await this.db.insert(llmModels)
        .values(modelData as typeof llmModels.$inferInsert)
        .returning();
      return created;
    }
  }

  async upsertModelsForProvider(providerId: string, models: Partial<LLMModel>[]): Promise<LLMModel[]> {
    const results: LLMModel[] = [];
    for (const modelData of models) {
      const model = await this.upsertModel({ ...modelData, providerId });
      results.push(model);
    }
    const currentNames = models.map(m => m.name).filter(Boolean) as string[];
    if (currentNames.length > 0) {
      await this.pool.query(
        `UPDATE "llm_models" SET "is_enabled" = false, "updated_at" = NOW() WHERE "provider_id" = $1 AND "name" NOT IN (${currentNames.map((_, i) => `$${i + 2}`).join(',')})`,
        [providerId, ...currentNames]
      );
    }
    return results;
  }

  async getModelStats(modelId: string): Promise<{ totalRequests: string; totalTokensUsed: string; totalErrors: string; errorRate: number } | null> {
    const model = await this.findById(modelId);
    if (!model) return null;
    return { totalRequests: '0', totalTokensUsed: '0', totalErrors: '0', errorRate: 0 };
  }

  async getPopularModels(limit = 10): Promise<LLMModel[]> {
    return this.db.select().from(llmModels)
      .where(eq(llmModels.isEnabled, true))
      .orderBy(asc(llmModels.name))
      .limit(limit);
  }

  async markStaleModelsAsUnavailable(_staleThresholdHours = 24): Promise<void> {
    await this.db.update(llmModels)
      .set({ isEnabled: false, updatedAt: new Date() })
      .where(eq(llmModels.isEnabled, true));
  }
}
