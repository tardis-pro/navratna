import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import llmRoutes from './routes/llmRoutes.js';
import userLLMRoutes from './routes/userLLMRoutes.js';

class LLMServiceServer extends BaseService {
  constructor() {
    super({
      name: 'llm-service',
      port: parseInt(process.env.PORT || '3007', 10),
      enableEnterpriseEventBus: true
    });
  }

  protected async initialize(): Promise<void> {
    logger.info('LLM Service initialized');
  }

  protected setupCustomMiddleware(): void {
    // Request logging
    this.app.use((req, res, next) => {
      logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
      next();
    });
  }

  protected async setupRoutes(): Promise<void> {
    // API routes
    this.app.use('/api/v1/llm', llmRoutes);
    this.app.use('/api/v1/user/llm', userLLMRoutes);
  }

  protected async setupEventSubscriptions(): Promise<void> {
    // Subscribe to LLM request events
    await this.eventBusService.subscribe('llm.user.request', (event: any) => this.handleUserLLMRequest(event));
    await this.eventBusService.subscribe('llm.global.request', (event: any) => this.handleGlobalLLMRequest(event));
    await this.eventBusService.subscribe('llm.agent.generate.request', (event: any) => this.handleAgentGenerateRequest(event));
    await this.eventBusService.subscribe('llm.provider.changed', (event: any) => this.handleProviderChanged(event));
    logger.info('Event bus subscriptions configured');
  }

  private async handleUserLLMRequest(event: any): Promise<void> {
    try {
      logger.info('Raw event received', { event });
      const { requestId, agentRequest, userId } = event.data || event;
      logger.info('Processing user LLM request', { requestId, userId, hasAgentRequest: !!agentRequest });

      // Import and use UserLLMService from shared package
      const { UserLLMService } = await import('@uaip/llm-service');
      const userLLMService = new UserLLMService();

      // Add error handling and better logging
      logger.info('Calling UserLLMService.generateAgentResponse', {
        userId,
        hasAgentRequest: !!agentRequest,
        agentRequestKeys: agentRequest ? Object.keys(agentRequest) : [],
        hasAgent: agentRequest?.agent ? true : false,
        hasMessages: agentRequest?.messages ? true : false,
        hasContext: agentRequest?.context ? true : false
      });
      const response = await userLLMService.generateAgentResponse(userId, agentRequest);
      logger.info('UserLLMService response received', {
        hasResponse: !!response,
        responseContent: response?.content?.substring(0, 100),
        responseModel: response?.model,
        responseError: response?.error
      });

      // Publish response
      const responseChannel = `llm.response.${requestId}`;
      logger.info('Publishing LLM response', { responseChannel, hasResponse: !!response });
      await this.eventBusService.publish(responseChannel, response);

      logger.info('User LLM request processed', { requestId, userId });
    } catch (error) {
      logger.error('Failed to process user LLM request', {
        error: error.message,
        stack: error.stack,
        requestId: event?.data?.requestId || event?.requestId,
        userId: event?.data?.userId || event?.userId
      });

      // Publish error response
      try {
        await this.eventBusService.publish(`llm.response.${event?.data?.requestId || event?.requestId}`, {
          error: error.message,
          success: false
        });
      } catch (publishError) {
        logger.error('Failed to publish error response', { publishError });
      }
    }
  }

  private async handleGlobalLLMRequest(event: any): Promise<void> {
    try {
      const { requestId, agentRequest } = event.data || event;
      logger.info('Processing global LLM request', { requestId });

      // Import and use LLMService
      const { llmService } = await import('@uaip/llm-service');
      // llmService is already a singleton instance
      logger.info('Calling llmService.generateAgentResponse', { hasAgentRequest: !!agentRequest });
      const response = await llmService.generateAgentResponse(agentRequest);
      logger.info('LLMService response received', { hasResponse: !!response });

      // Publish response
      await this.eventBusService.publish(`llm.response.${requestId}`, response);

      logger.info('Global LLM request processed', { requestId });
    } catch (error) {
      logger.error('Failed to process global LLM request', {
        error: error.message,
        stack: error.stack,
        requestId: event?.data?.requestId || event?.requestId
      });

      // Publish error response
      try {
        await this.eventBusService.publish(`llm.response.${event?.data?.requestId || event?.requestId}`, {
          error: error.message,
          success: false
        });
      } catch (publishError) {
        logger.error('Failed to publish error response', { publishError });
      }
    }
  }

