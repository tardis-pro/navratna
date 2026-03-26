import { BaseRepository } from '../base/base_repository';

export class UserPresenceRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'user_presence';
  }
  get plane(): 'control' {
    return 'control';
  }
}
