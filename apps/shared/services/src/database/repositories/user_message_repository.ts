import { BaseRepository } from '../base/base_repository';

export class UserMessageRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'user_messages';
  }
  get plane(): 'control' {
    return 'control';
  }
}
