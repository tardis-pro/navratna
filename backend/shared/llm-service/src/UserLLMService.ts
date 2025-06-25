import { 
  LLMRequest, 
  LLMResponse, 
  AgentResponseRequest, 
  AgentResponseResponse,
  ArtifactRequest,
  ArtifactResponse,
  ContextRequest,
  ContextAnalysis
} from './interfaces.js';
import { BaseProvider } from './providers/BaseProvider.js';
import { OllamaProvider } from './providers/OllamaProvider.js';
import { LLMStudioProvider } from './providers/LLMStudioProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { UserLLMProviderRepository, UserLLMProvider, UserLLMProviderType } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';

export class UserLLMService {
  private userLLMProviderRepository: UserLLMProviderRepository | null = null;
  private providerCache: Map<string, BaseProvider> = new Map(); // Cache providers by user+type

  constructor() {
    // Don't initialize repository in constructor - use lazy initialization
  }

  // Lazy initialization of repository
  private async getUserLLMProviderRepository(): Promise<UserLLMProviderRepository> {
    if (!this.userLLMProviderRepository) {
      const databaseService = DatabaseService.getInstance();
      await databaseService.initialize(); // Ensure database is initialized
      this.userLLMProviderRepository = databaseService.userLLMProviderRepository;
    }
    return this.userLLMProviderRepository;
  }

  // Provider Management Methods

  /**
   * Create a new LLM provider for a user
   */
  async createUserProvider(userId: string, data: {
    name: string;
    description?: string;
    type: UserLLMProviderType;
    baseUrl?: string;
    apiKey?: string;
    defaultModel?: string;
    configuration?: any;
    priority?: number;
  }): Promise<UserLLMProvider> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      const provider = await repository.createUserProvider({
        userId,
        ...data
      });

      // Clear cache for this user
      this.clearUserCache(userId);

      logger.info('Created user LLM provider', {
        userId,
        providerId: provider.id,
        type: provider.type,
        name: provider.name
      });

