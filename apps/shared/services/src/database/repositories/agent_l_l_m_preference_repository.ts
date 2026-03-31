import { eq } from 'drizzle-orm';
import { getIntelligenceDb } from '../drizzle/clients/index';
import { agentLLMPreferences } from '../drizzle/schemas/intelligence.schema';
import { logger } from '@uaip/utils';

type AgentLLMPreferenceRow = typeof agentLLMPreferences.$inferSelect;
type NewAgentLLMPreference = typeof agentLLMPreferences.$inferInsert;

export class AgentLLMPreferenceRepository {
    private get db() {
        return getIntelligenceDb();
    }

    async findById(id: string): Promise<AgentLLMPreferenceRow | null> {
        try {
            const [row] = await this.db
                .select()
                .from(agentLLMPreferences)
                .where(eq(agentLLMPreferences.id, id))
                .limit(1);
            return row ?? null;
        } catch (error: unknown) {
            logger.error('AgentLLMPreferenceRepository.findById failed', {
                id,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async findByAgentId(agentId: string): Promise<AgentLLMPreferenceRow[]> {
        try {
            return this.db
                .select()
                .from(agentLLMPreferences)
                .where(eq(agentLLMPreferences.agentId, agentId));
        } catch (error: unknown) {
            logger.error('AgentLLMPreferenceRepository.findByAgentId failed', {
                agentId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async upsertForAgent(
        agentId: string,
        data: Partial<NewAgentLLMPreference>
    ): Promise<AgentLLMPreferenceRow> {
        try {
            const [existing] = await this.db
                .select()
                .from(agentLLMPreferences)
                .where(eq(agentLLMPreferences.agentId, agentId))
                .limit(1);

            if (existing) {
                const [updated] = await this.db
                    .update(agentLLMPreferences)
                    .set(data)
                    .where(eq(agentLLMPreferences.id, existing.id))
                    .returning();
                return updated ?? existing;
            }

            const [created] = await this.db
                .insert(agentLLMPreferences)
                .values({ ...data, agentId })
                .returning();
            return created;
        } catch (error: unknown) {
            logger.error('AgentLLMPreferenceRepository.upsertForAgent failed', {
                agentId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async deleteByAgentId(agentId: string): Promise<boolean> {
        try {
            const result = await this.db
                .delete(agentLLMPreferences)
                .where(eq(agentLLMPreferences.agentId, agentId));
            return (result.rowCount ?? 0) > 0;
        } catch (error: unknown) {
            logger.error('AgentLLMPreferenceRepository.deleteByAgentId failed', {
                agentId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
}
