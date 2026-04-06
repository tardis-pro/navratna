import { getControlDb } from '../drizzle/clients/index';
import {
  userLLMProviders,
  type UserLLMProvider,
} from '../../database/drizzle/schemas/control_schema';
import { BaseSeed } from './base_seed';
import { logger } from '@uaip/utils';
import type { InferInsertModel } from 'drizzle-orm';

type UserLLMProviderInsert = InferInsertModel<typeof userLLMProviders>;

export class UserLLMProviderSeed extends BaseSeed {
  private db = getControlDb();
  private users: { id: string; role: string }[] = [];

  constructor(userIds: string[]) {
    super('UserLLMProviders');
    this.users = userIds.map((id) => ({ id, role: 'user' }));
  }

  async seed(): Promise<UserLLMProvider[]> {
    logger.info(`Seeding ${this.entityName}...`);

    const seedData = await this.getSeedData();

    for (const provider of seedData) {
      await this.db
        .insert(userLLMProviders)
        .values(provider)
        .onConflictDoNothing();
    }

    logger.info(`   ${this.entityName} seeding completed`);
    return await this.db.select().from(userLLMProviders);
  }

  async getSeedData(): Promise<UserLLMProviderInsert[]> {
    const providers: UserLLMProviderInsert[] = [];

    for (const user of this.users) {
      providers.push(...this.createLocalProviders(user.id));
      if (user.role === 'admin') {
        providers.push(...this.createBasicCloudProviders(user.id, true));
      } else {
        providers.push(...this.createBasicCloudProviders(user.id, false));
      }
    }

    return providers;
  }

  private createLocalProviders(userId: string): UserLLMProviderInsert[] {
    return [
      {
        userId,
        providerId: '00000000-0000-0000-0000-000000000001',
        apiKeyEncrypted: null,
        isDefault: false,
        configuration: {
          timeout: 60000,
          retries: 2,
          rateLimit: 10,
          headers: { 'User-Agent': 'UAIP-Client/1.0' },
          customEndpoints: { models: '/api/tags', chat: '/api/chat', completions: '/api/generate' },
        },
      },
      {
        userId,
        providerId: '00000000-0000-0000-0000-000000000002',
        apiKeyEncrypted: null,
        isDefault: true,
        configuration: {
          timeout: 60000,
          retries: 2,
          rateLimit: 5,
          headers: { 'User-Agent': 'UAIP-Client/1.0', 'Content-Type': 'application/json' },
          customEndpoints: {
            models: '/v1/models',
            chat: '/v1/chat/completions',
            completions: '/v1/completions',
          },
        },
      },
    ];
  }

  private createBasicCloudProviders(userId: string, withApiKey: boolean): UserLLMProviderInsert[] {
    const apiKey = withApiKey ? 'demo-key-' + userId.slice(0, 8) : null;
    return [
      {
        userId,
        providerId: '00000000-0000-0000-0000-000000000003',
        apiKeyEncrypted: apiKey,
        isDefault: false,
        configuration: {
          timeout: 30000,
          retries: 3,
          rateLimit: 60,
          headers: { 'User-Agent': 'UAIP-Client/1.0' },
        },
      },
      {
        userId,
        providerId: '00000000-0000-0000-0000-000000000004',
        apiKeyEncrypted: apiKey,
        isDefault: false,
        configuration: {
          timeout: 30000,
          retries: 3,
          rateLimit: 30,
          headers: { 'anthropic-version': '2023-06-01', 'User-Agent': 'UAIP-Client/1.0' },
        },
      },
    ];
  }
}
