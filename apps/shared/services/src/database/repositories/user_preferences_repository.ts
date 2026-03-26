import { BaseRepository } from '../base/base_repository';

export class UserPreferencesRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'user_preferences';
  }
  get plane(): 'control' {
    return 'control';
  }
}
