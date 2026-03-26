import { BaseRepository } from '../base/base_repository';
import { logger } from '@uaip/utils';
import { getIntelligenceDb } from '../drizzle/clients/index';

export class ArtifactRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'artifacts';
  }
  get plane(): 'intelligence' {
    return 'intelligence';
  }
}
