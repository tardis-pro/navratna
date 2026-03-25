import { BaseRepository } from '../base/BaseRepository';
import { logger } from '@uaip/utils';
import { getControlDb } from '../drizzle/clients/index';

export class UserPresenceRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() { return 'user_presence'; }
  get plane(): 'control' { return 'control'; }
}

