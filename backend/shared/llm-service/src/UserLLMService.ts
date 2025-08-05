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
import { getContextManager, ContextManager } from './context-manager/ContextManager.js';
import { BaseProvider } from './providers/BaseProvider.js';
import { OllamaProvider } from './providers/OllamaProvider.js';
import { LLMStudioProvider } from './providers/LLMStudioProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { UserLLMProviderRepository, UserLLMProvider, UserLLMProviderType, DatabaseService, UnifiedModelSelectionFacade, UnifiedModelSelection, AgentTaskTypeResolver } from '@uaip/shared-services';
import { LLMTaskType } from '@uaip/types';
import { logger } from '@uaip/utils';

export class UserLLMService {
  private userLLMProviderRepository: UserLLMProviderRepository | null = null;
  private providerCache: Map<string, BaseProvider> = new Map(); // Cache providers by user+type
  private modelSelectionFacade: UnifiedModelSelectionFacade | null = null;
  private taskTypeResolver: AgentTaskTypeResolver | null = null;
  private contextManager: ContextManager;

  constructor(modelSelectionFacade?: UnifiedModelSelectionFacade) {
    this.modelSelectionFacade = modelSelectionFacade || null;
    this.contextManager = getContextManager();
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

  // Lazy initialization of task type resolver
  private async getTaskTypeResolver(): Promise<AgentTaskTypeResolver> {
    if (!this.taskTypeResolver) {
      const databaseService = DatabaseService.getInstance();
      await databaseService.initialize(); // Ensure database is initialized
      this.taskTypeResolver = new AgentTaskTypeResolver(databaseService);
    }
    return this.taskTypeResolver;
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
        hasMessages: !!request.messages,
        messagesCount: request.messages?.length || 0,
        hasContext: !!request.context,
        hasTools: !!request.tools,
        toolsCount: request.tools?.length || 0
      });

      // Build the LLM request from the agent context
      const prompt = this.buildAgentPrompt(request);
      const systemPrompt = this.buildAgentSystemPrompt(request);

      const llmRequest: LLMRequest = {
        prompt,
        systemPrompt,
        maxTokens: request.agent.maxTokens,
        temperature: request.agent.temperature,
        model: request.agent.modelId,
        userId,
        agentId: request.agent.id
      };

      logger.info('Built LLM request for agent', {
        userId,
        agentId: request.agent.id,
        agentName: request.agent.name,
        hasPrompt: !!prompt,
        hasSystemPrompt: !!systemPrompt,
        maxTokens: llmRequest.maxTokens,
        temperature: llmRequest.temperature,
        model: llmRequest.model
      });

      let response: LLMResponse;
      
