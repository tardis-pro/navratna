import { BaseRepository } from '../base/base_repository';
import { logger } from '@uaip/utils';
import { getControlDb } from '../drizzle/clients/index';

export class OAuthRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'oauth_providers';
  }
  get plane(): 'control' {
    return 'control';
  }
}
