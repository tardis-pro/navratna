import { DataSource, DeepPartial } from 'typeorm';
import { BaseSeed } from './BaseSeed.js';
import { UserLLMProvider, UserLLMProviderType, UserLLMProviderStatus } from '../../entities/userLLMProvider.entity.js';
import { UserEntity } from '../../entities/user.entity.js';
import { SecurityLevel } from '@uaip/types';
import { logger } from '@uaip/utils';

/**
 * Comprehensive UserLLMProvider seeder that creates default providers for all users
 * Based on user roles and security clearance levels
 */
export class UserLLMProviderSeed extends BaseSeed<UserLLMProvider> {
  private users: UserEntity[] = [];

  constructor(dataSource: DataSource, users: UserEntity[]) {
    super(dataSource, dataSource.getRepository(UserLLMProvider), 'User LLM Providers');
    this.users = users;
  }

  getUniqueField(): keyof UserLLMProvider {
    return 'id'; // Since we have composite unique constraint (userId, name), use ID for upsert
  }

  async getSeedData(): Promise<DeepPartial<UserLLMProvider>[]> {
    const seedData: DeepPartial<UserLLMProvider>[] = [];

    for (const user of this.users) {
      const userProviders = this.getProvidersForUser(user);
      seedData.push(...userProviders);
    }

    return seedData;
  }

  /**
   * Generate appropriate LLM providers based on user role and security clearance
   */
  private getProvidersForUser(user: UserEntity): DeepPartial<UserLLMProvider>[] {
    const providers: DeepPartial<UserLLMProvider>[] = [];
    const baseConfig = this.getBaseProvidersConfig();

    // All users get basic local providers (Ollama, LM Studio) for privacy
    providers.push(...this.createLocalProviders(user));

    // Role-based cloud provider access
    switch (user.role) {
      case 'admin':
      case 'system':
        // Admins get all providers with demo keys and advanced configurations
        providers.push(...this.createAllCloudProviders(user, true));
        providers.push(...this.createCustomProviders(user));
        break;

      case 'moderator':
        // Moderators get mainstream cloud providers
        providers.push(...this.createMainstreamCloudProviders(user, false));
        break;

      case 'user':
        // Regular users get OpenAI and Anthropic (industry standard)
        if (user.securityClearance === SecurityLevel.HIGH) {
          providers.push(...this.createMainstreamCloudProviders(user, false));
        } else {
          providers.push(...this.createBasicCloudProviders(user, false));
        }
        break;

      case 'guest':
        // Guests only get local providers for privacy and security
        // No cloud providers for guest accounts
        break;

      default:
        // Default to basic cloud providers for unknown roles
        providers.push(...this.createBasicCloudProviders(user, false));
    }

    return providers;
  }

  /**
   * Create local AI providers (Ollama, LM Studio) - available to all users
   */
  private createLocalProviders(user: UserEntity): DeepPartial<UserLLMProvider>[] {
    return [
      {
        userId: user.id,
        name: 'Local Ollama',
        description: 'Privacy-focused local AI with Ollama - no data leaves your machine',
        type: 'ollama' as UserLLMProviderType,
        baseUrl: 'http://localhost:11434',
        defaultModel: 'llama3.2:latest',
        configuration: {
          timeout: 60000,
          retries: 2,
          rateLimit: 10,
          headers: {
            'User-Agent': 'UAIP-Client/1.0',
          },
          customEndpoints: {
            models: '/api/tags',
            chat: '/api/chat',
            completions: '/api/generate'
          }
        },
        status: 'testing' as UserLLMProviderStatus, // Will test connection on first use
        isActive: true,
        priority: 10, // Lower priority than cloud providers
        totalTokensUsed: '0',
        totalRequests: '0',
        totalErrors: '0'
      },
      {
        userId: user.id,
        name: 'LM Studio Local',
        description: 'Local LM Studio instance for running open-source models privately',
        type: 'llmstudio' as UserLLMProviderType,
        baseUrl: 'http://192.168.1.17:1234',
        defaultModel: 'local-model',
        configuration: {
          timeout: 60000,
          retries: 2,
          rateLimit: 5,
          headers: {
            'User-Agent': 'UAIP-Client/1.0',
            'Content-Type': 'application/json'
          },
          customEndpoints: {
            models: '/v1/models',
            chat: '/v1/chat/completions',
            completions: '/v1/completions'
          }
        },
        status: 'testing' as UserLLMProviderStatus,
        isActive: true,
        priority: 1,
        totalTokensUsed: '0',
        totalRequests: '0',
        totalErrors: '0'
      },
      {
        userId: user.id,
        name: 'LM Studio Local',
        description: 'Local LM Studio instance for running open-source models privately',
        type: 'llmstudio' as UserLLMProviderType,
        baseUrl: 'http://192.168.1.11:1234',
        defaultModel: 'arch-agent-7b',
        configuration: {
          timeout: 60000,
          retries: 2,
          rateLimit: 5,
          headers: {
            'User-Agent': 'UAIP-Client/1.0',
            'Content-Type': 'application/json'
          },
          customEndpoints: {
            models: '/v1/models',
            chat: '/v1/chat/completions',
            completions: '/v1/completions'
          }
        },
        status: 'testing' as UserLLMProviderStatus,
        isActive: true,
        priority: 1,
        totalTokensUsed: '0',
        totalRequests: '0',
        totalErrors: '0'
      }
    ];
  }

