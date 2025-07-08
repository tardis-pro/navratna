import { DataSource } from 'typeorm';
import { UserLLMProvider } from '../../entities/userLLMProvider.entity.js';
import { logger } from '@uaip/utils';

export class DefaultUserLLMProviderSeed {
  
  /**
   * Create default LLM providers for a user based on their role
   * This is called when a new user is created
   */
  static async createDefaultProvidersForUser(
    dataSource: DataSource, 
    userId: string, 
    userRole: string = 'user'
  ): Promise<void> {
    try {
      const userLLMProviderRepo = dataSource.getRepository(UserLLMProvider);
      
      // Check if user already has providers
      const existingProviders = await userLLMProviderRepo.count({ 
        where: { userId } 
      });
      
      if (existingProviders > 0) {
        logger.info('User already has LLM providers, skipping default creation', { userId });
        return;
      }
      
      const defaultProviders = this.getDefaultProvidersForRole(userRole);
      
      for (const providerConfig of defaultProviders) {
        const provider = new UserLLMProvider();
        provider.userId = userId;
        provider.name = providerConfig.name;
        provider.description = providerConfig.description;
        provider.type = providerConfig.type;
        provider.baseUrl = providerConfig.baseUrl;
        provider.defaultModel = providerConfig.defaultModel;
        provider.configuration = providerConfig.configuration;
        provider.priority = providerConfig.priority;
        provider.status = providerConfig.status;
        provider.isActive = providerConfig.isActive;
        
        // For demo providers, set placeholder API keys
        if (providerConfig.apiKey) {
          provider.setApiKey(providerConfig.apiKey);
        }
        
        await userLLMProviderRepo.save(provider);
      }
      
      logger.info('Default LLM providers created for user', { 
        userId, 
        userRole, 
        providerCount: defaultProviders.length 
      });
      
    } catch (error) {
      logger.error('Failed to create default LLM providers for user', { 
        error, 
        userId, 
        userRole 
      });
      throw error;
    }
  }
  
  /**
   * Get default provider configurations based on user role
   */
  private static getDefaultProvidersForRole(role: string): Array<{
    name: string;
    description?: string;
    type: 'openai' | 'anthropic' | 'google' | 'ollama' | 'llmstudio' | 'custom';
    baseUrl?: string;
    apiKey?: string;
    defaultModel?: string;
    configuration?: any;
    priority: number;
    status: 'active' | 'inactive' | 'error' | 'testing';
    isActive: boolean;
  }> {
    
    const baseProviders = [];
    
    // OpenAI provider (requires user to add their own API key)
    baseProviders.push({
      name: 'OpenAI',
      description: 'OpenAI GPT models - Add your API key in settings',
      type: 'openai' as const,
      baseUrl: 'https://api.openai.com',
      defaultModel: 'gpt-4o-mini',
      configuration: {
        timeout: 30000,
        retries: 3,
        rateLimit: 60,
        headers: {
          'User-Agent': 'UAIP-Client/1.0'
        }
      },
      priority: 10,
      status: 'inactive' as const, // Inactive until user adds API key
      isActive: false
    });
    
    // Anthropic provider (requires user to add their own API key)
    baseProviders.push({
      name: 'Anthropic Claude',
      description: 'Anthropic Claude models - Add your API key in settings',
      type: 'anthropic' as const,
      baseUrl: 'https://api.anthropic.com',
      defaultModel: 'claude-3-5-sonnet-20241022',
      configuration: {
        timeout: 30000,
        retries: 3,
        rateLimit: 30,
        headers: {
          'anthropic-version': '2023-06-01',
          'User-Agent': 'UAIP-Client/1.0'
        }
      },
      priority: 20,
      status: 'inactive' as const, // Inactive until user adds API key
      isActive: false
    });
    
    // Local Ollama provider (active by default if available)
    baseProviders.push({
      name: 'Local Ollama',
      description: 'Local Ollama instance for privacy-focused AI',
      type: 'ollama' as const,
      baseUrl: 'http://localhost:11434',
      defaultModel: 'llama3.2',
      configuration: {
        timeout: 60000,
        retries: 2,
        rateLimit: 10
      },
      priority: 30,
      status: 'testing' as const, // Will be tested and activated if available
      isActive: true
    });
    
    // LM Studio provider (active by default if available)
    baseProviders.push({
      name: 'LM Studio',
      description: 'Local LM Studio instance for private AI models',
      type: 'llmstudio' as const,
      baseUrl: 'http://localhost:1234',
      defaultModel: 'local-model',
      configuration: {
        timeout: 60000,
        retries: 2,
        rateLimit: 5
      },
      priority: 40,
      status: 'testing' as const, // Will be tested and activated if available
      isActive: true
    });
    
    // Role-specific providers
    if (role === 'admin' || role === 'system') {
      // Admins get additional demo providers
      baseProviders.push({
        name: 'Demo Provider',
        description: 'Demo provider for testing and development',
        type: 'custom' as const,
        baseUrl: 'http://localhost:8080/v1',
        defaultModel: 'demo-model',
        configuration: {
          timeout: 10000,
          retries: 1
        },
        priority: 100,
        status: 'testing' as const,
        isActive: false
      });
    }
    
    return baseProviders;
  }
  
  /**
   * Clean up inactive providers for a user
   */
  static async cleanupInactiveProviders(dataSource: DataSource, userId: string): Promise<void> {
    try {
      const userLLMProviderRepo = dataSource.getRepository(UserLLMProvider);
      
      // Remove providers that have been inactive for more than 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const inactiveProviders = await userLLMProviderRepo.find({
        where: {
          userId,
          isActive: false,
          status: 'inactive'
        }
      });
      
      const providersToDelete = inactiveProviders.filter(provider => 
        !provider.lastUsedAt || provider.lastUsedAt < thirtyDaysAgo
      );
      
      if (providersToDelete.length > 0) {
        await userLLMProviderRepo.remove(providersToDelete);
        logger.info('Cleaned up inactive LLM providers', { 
          userId, 
          deletedCount: providersToDelete.length 
        });
      }
      
    } catch (error) {
      logger.error('Failed to cleanup inactive LLM providers', { error, userId });
    }
  }
  
  /**
   * Update default provider configurations for existing users
   */
  static async updateDefaultProviders(dataSource: DataSource): Promise<void> {
    try {
      const userLLMProviderRepo = dataSource.getRepository(UserLLMProvider);
      
      // Update OpenAI providers with latest models
      await userLLMProviderRepo.update(
        { type: 'openai', name: 'OpenAI' },
        { 
              defaultModel: 'gpt-4o-mini'
        }
      );
      
      // Update Anthropic providers with latest models
      await userLLMProviderRepo.update(
        { type: 'anthropic', name: 'Anthropic Claude' },
        { 
              defaultModel: 'claude-3-5-sonnet-20241022'
        }
      );
      
      logger.info('Updated default provider configurations');
      
    } catch (error) {
      logger.error('Failed to update default provider configurations', { error });
    }
  }
  
  /**
   * Run the seeder to update all existing users
   */
  static async run(dataSource: DataSource): Promise<void> {
    logger.info('Running DefaultUserLLMProviderSeed...');
    
    try {
      await this.updateDefaultProviders(dataSource);
      logger.info('DefaultUserLLMProviderSeed completed successfully');
    } catch (error) {
      logger.error('DefaultUserLLMProviderSeed failed', { error });
      throw error;
    }
  }
}