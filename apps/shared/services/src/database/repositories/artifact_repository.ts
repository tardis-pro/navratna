import { eq, desc, and, count, ilike } from 'drizzle-orm';
import { getIntelligenceDb } from '../drizzle/clients/index';
import { artifacts, type Artifact } from '../drizzle/schemas/intelligence.schema';
import { logger } from '@uaip/utils';

type ArtifactRow = typeof artifacts.$inferSelect;
type NewArtifact = typeof artifacts.$inferInsert;

export class ArtifactRepository {
    private get db() {
        return getIntelligenceDb();
    }

    async findById(id: string): Promise<ArtifactRow | null> {
        try {
            const [row] = await this.db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
            if (!row) {
                return null;
            }
            const artifact: Artifact = row;
            return artifact;
        } catch (error: unknown) {
            logger.error('ArtifactRepository.findById failed', {
                id,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    async findMany(options: { limit?: number; offset?: number; type?: string; status?: string }): Promise<ArtifactRow[]> {
        try {
            const clauses = [];

            if (options.type) {
                clauses.push(ilike(artifacts.type, `%${options.type}%`));
            }

            if (options.status) {
                clauses.push(eq(artifacts.status, options.status));
            }

            const query = this.db
                .select()
                .from(artifacts)
                .orderBy(desc(artifacts.createdAt))
                .limit(options.limit ?? 100)
                .offset(options.offset ?? 0);

            if (clauses.length === 0) {
                return query;
            }

            return query.where(and(...clauses));
        } catch (error: unknown) {
            logger.error('ArtifactRepository.findMany failed', {
                options,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    async create(data: NewArtifact): Promise<ArtifactRow> {
        try {
            const [row] = await this.db.insert(artifacts).values(data).returning();
            const artifact: Artifact = row;
            return artifact;
        } catch (error: unknown) {
            logger.error('ArtifactRepository.create failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    async update(id: string, data: Partial<NewArtifact>): Promise<ArtifactRow | null> {
        try {
            const [row] = await this.db.update(artifacts).set(data).where(eq(artifacts.id, id)).returning();
            if (!row) {
                return null;
            }
            const artifact: Artifact = row;
            return artifact;
        } catch (error: unknown) {
            logger.error('ArtifactRepository.update failed', {
                id,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const result = await this.db.delete(artifacts).where(eq(artifacts.id, id));
            return (result.rowCount ?? 0) > 0;
        } catch (error: unknown) {
            logger.error('ArtifactRepository.delete failed', {
                id,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    async count(): Promise<number> {
        try {
            const [result] = await this.db.select({ total: count() }).from(artifacts);
            return Number(result?.total ?? 0);
        } catch (error: unknown) {
            logger.error('ArtifactRepository.count failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    async findByConversationId(conversationId: string): Promise<ArtifactRow[]> {
        try {
            return this.db
                .select()
                .from(artifacts)
                .where(eq(artifacts.conversationId, conversationId))
                .orderBy(desc(artifacts.createdAt));
        } catch (error: unknown) {
            logger.error('ArtifactRepository.findByConversationId failed', {
                conversationId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }
}
