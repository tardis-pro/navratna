import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';
import { DatabaseService, EventBusService } from '@uaip/shared-services';
import llmRoutes from './routes/llmRoutes';
import userLLMRoutes from './routes/userLLMRoutes';
import healthRoutes from './routes/healthRoutes';

const app = express();
const PORT = process.env.PORT || 3007;

// Middleware
app.use(helmet());
// CORS is handled by nginx API gateway - disable service-level CORS
// app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  next();
});

// Routes
app.use('/health', healthRoutes);
app.use('/api/v1/llm', llmRoutes);
app.use('/api/v1/user/llm', userLLMRoutes);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler - using a different approach instead of wildcard
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Event handlers for LLM requests
async function handleUserLLMRequest(event: any, eventBusService: any) {
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
    await eventBusService.publish(responseChannel, response);
    
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
      await eventBusService.publish(`llm.response.${event?.data?.requestId || event?.requestId}`, {
        error: error.message,
        success: false
      });
    } catch (publishError) {
      logger.error('Failed to publish error response', { publishError });
    }
  }
}

async function handleGlobalLLMRequest(event: any, eventBusService: any) {
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
    await eventBusService.publish(`llm.response.${requestId}`, response);
    
    logger.info('Global LLM request processed', { requestId });
  } catch (error) {
    logger.error('Failed to process global LLM request', { 
      error: error.message, 
      stack: error.stack,
      requestId: event?.data?.requestId || event?.requestId 
    });
    
    // Publish error response
    try {
      await eventBusService.publish(`llm.response.${event?.data?.requestId || event?.requestId}`, {
        error: error.message,
        success: false
      });
    } catch (publishError) {
      logger.error('Failed to publish error response', { publishError });
    }
  }
}

// Start server
async function startServer() {
  try {
    // Initialize database service before starting server
    logger.info('Initializing database service...');
    const databaseService = DatabaseService.getInstance();
    await databaseService.initialize();
    logger.info('Database service initialized successfully');

    // Initialize event bus service
    logger.info('Initializing event bus service...');
    const eventBusService = new EventBusService({
      url: process.env.RABBITMQ_URL || 'amqp://localhost',
      serviceName: 'llm-service',
      exchangePrefix: 'uaip.enterprise',
      complianceMode: true
    }, logger);
    await eventBusService.connect();
    
    // Subscribe to LLM request events
    await eventBusService.subscribe('llm.user.request', (event: any) => handleUserLLMRequest(event, eventBusService));
    await eventBusService.subscribe('llm.global.request', (event: any) => handleGlobalLLMRequest(event, eventBusService));
    logger.info('Event bus subscriptions configured');

    app.listen(PORT, () => {
      logger.info(`LLM Service API running on port ${PORT}`, {
        service: 'llm-service-api',
        port: PORT,
        environment: process.env.NODE_ENV || 'development'
      });
    });
  } catch (error) {
    logger.error('Failed to start LLM Service API', { error });
    process.exit(1);
  }
}

startServer(); 