  private async handleAgentGenerateRequest(event: any): Promise<void> {
    try {
      const { requestId, agentId, messages, systemPrompt, maxTokens, temperature, model, provider } = event.data || event;

      logger.info('Processing agent generate request', {
        requestId,
        agentId,
        messageCount: messages?.length,
        model,
        provider
      });

      // Get agent configuration from database
      const { AgentService } = await import('@uaip/shared-services');
      const agentService = AgentService.getInstance();
      const agent = await agentService.findAgentById(agentId);

      if (!agent) {
        logger.error('Agent not found', { agentId });
        throw new Error(`Agent ${agentId} not found`);
      }

      logger.info('Agent found', {
        agentId: agent.id,
        agentModelId: agent.modelId,
        agentApiType: agent.apiType,
        userLLMProviderId: agent.userLLMProviderId,
        createdBy: agent.createdBy
      });

      // Use agent's model if available, otherwise use requested model
      const effectiveModel = agent.modelId || model || 'llama2';
      let effectiveProvider = provider;

      // If provider is explicitly provided in the request, use it first
      if (provider) {
        logger.info('Using explicitly provided provider', {
          agentId,
          providedProvider: provider,
          effectiveModel
        });
        effectiveProvider = provider;
      }
      // If agent has specific provider configured, use that
      else if (agent.userLLMProviderId) {
        logger.info('Agent has specific provider configured', {
          agentId,
          userLLMProviderId: agent.userLLMProviderId
        });

        try {
          const { UserLLMService } = await import('@uaip/llm-service');
          const userLLMService = new UserLLMService();
          const agentProvider = await userLLMService.getUserProviderById(agent.userLLMProviderId);

          if (agentProvider && agentProvider.isActive) {
            effectiveProvider = agentProvider.type;
            logger.info('Using agent-specific provider', {
              agentId,
              providerId: agentProvider.id,
              providerType: agentProvider.type,
              effectiveModel
            });
          }
        } catch (error) {
          logger.error('Failed to get agent provider, using fallback', {
            agentId,
            error: error.message
          });
        }
      }

      // If no specific provider found yet, try to find user provider that supports the model
      if (!effectiveProvider && agent.createdBy) {
        logger.info('Looking for user provider that supports model', {
          userId: agent.createdBy,
          effectiveModel
        });

        try {
          const { UserLLMService } = await import('@uaip/llm-service');
          const userLLMService = new UserLLMService();
          const userProviders = await userLLMService.getActiveUserProviders(agent.createdBy);

          // Parse model ID to extract provider UUID if it's in format: {uuid}-{model-name}
          const uuidRegex = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
          const uuidMatch = effectiveModel.match(uuidRegex);

          if (uuidMatch) {
            const providerId = uuidMatch[1];
            const matchingProvider = userProviders.find(p => p.id === providerId);
            if (matchingProvider && matchingProvider.isActive) {
              effectiveProvider = matchingProvider.type;
              logger.info('Using provider from model ID', {
                agentId,
                effectiveModel,
                providerId: matchingProvider.id,
                providerType: matchingProvider.type,
                extractedUuid: providerId
              });
            }
          }

          // Fallback to simple model-to-provider mapping if UUID extraction didn't work
          if (!effectiveProvider) {
            if (effectiveModel.includes('gpt') || effectiveModel.includes('openai')) {
              const openaiProvider = userProviders.find(p => p.type === 'openai');
              if (openaiProvider) {
                effectiveProvider = 'openai';
                logger.info('Using user OpenAI provider for GPT model', {
                  agentId,
                  effectiveModel,
                  providerId: openaiProvider.id
                });
              }
            } else if (effectiveModel.includes('claude') || effectiveModel.includes('anthropic')) {
              const anthropicProvider = userProviders.find(p => p.type === 'anthropic');
              if (anthropicProvider) {
                effectiveProvider = 'anthropic';
                logger.info('Using user Anthropic provider for Claude model', {
                  agentId,
                  effectiveModel,
                  providerId: anthropicProvider.id
                });
              }
            }
          }
        } catch (error) {
          logger.error('Failed to get user providers, using fallback', {
            agentId,
            userId: agent.createdBy,
            error: error.message
          });
        }
      }

      logger.info('Final provider and model selection', {
        requestId,
        agentId,
        effectiveProvider,
        effectiveModel,
        fallbackToGlobal: !effectiveProvider
      });

      // Convert messages to the format expected by LLMService
      const prompt = this.buildPromptFromMessages(messages);

      let response;

      // Use UserLLMService if we have user context (agent.createdBy) to leverage user's configured providers
      if (agent.createdBy) {
        logger.info('Using UserLLMService for agent with user context', {
          agentId,
          userId: agent.createdBy,
          effectiveProvider
        });

        try {
          const { UserLLMService } = await import('@uaip/llm-service');
          const userLLMService = new UserLLMService();

          response = await userLLMService.generateResponse(agent.createdBy, {
            prompt,
            systemPrompt,
            maxTokens: maxTokens || agent.maxTokens || 500,
            temperature: temperature || agent.temperature || 0.7,
            model: effectiveModel
          });

          logger.info('UserLLMService generation completed', {
            agentId,
            userId: agent.createdBy,
            hasContent: !!response.content
          });
        } catch (userServiceError) {
          logger.error('UserLLMService failed, falling back to global service', {
            agentId,
            userId: agent.createdBy,
            error: userServiceError.message
          });

          // Fallback to global service if UserLLMService fails
          const { llmService } = await import('@uaip/llm-service');
          response = await llmService.generateResponse({
            prompt,
            systemPrompt,
            maxTokens: maxTokens || agent.maxTokens || 500,
            temperature: temperature || agent.temperature || 0.7,
            model: effectiveModel
          }, effectiveProvider);
        }
      } else {
        // Use global LLMService for agents without user context
        logger.info('Using global LLMService for agent without user context', { agentId });

        const { llmService } = await import('@uaip/llm-service');
        response = await llmService.generateResponse({
          prompt,
          systemPrompt,
          maxTokens: maxTokens || agent.maxTokens || 500,
          temperature: temperature || agent.temperature || 0.7,
          model: effectiveModel
        }, effectiveProvider);
      }

      logger.info('LLM generation completed', {
        requestId,
        hasContent: !!response.content,
        model: response.model,
        hasError: !!response.error,
        finishReason: response.finishReason
      });

      // Publish response on the expected event channel
      await this.eventBusService.publish('llm.agent.generate.response', {
        requestId,
        agentId,
        content: response.content,
        error: response.error,
        confidence: this.calculateConfidence(response),
        model: response.model || model || 'unknown',
        finishReason: response.finishReason,
        tokensUsed: response.tokensUsed,
        timestamp: new Date().toISOString()
      });

      logger.info('Agent generate response published', { requestId, agentId });

    } catch (error) {
      logger.error('Failed to process agent generate request', {
        error: error.message,
        stack: error.stack,
        requestId: event?.data?.requestId || event?.requestId,
        agentId: event?.data?.agentId || event?.agentId
      });

      // Publish error response
      try {
        await this.eventBusService.publish('llm.agent.generate.response', {
          requestId: event?.data?.requestId || event?.requestId,
          agentId: event?.data?.agentId || event?.agentId,
          content: null,
          error: error.message,
          confidence: 0,
          model: event?.data?.model || event?.model || 'unknown',
          finishReason: 'error',
          timestamp: new Date().toISOString()
        });
      } catch (publishError) {
        logger.error('Failed to publish agent generate error response', { publishError });
      }
    }
  }