      // Check if we have model selection facade and agent ID for intelligent selection
      if (this.modelSelectionFacade && request.agent.id) {
        logger.info('Using model selection facade for agent', {
          agentId: request.agent.id,
          agentName: request.agent.name
        });
        
        // Convert the types Agent to a partial database Agent for task type determination
        // Only include the properties that are actually available and needed
        const agentForTaskType = {
          id: request.agent.id,
          name: request.agent.name,
          description: request.agent.description,
          role: request.agent.role,
          capabilities: request.agent.capabilities || [],
          // Set reasonable defaults for missing properties
          learningHistory: [],
          securityLevel: 'medium' as const,
          complianceTags: [],
          auditTrail: [],
          performanceMetrics: {},
          configuration: request.agent.configuration || {},
          preferences: {},
          tags: [],
          metadata: request.agent.metadata || {},
          version: request.agent.version || 1,
          toolPermissions: {},
          toolPreferences: {},
          toolBudget: {},
          maxConcurrentTools: 3,
          modelId: request.agent.modelId,
          apiType: request.agent.apiType,
          userLLMProviderId: request.agent.userLLMProviderId,
          temperature: request.agent.temperature,
          maxTokens: request.agent.maxTokens,
          systemPrompt: request.agent.systemPrompt
        };

        // Determine appropriate task type for the agent
        const taskTypeResolver = await this.getTaskTypeResolver();
        const taskType = await taskTypeResolver.determineTaskType(agentForTaskType as any, {
          userIntent: request.messages?.[0]?.content,
          conversationHistory: request.messages
        });

        // Use facade to select model and provider
        const modelSelection = await this.modelSelectionFacade.selectForAgent(
          request.agent.id,
          taskType,
          {
            model: llmRequest.model,
            urgency: 'medium'
          }
        );

        logger.info('Model selection facade result', {
          selectedModel: modelSelection.model.model,
          selectedProvider: modelSelection.model.provider,
          confidence: modelSelection.model.confidence,
          taskType: taskType
        });

        // Use the selected model and provider type to find a matching user provider
        const repository = await this.getUserLLMProviderRepository();
        const selectedProvider = await repository.findByUserAndType(userId, modelSelection.model.provider);
        
        if (selectedProvider) {
          logger.info('Using selected provider from facade', { providerId: selectedProvider.id, providerName: selectedProvider.name });
          response = await this.generateResponse(userId, llmRequest, selectedProvider);
        } else {
          logger.error('Selected provider not found', { providerType: modelSelection.model.provider });
          throw new Error(`Selected provider not found: ${modelSelection.model.provider}`);
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
    const cacheKey = `${userProvider.userId}-${userProvider.id}`;
    
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
          return 'http://192.168.1.9:1234';
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
      case 'anthropic':
      case 'custom':
      case 'google':
        // OpenAI, Anthropic, Google, and custom providers all use OpenAI-compatible endpoints
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
    const { agent, messages = [], context, tools = [] } = request;
    
    // Create optimized rolling window context
    const contextDocs = context ? [context] : [];
    const systemPrompt = this.buildAgentSystemPrompt(request);
    const systemPromptTokens = this.contextManager.estimateTokens(systemPrompt);
    
    const window = this.contextManager.createRollingWindow(
      messages, 
      systemPromptTokens, 
      tools.length, 
      contextDocs
    );

    // Log context health
    const health = this.contextManager.analyzeContextHealth(window);
    if (health.status !== 'healthy') {
      logger.warn('UserLLM Context health issue', { 
        status: health.status, 
        warnings: health.warnings,
        recommendations: health.recommendations,
        agentId: agent.id 
      });
    }

    let prompt = '';

    // Add deduplicated context documents
    if (window.contextDocuments.length > 0) {
      window.contextDocuments.forEach(doc => {
        prompt += `Context Document:\nTitle: ${doc.title}\nContent: ${doc.content}\n\n`;
      });
    }

    // Add summarized older context if available
    if (window.summarizedContext) {
      prompt += `${window.summarizedContext}\n\n`;
    }

    // Add recent conversation history
    if (window.recentMessages.length > 0) {
      prompt += 'Recent Conversation:\n';
      window.recentMessages.forEach(msg => {
        prompt += `${msg.sender}: ${msg.content}\n`;
      });
      prompt += '\n';
    }

    prompt += `${agent.name}:`;
    
    logger.info('UserLLM Context window created', {
      agentId: agent.id,
      totalMessages: messages.length,
      recentMessages: window.recentMessages.length,
      hasSummary: !!window.summarizedContext,
      estimatedTokens: window.estimatedTokens,
      contextHealth: health.status
    });
    
    return prompt;
  }

  private buildAgentSystemPrompt(request: AgentResponseRequest): string {
    const { agent, tools = [] } = request;

    // Check cache for persona prompt
    const cachedPrompt = this.contextManager.getCachedPersonaPrompt(agent.id);
    if (cachedPrompt) {
      return cachedPrompt;
    }
    
    let systemPrompt = `You are ${agent.name}`;
    
    if (agent.persona?.description) {
      systemPrompt += `, ${agent.persona.description}`;
    }
    
    systemPrompt += '.\n\n';

    // Dynamic response limits based on available context
    const availableTokens = this.contextManager.calculateOptimalResponseLimit(
      this.contextManager.config.maxTokens - this.contextManager.estimateTokens(systemPrompt)
    );
    const responseWordLimit = Math.max(200, Math.floor(availableTokens / 4)); // Rough tokens to words

    systemPrompt += `RESPONSE GUIDELINES:\n`;
    systemPrompt += `- Keep responses under ${responseWordLimit} words unless the query explicitly requires more detail\n`;
    systemPrompt += '- Be direct and concise while maintaining helpfulness\n';
    systemPrompt += '- Use structured format (bullet points, numbered lists) for complex information\n';
    systemPrompt += '- Offer to elaborate on specific aspects if the topic is complex\n\n';
    
    if (agent.persona?.capabilities && agent.persona.capabilities.length > 0) {
      systemPrompt += `Your capabilities include: ${agent.persona.capabilities.join(', ')}\n`;
    }
    
    if (tools.length > 0) {
      systemPrompt += '\nAvailable tools:\n';
      tools.forEach(tool => {
        systemPrompt += `- ${tool.name}: ${tool.description}\n`;
      });
    }

    // Cache the persona prompt to avoid rebuilding
    this.contextManager.cachePersonaPrompt(agent.id, systemPrompt);
    
    return systemPrompt;
  }
} 