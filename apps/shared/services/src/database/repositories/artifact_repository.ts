import { BaseRepository } from '../base/base_repository';

export class ArtifactRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'artifacts';
  }
  get plane(): 'intelligence' {
    return 'intelligence';
  }
}
