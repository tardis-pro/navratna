import { BaseRepository } from '../base/base_repository';

export class OAuthRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'oauth_providers';
  }
  get plane(): 'control' {
    return 'control';
  }
}
