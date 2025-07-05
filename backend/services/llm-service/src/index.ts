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
