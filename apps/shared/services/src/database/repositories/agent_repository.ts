import { BaseRepository } from '../base/base_repository';

export class AgentRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'agents';
  }
  get plane(): 'intelligence' {
    return 'intelligence';
  }
}
