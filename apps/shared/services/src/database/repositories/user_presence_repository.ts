import { BaseRepository } from '../base/base_repository';
import { logger } from '@uaip/utils';
import { getControlDb } from '../drizzle/clients/index';

export class UserPresenceRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'user_presence';
  }
  get plane(): 'control' {
    return 'control';
  }
}
