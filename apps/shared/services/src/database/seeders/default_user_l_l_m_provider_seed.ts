import { getControlDb } from '../drizzle/clients/index';
import { userLLMProviders } from '../../database/drizzle/schemas/control_schema';
import { logger } from '@uaip/utils';
import type { InferInsertModel } from 'drizzle-orm';

type UserLLMProviderInsert = InferInsertModel<typeof userLLMProviders>;

export class DefaultUserLLMProviderSeed {
  static async createDefaultProvidersForUser(userId: string): Promise<void> {
    const db = getControlDb();
    try {
      const providers = this.getDefaultProvidersForUser(userId);
      for (const provider of providers) {
        await db
          .insert(userLLMProviders)
          .values(provider)
          .onConflictDoNothing();
      }
      logger.info(`Created default LLM providers for user: ${userId}`);
    } catch (error) {
      logger.error('Failed to create default LLM providers for user', { error, userId });
      throw error;
    }
  }

  static async run(): Promise<void> {
    logger.info('Running DefaultUserLLMProviderSeed...');
    logger.info('DefaultUserLLMProviderSeed completed successfully');
  }

  private static getDefaultProvidersForUser(userId: string): UserLLMProviderInsert[] {
    return [
      {
        userId,
        providerId: '00000000-0000-0000-0000-000000000001',
        apiKeyEncrypted: null,
        isDefault: true,
        configuration: {
          timeout: 60000,
          retries: 2,
          rateLimit: 10,
        },
      },
      {
        userId,
        providerId: '00000000-0000-0000-0000-000000000002',
        apiKeyEncrypted: null,
        isDefault: false,
        configuration: {
          timeout: 60000,
          retries: 2,
          rateLimit: 5,
        },
      },
    ];
  }
}