  /**
   * Create basic cloud providers (OpenAI, Anthropic)
   */
  private createBasicCloudProviders(user: UserEntity, withDemoKeys: boolean): DeepPartial<UserLLMProvider>[] {
    const providers: DeepPartial<UserLLMProvider>[] = [];

    // OpenAI Provider
    const openaiProvider: DeepPartial<UserLLMProvider> = {
      userId: user.id,
      name: 'OpenAI GPT',
      description: withDemoKeys
        ? 'OpenAI GPT models with demo access - production ready'
        : 'OpenAI GPT models - add your API key in settings to activate',
      type: 'openai' as UserLLMProviderType,
      baseUrl: 'https://api.openai.com',
      defaultModel: 'gpt-4o-mini',
      configuration: {
        timeout: 30000,
        retries: 3,
        rateLimit: 60,
        headers: {
          'User-Agent': 'UAIP-Client/1.0',
        }
      },
      status: withDemoKeys ? 'active' as UserLLMProviderStatus : 'inactive' as UserLLMProviderStatus,
      isActive: withDemoKeys,
      priority: 10, // High priority for OpenAI
      totalTokensUsed: '0',
      totalRequests: '0',
      totalErrors: '0'
    };

    // Add API key - demo key for admins/demo users, placeholder for others
    const demoProvider = new UserLLMProvider();
    Object.assign(demoProvider, openaiProvider);
    if (withDemoKeys) {
      demoProvider.setApiKey('demo-openai-key-for-testing-' + user.role);
    } else {
      demoProvider.setApiKey('sk-placeholder-openai-key-replace-in-settings');
    }
    openaiProvider.apiKeyEncrypted = demoProvider.apiKeyEncrypted;

    providers.push(openaiProvider);

    // Anthropic Provider
    const anthropicProvider: DeepPartial<UserLLMProvider> = {
      userId: user.id,
      name: 'Anthropic Claude',
      description: withDemoKeys
        ? 'Anthropic Claude models with demo access - excellent for analysis'
        : 'Anthropic Claude models - add your API key in settings to activate',
      type: 'anthropic' as UserLLMProviderType,
      baseUrl: 'https://api.anthropic.com',
      defaultModel: 'claude-3-5-sonnet-20241022',
      configuration: {
        timeout: 30000,
        retries: 3,
        rateLimit: 30,
        headers: {
          'anthropic-version': '2023-06-01',
          'User-Agent': 'UAIP-Client/1.0',
        }
      },
      status: withDemoKeys ? 'active' as UserLLMProviderStatus : 'inactive' as UserLLMProviderStatus,
      isActive: withDemoKeys,
      priority: 20, // High priority for Anthropic
      totalTokensUsed: '0',
      totalRequests: '0',
      totalErrors: '0'
    };

    // Add API key - demo key for admins/demo users, placeholder for others
    const demoAnthropicProvider = new UserLLMProvider();
    Object.assign(demoAnthropicProvider, anthropicProvider);
    if (withDemoKeys) {
      demoAnthropicProvider.setApiKey('demo-anthropic-key-for-testing-' + user.role);
    } else {
      demoAnthropicProvider.setApiKey('sk-ant-placeholder-anthropic-key-replace-in-settings');
    }
    anthropicProvider.apiKeyEncrypted = demoAnthropicProvider.apiKeyEncrypted;

    providers.push(anthropicProvider);

    return providers;
  }

