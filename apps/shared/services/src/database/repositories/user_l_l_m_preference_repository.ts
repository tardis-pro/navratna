import { BaseRepository } from '../base/base_repository';

export { AgentLLMPreferenceRepository } from './agent_l_l_m_preference_repository';

export class UserLLMPreferenceRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'user_llm_preferences';
  }
  get plane(): 'control' {
    return 'control';
  }

  async findByUserId(userId: string): Promise<Record<string, unknown>[]> {
    return this.findMany({ user_id: userId });
  }

  async upsertForUser(
    userId: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const existing = await this.findMany({ user_id: userId }, { limit: 1 });
    if (existing[0]) return (await this.update(existing[0].id as string, data)) ?? existing[0];
    return this.create({ user_id: userId, ...data });
  }
}
