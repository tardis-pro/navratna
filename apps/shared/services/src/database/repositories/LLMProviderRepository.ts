import { BaseRepository } from '../base/BaseRepository';
import { logger } from '@uaip/utils';
import { getIntelligenceDb } from '../drizzle/clients/index';

export class LLMProviderRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() { return 'llm_providers'; }
  get plane(): 'intelligence' { return 'intelligence'; }
}