      return provider;
    } catch (error) {
      logger.error('Error creating user LLM provider', { userId, data, error });
      throw error;
    }
  }

  /**
   * Get all providers for a user
   */
  async getUserProviders(userId: string): Promise<UserLLMProvider[]> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      return await repository.findAllProvidersByUser(userId);
    } catch (error) {
      logger.error('Error getting user LLM providers', { userId, error });
      throw error;
    }
  }

  /**
   * Get active providers for a user
   */
  async getActiveUserProviders(userId: string): Promise<UserLLMProvider[]> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      return await repository.findActiveProvidersByUser(userId);
    } catch (error) {
      logger.error('Error getting active user LLM providers', { userId, error });
      throw error;
    }
  }

  /**
   * Get providers by type for a user
   */
  async getUserProvidersByType(userId: string, type: UserLLMProviderType): Promise<UserLLMProvider[]> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      return await repository.findProvidersByUserAndType(userId, type);
    } catch (error) {
      logger.error('Error getting user LLM providers by type', { userId, type, error });
      throw error;
    }
  }

  /**
   * Update a user's provider configuration
   */
  async updateUserProviderConfig(userId: string, providerId: string, config: {
    name?: string;
    description?: string;
    baseUrl?: string;
    defaultModel?: string;
    priority?: number;
    configuration?: any;
  }): Promise<void> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      await repository.updateProviderConfig(providerId, userId, config);
      
      // Clear cache for this user
      this.clearUserCache(userId);

      logger.info('Updated user LLM provider configuration', { userId, providerId, config });
    } catch (error) {
      logger.error('Error updating user LLM provider configuration', { userId, providerId, config, error });
      throw error;
    }
  }

  /**
   * Update a user's provider API key
   */
  async updateUserProviderApiKey(userId: string, providerId: string, apiKey: string): Promise<void> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      await repository.updateApiKey(providerId, apiKey, userId);
      
      // Clear cache for this user
      this.clearUserCache(userId);

      logger.info('Updated user LLM provider API key', { userId, providerId });
    } catch (error) {
      logger.error('Error updating user LLM provider API key', { userId, providerId, error });
      throw error;
    }
  }

  /**
   * Delete a user's provider
   */
  async deleteUserProvider(userId: string, providerId: string): Promise<void> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      await repository.deleteUserProvider(providerId, userId);
      
      // Clear cache for this user
      this.clearUserCache(userId);

      logger.info('Deleted user LLM provider', { userId, providerId });
    } catch (error) {
      logger.error('Error deleting user LLM provider', { userId, providerId, error });
      throw error;
    }
  }

  /**
   * Test a user's provider connectivity
   */
  async testUserProvider(userId: string): Promise<{
    isHealthy: boolean;
    error?: string;
    modelCount: number;
    responseTime: number;
  }> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      const userProviders = await repository.findAllProvidersByUser(userId);
      if (!userProviders || userProviders.length === 0) {
        throw new Error('Provider not found or access denied');
      }

      const startTime = Date.now();
      const provider = await this.createProviderInstance(userProviders[0]);
      
      try {
        const models = await provider.getAvailableModels();
        const responseTime = Date.now() - startTime;
        userProviders.forEach(async (provider) => {
          // Update health check result
          await repository.updateHealthCheck(provider.id, {
          status: 'healthy',
            latency: responseTime
          });
        });
        return {
          isHealthy: true,
          modelCount: models.length,
          responseTime
        };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Update health check result
        await repository.updateHealthCheck(userProviders[0].id, {
          status: 'unhealthy',
          error: errorMessage,
          latency: responseTime
        });

        return {
          isHealthy: false,
          error: errorMessage,
          modelCount: 0,
          responseTime
        };
      }
    } catch (error) {
      logger.error('Error testing user LLM provider', { userId, error });
      throw error;
    }
  }

  // LLM Generation Methods

  /**
   * Generate LLM response using user's providers
   */
  async generateResponse(userId: string, request: LLMRequest, preferredType?: UserLLMProviderType): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      const provider = await this.getBestUserProvider(userId, preferredType);
      if (!provider) {
        return {
          content: 'I apologize, but you have no active LLM providers configured. Please add an API key for at least one provider in your settings.',
          model: 'unavailable',
          error: 'No active providers available for user',
          finishReason: 'error'
        };
      }

      logger.info('Generating LLM response for user', {
        userId,
        provider: provider.type,
        promptLength: request.prompt.length,
        model: request.model
      });

      const providerInstance = await this.getOrCreateProviderInstance(provider);
      const response = await providerInstance.generateResponse(request);

      const duration = Date.now() - startTime;
      
      // Update usage statistics
      if (response.tokensUsed) {
        const repository = await this.getUserLLMProviderRepository();
        await repository.updateUsageStats(
          provider.id, 
          response.tokensUsed, 
          !!response.error
        );
      }

      logger.info('LLM response generated successfully for user', {
        userId,
        providerId: provider.id,
        tokensUsed: response.tokensUsed,
        duration,
        isError: !!response.error
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Error generating LLM response for user', { 
        userId, 
        error: error instanceof Error ? error.message : error,
        duration 
      });

      return {
        content: 'I apologize, but I encountered an error while generating your response. Please try again or check your provider configuration.',
        model: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        finishReason: 'error'
      };
    }
  }

  /**
   * Generate agent response using user's providers
   */
  async generateAgentResponse(userId: string, request: AgentResponseRequest): Promise<AgentResponseResponse> {
    try {
      // Convert to LLM request
      const llmRequest: LLMRequest = {
        prompt: this.buildAgentPrompt(request),
        systemPrompt: this.buildAgentSystemPrompt(request),
        maxTokens: 200, // Keep responses concise
        temperature: 0.7,
        model: request.agent.configuration?.model || request.agent.modelId
      };

      const response = await this.generateResponse(userId, llmRequest);

      return {
        content: response.content,
        model: response.model,
        tokensUsed: response.tokensUsed,
        confidence: response.confidence,
        finishReason: response.finishReason,
        error: response.error
      };
    } catch (error) {
      logger.error('Error generating agent response for user', { userId, error });
      throw error;
    }
  }

  /**
   * Get available models for a user
   */
  async getAvailableModels(userId: string): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    source: string;
    apiEndpoint: string;
    apiType: UserLLMProviderType;
    provider: string;
    isAvailable: boolean;
  }>> {
    try {
      const userProviders = await this.getActiveUserProviders(userId);
      const allModels = [];
      logger.info('Getting models for user', { userId, userProviders });
      for (const userProvider of userProviders) {
        try {
          const providerInstance = await this.getOrCreateProviderInstance(userProvider);
          logger.info('Getting models from provider', { userId, providerId: userProvider.id, providerName: userProvider.name });
          const models = await providerInstance.getAvailableModels();
          logger.info('Models from provider', { userId, providerId: userProvider.id, providerName: userProvider.name, models });
          allModels.push(...models.map(model => ({
            ...model,
            provider: userProvider.name,
            apiType: userProvider.type,
            isAvailable: true
          })));
        } catch (error) {
          logger.error(`Failed to get models from user provider ${userProvider.id}`, { 
            userId,
            providerId: userProvider.id,
            error 
          });
        }
      }

      return allModels;
    } catch (error) {
      logger.error('Error getting available models for user', { userId, error });
      throw error;
    }
  }

  // Private Helper Methods

  private async getBestUserProvider(userId: string, preferredType?: UserLLMProviderType): Promise<UserLLMProvider | null> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      return await repository.findBestProviderForUser(userId, preferredType);
    } catch (error) {
      logger.error('Error getting best user provider', { userId, preferredType, error });
      return null;
    }
  }

  private async getOrCreateProviderInstance(userProvider: UserLLMProvider): Promise<BaseProvider> {
    const cacheKey = `${userProvider.userId}-${userProvider.type}`;
    
    if (this.providerCache.has(cacheKey)) {
      return this.providerCache.get(cacheKey)!;
    }

    const provider = await this.createProviderInstance(userProvider);
    this.providerCache.set(cacheKey, provider);
    return provider;
  }

  private async createProviderInstance(userProvider: UserLLMProvider): Promise<BaseProvider> {
    const config = userProvider.getProviderConfig();
    
    switch (userProvider.type) {
      case 'ollama':
        return new OllamaProvider(config as any, userProvider.name);
      case 'llmstudio':
        return new LLMStudioProvider(config as any, userProvider.name);
      case 'openai':
        return new OpenAIProvider(config as any, userProvider.name);
      default:
        throw new Error(`Unsupported provider type: ${userProvider.type}`);
    }
  }

  private clearUserCache(userId: string): void {
    // Remove all cached providers for this user
    for (const [key] of this.providerCache) {
      if (key.startsWith(`${userId}-`)) {
        this.providerCache.delete(key);
      }
    }
  }

  private buildAgentPrompt(request: AgentResponseRequest): string {
    const { agent, messages, context } = request;

    let prompt = '';

    // Add context if available
    if (context) {
      prompt += `Context Document:\nTitle: ${context.title}\nContent: ${context.content}\n\n`;
    }

    // Add conversation history
    if (messages.length > 0) {
      prompt += 'Conversation History:\n';
      messages.forEach(msg => {
        prompt += `${msg.sender}: ${msg.content}\n`;
      });
      prompt += '\n';
    }

    prompt += `${agent.name}:`;
    return prompt;
  }

  private buildAgentSystemPrompt(request: AgentResponseRequest): string {
    const { agent } = request;
    
    let systemPrompt = `You are ${agent.name}`;
    
    if (agent.persona?.description) {
      systemPrompt += `, ${agent.persona.description}`;
    }
    
    systemPrompt += '.\n\nCRITICAL RESPONSE RULES:\n';
    systemPrompt += '- Keep responses under 200 words maximum\n';
    systemPrompt += '- Be direct and concise - no fluff or filler\n';
    systemPrompt += '- Only answer what was asked - don\'t elaborate unnecessarily\n';
    systemPrompt += '- Use bullet points or short sentences\n';
    systemPrompt += '- If the topic is complex, give a brief answer and offer to elaborate if needed\n\n';
    
    if (agent.persona?.capabilities && agent.persona.capabilities.length > 0) {
      systemPrompt += `Your capabilities include: ${agent.persona.capabilities.join(', ')}\n`;
    }
    
    if (request.tools && request.tools.length > 0) {
      systemPrompt += '\nAvailable tools:\n';
      request.tools.forEach(tool => {
        systemPrompt += `- ${tool.name}: ${tool.description}\n`;
      });
    }

    return systemPrompt;
  }
} 