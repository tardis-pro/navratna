import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { logger } from '@uaip/utils';
import { errorHandler, rateLimiter, metricsMiddleware, metricsEndpoint } from '@uaip/middleware';
import { LLMService } from '@uaip/llm-service';
import {
  DatabaseService,
  EventBusService,
  PersonaService,
  DiscussionService,
  ServiceFactory,
  UserKnowledgeService,
  QdrantService,
  EmbeddingService,
  redisCacheService
} from '@uaip/shared-services';
import { createAgentRoutes } from './routes/agentRoutes.js';
import { createPersonaRoutes } from './routes/personaRoutes.js';
import { createDiscussionRoutes } from './routes/discussionRoutes.js';
import { healthRoutes } from './routes/healthRoutes.js';
import knowledgeRoutes from './routes/knowledgeRoutes.js';
import { AgentController } from './controllers/agentController.js';
import { PersonaController } from './controllers/personaController.js';
import { DiscussionController } from './controllers/discussionController.js';

// Import new microservices
import {
  AgentCoreService,
  AgentContextService,
  AgentPlanningService,
  AgentLearningService,
  AgentDiscussionService,
  AgentMetricsService,
  AgentIntentService,
  AgentInitializationService,
  AgentEventOrchestrator,
  ConversationIntelligenceService
} from './services/index.js';

class AgentIntelligenceService {
  private app: express.Application;
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private personaService: PersonaService;
  private discussionService: DiscussionService;
  private agentController: AgentController;
  private personaController: PersonaController;
  private discussionController: DiscussionController;

  // New microservices
  private agentCoreService: AgentCoreService;
  private agentContextService: AgentContextService;
  private agentPlanningService: AgentPlanningService;
  private agentLearningService: AgentLearningService;
  private agentDiscussionService: AgentDiscussionService;
  private agentMetricsService: AgentMetricsService;
  private agentIntentService: AgentIntentService;
  private agentInitializationService: AgentInitializationService;
  private agentEventOrchestrator: AgentEventOrchestrator;
  private conversationIntelligenceService: ConversationIntelligenceService;

  // ServiceFactory instance
  private serviceFactory: any;

