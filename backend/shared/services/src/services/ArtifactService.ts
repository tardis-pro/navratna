import { TypeOrmService } from '../typeormService.js';
import { ArtifactRepository } from '../database/repositories/ArtifactRepository.js';
import { Artifact } from '../entities/artifact.entity.js';
import { ArtifactDeployment } from '../entities/artifactDeployment.entity.js';
import { Repository } from 'typeorm';

export class ArtifactService {
  private static instance: ArtifactService;
  private typeormService: TypeOrmService;

  private _artifactRepository: ArtifactRepository | null = null;
  private _artifactDeploymentRepository: Repository<ArtifactDeployment> | null = null;

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
      this._artifactRepository = new ArtifactRepository(this.typeormService.dataSource, Artifact);
    }
    return this._artifactRepository;
  }

  public getArtifactDeploymentRepository(): Repository<ArtifactDeployment> {
    if (!this._artifactDeploymentRepository) {
      this._artifactDeploymentRepository = this.typeormService.dataSource.getRepository(ArtifactDeployment);
    }
    return this._artifactDeploymentRepository;
  }
}
