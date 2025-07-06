import { logger } from '@uaip/utils';
import { BaseRepository } from '../base/BaseRepository.js';
import { ArtifactDeployment } from '../../entities/artifactDeployment.entity.js';

export class ArtifactDeploymentRepository extends BaseRepository<ArtifactDeployment> {
  constructor() {
    super(ArtifactDeployment);
  }

  /**
   * Find deployments by artifact
   */
  public async findByArtifact(artifactId: string): Promise<ArtifactDeployment[]> {
    try {
      return await this.findMany({ artifactId });
    } catch (error) {
      logger.error('Error finding deployments by artifact', { artifactId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Find deployments by environment
   */
  public async findByEnvironment(environment: string): Promise<ArtifactDeployment[]> {
    try {
      return await this.findMany({ environment });
    } catch (error) {
      logger.error('Error finding deployments by environment', { environment, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Find deployments by status
   */
  public async findByStatus(status: string): Promise<ArtifactDeployment[]> {
    try {
      return await this.findMany({ status });
    } catch (error) {
      logger.error('Error finding deployments by status', { status, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Update deployment status
   */
  public async updateStatus(id: string, status: string, errorMessage?: string): Promise<ArtifactDeployment | null> {
    try {
      const updateData: any = { status };
      if (errorMessage) {
        updateData.errorMessage = errorMessage;
      }
      return await this.update(id, updateData);
    } catch (error) {
      logger.error('Error updating deployment status', { id, status, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Find latest deployment for artifact
   */
  public async findLatestByArtifact(artifactId: string): Promise<ArtifactDeployment | null> {
    try {
      const deployments = await this.findMany({ artifactId });
      if (deployments.length === 0) return null;
      
      // Sort by deployedAt descending and return the first one
      return deployments.sort((a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime())[0];
    } catch (error) {
      logger.error('Error finding latest deployment', { artifactId, error: (error as Error).message });
      throw error;
    }
  }
}