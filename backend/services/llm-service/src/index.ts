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

      // Import and use LLMService
      const { llmService } = await import('@uaip/llm-service');
      
      // Convert messages to the format expected by LLMService
      const prompt = this.buildPromptFromMessages(messages);
      
      // Generate response using LLMService
      const response = await llmService.generateResponse({
        prompt,
        systemPrompt,
        maxTokens: maxTokens || 500,
        temperature: temperature || 0.7,
        model: model || 'llama2'
      }, provider);

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

  private async handleProviderChanged(event: any): Promise<void> {
    try {
      const { eventType, providerId, providerType } = event.data || event;
      
      logger.info('Provider change event received', { 
        eventType, 
        providerId, 
        providerType 
      });

      // Import and refresh LLM service providers
      const { llmService } = await import('@uaip/llm-service');
      await llmService.refreshProviders();
      
      logger.info('LLM service providers refreshed due to provider change', { 
        eventType, 
        providerId, 
        providerType 
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
