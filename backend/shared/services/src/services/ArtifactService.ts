import { TypeOrmService } from '../typeormService.js';
import { ArtifactRepository } from '../database/repositories/ArtifactRepository.js';
import { ArtifactDeploymentRepository } from '../database/repositories/ArtifactDeploymentRepository.js';
import { Artifact } from '../entities/artifact.entity.js';
import { ArtifactDeployment } from '../entities/artifactDeployment.entity.js';

export class ArtifactService {
  private static instance: ArtifactService;
  private typeormService: TypeOrmService;

  private _artifactRepository: ArtifactRepository | null = null;
  private _artifactDeploymentRepository: ArtifactDeploymentRepository | null = null;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
  }

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
