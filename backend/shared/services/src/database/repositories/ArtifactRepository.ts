import { logger } from '@uaip/utils';
import { BaseRepository } from '../base/BaseRepository.js';
import { Artifact } from '../../entities/artifact.entity.js';

export class ArtifactRepository extends BaseRepository<Artifact> {
  constructor() {
    super(Artifact);
  }

  /**
   * Find artifacts by type
   */
  public async findByType(type: string): Promise<Artifact[]> {
    try {
      return await this.findMany({ type });
    } catch (error) {
      logger.error('Error finding artifacts by type', { type, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Find artifacts by project
   */
  public async findByProject(projectId: string): Promise<Artifact[]> {
    try {
      return await this.findMany({ projectId });
    } catch (error) {
      logger.error('Error finding artifacts by project', {
        projectId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Find artifacts by conversation
   */
  public async findByConversation(conversationId: string): Promise<Artifact[]> {
    try {
      return await this.findMany({ conversationId });
    } catch (error) {
      logger.error('Error finding artifacts by conversation', {
        conversationId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Find artifacts by generator
   */
  public async findByGenerator(generatedBy: number): Promise<Artifact[]> {
    try {
      return await this.findMany({ generatedBy });
    } catch (error) {
      logger.error('Error finding artifacts by generator', {
        generatedBy,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Update artifact status
   */
  public async updateStatus(
    id: string,
    status: 'draft' | 'review' | 'approved' | 'deployed' | 'archived'
  ): Promise<Artifact | null> {
    try {
      return await this.update(id, { status });
    } catch (error) {
      logger.error('Error updating artifact status', {
        id,
        status,
        error: (error as Error).message,
      });
      throw error;
    }
  }
}
