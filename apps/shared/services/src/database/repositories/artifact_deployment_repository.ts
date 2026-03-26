import { BaseRepository } from '../base/base_repository';

export class ArtifactDeploymentRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'artifact_deployments';
  }
  get plane(): 'intelligence' {
    return 'intelligence';
  }
}
