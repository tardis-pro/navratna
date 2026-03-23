import { BaseRepository } from '../base/BaseRepository';
import { logger } from '@uaip/utils';
import { getControlDb } from '../drizzle/clients/index';

export class UserPreferencesRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() { return 'user_preferences'; }
  get plane(): 'control' { return 'control'; }
}