  constructor() {
    this.app = express();
    this.databaseService = new DatabaseService();
    this.eventBusService = new EventBusService({
      url: process.env.RABBITMQ_URL || 'amqp://localhost',
      serviceName: 'agent-intelligence',
      exchangePrefix: 'uaip.enterprise',
      complianceMode: true
    }, logger);

    // Initialize persona and discussion services
    this.personaService = new PersonaService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      enableCaching: true,
      enableAnalytics: true
    });

    this.discussionService = new DiscussionService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      personaService: this.personaService,
      enableRealTimeEvents: true,
      enableAnalytics: true,
      maxParticipants: 20,
      defaultTurnTimeout: 300
    });

    // Initialize controllers with service dependencies
    // Note: AgentController will be initialized after ServiceFactory is ready
    this.personaController = new PersonaController(this.personaService);
    this.discussionController = new DiscussionController(this.discussionService);

    // Initialize microservices (will be fully configured in start() method)
    this.initializeMicroservices();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    // CORS is handled by nginx API gateway - disable service-level CORS
    // this.app.use(cors({
    //   origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    //   credentials: true
    // }));

    // Performance middleware
    this.app.use(compression());
    this.app.use(rateLimiter);

    // Logging middleware
    this.app.use(morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) }
    }));

    // Request parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Metrics middleware
    this.app.use(metricsMiddleware);
  }

  private setupRoutes(): void {
    // Metrics endpoint for Prometheus
    this.app.get('/metrics', metricsEndpoint);

    // Health check routes
    this.app.use('/health', healthRoutes);

    // API routes will be set up after controller initialization
    // For now, set up non-agent routes
    this.app.use('/api/v1/personas', createPersonaRoutes(this.personaController));
    this.app.use('/api/v1/discussions', createDiscussionRoutes(this.discussionController));
    
    // Knowledge routes - handled by this service as configured in nginx
    this.app.use('/api/v1/knowledge', knowledgeRoutes);
  }

  private setup404Handler(): void {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found'
        },
        meta: {
          timestamp: new Date(),
          version: process.env.VERSION || '1.0.0'
        }
      });
    });
  }

  private async setupEventSubscriptions(): Promise<void> {
    // Subscribe to agent chat requests from WebSocket connections
    await this.eventBusService.subscribe('agent.chat.request', async (event) => {
      try {
        const { userId, agentId, message, conversationHistory, context, connectionId, messageId, timestamp } = event.data;
        
        logger.info('Processing agent chat request', { 
          userId: userId?.substring(0, 8) + '...',
          agentId: agentId?.substring(0, 8) + '...',
          messageLength: message?.length || 0,
          connectionId,
          messageId
        });

        // Forward to agent discussion service for processing
        const chatResponse = await this.agentDiscussionService.participateInDiscussion({
          agentId,
          message,
          userId,
          conversationHistory: conversationHistory || [],
          context: context || {}
        });

        // Publish response back via event bus
        await this.eventBusService.publish('agent.chat.response', {
          connectionId,
          agentId,
          userId,
          messageId,
          response: chatResponse.response,
          agentName: chatResponse.agentName || 'Agent',
          confidence: chatResponse.confidence || 0.8,
          timestamp: new Date().toISOString(),
          metadata: chatResponse.metadata || {}
        });

        logger.info('Agent chat response sent', { 
          agentId: agentId?.substring(0, 8) + '...',
          connectionId,
          messageId,
          responseLength: chatResponse.response?.length || 0
        });

      } catch (error) {
        logger.error('Agent chat processing failed', { error, event: event.data });
        
        // Send error response
        if (event.data.connectionId) {
          await this.eventBusService.publish('agent.chat.response', {
            connectionId: event.data.connectionId,
            agentId: event.data.agentId,
            messageId: event.data.messageId,
            response: 'I apologize, but I encountered an error processing your request. Please try again.',
            agentName: 'Agent',
            confidence: 0.0,
            error: true,
            timestamp: new Date().toISOString()
          });
        }
      }
    });
  }

  private setupAgentRoutes(): void {
    // Set up agent routes after controller is initialized
    this.app.use('/api/v1/agents', createAgentRoutes(this.agentController));
    // Set up 404 handler after all routes are registered
    this.setup404Handler();
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  private initializeMicroservices(): void {
    // Initialize microservices with basic configuration
    // Full initialization with enhanced services happens in start() method
    const baseConfig = {
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      knowledgeGraphService: null, // Will be set in start() method
      llmService: null, // Will be set in start() method
      serviceName: 'agent-intelligence',
      securityLevel: 2
    };

    this.agentCoreService = new AgentCoreService(baseConfig);
    this.agentContextService = new AgentContextService(baseConfig);
    this.agentPlanningService = new AgentPlanningService(baseConfig);
    this.agentLearningService = new AgentLearningService(baseConfig);
    this.agentDiscussionService = new AgentDiscussionService({
      ...baseConfig,
      llmService: null, // Will be set in start() method
      userLLMService: null // Will be set in start() method
    });
    this.agentMetricsService = new AgentMetricsService(baseConfig);
    this.agentIntentService = new AgentIntentService({
      ...baseConfig,
      llmService: null, // Will be set in start() method
      userLLMService: null // Will be set in start() method
    });
    this.agentInitializationService = new AgentInitializationService(baseConfig);
    this.agentEventOrchestrator = new AgentEventOrchestrator({
      ...baseConfig,
      orchestrationPipelineUrl: process.env.ORCHESTRATION_PIPELINE_URL || 'http://localhost:3002'
    });

    // ConversationIntelligenceService will be initialized in start() method after all dependencies are ready
    this.conversationIntelligenceService = null;

    logger.info('Microservices initialized with basic configuration');
  }

  private async configureMicroservicesWithEnhancedServices(
    knowledgeGraphService: any,
    agentMemoryService: any,
    llmService: any,
    userLLMService: any
  ): Promise<void> {
    try {
      // Update services with enhanced capabilities
      if (knowledgeGraphService) {
        this.agentContextService['knowledgeGraphService'] = knowledgeGraphService;
        this.agentPlanningService['knowledgeGraphService'] = knowledgeGraphService;
        this.agentLearningService['knowledgeGraphService'] = knowledgeGraphService;
        this.agentDiscussionService['knowledgeGraphService'] = knowledgeGraphService;
        this.agentMetricsService['knowledgeGraphService'] = knowledgeGraphService;
        this.agentIntentService['knowledgeGraphService'] = knowledgeGraphService;
        this.agentInitializationService['knowledgeGraphService'] = knowledgeGraphService;
      }

      if (agentMemoryService) {
        this.agentLearningService['agentMemoryService'] = agentMemoryService;
        this.agentDiscussionService['agentMemoryService'] = agentMemoryService;
        this.agentMetricsService['agentMemoryService'] = agentMemoryService;
        this.agentInitializationService['agentMemoryService'] = agentMemoryService;
      }

      if (llmService && userLLMService) {
        this.agentDiscussionService['llmService'] = llmService;
        this.agentDiscussionService['userLLMService'] = userLLMService;
        this.agentIntentService['llmService'] = llmService;
        this.agentIntentService['userLLMService'] = userLLMService;
      }

      // Initialize all microservices
      logger.info('Initializing microservices...');
      await this.agentCoreService.initialize();
      await this.agentContextService.initialize();
      await this.agentPlanningService.initialize();
      await this.agentLearningService.initialize();
      await this.agentDiscussionService.initialize();
      await this.agentMetricsService.initialize();
      await this.agentIntentService.initialize();
      await this.agentInitializationService.initialize();
      
      // Initialize ConversationIntelligenceService with all dependencies
      if (this.conversationIntelligenceService === null) {
        const userKnowledgeService = await this.serviceFactory.getUserKnowledgeService();
        const qdrantService = await this.serviceFactory.getQdrantService();
        const embeddingService = await this.serviceFactory.getEmbeddingService();
        
        // Initialize Redis cache service
        await redisCacheService.initialize();
        
        this.conversationIntelligenceService = new ConversationIntelligenceService(
          this.eventBusService,
          userKnowledgeService,
          qdrantService,
          embeddingService,
          llmService,
          redisCacheService
        );
        
        logger.info('ConversationIntelligenceService initialized successfully');
      }
      
      logger.info('All microservices initialized successfully');

      // Initialize the event orchestrator with all services
      await this.agentEventOrchestrator.initialize({
        agentCoreService: this.agentCoreService,
        agentContextService: this.agentContextService,
        agentPlanningService: this.agentPlanningService,
        agentLearningService: this.agentLearningService,
        agentDiscussionService: this.agentDiscussionService,
        agentMetricsService: this.agentMetricsService,
        agentIntentService: this.agentIntentService,
        agentInitializationService: this.agentInitializationService
      });

      logger.info('Microservices configured with enhanced services and orchestrator initialized');
    } catch (error) {
      logger.error('Failed to configure microservices with enhanced services:', error);
      throw error;
    }
  }

  private async initializeAgentController(): Promise<void> {
    try {
      // Get services from ServiceFactory instance
      if (!this.serviceFactory) {
        throw new Error('ServiceFactory not initialized');
      }
      const knowledgeGraphService = await this.serviceFactory.getKnowledgeGraphService();
      const agentMemoryService = await this.serviceFactory.getAgentMemoryService();

      // Initialize AgentController with enhanced services
      this.agentController = new AgentController(
        knowledgeGraphService,
        agentMemoryService,
        this.personaService,
        this.discussionService,
        this.databaseService,
        this.eventBusService
      );

      // Initialize AgentController services
      await this.agentController.initialize();

      logger.info('AgentController initialized with full service dependencies');
    } catch (error) {
      logger.error('Failed to initialize AgentController with enhanced services:', error);
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      // Initialize database service first
      await this.databaseService.initialize();
      logger.info('DatabaseService initialized successfully');

      // Test database connection using health check
      const healthCheck = await this.databaseService.healthCheck();
      if (healthCheck.status === 'healthy') {
        logger.info('Database connection verified');
      } else {
        throw new Error('Database health check failed');
      }

      // Initialize ServiceFactory for Knowledge Graph services
      let enhancedServicesAvailable = false;
      let knowledgeGraphService = null;
      let agentMemoryService = null;
      let llmService = null;
      let userLLMService = null;

      try {
        const { serviceFactory } = await import('@uaip/shared-services');
        this.serviceFactory = serviceFactory; // Store serviceFactory as instance property
        await this.serviceFactory.initialize();
        logger.info('ServiceFactory initialized successfully');

        // Get enhanced services
        knowledgeGraphService = await this.serviceFactory.getKnowledgeGraphService();
        agentMemoryService = await this.serviceFactory.getAgentMemoryService();
        llmService = await this.serviceFactory.getLLMService();
        userLLMService = await this.serviceFactory.getUserLLMService();

        // Initialize AgentController with enhanced services
        await this.initializeAgentController();
        logger.info('AgentController initialized with enhanced services');
        enhancedServicesAvailable = true;
      } catch (error) {
        logger.warn('ServiceFactory initialization failed, falling back to basic services:', error);
      }

      // Configure microservices with enhanced services if available
      await this.configureMicroservicesWithEnhancedServices(
        knowledgeGraphService,
        agentMemoryService,
        llmService,
        userLLMService
      );

      if (!enhancedServicesAvailable) {
        // Initialize microservices in fallback mode (without enhanced services)
        logger.info('Initializing microservices in fallback mode...');
        
        // LLM services will be accessed via event bus - no direct import needed
        logger.info('LLM services will be accessed via event bus in fallback mode');
        
        await this.agentCoreService.initialize();
        await this.agentContextService.initialize();
        await this.agentPlanningService.initialize();
        await this.agentLearningService.initialize();
        await this.agentDiscussionService.initialize();
        await this.agentMetricsService.initialize();
        await this.agentIntentService.initialize();
        await this.agentInitializationService.initialize();
        
        // Initialize ConversationIntelligenceService in fallback mode
        try {
          // Initialize Redis cache service
          await redisCacheService.initialize();
          
          // Create minimal ConversationIntelligenceService with limited functionality
          // Note: Some features may be limited without enhanced services
          this.conversationIntelligenceService = new ConversationIntelligenceService(
            this.eventBusService,
            null, // userKnowledgeService - fallback mode
            null, // qdrantService - fallback mode
            null, // embeddingService - fallback mode
            null, // llmService - fallback mode
            redisCacheService
          );
          
          logger.info('ConversationIntelligenceService initialized in fallback mode');
        } catch (error) {
          logger.warn('Failed to initialize ConversationIntelligenceService in fallback mode:', error);
          this.conversationIntelligenceService = null;
        }
        
        logger.info('All microservices initialized in fallback mode');

        // Initialize AgentController without enhanced services but with basic services
        this.agentController = new AgentController(
          undefined, // knowledgeGraphService
          undefined, // agentMemoryService
          this.personaService,
          this.discussionService,
          this.databaseService,
          this.eventBusService
        );

        // Initialize AgentController services
        await this.agentController.initialize();

        logger.info('AgentController initialized in fallback mode');
      }

      // Set up agent routes
      this.setupAgentRoutes();

      // Connect to event bus with retry logic
      try {
        await this.eventBusService.connect();
        logger.info('Event bus connected successfully');
        
        // Setup event subscriptions for agent chat
        await this.setupEventSubscriptions();
        logger.info('Event subscriptions configured');
      } catch (error) {
        logger.warn('Event bus connection failed, continuing without event publishing:', error);
        // Service can still function without event bus for basic operations
      }

      // Initialize persona and discussion services
      logger.info('Persona and Discussion services initialized');

      // Start HTTP server
      const port = parseInt(process.env.PORT || '3001', 10);
      this.app.listen(port, () => {
        logger.info(`Agent Intelligence Service started on port ${port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`Version: ${process.env.VERSION || '1.0.0'}`);
        logger.info('Available endpoints:');
        logger.info('  - /api/v1/agents - Agent management');
        logger.info('  - /api/v1/personas - Persona management');
        logger.info('  - /api/v1/discussions - Discussion orchestration');
      });

    } catch (error) {
      logger.error('Failed to start Agent Intelligence Service:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      // Shutdown event orchestrator first
      if (this.agentEventOrchestrator) {
        await this.agentEventOrchestrator.shutdown();
        logger.info('Agent Event Orchestrator shutdown completed');
      }

      // Close connections if methods exist
      if (this.eventBusService && typeof this.eventBusService.close === 'function') {
        await this.eventBusService.close();
      }
      if (this.databaseService && typeof this.databaseService.close === 'function') {
        await this.databaseService.close();
      }
      logger.info('Agent Intelligence Service stopped gracefully');
    } catch (error) {
      logger.error('Error during service shutdown:', error);
    }
  }
}

// Initialize and start the service
const service = new AgentIntelligenceService();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await service.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await service.stop();
  process.exit(0);
});

// Start the service
service.start().catch((error) => {
  logger.error('Failed to start service:', error);
  process.exit(1);
}); 