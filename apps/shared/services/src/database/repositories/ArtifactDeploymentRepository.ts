import { BaseRepository } from '../base/BaseRepository';
import { logger } from '@uaip/utils';
import { getIntelligenceDb } from '../drizzle/clients/index';

export class ArtifactDeploymentRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'artifact_deployments';
  }
  get plane(): 'intelligence' {
    return 'intelligence';
  }
}