  /**
   * Create mainstream cloud providers (OpenAI, Anthropic, Google)
   */
  private createMainstreamCloudProviders(user: UserEntity, withDemoKeys: boolean): DeepPartial<UserLLMProvider>[] {
    const providers = this.createBasicCloudProviders(user, withDemoKeys);

    // Add Google Gemini
    const googleProvider: DeepPartial<UserLLMProvider> = {
      userId: user.id,
      name: 'Google Gemini',
      description: withDemoKeys
        ? 'Google Gemini models with demo access - great for code and reasoning'
        : 'Google Gemini models - add your API key in settings to activate',
      type: 'google' as UserLLMProviderType,
      baseUrl: 'https://generativelanguage.googleapis.com',
      defaultModel: 'gemini-1.5-flash',
      configuration: {
        timeout: 30000,
        retries: 3,
        rateLimit: 40,
        headers: {
          'User-Agent': 'UAIP-Client/1.0',
        }
      },
      status: withDemoKeys ? 'active' as UserLLMProviderStatus : 'inactive' as UserLLMProviderStatus,
      isActive: withDemoKeys,
      priority: 30,
      totalTokensUsed: '0',
      totalRequests: '0',
      totalErrors: '0'
    };

    // Add API key - demo key for admins/demo users, placeholder for others
    const demoGoogleProvider = new UserLLMProvider();
    Object.assign(demoGoogleProvider, googleProvider);
    if (withDemoKeys) {
      demoGoogleProvider.setApiKey('demo-google-key-for-testing-' + user.role);
    } else {
      demoGoogleProvider.setApiKey('AIza-placeholder-google-key-replace-in-settings');
    }
    googleProvider.apiKeyEncrypted = demoGoogleProvider.apiKeyEncrypted;

    providers.push(googleProvider);

    // Add OpenRouter for aggregated model access
    const openRouterProvider: DeepPartial<UserLLMProvider> = {
      userId: user.id,
      name: 'OpenRouter (300+ Models)',
      description: withDemoKeys
        ? 'OpenRouter aggregator with 300+ models from multiple providers - demo access'
        : 'OpenRouter aggregator with 300+ models from multiple providers - add your API key to access',
      type: 'openai' as UserLLMProviderType, // Uses OpenAI-compatible API
      baseUrl: 'https://openrouter.ai/api',
      defaultModel: 'anthropic/claude-3.5-sonnet',
      configuration: {
        timeout: 60000,
        retries: 3,
        rateLimit: 50,
        headers: {
          'User-Agent': 'UAIP-Client/1.0',
          'HTTP-Referer': 'https://council-of-nycea.com',
          'X-Title': 'Council of Nycea'
        }
      },
      status: withDemoKeys ? 'active' as UserLLMProviderStatus : 'inactive' as UserLLMProviderStatus,
      isActive: withDemoKeys,
      priority: 25, // Between Anthropic and Google
      totalTokensUsed: '0',
      totalRequests: '0',
      totalErrors: '0'
    };

    // Add API key - demo key for admins/demo users, placeholder for others
    const demoOpenRouterProvider = new UserLLMProvider();
    Object.assign(demoOpenRouterProvider, openRouterProvider);
    if (withDemoKeys) {
      demoOpenRouterProvider.setApiKey('demo-openrouter-key-for-testing-' + user.role);
    } else {
      demoOpenRouterProvider.setApiKey('sk-or-placeholder-openrouter-key-replace-in-settings');
    }
    openRouterProvider.apiKeyEncrypted = demoOpenRouterProvider.apiKeyEncrypted;

    providers.push(openRouterProvider);

    return providers;
  }

  /**
   * Create all cloud providers (for admins)
   */
  private createAllCloudProviders(user: UserEntity, withDemoKeys: boolean): DeepPartial<UserLLMProvider>[] {
    return this.createMainstreamCloudProviders(user, withDemoKeys);
  }

