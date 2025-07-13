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
import { UserLLMProviderRepository, UserLLMProvider, UserLLMProviderType, DatabaseService, UnifiedModelSelectionFacade, UnifiedModelSelection } from '@uaip/shared-services';
import { LLMTaskType } from '@uaip/types';
import { logger } from '@uaip/utils';

export class UserLLMService {
  private userLLMProviderRepository: UserLLMProviderRepository | null = null;
  private providerCache: Map<string, BaseProvider> = new Map(); // Cache providers by user+type
  private modelSelectionFacade: UnifiedModelSelectionFacade | null = null;

  constructor(modelSelectionFacade?: UnifiedModelSelectionFacade) {
    this.modelSelectionFacade = modelSelectionFacade || null;
    logger.info('UserLLMService constructor called', {
      facadeProvided: !!modelSelectionFacade,
      facadeType: typeof modelSelectionFacade,
      facadeConstructor: modelSelectionFacade?.constructor?.name,
      facadeStored: !!this.modelSelectionFacade
    });
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
   * Get a specific user provider by ID
   */
  async getUserProviderById(providerId: string): Promise<UserLLMProvider | null> {
    try {
      const repository = await this.getUserLLMProviderRepository();
      return await repository.findById(providerId);
    } catch (error) {
      logger.error('Error getting user LLM provider by ID', { providerId, error });
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
  async generateResponse(userId: string, request: LLMRequest, provider?: UserLLMProvider): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      // Get provider if not provided
      if (!provider) {
        const providers = await this.getUserProviders(userId);
        if (providers.length === 0) {
          throw new Error('No LLM providers configured for user');
        }
        provider = providers[0]; // Use first available provider
      }

      // Ensure we have a fresh entity instance if the provider might be a plain object
      if (provider.id && typeof provider.getProviderConfig !== 'function') {
        const repository = await this.getUserLLMProviderRepository();
        const freshProvider = await repository.findById(provider.id);
        if (freshProvider) {
          provider = freshProvider;
        }
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
      // Log the incoming request structure
      logger.info('UserLLMService.generateAgentResponse - Incoming request', {
        userId,
        hasAgent: !!request.agent,
        agentKeys: request.agent ? Object.keys(request.agent) : [],
        agentName: request.agent?.name,
        agentRole: request.agent?.role,
        hasPersona: !!request.agent?.persona,
        personaKeys: request.agent?.persona ? Object.keys(request.agent.persona) : [],
        personaDescription: request.agent?.persona?.description,
        personaCapabilities: request.agent?.persona?.capabilities,
        messagesCount: request.messages?.length || 0,
        hasContext: !!request.context,
        hasTools: !!(request.tools && request.tools.length > 0),
        toolsCount: request.tools?.length || 0
      });

      // Build prompts
      const agentPrompt = this.buildAgentPrompt(request);
      const systemPrompt = this.buildAgentSystemPrompt(request);

      // Log the built prompts
      logger.info('UserLLMService.generateAgentResponse - Built prompts', {
        userId,
        agentName: request.agent?.name,
        systemPromptLength: systemPrompt.length,
        systemPrompt: systemPrompt.substring(0, 500) + (systemPrompt.length > 500 ? '...' : ''),
        agentPromptLength: agentPrompt.length,
        agentPrompt: agentPrompt.substring(0, 300) + (agentPrompt.length > 300 ? '...' : ''),
        hasContext: !!request.context,
        contextContent: request.context?.content?.substring(0, 200) || 'none'
      });

      // Extract original prompt and systemPrompt if context contains them
      let finalPrompt = agentPrompt;
      let finalSystemPrompt = systemPrompt;
      
      // If context contains embedded prompts (for compatibility with current architecture)
      if (request.context && request.context.content) {
        const contextContent = request.context.content;
        const promptMatch = contextContent.match(/Prompt: (.*?)(?:\n|$)/);
        const systemMatch = contextContent.match(/System Instructions: (.*?)(?:\n|$)/);
        
        if (promptMatch && promptMatch[1]) {
          finalPrompt = promptMatch[1];
        }
        if (systemMatch && systemMatch[1]) {
          finalSystemPrompt = systemMatch[1];
        }
      }

      // Convert to LLM request
      const llmRequest: LLMRequest = {
        prompt: finalPrompt,
        systemPrompt: finalSystemPrompt,
        maxTokens: 200, // Keep responses concise
        temperature: 0.7,
        model: request.agent.configuration?.model || request.agent.modelId
      };

      // Log final prompts being used
      logger.info('UserLLMService.generateAgentResponse - Final prompts for LLM', {
        userId,
        agentName: request.agent?.name,
        finalPromptLength: finalPrompt.length,
        finalPrompt: finalPrompt.substring(0, 200) + (finalPrompt.length > 200 ? '...' : ''),
        finalSystemPromptLength: finalSystemPrompt.length,
        finalSystemPrompt: finalSystemPrompt.substring(0, 200) + (finalSystemPrompt.length > 200 ? '...' : ''),
        model: llmRequest.model,
        maxTokens: llmRequest.maxTokens,
        temperature: llmRequest.temperature
      });

      // Use model selection facade if available
      let response: LLMResponse;
      
      logger.info('Checking model selection facade availability', {
        hasFacade: !!this.modelSelectionFacade,
        hasAgentId: !!request.agent?.id,
        agentId: request.agent?.id,
        agentName: request.agent?.name
      });
      
      if (this.modelSelectionFacade && request.agent?.id) {
        logger.info('Using model selection facade for agent response', {
          agentId: request.agent.id,
          agentName: request.agent.name,
          model: llmRequest.model
        });
        
        // Use facade to select model and provider
        const modelSelection = await this.modelSelectionFacade.selectForAgent(
          request.agent.id,
          LLMTaskType.REASONING,
          {
            model: llmRequest.model,
            urgency: 'medium'
          }
        );

        logger.info('Model selection facade result', {
          selectedModel: modelSelection.model.model,
          selectedProvider: modelSelection.provider.effectiveProvider,
          providerId: modelSelection.provider.providerId,
          confidence: modelSelection.model.confidence
        });

        // Trust the facade result - it handles fallbacks internally
        const repository = await this.getUserLLMProviderRepository();
        const selectedProvider = await repository.findById(modelSelection.provider.providerId);
        
        if (selectedProvider) {
          logger.info('Using selected provider from facade', { providerId: selectedProvider.id, providerName: selectedProvider.name });
          response = await this.generateResponse(userId, llmRequest, selectedProvider);
        } else {
          logger.error('Selected provider not found', { providerId: modelSelection.provider.providerId });
          throw new Error(`Selected provider not found: ${modelSelection.provider.providerId}`);
        }
      } else {
        logger.info('Using traditional user provider lookup', {
          reason: !this.modelSelectionFacade ? 'no facade' : 'no agent id'
        });
        response = await this.generateResponse(userId, llmRequest);
      }

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

  /**
   * Get provider configuration safely - handles both entity instances and plain objects
   */
  private getProviderConfig(userProvider: UserLLMProvider): {
    type: UserLLMProviderType;
    baseUrl?: string;
    apiKey?: string;
    defaultModel?: string;
    timeout?: number;
    retries?: number;
  } {
    // Check if this is a proper entity instance with the method
    if (typeof userProvider.getProviderConfig === 'function') {
      return userProvider.getProviderConfig();
    }
    
    // Handle plain object case - reconstruct the config manually
    const getDefaultBaseUrl = (type: UserLLMProviderType): string => {
      switch (type) {
        case 'openai':
          return 'https://api.openai.com';
        case 'anthropic':
          return 'https://api.anthropic.com';
        case 'google':
          return 'https://generativelanguage.googleapis.com';
        case 'ollama':
          return 'http://localhost:11434';
        case 'llmstudio':
          return 'http://192.168.1.16:1234';
        default:
          return userProvider.baseUrl || '';
      }
    };

    const getApiKey = (): string | undefined => {
      if (!userProvider.apiKeyEncrypted) {
        return undefined;
      }
      // For plain objects, we can't decrypt, so return undefined
      // The provider will need to handle this case
      return undefined;
    };

    return {
      type: userProvider.type,
      baseUrl: userProvider.baseUrl || getDefaultBaseUrl(userProvider.type),
      apiKey: getApiKey(),
      defaultModel: userProvider.defaultModel,
      timeout: userProvider.configuration?.timeout,
      retries: userProvider.configuration?.retries,
    };
  }

  private async createProviderInstance(userProvider: UserLLMProvider): Promise<BaseProvider> {
    // Get config safely - handle both entity instances and plain objects
    const config = this.getProviderConfig(userProvider);
    
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

    // Add conversation history (with null check)
    if (messages && messages.length > 0) {
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