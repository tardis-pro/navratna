import { ArtifactRepository } from '../database/repositories/artifact_repository';
import { ArtifactDeploymentRepository } from '../database/repositories/artifact_deployment_repository';
// Entity types used by repositories: Artifact, ArtifactDeployment

export class ArtifactService {
  private static instance: ArtifactService;

  private _artifactRepository: ArtifactRepository | null = null;
  private _artifactDeploymentRepository: ArtifactDeploymentRepository | null = null;

  private constructor() {}

  public static getInstance(): ArtifactService {
    if (!ArtifactService.instance) {
      ArtifactService.instance = new ArtifactService();
    }
    return ArtifactService.instance;
  }

  public getArtifactRepository(): ArtifactRepository {
    if (!this._artifactRepository) {
      this._artifactRepository = new ArtifactRepository();
    }
    return this._artifactRepository;
  }

  public getArtifactDeploymentRepository(): ArtifactDeploymentRepository {
    if (!this._artifactDeploymentRepository) {
      this._artifactDeploymentRepository = new ArtifactDeploymentRepository();
    }
    return this._artifactDeploymentRepository;
  }
}
