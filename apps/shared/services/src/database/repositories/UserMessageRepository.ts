import { BaseRepository } from '../base/BaseRepository';
import { logger } from '@uaip/utils';
import { getControlDb } from '../drizzle/clients/index';

export class UserMessageRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'user_messages';
  }
  get plane(): 'control' {
    return 'control';
  }
}
