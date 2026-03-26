import { BaseRepository } from '../base/base_repository';

export class LLMProviderRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'llm_providers';
  }
  get plane(): 'intelligence' {
    return 'intelligence';
  }
}
