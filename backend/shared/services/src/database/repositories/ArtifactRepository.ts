import { BaseRepository } from '../base/BaseRepository';
import { logger } from '@uaip/utils';
import { getIntelligenceDb } from '../drizzle/clients/index';

export class ArtifactRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() { return 'artifacts'; }
  get plane(): 'intelligence' { return 'intelligence'; }
}