  /**
   * Create custom/development providers (for admins)
   */
  private createCustomProviders(user: UserEntity): DeepPartial<UserLLMProvider>[] {
    return [
      {
        userId: user.id,
        name: 'Development API',
        description: 'Custom development endpoint for testing new models',
        type: 'custom' as UserLLMProviderType,
        baseUrl: 'http://localhost:8080',
        defaultModel: 'dev-model-v1',
        configuration: {
          timeout: 15000,
          retries: 1,
          rateLimit: 5,
          headers: {
            'User-Agent': 'UAIP-Client/1.0',
            'X-Environment': 'development'
          },
          customEndpoints: {
            models: '/v1/models',
            chat: '/v1/chat/completions',
            completions: '/v1/completions'
          }
        },
        status: 'testing' as UserLLMProviderStatus,
        isActive: false, // Disabled by default, admins can enable
        priority: 1, // Low priority
        totalTokensUsed: '0',
        totalRequests: '0',
        totalErrors: '0'
      },
      {
        userId: user.id,
        name: 'Enterprise Custom',
        description: 'Enterprise custom endpoint - configure in settings',
        type: 'custom' as UserLLMProviderType,
        baseUrl: 'https://api.enterprise.internal',
        defaultModel: 'enterprise-model',
        configuration: {
          timeout: 60000,
          retries: 3,
          rateLimit: 100,
          headers: {
            'User-Agent': 'UAIP-Client/1.0',
            'X-Environment': 'enterprise'
          }
        },
        status: 'inactive' as UserLLMProviderStatus,
        isActive: false,
        priority: 2,
        totalTokensUsed: '0',
        totalRequests: '0',
        totalErrors: '0'
      }
    ];
  }

  /**
   * Get base configuration templates
   */
  private getBaseProvidersConfig() {
    return {
      defaultTimeout: 30000,
      defaultRetries: 3,
      defaultHeaders: {
        'User-Agent': 'UAIP-Client/1.0',
        'Content-Type': 'application/json'
      }
    };
  }

  /**
   * Override seed method to handle composite unique constraints properly
   */
  async seed(): Promise<UserLLMProvider[]> {
    logger.info(`🌱 Seeding ${this.entityName}...`);

    try {
      const seedData = await this.getSeedData();

      if (seedData.length === 0) {
        logger.info(`   ℹ️ No seed data for ${this.entityName}`);
        return [];
      }

      let processedCount = 0;
      let skippedCount = 0;

      // Manual processing due to composite unique constraint (userId, name)
      for (const providerData of seedData) {
        try {
          // Check if provider already exists for this user with this name
          const existingProvider = await this.repository.findOne({
            where: {
              userId: providerData.userId,
              name: providerData.name
            }
          });

          if (existingProvider) {
            // Update existing provider with new configuration
            await this.repository.update(existingProvider.id, providerData);
            processedCount++;
          } else {
            // Create new provider
            const newProvider = this.repository.create(providerData);
            await this.repository.save(newProvider);
            processedCount++;
          }
        } catch (itemError) {
          logger.warn(`   ⚠️ Failed to process ${this.entityName} for user ${providerData.userId}:`, {
            error: itemError.message,
            stack: itemError.stack,
            providerName: providerData.name,
            providerType: providerData.type,
            userId: providerData.userId
          });
          skippedCount++;
          continue;
        }
      }

      logger.info(`   ✅ ${this.entityName} seeding completed: ${processedCount} processed, ${skippedCount} skipped`);

      // Return all user LLM providers
      return await this.repository.find({
        relations: ['user'],
        order: { userId: 'ASC', priority: 'ASC' }
      });

    } catch (error) {
      logger.error(`   ❌ ${this.entityName} seeding failed:`, error);
      logger.warn(`   ⚠️ Continuing without ${this.entityName} seeding...`);

      try {
        return await this.repository.find();
      } catch (findError) {
        logger.warn(`   ⚠️ Could not retrieve existing ${this.entityName}:`, findError.message);
        return [];
      }
    }
  }

  /**
   * Helper method to create providers for a new user (used by user registration)
   */
  static async createDefaultProvidersForUser(
    dataSource: DataSource,
    user: UserEntity
  ): Promise<void> {
    const seed = new UserLLMProviderSeed(dataSource, [user]);
    await seed.seed();
    logger.info(`Created default LLM providers for user: ${user.email}`);
  }

  /**
   * Helper method to update provider configurations for all users
   */
  static async updateProviderConfigurations(dataSource: DataSource): Promise<void> {
    const userRepo = dataSource.getRepository(UserEntity);
    const users = await userRepo.find();

    const seed = new UserLLMProviderSeed(dataSource, users);
    await seed.seed();
    logger.info('Updated LLM provider configurations for all users');
  }
}