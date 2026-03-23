import { BaseRepository } from '../base/BaseRepository';
import { logger } from '@uaip/utils';
import { getControlDb } from '../drizzle/clients/index';

export class UserLLMPreferenceRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() { return 'user_llm_preferences'; }
  get plane(): 'control' { return 'control'; }
}

export class AgentLLMPreferenceRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() { return 'agent_llm_preferences'; }
  get plane(): 'intelligence' { return 'intelligence'; }
  async findByAgentId(agentId: string): Promise<Record<string, unknown>[]> { return this.findMany({ agent_id: agentId }); }
  async upsertForAgent(agentId: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await this.findMany({ agent_id: agentId });
    if (existing[0]) return (await this.update(existing[0].id as string, data)) ?? existing[0];
    return this.create({ agent_id: agentId, ...data });
  }
}
