import { BaseRepository } from '../base/BaseRepository';
import { logger } from '@uaip/utils';

export class UserLLMProviderRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() { return 'user_llm_providers'; }
  get plane(): 'control' { return 'control'; }

  async findByUserId(userId: string): Promise<Record<string, unknown>[]> {
    return this.findMany({ user_id: userId });
  }

  async findActiveByUserId(userId: string): Promise<Record<string, unknown>[]> {
    try {
      return this.rawQuery(`SELECT * FROM user_llm_providers WHERE user_id = $1 ORDER BY is_default DESC`, [userId]);
    } catch (error) {
      logger.error('UserLLMProviderRepository.findActiveByUserId failed', { error: (error as Error).message });
      throw error;
    }
  }

  async findDefaultForUser(userId: string): Promise<Record<string, unknown> | null> {
    const rows = await this.rawQuery(`SELECT * FROM user_llm_providers WHERE user_id = $1 AND is_default = true LIMIT 1`, [userId]);
    return rows[0] ?? null;
  }

  async setDefault(userId: string, providerId: string): Promise<void> {
    await this.rawQuery(`UPDATE user_llm_providers SET is_default = false WHERE user_id = $1`, [userId]);
    await this.rawQuery(`UPDATE user_llm_providers SET is_default = true WHERE user_id = $1 AND id = $2`, [userId, providerId]);
  }
}
