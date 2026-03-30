import { eq, desc } from 'drizzle-orm';
import { getIntelligenceDb } from '../drizzle/clients/index';
import { artifactDeployments } from '../drizzle/schemas/intelligence_schema';
import { logger } from '@uaip/utils';

type ArtifactDeploymentRow = typeof artifactDeployments.$inferSelect;
type NewArtifactDeployment = typeof artifactDeployments.$inferInsert;

export class ArtifactDeploymentRepository {
  private get db() {
    return getIntelligenceDb();
  }

  async findById(id: string): Promise<ArtifactDeploymentRow | null> {
    try {
      const [row] = await this.db.select().from(artifactDeployments).where(eq(artifactDeployments.id, id)).limit(1);
      return row ?? null;
    } catch (error: unknown) {
      logger.error('ArtifactDeploymentRepository.findById failed', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async findByArtifactId(artifactId: string): Promise<ArtifactDeploymentRow[]> {
    try {
      return this.db
        .select()
        .from(artifactDeployments)
        .where(eq(artifactDeployments.artifactId, artifactId))
        .orderBy(desc(artifactDeployments.deployedAt));
    } catch (error: unknown) {
      logger.error('ArtifactDeploymentRepository.findByArtifactId failed', {
        artifactId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async create(data: NewArtifactDeployment): Promise<ArtifactDeploymentRow> {
    try {
      const [row] = await this.db.insert(artifactDeployments).values(data).returning();
      return row;
    } catch (error: unknown) {
      logger.error('ArtifactDeploymentRepository.create failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async update(id: string, data: Partial<NewArtifactDeployment>): Promise<ArtifactDeploymentRow | null> {
    try {
      const [row] = await this.db
        .update(artifactDeployments)
        .set(data)
        .where(eq(artifactDeployments.id, id))
        .returning();
      return row ?? null;
    } catch (error: unknown) {
      logger.error('ArtifactDeploymentRepository.update failed', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.delete(artifactDeployments).where(eq(artifactDeployments.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error: unknown) {
      logger.error('ArtifactDeploymentRepository.delete failed', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