  private buildPromptFromMessages(messages: any[]): string {
    if (!messages || messages.length === 0) {
      return '';
    }

    // Build conversation format prompt
    let prompt = '';
    messages.forEach((message, index) => {
      const sender = message.sender === 'user' ? 'User' : 'Assistant';
      prompt += `${sender}: ${message.content}\n`;
    });

    // Add the assistant prompt at the end
    prompt += 'Assistant:';

    return prompt;
  }

  private calculateConfidence(response: any): number {
    // Calculate confidence based on response quality
    if (response.error) {
      return 0;
    }

    if (!response.content || response.content.trim().length === 0) {
      return 0.1;
    }

    // Base confidence
    let confidence = 0.8;

    // Adjust based on finish reason
    switch (response.finishReason) {
      case 'stop':
        confidence = 0.9;
        break;
      case 'length':
        confidence = 0.7;
        break;
      case 'error':
        confidence = 0.1;
        break;
      default:
        confidence = 0.8;
    }

    // Adjust based on content length (very short responses might be less reliable)
    const contentLength = response.content.trim().length;
    if (contentLength < 10) {
      confidence *= 0.5;
    } else if (contentLength < 50) {
      confidence *= 0.8;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Determine the best provider and model using fallback logic:
   * 1. Agent's specific provider and model
   * 2. User's provider that supports the requested model
   * 3. Global provider that supports the requested model
   */
  private async determineProviderAndModel(agent: any, requestedModel?: string, requestedProvider?: string): Promise<{
    effectiveProvider?: string;
    effectiveModel: string;
  }> {
    try {
      const { UserLLMService } = await import('@uaip/llm-service');
      const userLLMService = new UserLLMService();

      // 1. Check if agent has specific provider configured
      if (agent.userLLMProviderId) {
        logger.info('Agent has specific provider configured', {
          agentId: agent.id,
          userLLMProviderId: agent.userLLMProviderId,
          agentModelId: agent.modelId
        });

        try {
          const agentProvider = await userLLMService.getUserProviderById(agent.userLLMProviderId);
          if (agentProvider && agentProvider.isActive) {
            const effectiveModel = requestedModel || agent.modelId || agentProvider.defaultModel || 'llama2';
            logger.info('Using agent-specific provider', {
              providerId: agentProvider.id,
              providerType: agentProvider.type,
              effectiveModel
            });
            return {
              effectiveProvider: agentProvider.type,
              effectiveModel
            };
          }
        } catch (error) {
          logger.warn('Failed to get agent-specific provider, falling back', {
            agentId: agent.id,
            userLLMProviderId: agent.userLLMProviderId,
            error: error.message
          });
        }
      }

      // 2. Check user's providers that support the requested model
      if (agent.createdBy) {
        logger.info('Checking user providers', {
          userId: agent.createdBy,
          requestedModel,
          agentModelId: agent.modelId
        });

        const userProviders = await userLLMService.getActiveUserProviders(agent.createdBy);
        const effectiveModel = requestedModel || agent.modelId || 'llama2';

        // Try to find a provider that supports the model
        for (const provider of userProviders) {
          if (this.providerSupportsModel(provider.type, effectiveModel)) {
            logger.info('Using user provider that supports model', {
              providerId: provider.id,
              providerType: provider.type,
              effectiveModel
            });
            return {
              effectiveProvider: provider.type,
              effectiveModel
            };
          }
        }
      }

      // 3. Fall back to global provider
      logger.info('Falling back to global provider', {
        requestedProvider,
        requestedModel,
        agentModelId: agent.modelId
      });

      const effectiveModel = requestedModel || agent.modelId || 'llama2';
      const effectiveProvider = requestedProvider || this.getProviderTypeFromModel(effectiveModel);

      return {
        effectiveProvider,
        effectiveModel
      };

    } catch (error) {
      logger.error('Error determining provider and model', {
        agentId: agent.id,
        error: error.message
      });

      // Final fallback
      return {
        effectiveProvider: requestedProvider,
        effectiveModel: requestedModel || agent.modelId || 'llama2'
      };
    }
  }

  private providerSupportsModel(providerType: string, model: string): boolean {
    // Simple model-to-provider mapping
    if (model.includes('gpt') || model.includes('openai')) {
      return providerType === 'openai';
    }

    if (model.includes('llama') || model.includes('ollama')) {
      return providerType === 'ollama';
    }

    if (model.includes('claude') || model.includes('anthropic')) {
      return providerType === 'anthropic';
    }

    // Default: assume llmstudio can handle most models
    return providerType === 'llmstudio';
  }

  private getProviderTypeFromModel(model: string): string | undefined {
    if (model.includes('gpt') || model.includes('openai')) {
      return 'openai';
    }

    if (model.includes('llama') || model.includes('ollama')) {
      return 'ollama';
    }

    if (model.includes('claude') || model.includes('anthropic')) {
      return 'anthropic';
    }

    // Default fallback
    return 'ollama';
  }

  private async handleProviderChanged(event: any): Promise<void> {
    try {
      const { eventType, providerId, providerType, agentId } = event.data || event;

      logger.info('Provider change event received', {
        eventType,
        providerId,
        providerType,
        agentId
      });

      // Import and refresh LLM service providers
      const { llmService } = await import('@uaip/llm-service');
      await llmService.refreshProviders();

      // If this is an agent config change, clear any cached agent configurations
      if (eventType === 'agent-config-changed' && agentId) {
        logger.info('Clearing agent configuration cache', { agentId });
        // Clear any agent-specific caches if they exist
        // For now, the provider refresh should handle this, but we could add specific agent cache clearing here
      }

      logger.info('LLM service providers refreshed due to provider change', {
        eventType,
        providerId,
        providerType,
        agentId
      });

    } catch (error) {
      logger.error('Failed to handle provider change event', {
        error: error.message,
        event: event?.data || event
      });
    }
  }

  protected async checkServiceHealth(): Promise<boolean> {
    // Add service-specific health checks here
    return true;
  }
}

// Start the server
const server = new LLMServiceServer();
server.start().catch((error) => {
  logger.error('Failed to start LLM Service API', { error });
  process.exit(1);
});

export default server;
